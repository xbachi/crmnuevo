"""Marca / modelo / versión a partir del texto MODELO de la hoja, y vocabulario web (combustible, caja, km, fecha)."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date

from common import MONTH_ABBR_ES, PROJECT_DIR, norm_text, parse_month_year
from compare import infer_caja_from_modelo, normalize_caja

MARCAS_JSON = PROJECT_DIR / "data" / "marcas.json"



@dataclass
class Modelo:
    marca: str
    modelo: str
    version: str
    marca_completa: str
    titulo: str
    avisos: list[str] = field(default_factory=list)


def _cargar() -> dict:
    with MARCAS_JSON.open(encoding="utf-8") as fh:
        return json.load(fh)


_DATA = None


def _data() -> dict:
    global _DATA
    if _DATA is None:
        _DATA = _cargar()
    return _DATA


def _aliases() -> list[tuple[str, str]]:
    """(alias normalizado, marca canónica), los alias más largos primero."""
    pairs = []
    for m in _data()["marcas"]:
        for a in m["alias"]:
            pairs.append((norm_text(a), m["nombre"]))
    return sorted(pairs, key=lambda p: -len(p[0]))


def limpiar_texto(texto) -> str:
    """Colapsa espacios dobles / saltos de línea."""
    if texto is None:
        return ""
    return re.sub(r"\s+", " ", str(texto).replace(" ", " ")).strip()


def _casing_modelo(token: str) -> str:
    """'SPORTAGE' -> 'Sportage'; conserva 'i20', 'Q2', 'C220', 'XCeed', 'TTs'."""
    if token.isupper() and token.isalpha() and len(token) > 3:
        return token.capitalize()
    return token


def _starts_with_words(norm_rest: str, phrase: str) -> bool:
    return norm_rest == phrase or norm_rest.startswith(phrase + " ")


def split_modelo(texto) -> Modelo:
    """'KIA XCeed  GDi PHEV 140cv Edrive' -> Kia / XCeed / 'GDi PHEV 140cv Edrive' / 'Kia XCeed'."""
    avisos: list[str] = []
    text = limpiar_texto(texto)
    text = re.sub(r"^([A-Za-zÀ-ÿ]+)-\s*", r"\1 ", text)            # 'Mercedes- C220' -> 'Mercedes C220'
    norm = norm_text(text)
    marca, rest = None, text
    for alias, canon in _aliases():
        if _starts_with_words(norm, alias):
            marca = canon
            rest = text[len(alias):].strip(" -")
            break
    if marca is None:
        tokens = text.split(" ")
        marca = tokens[0].capitalize() if tokens and tokens[0] else ""
        rest = " ".join(tokens[1:])
        avisos.append(f"marca desconocida en MODELO: '{tokens[0] if tokens else ''}' (revisar data/marcas.json)")
    rest = limpiar_texto(rest)
    tokens = rest.split(" ") if rest else []
    norm_rest = norm_text(rest)
    n_modelo = 1
    for compuesto in sorted(_data().get("modelos_compuestos", []), key=len, reverse=True):
        if _starts_with_words(norm_rest, compuesto):
            n_modelo = len(compuesto.split(" "))
            break
    modelo = " ".join(_casing_modelo(t) for t in tokens[:n_modelo])
    version = " ".join(tokens[n_modelo:])
    if not modelo:
        avisos.append("MODELO sin nombre de modelo tras la marca")
    marca_completa = f"{marca} {modelo}".strip()
    return Modelo(marca=marca, modelo=modelo, version=version, marca_completa=marca_completa, titulo=marca_completa,
                  avisos=avisos)


# ------------------------------------------------------------- combustible
from combustible import (DIESEL, ELECTRICO, GASOLINA, HIBRIDO, combustible_modelo,  # noqa: E402,F401
                         combustible_permiso, normalizar_combustible)


def combustible_web(p3, modelo_texto) -> tuple[str, str | None]:
    """(valor, aviso): del permiso si es usable; si no, por tokens del MODELO con aviso 'sin confirmar'."""
    valor = combustible_permiso(p3)
    if valor:
        return valor, None
    valor, aviso = combustible_modelo(modelo_texto)
    return valor, aviso or "combustible deducido del MODELO, sin confirmar con el permiso"


# -------------------------------------------------------------- caja / km
def caja_web(caja_sheet, modelo_texto, expo_cambio=None) -> tuple[str | None, str | None]:
    """'manual' -> Manual; si AA está vacía se infiere de la ficha-expo o del MODELO (aviso si no hay fuente)."""
    valor = normalize_caja(caja_sheet) or normalize_caja(expo_cambio) or infer_caja_from_modelo(modelo_texto or "")
    if valor is None:
        return None, "caja de cambios sin fuente (AA vacía y sin pista en MODELO)"
    return valor, None


def km_web(kms) -> str:
    """88858 -> '88.858'."""
    if kms is None or kms == "":
        return ""
    try:
        n = int(round(float(kms)))
    except (TypeError, ValueError):
        return str(kms)
    return f"{n:,}".replace(",", ".")


def matriculacion_web(fecha: date | None, texto_ab=None, num_ac=None) -> tuple[str, int | None]:
    """(2022-04-11) -> ('Abr 2022', 202204); si no hay fecha, desde AB 'Abr 2022' / AC 202204.
    Mes abreviado, igual que la columna AB de la hoja y que el campo _matriculacion de la web."""
    if fecha is not None:
        return f"{MONTH_ABBR_ES[fecha.month - 1]} {fecha.year}", fecha.year * 100 + fecha.month
    ym = parse_month_year(texto_ab)
    if ym:
        return f"{MONTH_ABBR_ES[ym[1] - 1]} {ym[0]}", ym[0] * 100 + ym[1]
    if num_ac:
        try:
            n = int(float(num_ac))
            return f"{MONTH_ABBR_ES[n % 100 - 1]} {n // 100}", n
        except (ValueError, IndexError):
            pass
    return "", None
