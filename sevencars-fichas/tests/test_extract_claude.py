"""Motor Claude Code: parseo del sobre JSON, JSON con fences, reintento y errores (subprocess simulado)."""
import io
import json
import subprocess
from types import SimpleNamespace

import pytest
from PIL import Image

import extract_claude
from docs import PreparedImage
from extract import EXTRACTION_SCHEMA, ExtractionError, ExtractionRequest

GOOD = {"ficha_tecnica": {"presente": True, "matricula": "9028LXG"},
        "permiso_circulacion": {"presente": False}, "notas": ""}


def tiny_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buf, format="JPEG")
    return buf.getvalue()


def make_request() -> ExtractionRequest:
    imgs = [PreparedImage("Ficha técnica cara 1.jpeg", tiny_jpeg(), 8, 8),
            PreparedImage("permiso-circulacion.pdf (pág. 1)", tiny_jpeg(), 8, 8, page=1)]
    return ExtractionRequest(model="x", images=imgs, prompt="p", doc_names=["a", "b"],
                             text_aids=["### Texto extraído de permiso-circulacion.pdf\n2202KSC"],
                             image_kinds=["TARJETA ITV / ficha técnica", "PERMISO DE CIRCULACIÓN"])


class FakeRun:
    """Replaces subprocess.run; `outputs` is a list of (returncode, stdout, stderr) or exceptions."""

    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def __call__(self, cmd, **kwargs):
        self.calls.append({"cmd": cmd, **kwargs})
        item = self.outputs.pop(0)
        if isinstance(item, BaseException):
            raise item
        rc, out, err = item
        return SimpleNamespace(returncode=rc, stdout=out, stderr=err)


def envelope(**fields) -> str:
    base = {"type": "result", "subtype": "success", "is_error": False, "num_turns": 3,
            "total_cost_usd": 0.0, "modelUsage": {"claude-fable-5": {}}}
    base.update(fields)
    return json.dumps(base)


@pytest.fixture
def fake(monkeypatch):
    def install(outputs):
        runner = FakeRun(outputs)
        monkeypatch.setattr(extract_claude.subprocess, "run", runner)
        return runner
    return install


# ------------------------------------------------------------ parse helpers
@pytest.mark.parametrize("text", [
    json.dumps(GOOD),
    "```json\n" + json.dumps(GOOD) + "\n```",
    "```\n" + json.dumps(GOOD) + "```",
    "Acá va el resultado:\n" + json.dumps(GOOD) + "\nListo.",
])
def test_parse_json_text_variants(text):
    assert extract_claude.parse_json_text(text) == GOOD


@pytest.mark.parametrize("text", ["", "sin json", "[1, 2]", "{no valido}"])
def test_parse_json_text_errors(text):
    with pytest.raises(ValueError):
        extract_claude.parse_json_text(text)


def test_result_from_envelope_prefers_structured_output():
    assert extract_claude.result_from_envelope({"structured_output": GOOD, "result": "otra cosa"}) == GOOD
    assert extract_claude.result_from_envelope({"result": "```json\n" + json.dumps(GOOD) + "\n```"}) == GOOD
    assert extract_claude.result_from_envelope({"result": GOOD}) == GOOD
    with pytest.raises(ValueError):
        extract_claude.result_from_envelope({"subtype": "success"})


def test_classify_failure():
    assert extract_claude.classify_failure("You've hit your usage limit") == "claude_limite"
    assert extract_claude.classify_failure("rate_limit_error") == "claude_limite"
    assert extract_claude.classify_failure("boom") == "claude_error"


# ------------------------------------------------------------ happy path
def test_run_structured_output(fake):
    runner = fake([(0, envelope(structured_output=GOOD, result="ignored"), "")])
    out = extract_claude.run_claude_extraction(make_request(), model="sonnet")
    assert out["resultado"] == GOOD
    assert out["uso"]["motor"] == "claude" and out["uso"]["turnos"] == 3 and out["modelo"] == "sonnet"
    call = runner.calls[0]
    cmd = call["cmd"]
    assert cmd[0] == extract_claude.claude_bin() and cmd[1] == "-p"
    assert "--json-schema" in cmd and json.loads(cmd[cmd.index("--json-schema") + 1]) == EXTRACTION_SCHEMA
    assert cmd[cmd.index("--output-format") + 1] == "json"
    assert cmd[cmd.index("--tools") + 1] == "Read" and "--no-session-persistence" in cmd
    assert cmd[cmd.index("--model") + 1] == "sonnet"
    assert "CLAUDECODE" not in call["env"] and call["timeout"] == extract_claude.TIMEOUT_S
    prompt = cmd[2]
    assert "01-ficha-tecnica-cara-1-jpeg.jpg" in prompt and "02-permiso-circulacion-pdf-pag-1.jpg" in prompt
    assert "contexto.txt" in prompt and "NO delegues" in prompt and "Read" in prompt
    assert '"ficha_tecnica"' in prompt  # schema included as text fallback


def test_workdir_contains_images_and_context(fake, tmp_path):
    seen = {}

    def runner(cmd, **kwargs):
        from pathlib import Path
        seen["files"] = sorted(p.name for p in Path(kwargs["cwd"]).iterdir())
        seen["ctx"] = (Path(kwargs["cwd"]) / "contexto.txt").read_text(encoding="utf-8")
        return SimpleNamespace(returncode=0, stdout=envelope(structured_output=GOOD), stderr="")
    extract_claude.subprocess.run = runner
    try:
        extract_claude.run_claude_extraction(make_request())
    finally:
        extract_claude.subprocess.run = subprocess.run
    assert seen["files"] == ["01-ficha-tecnica-cara-1-jpeg.jpg", "02-permiso-circulacion-pdf-pag-1.jpg", "contexto.txt"]
    assert "2202KSC" in seen["ctx"]


def test_run_result_with_fences(fake):
    fake([(0, envelope(result="```json\n" + json.dumps(GOOD) + "\n```"), "")])
    assert extract_claude.run_claude_extraction(make_request())["resultado"] == GOOD


# ------------------------------------------------------------ retry path
def test_retry_once_on_invalid_json(fake):
    runner = fake([(0, envelope(result="Voy a leer las imágenes primero."), ""),
                   (0, envelope(result=json.dumps(GOOD)), "")])
    assert extract_claude.run_claude_extraction(make_request())["resultado"] == GOOD
    assert len(runner.calls) == 2
    assert "no fue un JSON válido" in runner.calls[1]["cmd"][2]


def test_retry_fails_twice(fake):
    runner = fake([(0, envelope(result="nada"), ""), (0, envelope(result="tampoco"), "")])
    with pytest.raises(ExtractionError) as exc:
        extract_claude.run_claude_extraction(make_request())
    assert exc.value.code == "claude_json" and len(runner.calls) == 2
    assert "JSON válido" in exc.value.user_message()


# ------------------------------------------------------------ failures
def test_missing_cli(fake):
    fake([FileNotFoundError("claude")])
    with pytest.raises(ExtractionError) as exc:
        extract_claude.run_claude_extraction(make_request())
    assert exc.value.code == "claude_missing" and "--motor openai" in exc.value.user_message()


def test_timeout(fake):
    fake([subprocess.TimeoutExpired(cmd="claude", timeout=300)])
    with pytest.raises(ExtractionError) as exc:
        extract_claude.run_claude_extraction(make_request())
    assert exc.value.code == "claude_timeout"


def test_usage_limit_message(fake):
    fake([(1, "", "You've hit your usage limit. Resets at 3pm")])
    with pytest.raises(ExtractionError) as exc:
        extract_claude.run_claude_extraction(make_request())
    assert exc.value.code == "claude_limite"
    assert "5 horas" in exc.value.user_message() and "--motor openai" in exc.value.user_message()


def test_nonzero_exit_generic(fake):
    fake([(2, "", "Error: unknown option")])
    with pytest.raises(ExtractionError) as exc:
        extract_claude.run_claude_extraction(make_request())
    assert exc.value.code == "claude_error" and "unknown option" in exc.value.user_message()


def test_envelope_is_error(fake):
    fake([(0, envelope(is_error=True, subtype="error_max_turns", result=""), "")])
    with pytest.raises(ExtractionError) as exc:
        extract_claude.run_claude_extraction(make_request())
    assert exc.value.code == "claude_error" and "error_max_turns" in exc.value.detail


def test_non_json_stdout(fake):
    fake([(0, "plain text answer", "")])
    with pytest.raises(ExtractionError) as exc:
        extract_claude.run_claude_extraction(make_request())
    assert exc.value.code == "claude_error"


def test_no_images_raises_before_running(fake):
    runner = fake([])
    with pytest.raises(ExtractionError) as exc:
        extract_claude.run_claude_extraction(ExtractionRequest(model="x", images=[], prompt="p"))
    assert exc.value.code == "sin_documentos" and runner.calls == []


def test_stream_list_envelope(fake):
    fake([(0, json.dumps([{"type": "system"}, {"type": "result", "structured_output": GOOD}]), "")])
    assert extract_claude.run_claude_extraction(make_request())["resultado"] == GOOD
