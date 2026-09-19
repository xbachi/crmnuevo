"""Caja de cambios: orden de evidencias (MODELO → eléctrico → fotos → Duda). La detección por fotos
usa el mismo motor Claude Code headless que extract_claude.py, en dos pasadas livianas, con caché por carpeta."""
from __future__ import annotations

import io
import json
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import extract_claude
from combustible import ELECTRICO
from compare import infer_caja_from_modelo
from extract import CACHE_DIR, ExtractionError, cache_key

MANUAL, AUTOMATICO, DUDA = "Manual", "Automático", "Duda"
ALTA, MEDIA, BAJA = "alta", "media", "baja"
MAX_FOTOS_PASO1 = 40           # tope solo para galerías absurdas: se envían TODAS las fotos
MAX_FOTOS_PASO2 = 5            # candidatas por tanda en la pasada 2
LADO_PASO1 = 512
LADO_PASO2 = 1600
MAX_TURNS = 4
TIMEOUT_S = 240
CLASES = ("exterior", "interior", "detalle")

# Pasada 1: clasificación por foto (una palabra) + bandera; la selección la hace Python, no el modelo.
SCHEMA_PASO1 = {
    "type": "object",
    "properties": {
        "fotos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "archivo": {"type": "string"},
                    "clase": {"type": "string", "enum": list(CLASES)},
                    "muestra_palanca_o_pedales": {"type": "boolean"},
                },
                "required": ["archivo", "clase", "muestra_palanca_o_pedales"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["fotos"], "additionalProperties": False,
}
SCHEMA_PASO2 = {"type": "object",
                "properties": {"caja": {"type": "string", "enum": [MANUAL, AUTOMATICO, DUDA]},
                               "confianza": {"type": "string", "enum": [ALTA, MEDIA, BAJA]},
                               "foto": {"type": "string"},
                               "motivo": {"type": "string"}},
                "required": ["caja", "confianza", "foto", "motivo"], "additionalProperties": False}

PROMPT_PASO1 = """Miniaturas de las fotos de un coche en venta. Clasificá CADA archivo y marcá si en él se ve la caja
de cambios.

muestra_palanca_o_pedales = true SOLO si en la foto aparece alguna de estas zonas:
- la zona entre los asientos delanteros donde está la palanca o el selector de marchas,
- el pomo de la palanca (aunque salga de lejos o parcialmente),
- la consola central,
- los pedales.
No la marques por el volante, el cuadro de mandos, la pantalla, las ruedas ni las etiquetas.

clase: "exterior" (carrocería, ruedas), "interior" (habitáculo, asientos, salpicadero) o "detalle" (primeros planos,
etiquetas, documentación).

Archivos ({n}): {archivos}
Leé cada imagen con la herramienta Read, una por una, sin saltarte ninguna. Respondé únicamente con el JSON
{{"fotos": [{{"archivo": "1.jpg", "clase": "exterior", "muestra_palanca_o_pedales": false}}, ...]}} con UNA entrada por
archivo, en el mismo orden."""

PROMPT_PASO2 = """Determiná el tipo de caja de cambios de este coche a partir de estas fotos del interior.
Pistas: tres pedales = manual; dos pedales = automático; un pomo con esquema en H y números (1-2-3-4-5-6) impresos
= MANUAL (esa sola pista basta, con confianza alta); un selector marcado P R N D = automático; un selector giratorio
o botones = automático. Si no se ve con claridad, respondé "Duda" en vez de adivinar. Indicá la foto decisiva y el
motivo en una frase.
Archivos: {archivos}
Leé cada imagen con la herramienta Read y respondé únicamente con el JSON
{{"caja": "Manual"|"Automático"|"Duda", "confianza": "alta"|"media"|"baja", "foto": "<archivo>", "motivo": "..."}}."""


@dataclass
class CajaVerdict:
    caja: str                       # Manual | Automático | Duda
    fuente: str                     # "MODELO" | "ficha-expo" | "eléctrico" | "fotos" | "ninguna"
    confianza: str = ALTA
    foto: str = ""
    motivo: str = ""
    avisos: list[str] = field(default_factory=list)

    @property
    def decidido(self) -> bool:
        return self.caja in (MANUAL, AUTOMATICO)

    @property
    def escribible(self) -> bool:
        """Solo Manual/Automático y, si viene de las fotos, con confianza alta."""
        return self.decidido and (self.fuente != "fotos" or self.confianza == ALTA)

    def para_verificar(self) -> str | None:
        if self.escribible:
            return None
        detalle = f"{self.caja} según fotos, confianza {self.confianza}" if self.fuente == "fotos" and self.decidido else "sin fuente"
        return f"caja: sin confirmar (revisar en el borrador) — {detalle}" + (f"; {self.motivo}" if self.motivo else "")


# ------------------------------------------------------------- evidencias 1-3
def caja_por_texto(modelo_texto: str | None, combustible: str | None = None) -> CajaVerdict | None:
    """Evidencias sin fotos (MODELO, eléctrico); None si ninguna decide."""
    valor = infer_caja_from_modelo(modelo_texto or "")
    if valor:
        return CajaVerdict(valor, "MODELO")
    if combustible == ELECTRICO:
        return CajaVerdict(AUTOMATICO, "eléctrico", motivo="los eléctricos no llevan caja manual")
    return None


# ------------------------------------------------------------------- fotos
def miniatura(path: Path, lado: int) -> bytes:
    """Miniatura JPEG ≤ `lado` px, con la rotación EXIF ya aplicada (la reutiliza descripcion_cochesnet)."""
    from PIL import Image, ImageOps
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.thumbnail((lado, lado))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80, optimize=True)
        return buf.getvalue()


def _llamar(prompt: str, schema: dict, workdir: Path) -> dict:
    envelope = extract_claude._invoke(extract_claude.claude_bin(), prompt, workdir, extract_claude.claude_model(),
                                      TIMEOUT_S, MAX_TURNS, schema=schema)
    return extract_claude.result_from_envelope(envelope)


def paso1(fotos: list[Path], workdir: Path) -> list[str]:
    """TODAS las fotos (tope MAX_FOTOS_PASO1) como miniaturas ≤512 px en UNA llamada. El modelo clasifica cada
    archivo; la selección (bandera muestra_palanca_o_pedales, en orden de galería) se hace acá."""
    envio = fotos[:MAX_FOTOS_PASO1]
    nombres = []
    for p in envio:
        (workdir / p.name).write_bytes(miniatura(p, LADO_PASO1))
        nombres.append(p.name)
    data = _llamar(PROMPT_PASO1.format(n=len(nombres), archivos=", ".join(nombres)), SCHEMA_PASO1, workdir)
    marcadas = set()
    for item in data.get("fotos") or []:
        if not isinstance(item, dict):
            continue
        archivo = str(item.get("archivo") or "")
        if archivo in nombres and item.get("muestra_palanca_o_pedales") is True:
            marcadas.add(archivo)
    return [n for n in nombres if n in marcadas]        # orden de galería, no el del modelo


def paso2(fotos: list[Path], workdir: Path) -> dict:
    """Hasta MAX_FOTOS_PASO2 candidatas a ≤1600 px en UNA llamada → veredicto estricto."""
    nombres = []
    for p in fotos[:MAX_FOTOS_PASO2]:
        (workdir / p.name).write_bytes(miniatura(p, LADO_PASO2))
        nombres.append(p.name)
    data = _llamar(PROMPT_PASO2.format(archivos=", ".join(nombres)), SCHEMA_PASO2, workdir)
    caja = data.get("caja") if data.get("caja") in (MANUAL, AUTOMATICO, DUDA) else DUDA
    confianza = data.get("confianza") if data.get("confianza") in (ALTA, MEDIA, BAJA) else BAJA
    return {"caja": caja, "confianza": confianza, "foto": str(data.get("foto") or ""), "motivo": str(data.get("motivo") or "")}


def _fingerprint(fotos: list[Path]) -> list[dict]:
    return [{"nombre": p.name, "mtime": round(p.stat().st_mtime, 3)} for p in fotos]


def cache_path_caja(folder_name: str, cache_dir: Path = CACHE_DIR) -> Path:
    return Path(cache_dir) / f"{cache_key(folder_name)}-caja.json"


def caja_por_fotos(fotos: list[Path], folder_name: str, force: bool = False, cache_dir: Path = CACHE_DIR) -> CajaVerdict:
    """Dos pasadas con caché en data/extracciones/<carpeta>-caja.json."""
    if not fotos:
        return CajaVerdict(DUDA, "ninguna", BAJA, motivo="sin fotos")
    fp = _fingerprint(fotos)
    path = cache_path_caja(folder_name, cache_dir)
    if not force and path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("fotos") == fp and "veredicto" in data:
                v = data["veredicto"]
                return CajaVerdict(v["caja"], "fotos", v["confianza"], v.get("foto", ""), v.get("motivo", ""),
                                   avisos=[f"caja por fotos: caché {data.get('timestamp', '')}"])
        except (ValueError, KeyError, OSError):
            pass
    t0 = time.monotonic()
    tandas: list[list[str]] = []
    try:
        with tempfile.TemporaryDirectory(prefix="fichas-caja-") as tmp:
            workdir = Path(tmp)
            elegidas = paso1(fotos, workdir)
        por_nombre = {p.name: p for p in fotos}
        if not elegidas:
            veredicto = {"caja": DUDA, "confianza": BAJA, "foto": "",
                         "motivo": "ninguna foto muestra la palanca ni los pedales"}
        else:
            # tandas de MAX_FOTOS_PASO2; si la primera no decide y quedan candidatas, se reintenta una vez
            for inicio in (0, MAX_FOTOS_PASO2):
                tanda = elegidas[inicio:inicio + MAX_FOTOS_PASO2]
                if not tanda:
                    break
                tandas.append(tanda)
                with tempfile.TemporaryDirectory(prefix="fichas-caja2-") as tmp2:
                    veredicto = paso2([por_nombre[n] for n in tanda], Path(tmp2))
                if veredicto["caja"] != DUDA:
                    break
    except ExtractionError as exc:
        return CajaVerdict(DUDA, "fotos", BAJA, motivo=f"error de la IA: {exc.user_message()[:120]}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"carpeta": folder_name, "timestamp": datetime.now().isoformat(timespec="seconds"),
                                "duracion_s": round(time.monotonic() - t0, 1), "fotos": fp,
                                "paso1": elegidas, "tandas": tandas, "veredicto": veredicto}, ensure_ascii=False, indent=2), encoding="utf-8")
    return CajaVerdict(veredicto["caja"], "fotos", veredicto["confianza"], veredicto["foto"], veredicto["motivo"])


# ---------------------------------------------------------------- resumen
def detectar_caja(modelo_texto: str | None, combustible: str | None = None, fotos: list[Path] | None = None,
                  folder_name: str = "", force: bool = False, sin_fotos: bool = False,
                  cache_dir: Path = CACHE_DIR) -> CajaVerdict:
    """Orden: MODELO → eléctrico → fotos (dos pasadas, solo confianza alta escribe) → Duda."""
    v = caja_por_texto(modelo_texto, combustible)
    if v is not None:
        return v
    if sin_fotos or not fotos:
        return CajaVerdict(DUDA, "ninguna", BAJA, motivo="sin fotos" if not fotos else "detección por fotos desactivada")
    return caja_por_fotos(fotos, folder_name, force=force, cache_dir=cache_dir)
