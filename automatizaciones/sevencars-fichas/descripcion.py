"""Punto de extensión para la descripción / equipamiento del producto (plantillas en plantillas/<nombre>.html).
Sin plantilla no se envía el campo. Placeholders: {marca} {modelo} {version} {kms} {cv} {cubicaje} {caja}
{combustible} {matriculacion} {garantia} {precio} {precio_financiado} {cuota} {matricula}."""
from __future__ import annotations

from pathlib import Path

from common import PROJECT_DIR

PLANTILLAS_DIR = PROJECT_DIR / "plantillas"
PLACEHOLDERS = ("marca", "modelo", "version", "kms", "cv", "cubicaje", "caja", "combustible", "matriculacion",
                "garantia", "precio", "precio_financiado", "cuota", "matricula")


class _Safe(dict):
    def __missing__(self, key):
        return ""


def render_plantilla(nombre: str, datos: dict, plantillas_dir: Path = PLANTILLAS_DIR) -> str | None:
    """Contenido de plantillas/<nombre>.html con los placeholders sustituidos; None si no existe la plantilla."""
    path = Path(plantillas_dir) / f"{nombre}.html"
    if not path.is_file():
        return None
    valores = _Safe({k: ("" if v is None else str(v)) for k, v in datos.items()})
    return path.read_text(encoding="utf-8").format_map(valores)
