"""Vehicle data extraction from document images with the OpenAI Responses API (+ local cache)."""
from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from common import PROJECT_DIR
from docs import (KIND_EXPO, KIND_FICHA, KIND_PERMISO, MAX_SIDE, Document, PreparedImage, load_document_images,
                  pdf_text, pick_lean_document)

DEFAULT_MODEL = "gpt-5.4-mini"
DEFAULT_MOTOR = "claude"          # "claude" (Claude Code CLI, subscription) | "openai"
MOTORES = ("claude", "openai")
CACHE_DIR = PROJECT_DIR / "data" / "extracciones"
PIPELINE_ENV = Path("/home/seb/fotosseven/sevencars-photo-pipeline/.env")


def load_env() -> None:
    """Project .env first, then the photo-pipeline .env (only fills variables not already set)."""
    from dotenv import load_dotenv
    load_dotenv(PROJECT_DIR / ".env")
    if PIPELINE_ENV.is_file():
        load_dotenv(PIPELINE_ENV)


def default_model() -> str:
    return os.environ.get("FICHAS_MODEL") or DEFAULT_MODEL


def default_motor() -> str:
    motor = (os.environ.get("FICHAS_MOTOR") or DEFAULT_MOTOR).lower()
    return motor if motor in MOTORES else DEFAULT_MOTOR


# ------------------------------------------------------------------ schema
def _nullable(t: str, **extra) -> dict:
    return {"type": [t, "null"], **extra}


_DOC_PROPERTIES = {
    "presente": {"type": "boolean", "description": "true si el documento aparece en las imágenes"},
    "matricula": _nullable("string", description="A. Matrícula"),
    "fecha_primera_matriculacion": _nullable("string", description="B. Fecha de primera matriculación, formato YYYY-MM-DD; null si son guiones"),
    "fecha_matriculacion": _nullable("string", description="I. Fecha de matriculación, formato YYYY-MM-DD"),
    "marca": _nullable("string", description="D.1 Marca"),
    "tipo_variante": _nullable("string", description="D.2 Tipo / variante / versión"),
    "denominacion_comercial": _nullable("string", description="D.3 Denominación comercial"),
    "bastidor": _nullable("string", description="E. Número de bastidor (VIN, 17 caracteres)"),
    "masa_maxima_kg": _nullable("integer", description="F.1 Masa máxima técnicamente admisible"),
    "masa_servicio_kg": _nullable("integer", description="G. Masa en servicio / en orden de marcha"),
    "homologacion": _nullable("string", description="K. Número de homologación"),
    "categoria": _nullable("string", description="J. Categoría del vehículo (M1...)"),
    "cilindrada_cc": _nullable("integer", description="P.1 Cilindrada en cm3"),
    "potencia_kw": _nullable("number", description="P.2 Potencia neta máxima en kW"),
    "combustible": _nullable("string", description="P.3 Tipo de combustible o fuente de energía"),
    "plazas": _nullable("integer", description="S.1 Número de plazas de asiento"),
    "co2_g_km": _nullable("number", description="V.7 Emisiones CO2 g/km (solo tarjeta ITV)"),
    "norma_euro": _nullable("string", description="V.9 Nivel de emisiones / norma Euro (solo tarjeta ITV)"),
    "neumaticos": _nullable("string", description="F.7 Neumáticos (solo tarjeta ITV)"),
    "fecha_emision": _nullable("string", description="Fecha de emisión (tarjeta ITV), YYYY-MM-DD"),
    "primera_expedicion": _nullable("string", description="Primera expedición (tarjeta ITV), YYYY-MM-DD"),
    "clasificacion": _nullable("string", description="CL Clasificación del vehículo"),
    "codigo_variante": _nullable("string", description="CV Código de variante / control VIN"),
    "proxima_itv": _nullable("string", description="Próxima ITV según observaciones, YYYY-MM-DD"),
    "kilometraje_fecha": _nullable("string", description="Fecha del 'Kilometraje a fecha ...' de observaciones, YYYY-MM-DD"),
    "kilometraje": _nullable("integer", description="Kilometraje indicado en observaciones"),
    "hibrido": _nullable("boolean", description="true si el documento indica vehículo híbrido / híbrido enchufable / eléctrico"),
    "observaciones": _nullable("string", description="Texto de observaciones relevante (resumido)"),
}

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "ficha_tecnica": {"type": "object", "properties": _DOC_PROPERTIES,
                          "required": list(_DOC_PROPERTIES), "additionalProperties": False},
        "permiso_circulacion": {"type": "object", "properties": _DOC_PROPERTIES,
                                "required": list(_DOC_PROPERTIES), "additionalProperties": False},
        "notas": {"type": "string", "description": "Dudas de lectura, datos ilegibles o incoherencias entre documentos"},
    },
    "required": ["ficha_tecnica", "permiso_circulacion", "notas"],
    "additionalProperties": False,
}

PROMPT_HEADER = """Sos un asistente que transcribe documentos oficiales de vehículos españoles (DGT).
Recibís imágenes del PERMISO DE CIRCULACIÓN y/o de la TARJETA ITV (ficha técnica) de un mismo vehículo,
a veces escaneadas, giradas o de baja calidad. Extraé los datos EXACTAMENTE como figuran, sin inventar.

Prioridad: el PERMISO DE CIRCULACIÓN es la fuente principal (siempre más legible) y va primero; la TARJETA ITV
es el complemento: aporta lo que el permiso no trae (V.7 CO2, V.9 norma Euro, F.7 neumáticos, CL, fecha de
emisión, primera expedición, observaciones) y sirve para contrastar. Rellená cada objeto solo con lo que se lee
en ESE documento.

Reglas:
- Si un campo no aparece o es ilegible, devolvé null. No estimes valores.
- Fechas en formato YYYY-MM-DD. Si el campo B (primera matriculación) son guiones, devolvé null.
- Códigos: A matrícula; B primera matriculación; I fecha de matriculación; D.1 marca; D.2 tipo/variante;
  D.3 denominación comercial; E bastidor; F.1 masa máxima; G masa en servicio; K homologación; J categoría;
  P.1 cilindrada; P.2 potencia neta (kW); P.3 combustible; S.1 plazas; V.7 CO2; V.9 norma Euro; F.7 neumáticos.
- En el permiso de circulación las observaciones pueden incluir 'Próxima ITV' y 'Kilometraje a fecha dd-mm-yyyy: N'.
- En la tarjeta ITV las observaciones pueden indicar híbrido/eléctrico (p. ej. 'P.3: Vehículo híbrido enchufable').
- 'presente' = false si ese documento no está entre las imágenes (y el resto de sus campos null).
- Anotá en 'notas' cualquier duda, tachadura o incoherencia entre la ficha y el permiso.
"""


@dataclass
class ExtractionRequest:
    model: str
    images: list[PreparedImage]
    prompt: str
    doc_names: list[str] = field(default_factory=list)
    text_aids: list[str] = field(default_factory=list)      # PDF-extracted text per document (for contexto.txt)
    image_kinds: list[str] = field(default_factory=list)    # parallel to images: "TARJETA ITV..." / "PERMISO..."
    scope: str = "completo"                                 # "completo" | "permiso"

    @property
    def total_bytes(self) -> int:
        return sum(len(i.jpeg) for i in self.images)

    def describe(self) -> list[str]:
        lines = [f"Modelo: {self.model}",
                 f"Imágenes: {len(self.images)} ({self.total_bytes / 1024:.0f} KB en total)"]
        for i, img in enumerate(self.images, start=1):
            lines.append(f"  {i}. {img.label}: {img.width}x{img.height} px, {len(img.jpeg) / 1024:.0f} KB")
        lines.append(f"Prompt: {len(self.prompt)} caracteres")
        return lines


class ExtractionError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(detail or code)
        self.code = code
        self.detail = detail

    def user_message(self) -> str:
        if self.code == "claude_missing":
            return (f"No se encontró el CLI de Claude Code ({self.detail}). Instalalo, indicá la ruta en "
                    "FICHAS_CLAUDE_BIN o usá --motor openai. Se genera el informe sin IA.")
        if self.code == "claude_timeout":
            return f"Claude Code no respondió en {self.detail}. Probá de nuevo más tarde. Se genera el informe sin IA."
        if self.code == "claude_limite":
            return ("Claude Code no pudo leer los documentos: parece que se alcanzó el límite de uso de la suscripción "
                    "(los cupos se renuevan por franjas de 5 horas). Esperá a la siguiente franja o usá --motor openai. "
                    f"Detalle: {self.detail[-300:]}. Se genera el informe sin IA.")
        if self.code == "claude_json":
            return f"Claude Code no devolvió un JSON válido ni tras reintentar ({self.detail}). Se genera el informe sin IA."
        if self.code == "claude_error":
            return f"Claude Code terminó con error: {self.detail}. Se genera el informe sin IA."
        if self.code == "sin_credito":
            return ("La cuenta de OpenAI no tiene crédito disponible (insufficient_quota / 429). "
                    "No se pudo leer la ficha técnica ni el permiso con IA. Cargá saldo en "
                    "https://platform.openai.com/settings/organization/billing y volvé a ejecutar. "
                    "Se genera igualmente el informe con la ficha-expo y la hoja (nivel --sin-ia).")
        if self.code == "sin_clave":
            return ("No hay clave de OpenAI: definí OPENAI_API_KEY (variable de entorno o archivo .env). "
                    "Se genera el informe sin IA.")
        if self.code == "auth":
            return f"OpenAI rechazó la clave (autenticación): {self.detail}. Se genera el informe sin IA."
        if self.code == "modelo":
            return f"El modelo indicado no está disponible: {self.detail}. Probá otro con --modelo. Se genera el informe sin IA."
        return f"Error llamando a OpenAI: {self.detail}. Se genera el informe sin IA."


# ------------------------------------------------------------------ request
SCOPE_FULL = "completo"
SCOPE_LEAN = "liviano"          # default: ONE image (permiso cara 1, else ficha cara 1), short prompt
SCOPE_PERMISO = "permiso"       # legacy alias of the lean scope (--solo-permiso)
LEAN_SCOPES = (SCOPE_LEAN, SCOPE_PERMISO)
PROMPT_LEAN = """Documento oficial DGT de un vehículo español, una sola imagen: {kind}. Transcribí los datos EXACTAMENTE
como figuran, sin inventar; null si un campo no aparece o no se lee. Fechas YYYY-MM-DD (guiones = null).
Campos: A matrícula · B primera matriculación · I fecha de matriculación · D.1 marca · D.2 tipo/variante ·
D.3 denominación comercial · E bastidor (17 caracteres) · P.1 cilindrada cc · P.2 potencia kW · P.3 combustible ·
S.1 plazas · observaciones (Próxima ITV; 'Kilometraje a fecha dd-mm-yyyy: N' -> kilometraje y kilometraje_fecha) ·
hibrido true si es híbrido/enchufable.
Rellená el objeto '{target}' con presente=true; en el otro objeto poné presente=false y todos los campos null.
"""
PROMPT_PERMISO_ONLY = """
ALCANCE: solo se adjunta el PERMISO DE CIRCULACIÓN (no hay tarjeta ITV). En 'ficha_tecnica' poné presente=false
y todos sus campos null. Del permiso extraé sobre todo: A matrícula, B/I fechas, D.1 marca, D.2 tipo/variante,
D.3 denominación comercial, E bastidor, P.1, P.2, P.3, S.1 y, de las observaciones, 'Kilometraje a fecha' y
'Próxima ITV'.
"""


def build_request(docs: list[Document], model: str | None = None, scope: str = SCOPE_LEAN) -> ExtractionRequest:
    """Prepare images + prompt for the official documents (permiso first, then ficha). Does not call the API.
    scope='permiso' sends only the permiso de circulación (identity audit: fewer images, faster)."""
    model = model or default_model()
    if scope in LEAN_SCOPES:
        return _build_lean_request(docs, model, scope)
    # permiso first (primary source, higher resolution), then the ficha técnica (complement)
    official = [d for d in docs if d.kind == KIND_PERMISO] + [d for d in docs if d.kind == KIND_FICHA]
    images: list[PreparedImage] = []
    text_aids: list[str] = []
    listing: list[str] = []
    kinds: list[str] = []
    for doc in official:
        kind_label = "TARJETA ITV / ficha técnica" if doc.kind == KIND_FICHA else "PERMISO DE CIRCULACIÓN"
        prepared = load_document_images(doc)
        for img in prepared:
            listing.append(f"- Imagen {len(images) + 1}: {img.label} -> {kind_label}")
            images.append(img)
            kinds.append(kind_label)
        if doc.is_pdf:
            text = pdf_text(doc.path).strip()
            if text:
                text_aids.append(f"### Texto extraído de {doc.name} ({kind_label}); puede estar desordenado:\n{text[:6000]}")
    prompt = PROMPT_HEADER + (PROMPT_PERMISO_ONLY if scope == SCOPE_PERMISO else "")
    prompt += "\nImágenes adjuntas:\n" + "\n".join(listing) + "\n"
    if text_aids:
        prompt += ("\nComo ayuda, este es el texto extraído automáticamente de los PDF (sin etiquetas, "
                   "puede estar desordenado; las imágenes mandan):\n" + "\n\n".join(text_aids) + "\n")
    prompt += "\nDevolvé el JSON con la estructura pedida."
    return ExtractionRequest(model=model, images=images, prompt=prompt, doc_names=[d.name for d in official],
                             text_aids=text_aids, image_kinds=kinds, scope=scope)


def _build_lean_request(docs: list[Document], model: str, scope: str) -> ExtractionRequest:
    doc = pick_lean_document(docs)
    if doc is None:
        return ExtractionRequest(model=model, images=[], prompt="", scope=scope)
    kind_label = "PERMISO DE CIRCULACIÓN" if doc.kind == KIND_PERMISO else "TARJETA ITV / ficha técnica"
    target = "permiso_circulacion" if doc.kind == KIND_PERMISO else "ficha_tecnica"
    images = load_document_images(doc, max_side=MAX_SIDE, first_page_only=True)[:1]
    prompt = PROMPT_LEAN.format(kind=kind_label, target=target)
    text_aids: list[str] = []
    if doc.is_pdf:
        text = pdf_text(doc.path).strip()
        if text:
            text_aids.append(f"### Texto extraído de {doc.name} (puede estar desordenado):\n{text[:3000]}")
            prompt += "\nTexto extraído del PDF como ayuda (la imagen manda):\n" + text[:3000] + "\n"
    prompt += "Devolvé solo el JSON pedido."
    return ExtractionRequest(model=model, images=images, prompt=prompt, doc_names=[doc.name], text_aids=text_aids,
                             image_kinds=[kind_label] * len(images), scope=scope)


def _image_part(img: PreparedImage) -> dict:
    b64 = base64.b64encode(img.jpeg).decode("ascii")
    return {"type": "input_image", "image_url": f"data:image/jpeg;base64,{b64}", "detail": "high"}


def run_extraction(request: ExtractionRequest, client=None) -> dict:
    """Call the Responses API with Structured Outputs. Returns {'resultado': dict, 'uso': dict}."""
    if not request.images:
        raise ExtractionError("sin_documentos", "no hay imágenes de ficha técnica ni permiso")
    import openai
    if client is None:
        if not os.environ.get("OPENAI_API_KEY"):
            raise ExtractionError("sin_clave")
        client = openai.OpenAI()
    content = [{"type": "input_text", "text": request.prompt}] + [_image_part(i) for i in request.images]
    kwargs = {
        "model": request.model,
        "input": [{"role": "user", "content": content}],
        "text": {"format": {"type": "json_schema", "name": "extraccion_vehiculo",
                            "schema": EXTRACTION_SCHEMA, "strict": True}},
    }
    if request.model.startswith("gpt-5"):
        kwargs["reasoning"] = {"effort": "low"}
    try:
        try:
            response = client.responses.create(**kwargs)
        except openai.BadRequestError as exc:
            if "reasoning" in str(exc) and "reasoning" in kwargs:
                kwargs.pop("reasoning")
                response = client.responses.create(**kwargs)
            else:
                raise
    except openai.RateLimitError as exc:
        code = "sin_credito" if "insufficient_quota" in str(exc) or "quota" in str(exc).lower() else "api"
        raise ExtractionError(code, str(exc)) from exc
    except openai.AuthenticationError as exc:
        raise ExtractionError("auth", str(exc)) from exc
    except openai.NotFoundError as exc:
        raise ExtractionError("modelo", str(exc)) from exc
    except openai.OpenAIError as exc:
        raise ExtractionError("api", str(exc)) from exc
    try:
        result = json.loads(response.output_text)
    except (ValueError, TypeError) as exc:
        raise ExtractionError("api", f"respuesta no es JSON válido: {exc}") from exc
    usage = {}
    if getattr(response, "usage", None) is not None:
        usage = {"input_tokens": getattr(response.usage, "input_tokens", None),
                 "output_tokens": getattr(response.usage, "output_tokens", None)}
    return {"resultado": result, "uso": usage, "modelo": getattr(response, "model", request.model)}


# -------------------------------------------------------------------- cache
def cache_key(folder_name: str | None, plate: str | None = None) -> str:
    """Cache file stem: the car folder name (documents belong to the folder, sheet plates can be wrong)."""
    import re
    base = folder_name or plate or "SIN_CARPETA"
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("_") or "SIN_CARPETA"


def cache_path(key: str, cache_dir: Path = CACHE_DIR) -> Path:
    return Path(cache_dir) / f"{key or 'SIN_MATRICULA'}.json"


def docs_fingerprint(docs: list[Document]) -> list[dict]:
    return [d.fingerprint() for d in docs if d.kind in (KIND_FICHA, KIND_PERMISO)]


def load_cache(key: str, docs: list[Document], force: bool = False, cache_dir: Path = CACHE_DIR,
               scope: str = SCOPE_FULL, legacy_key: str | None = None) -> dict | None:
    """Cached extraction if the official docs (names + mtimes) are unchanged and the cached scope covers the
    requested one (a 'completo' cache serves a 'permiso' request, not the other way round)."""
    if force:
        return None
    for k in (key, legacy_key):
        if not k:
            continue
        path = cache_path(k, cache_dir)
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            continue
        if data.get("documentos") != docs_fingerprint(docs) or "resultado" not in data:
            continue
        cached_scope = data.get("alcance", SCOPE_FULL)
        if scope == SCOPE_FULL and cached_scope != SCOPE_FULL:
            continue                      # a lean cache is upgraded only when --completo is requested
        return data
    return None


def save_cache(key: str, docs: list[Document], model: str, result: dict, usage: dict | None = None,
               cache_dir: Path = CACHE_DIR, motor: str = "openai", alcance: str = SCOPE_FULL,
               plate: str | None = None) -> Path:
    path = cache_path(key, cache_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "matricula": plate or "",
        "motor": motor,
        "alcance": alcance,
        "modelo": model,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "documentos": docs_fingerprint(docs),
        "uso": usage or {},
        "resultado": result,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def list_models(client=None) -> list[str]:
    import openai
    client = client or openai.OpenAI()
    return sorted(m.id for m in client.models.list())
