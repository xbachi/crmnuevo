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


# ----------------------------------------------------------------- gas (GLP / GNC / GNL)
# El vocabulario de la web y de la hoja no tiene «gas»: un bifuel sigue siendo Gasolina en AF y en _combustible
# (el select de ACF solo admite los cuatro VALORES). El gas va aparte, como indicador, para la descripción y la
# etiqueta DGT (ECO). Ojo: «GAS LICUADO DE PETROLEO» contiene «petrol» y combustible_permiso lo da como Gasolina.
GLP, GNC, GNL = "GLP", "GNC", "GNL"
GASES = (GLP, GNC, GNL)
_GAS_TEXTO = ((GNL, re.compile(r"\bgnl\b|\blng\b|gas natural licuado")),
              (GNC, re.compile(r"\bgnc\b|\bcng\b|gas natural|\bmetano\b")),
              (GLP, re.compile(r"\bglp\b|\blpg\b|gas licuado|\bautogas\b")))
# Denominaciones comerciales que delatan el gas en el texto de MODELO (sin confirmar con el permiso).
_GAS_MODELO = ((GNC, re.compile(r"\btgi\b|\bg-?tec\b|\bg-?tron\b|natural power|\becofuel\b")),
               (GLP, re.compile(r"\beco-?g\b|\bbi-?fuel\b")))


def gas_texto(texto) -> str | None:
    """'GAS LICUADO DE PETROLEO' / 'GASOLINA/GLP' -> GLP; 'GNC' / 'GAS NATURAL COMPRIMIDO' -> GNC; GNL; o None."""
    t = norm_text(texto)
    if not t:
        return None
    for gas, patron in _GAS_TEXTO:
        if patron.search(t):
            return gas
    return None


def gas_modelo(texto) -> str | None:
    """Por el texto de MODELO: 'Sandero 1.0 TCe ECO-G 100' -> GLP; 'Leon 1.5 TGI' -> GNC. Sin confirmar."""
    gas = gas_texto(texto)
    if gas:
        return gas
    t = norm_text(texto)
    for gas, patron in _GAS_MODELO:
        if patron.search(t):
            return gas
    return None


def gas_web(p3, modelo_texto) -> tuple[str | None, str | None]:
    """(gas, aviso): del P.3 si lo dice; si no, del MODELO con aviso de «sin confirmar»; (None, None) si no hay gas."""
    gas = gas_texto(p3)
    if gas:
        return gas, None
    gas = gas_modelo(modelo_texto)
    if gas:
        return gas, (f"gas: {gas} según el texto de MODELO, sin confirmar con el permiso (P.3 «{p3 or '-'}»); "
                     "cambia la etiqueta DGT a ECO")
    return None, None
