"""Document extraction with the Claude Code CLI in headless mode (uses the user's subscription, no per-call cost).

Same input (ExtractionRequest) and same output structure as extract.run_extraction, so both engines share
the cache in data/extracciones/<PLATE>.json.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

from common import strip_accents
from extract import EXTRACTION_SCHEMA, LEAN_SCOPES, PROMPT_HEADER, ExtractionError, ExtractionRequest

DEFAULT_CLAUDE_BIN = "/home/seb/.local/bin/claude"
TIMEOUT_S = 300
MAX_TURNS = 12
MAX_TURNS_LEAN = 4
DISALLOWED_TOOLS = "Bash,Edit,Write,Agent,WebFetch,WebSearch,NotebookEdit,Glob,Grep"
TOOLS_LECTURA = ("Read",)          # lectura de documentos y caja por fotos: nunca web
CONTEXT_FILE = "contexto.txt"
_LIMIT_HINTS = re.compile(r"limit|usage|rate|quota|cupo|too many requests|overloaded", re.IGNORECASE)


def claude_bin() -> str:
    return os.environ.get("FICHAS_CLAUDE_BIN") or DEFAULT_CLAUDE_BIN


def claude_model() -> str | None:
    return os.environ.get("FICHAS_CLAUDE_MODEL") or None


# ---------------------------------------------------------------- workdir
def _slug(text: str, limit: int = 40) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", strip_accents(text).lower()).strip("-")
    return s[:limit] or "doc"


def image_filenames(request: ExtractionRequest) -> list[str]:
    return [f"{i:02d}-{_slug(img.label)}.jpg" for i, img in enumerate(request.images, start=1)]


def write_workdir(request: ExtractionRequest, workdir: Path) -> tuple[list[str], bool]:
    """Write the prepared JPEGs (and contexto.txt with the PDF text) into workdir. Returns (names, has_context)."""
    names = image_filenames(request)
    for name, img in zip(names, request.images):
        (workdir / name).write_bytes(img.jpeg)
    has_context = bool(request.text_aids)
    if has_context:
        (workdir / CONTEXT_FILE).write_text("\n\n".join(request.text_aids), encoding="utf-8")
    return names, has_context


def build_claude_prompt(request: ExtractionRequest, names: list[str], has_context: bool) -> str:
    if request.scope in LEAN_SCOPES:
        return (request.prompt + f"\nLeé la imagen {names[0]} con la herramienta Read"
                + (f" y también {CONTEXT_FILE}" if has_context else "")
                + ". No uses otras herramientas ni delegues. Respondé ÚNICAMENTE con el objeto JSON (sin texto "
                  "alrededor ni bloques de código).")
    kinds = request.image_kinds or [""] * len(names)
    listing = "\n".join(f"- {name}  →  {kind}" for name, kind in zip(names, kinds))
    parts = [
        PROMPT_HEADER,
        "INSTRUCCIONES DE EJECUCIÓN (obligatorias):",
        "- Trabajá directamente en esta respuesta: NO delegues en agentes ni subagentes, NO hagas un plan, "
        "NO uses ninguna herramienta que no sea Read.",
        "- Leé TODAS las imágenes listadas con la herramienta Read (rutas relativas a la carpeta actual), "
        "una por una, antes de responder. Si una imagen está girada, interpretala igual.",
        "- Transcribí los campos exactamente como figuran; null si no aparece o es ilegible.",
        "",
        "Imágenes a leer:",
        listing,
    ]
    if has_context:
        parts += ["", f"Leé también {CONTEXT_FILE}: es el texto extraído automáticamente de los PDF (sin etiquetas, "
                      "puede estar desordenado). Las imágenes mandan si hay diferencias."]
    parts += [
        "",
        "SALIDA: respondé ÚNICAMENTE con un objeto JSON válido que cumpla este esquema, sin texto antes ni después "
        "y sin bloques de código:",
        json.dumps(EXTRACTION_SCHEMA, ensure_ascii=False),
    ]
    return "\n".join(parts)


# ------------------------------------------------------------------ parsing
def parse_json_text(text: str) -> dict:
    """JSON object from free text: strips ``` fences and any prose around the first {...} block."""
    if text is None:
        raise ValueError("respuesta vacía")
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except ValueError:
        pass
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no se encontró un objeto JSON en la respuesta")
    data = json.loads(cleaned[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("el JSON no es un objeto")
    return data


def result_from_envelope(envelope: dict) -> dict:
    """Structured result of a `claude -p --output-format json` run (structured_output or result)."""
    so = envelope.get("structured_output")
    if isinstance(so, dict):
        return so
    if isinstance(so, str) and so.strip():
        return parse_json_text(so)
    res = envelope.get("result")
    if isinstance(res, dict):
        return res
    if isinstance(res, str):
        return parse_json_text(res)
    raise ValueError("el sobre JSON no trae 'structured_output' ni 'result'")


def classify_failure(text: str) -> str:
    return "claude_limite" if _LIMIT_HINTS.search(text or "") else "claude_error"


def _load_envelope(stdout: str) -> dict:
    envelope = json.loads(stdout)
    if isinstance(envelope, list):
        results = [e for e in envelope if isinstance(e, dict) and e.get("type") == "result"]
        envelope = results[-1] if results else (envelope[-1] if envelope else {})
    if not isinstance(envelope, dict):
        raise ValueError("sobre JSON inesperado")
    return envelope


# ----------------------------------------------------------------- running
def build_command(binary: str, prompt: str, model: str | None, max_turns: int = MAX_TURNS,
                  schema: dict | None = None, tools: tuple[str, ...] = TOOLS_LECTURA) -> list[str]:
    """`tools`: las únicas herramientas disponibles y permitidas; el resto de DISALLOWED_TOOLS queda prohibido."""
    herramientas = ",".join(tools)
    prohibidas = ",".join(t for t in DISALLOWED_TOOLS.split(",") if t not in tools)
    cmd = [binary, "-p", prompt,
           "--output-format", "json",
           "--json-schema", json.dumps(schema or EXTRACTION_SCHEMA),
           "--tools", herramientas,
           "--allowedTools", herramientas,
           "--disallowedTools", prohibidas,
           "--max-turns", str(max_turns),
           "--no-session-persistence",
           "--setting-sources", "",
           "--permission-mode", "dontAsk"]
    if model:
        cmd += ["--model", model]
    return cmd


def _invoke(binary: str, prompt: str, workdir: Path, model: str | None, timeout: int, max_turns: int = MAX_TURNS,
            schema: dict | None = None, tools: tuple[str, ...] = TOOLS_LECTURA) -> dict:
    cmd = build_command(binary, prompt, model, max_turns, schema, tools)
    env = {k: v for k, v in os.environ.items() if k not in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT")}
    try:
        proc = subprocess.run(cmd, cwd=str(workdir), capture_output=True, text=True, timeout=timeout, env=env)
    except FileNotFoundError:
        raise ExtractionError("claude_missing", binary)
    except subprocess.TimeoutExpired:
        raise ExtractionError("claude_timeout", f"{timeout} s")
    out = proc.stdout or ""
    if proc.returncode != 0:
        text = ((proc.stderr or "") + "\n" + out).strip()
        raise ExtractionError(classify_failure(text), text[-600:] or f"código de salida {proc.returncode}")
    try:
        envelope = _load_envelope(out)
    except ValueError:
        text = (out + "\n" + (proc.stderr or "")).strip()
        raise ExtractionError(classify_failure(text), "salida no JSON: " + text[-300:])
    if envelope.get("is_error"):
        text = f"{envelope.get('subtype', '')} {envelope.get('result', '')}".strip()
        raise ExtractionError(classify_failure(text), text[-600:])
    return envelope


def run_claude_extraction(request: ExtractionRequest, model: str | None = None, timeout: int = TIMEOUT_S) -> dict:
    """Run the Claude Code CLI on the prepared images. Returns {'resultado', 'uso', 'modelo'} like run_extraction."""
    if not request.images:
        raise ExtractionError("sin_documentos", "no hay imágenes de ficha técnica ni permiso")
    binary = claude_bin()
    model = model or claude_model()          # None -> the CLI's default model
    max_turns = MAX_TURNS_LEAN if request.scope in LEAN_SCOPES else MAX_TURNS
    t0 = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="fichas-claude-") as tmp:
        workdir = Path(tmp)
        names, has_context = write_workdir(request, workdir)
        prompt = build_claude_prompt(request, names, has_context)
        envelope = _invoke(binary, prompt, workdir, model, timeout, max_turns)
        try:
            data = result_from_envelope(envelope)
        except ValueError as exc:
            corrective = (prompt + "\n\nATENCIÓN: tu respuesta anterior no fue un JSON válido "
                          f"({str(exc)[:200]}). Volvé a leer las imágenes si hace falta y respondé de nuevo "
                          "SOLO con el objeto JSON que cumple el esquema.")
            envelope = _invoke(binary, corrective, workdir, model, timeout, max_turns)
            try:
                data = result_from_envelope(envelope)
            except ValueError as exc2:
                raise ExtractionError("claude_json", str(exc2)) from exc2
    elapsed = round(time.monotonic() - t0, 1)
    models = list((envelope.get("modelUsage") or {}).keys())
    usage = {"motor": "claude", "duracion_s": elapsed, "coste_usd": envelope.get("total_cost_usd"),
             "turnos": envelope.get("num_turns"), "modelos": models}
    return {"resultado": data, "uso": usage, "modelo": model or (",".join(models) if models else "claude")}
