"""Vocabulario de combustible del sitio (Gasolina / Diésel / Híbrido / Eléctrico) a partir del P.3 del permiso o,
como respaldo sin confirmar, de los tokens del MODELO. Sin dependencias de compare.py (lo importa compare)."""
from __future__ import annotations

import re

from common import norm_text

GASOLINA, DIESEL, HIBRIDO, ELECTRICO = "Gasolina", "Diésel", "Híbrido", "Eléctrico"
VALORES = (GASOLINA, DIESEL, HIBRIDO, ELECTRICO)
_DIESEL_TOKENS = {"hdi", "bluehdi", "dci", "tdi", "cdti", "crdi", "tdci", "cdi", "jtd", "multijet", "diesel", "d",
                  "td", "ddis", "dtec", "i-dtec", "skyactiv-d", "blue-hdi", "ecoblue", "gasoil", "gasoleo"}
_HYBRID_TOKENS = {"phev", "hybrid", "hev", "mhev", "fhev", "hibrido", "hibrida", "4xe", "e-tech", "etech", "e-power",
                  "epower", "e-hybrid", "hybride"}
_ELECTRIC_TOKENS = {"ev", "electric", "electrico", "electrica", "e-tron", "id.3", "id.4", "id.5", "e-208", "e-2008",
                    "e-c4", "zoe", "leaf"}


def combustible_permiso(p3) -> str | None:
    """P.3 del permiso/ficha -> vocabulario web. 'GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)' -> Híbrido; 'DIESEL - HÍBRIDOS
    (HEV)' -> Híbrido; 'ELECTRICO' -> Eléctrico; None si no hay nada usable."""
    t = norm_text(p3)
    if not t:
        return None
    if re.search(r"\bhev\b|phev|hibrid|hybrid", t) or ("electr" in t and re.search(r"gasolina|diesel|gasoleo", t)):
        return HIBRIDO
    if "electr" in t:
        return ELECTRICO
    if re.search(r"diesel|gasoil|gasoleo", t):
        return DIESEL
    if "gasolina" in t or "petrol" in t:
        return GASOLINA
    return None


def combustible_modelo(texto) -> tuple[str, str | None]:
    """Por tokens del MODELO (sin confirmar). Devuelve (combustible, aviso); sin pista -> Gasolina + aviso."""
    tokens = set(re.split(r"[\s/,()]+", norm_text(texto)))
    if tokens & _HYBRID_TOKENS or any(t.startswith("hibr") or t.startswith("hybrid") for t in tokens):
        return HIBRIDO, None
    if "tesla" in tokens or tokens & _ELECTRIC_TOKENS:
        return ELECTRICO, None
    if tokens & _DIESEL_TOKENS or any(t.endswith("tdi") or t.endswith("hdi") or t.endswith("dci") for t in tokens):
        return DIESEL, None
    return GASOLINA, "combustible no deducible del MODELO ni del permiso: se asume Gasolina"


def normalizar_combustible(valor) -> str | None:
    """Valor de la hoja -> vocabulario ('diesel' -> Diésel, 'hibrido enchufable' -> Híbrido)."""
    t = norm_text(valor)
    if not t:
        return None
    if "hibr" in t or "hybrid" in t or "phev" in t or "hev" == t:
        return HIBRIDO
    if "electr" in t:
        return ELECTRICO
    if "diesel" in t or "gasoil" in t or "gasoleo" in t:
        return DIESEL
    if "gasolina" in t:
        return GASOLINA
    return str(valor).strip()
