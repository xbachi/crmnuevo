"""Categorías product_cat de sevencars.es y tabla fija modelo -> categorías."""
from __future__ import annotations

import json

from common import PROJECT_DIR, norm_text

CATEGORIAS_JSON = PROJECT_DIR / "data" / "categorias.json"
_DATA = None


def _data() -> dict:
    global _DATA
    if _DATA is None:
        with CATEGORIAS_JSON.open(encoding="utf-8") as fh:
            _DATA = json.load(fh)
    return _DATA


def categorias() -> dict[str, int]:
    return dict(_data()["categorias"])


def categorias_para(modelo: str) -> tuple[list[str], str | None]:
    """Slugs para un modelo ('XCeed' -> ['suv-4x4', 'familiar']); desconocido -> ([], aviso)."""
    tabla = _data()["modelos"]
    key = norm_text(modelo)
    if not key:
        return [], "modelo vacío: borrador sin categoría"
    if key in tabla:
        return list(tabla[key]), None
    first = key.split(" ")[0]
    if first in tabla:
        return list(tabla[first]), None
    return [], f"modelo '{modelo}' sin categoría en data/categorias.json: borrador sin categoría (usar --categoria)"


def validar_slugs(texto: str) -> list[str]:
    """'suv-4x4,familiar' -> slugs válidos; ValueError si alguno no existe."""
    slugs = [s.strip().lower() for s in (texto or "").split(",") if s.strip()]
    malos = [s for s in slugs if s not in categorias()]
    if malos:
        raise ValueError(f"categoría desconocida: {', '.join(malos)} (válidas: {', '.join(categorias())})")
    return slugs


def ids_de(slugs: list[str]) -> list[int]:
    cats = categorias()
    return [cats[s] for s in slugs if s in cats]
