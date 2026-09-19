"""Comparison rules between the sheet row and the values extracted from the documents."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from common import (fmt_value, month_year_label, norm_text, normalize_plate, parse_date, parse_int,
                    parse_number)
from sheet import FIELD_LABELS, VehicleRow, normalize_vin, validate_vin  # noqa: F401
from combustible import combustible_modelo, combustible_permiso, normalizar_combustible

OK = "OK"
RELLENAR = "RELLENAR"
DISCREPANCIA = "DISCREPANCIA"
SIN_DATO = "SIN DATO"
REVISAR = "REVISAR"

CV_TOLERANCE = 3
KW_TO_CV = 1.36

SRC_FICHA = "ficha técnica"
SRC_PERMISO = "permiso circulación"
SRC_MODELO = "MODELO (hoja)"
SRC_HOJA_E = "hoja (col. E)"
SRC_VENTAS = "ventas"

AUTO_TOKENS = {"automatico", "automatica", "automatic", "auto", "aut", "at", "at6", "at7", "at8", "at9",
               "dsg", "dsg6", "dsg7", "stronic", "s-tronic", "eat6", "eat8", "edc", "steptronic", "dct", "dct7",
               "cvt", "e-cvt", "ecvt", "xtronic", "tiptronic", "multitronic", "powershift", "7g-tronic",
               "9g-tronic", "g-tronic", "7g-dct", "8g-dct", "tct", "pdk", "aisin"}
MANUAL_TOKENS = {"manual", "mt", "mt5", "mt6", "man"}
HYBRID_SUBSTRINGS = ("hibr", "hybrid", "phev", "e-power", "epower")
HYBRID_TOKENS = {"hev", "mhev", "fhev", "phev"}
THERMAL_FUELS = ("gasolina", "diesel", "gasoleo", "petrol")
# "potencia total/combinada/del sistema: 104 kW" or "141 CV en total" inside ficha observations
_COMBINED_RE = re.compile(
    r"(?:total|combinad\w*|sistema|conjunt\w*)\D{0,60}?(\d{2,3}(?:[.,]\d+)?)\s*(kw|cv)"
    r"|(\d{2,3}(?:[.,]\d+)?)\s*(kw|cv)\D{0,40}?(?:total|combinad\w*|sistema|conjunt\w*)")


@dataclass
class Finding:
    campo: str
    columna_sheet: str
    valor_sheet: object
    valor_documento: object
    fuente: str
    estado: str
    nota: str = ""
    field_name: str = ""          # logical sheet field (for --escribir)

    def as_row(self) -> dict:
        return {"campo": self.campo, "columna_sheet": self.columna_sheet,
                "valor_sheet": fmt_value(self.valor_sheet), "valor_documento": fmt_value(self.valor_documento),
                "fuente": self.fuente, "estado": self.estado, "nota": self.nota}


@dataclass
class SourceValues:
    """One row of the side-by-side table in the report."""
    campo: str
    hoja: object = None
    ficha: object = None
    permiso: object = None


@dataclass
class Comparison:
    findings: list[Finding] = field(default_factory=list)
    sources: list[SourceValues] = field(default_factory=list)
    hybrid: bool = False

    def by_state(self, state: str) -> list[Finding]:
        return [f for f in self.findings if f.estado == state]


# ------------------------------------------------------------------ helpers
def _get(doc: dict | None, key: str):
    if not doc or not doc.get("presente", True):
        return None
    value = doc.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    return value


def kw_to_cv(kw) -> int | None:
    kw = parse_number(kw)
    return int(round(kw * KW_TO_CV)) if kw is not None else None


def cv_in_modelo(modelo: str) -> int | None:
    m = re.search(r"(\d{2,3})\s*cv\b", norm_text(modelo))
    return int(m.group(1)) if m else None


def infer_caja_from_modelo(modelo: str) -> str | None:
    text = norm_text(modelo)
    if "s tronic" in text or "s-tronic" in text:
        return "Automático"
    tokens = set(re.split(r"[\s/,()]+", text))
    if tokens & AUTO_TOKENS:
        return "Automático"
    if tokens & MANUAL_TOKENS:
        return "Manual"
    return None


def normalize_caja(value) -> str | None:
    text = norm_text(value)
    if not text:
        return None
    if text.startswith("auto") or text in AUTO_TOKENS:
        return "Automático"
    if text.startswith("man") or text in MANUAL_TOKENS:
        return "Manual"
    return str(value).strip()


def text_says_hybrid(text: str | None) -> bool:
    """'GASOLINA - HÍBRIDO ENCHUFABLE', 'PHEV', 'Híbrido', 'ELECTRICO/GASOLINA' -> True; 'ELECTRICO' alone or
    'chevrolet' -> False."""
    t = norm_text(text)
    if not t:
        return False
    if any(h in t for h in HYBRID_SUBSTRINGS):
        return True
    tokens = set(re.split(r"[^a-z0-9]+", t))
    if tokens & HYBRID_TOKENS:
        return True
    return "electr" in t and any(f in t for f in THERMAL_FUELS)


def is_hybrid(sheet_row: VehicleRow | None, ficha: dict | None, permiso: dict | None) -> bool:
    if _get(ficha, "hibrido") is True or _get(permiso, "hibrido") is True:
        return True
    texts = [sheet_row.modelo if sheet_row else "", _get(ficha, "combustible"), _get(permiso, "combustible"),
             _get(ficha, "observaciones")]
    return any(text_says_hybrid(t) for t in texts)


def combined_cv_in_observaciones(text: str | None) -> int | None:
    """Total/combined system power stated in the ficha observations, in CV (kW converted)."""
    m = _COMBINED_RE.search(norm_text(text))
    if not m:
        return None
    value, unit = (m.group(1), m.group(2)) if m.group(1) else (m.group(3), m.group(4))
    num = parse_number(value)
    if num is None:
        return None
    return int(round(num * KW_TO_CV)) if unit == "kw" else int(round(num))


def _state(sheet_value, doc_value, equal: bool) -> str:
    if sheet_value is None and doc_value is None:
        return SIN_DATO
    if doc_value is None:
        return SIN_DATO
    if sheet_value is None:
        return RELLENAR
    return OK if equal else DISCREPANCIA


def _first(*pairs):
    """First (value, source) whose value is not None."""
    for value, source in pairs:
        if value is not None:
            return value, source
    return None, None


# ----------------------------------------------------------------- compare
def compare(sheet_row: VehicleRow | None, ai: dict | None = None, columns: dict[str, str] | None = None,
            ventas_bastidor: str | None = None) -> Comparison:
    """Build findings. `ai` is the extraction result: {'ficha_tecnica': {...}, 'permiso_circulacion': {...}}.
    `ventas_bastidor` is the VIN from Ventas-Sevencars, used only when no document VIN is available.
    Sources: permiso de circulación (primary) and ficha técnica (complement). The dealer's PDF is NOT a source."""
    columns = columns or {}
    ficha = (ai or {}).get("ficha_tecnica") or None
    permiso = (ai or {}).get("permiso_circulacion") or None
    row = sheet_row
    cmp = Comparison()
    cmp.hybrid = is_hybrid(row, ficha, permiso)

    def col(field_name: str) -> str:
        return columns.get(field_name, "")

    def add(campo, field_name, valor_sheet, valor_doc, fuente, estado, nota=""):
        cmp.findings.append(Finding(campo=campo, columna_sheet=col(field_name), valor_sheet=valor_sheet,
                                    valor_documento=valor_doc, fuente=fuente or "", estado=estado, nota=nota,
                                    field_name=field_name))

    # ---- matrícula
    sheet_plate = row.matricula or None if row else None
    doc_plate, src = _first((normalize_plate(_get(permiso, "matricula")) or None, SRC_PERMISO),
                            (normalize_plate(_get(ficha, "matricula")) or None, SRC_FICHA))
    nota = ""
    fp, pp = normalize_plate(_get(ficha, "matricula")), normalize_plate(_get(permiso, "matricula"))
    if fp and pp and fp != pp:
        nota = f"la ficha ({fp}) y el permiso ({pp}) no coinciden"
    add("matrícula", "matricula", sheet_plate, doc_plate, src, _state(sheet_plate, doc_plate, sheet_plate == doc_plate), nota)

    # ---- modelo (marca + denominación comercial deben aparecer en MODELO)
    marca, src_m = _first((_get(permiso, "marca"), SRC_PERMISO), (_get(ficha, "marca"), SRC_FICHA))
    denom, src_d = _first((_get(permiso, "denominacion_comercial"), SRC_PERMISO),
                          (_get(ficha, "denominacion_comercial"), SRC_FICHA))
    sheet_modelo = row.modelo or None if row else None
    modelo_n = norm_text(sheet_modelo)
    if marca or denom:
        doc_modelo = " ".join(x for x in (marca, denom) if x)
        if sheet_modelo is None:
            add("modelo", "modelo", None, doc_modelo, src_m or src_d, RELLENAR)
        else:
            missing = [x for x in (marca, denom) if x and norm_text(x) not in modelo_n]
            if not missing:
                add("modelo", "modelo", sheet_modelo, doc_modelo, src_m or src_d, OK)
            else:
                add("modelo", "modelo", sheet_modelo, doc_modelo, src_m or src_d, DISCREPANCIA,
                    "no aparece en MODELO: " + ", ".join(missing))
    else:
        add("modelo", "modelo", sheet_modelo, None, "", SIN_DATO)

    # ---- fecha de matriculación (B si existe, si no I)
    sheet_date = row.fecha_matriculacion if row else None
    doc_b = parse_date(_get(permiso, "fecha_primera_matriculacion")) or parse_date(_get(ficha, "fecha_primera_matriculacion"))
    doc_i = parse_date(_get(permiso, "fecha_matriculacion")) or parse_date(_get(ficha, "fecha_matriculacion"))
    doc_date: date | None = doc_b or doc_i
    src_date = None
    if doc_date is not None:
        src_date = (SRC_PERMISO if _get(permiso, "fecha_primera_matriculacion") or _get(permiso, "fecha_matriculacion")
                    else SRC_FICHA)
        nota = ""
        if doc_b and doc_i and doc_b != doc_i:
            nota = f"B (primera matriculación) = {fmt_value(doc_b)}, I = {fmt_value(doc_i)}; se usa B"
        add("fecha matriculación", "fecha_matriculacion", sheet_date, doc_date, src_date,
            _state(sheet_date, doc_date, sheet_date == doc_date), nota)
    else:
        add("fecha matriculación", "fecha_matriculacion", sheet_date, None, "", SIN_DATO)

    # ---- matriculacion (AB) y matriculacion num (AC): derivadas de la fecha
    ref_date, ref_src = (doc_date, src_date) if doc_date else (sheet_date, SRC_HOJA_E)
    ym = (ref_date.year, ref_date.month) if ref_date is not None else None
    sheet_ab = row.matriculacion or None if row else None
    sheet_ac = row.matriculacion_num if row else None
    if ym:
        exp_ab, exp_ac = month_year_label(*ym), ym[0] * 100 + ym[1]
        add("matriculación (texto)", "matriculacion", sheet_ab, exp_ab, ref_src,
            _state(sheet_ab, exp_ab, norm_text(sheet_ab) == norm_text(exp_ab)))
        add("matriculación (num)", "matriculacion_num", sheet_ac, exp_ac, ref_src,
            _state(sheet_ac, exp_ac, sheet_ac == exp_ac))
    else:
        add("matriculación (texto)", "matriculacion", sheet_ab, None, "", SIN_DATO)
        add("matriculación (num)", "matriculacion_num", sheet_ac, None, "", SIN_DATO)

    # ---- motor cv (permiso first). Hybrids: the TOTAL system power only from the MODELO text; never P.2 alone.
    sheet_cv = row.motor_cv if row else None
    kw, src_kw = _first((_get(permiso, "potencia_kw"), SRC_PERMISO), (_get(ficha, "potencia_kw"), SRC_FICHA))
    doc_cv = kw_to_cv(kw)                      # P.2 × 1.36 (combustion engine for hybrids)
    src_cv = f"{src_kw} ({fmt_value(kw)} kW × 1,36)" if doc_cv is not None else ""
    modelo_cv = cv_in_modelo(row.modelo) if row else None
    ref_cv, ref_cv_src = None, ""              # value used for the "potencia en MODELO" check
    if cmp.hybrid:
        termico = f"el permiso solo da el motor térmico, {doc_cv} CV" if doc_cv is not None else "sin potencia térmica legible"
        if modelo_cv is not None:
            equal = sheet_cv is not None and abs(sheet_cv - modelo_cv) <= CV_TOLERANCE
            add("motor cv", "motor_cv", sheet_cv, modelo_cv, SRC_MODELO, _state(sheet_cv, modelo_cv, equal),
                f"híbrido: potencia total del sistema según el texto de MODELO ({termico}); confirmar la potencia total")
        else:
            add("motor cv", "motor_cv", sheet_cv, None, src_kw or "", REVISAR,
                f"híbrido: falta la potencia total del sistema ({termico}); sin confirmar, no se escribe")
    elif doc_cv is not None:
        nota = f"el texto de MODELO dice {modelo_cv} CV" if modelo_cv is not None and abs(modelo_cv - doc_cv) > CV_TOLERANCE else ""
        equal = sheet_cv is not None and abs(sheet_cv - doc_cv) <= CV_TOLERANCE
        add("motor cv", "motor_cv", sheet_cv, doc_cv, src_cv, _state(sheet_cv, doc_cv, equal), nota)
        ref_cv, ref_cv_src = doc_cv, src_kw
    else:
        add("motor cv", "motor_cv", sheet_cv, None, "", SIN_DATO)

    # potencia mencionada en MODELO vs documento (no híbridos)
    if modelo_cv is not None and ref_cv is not None:
        if abs(modelo_cv - ref_cv) <= CV_TOLERANCE:
            add("potencia en MODELO", "modelo", modelo_cv, ref_cv, ref_cv_src, OK, "CV mencionados en el texto de MODELO")
        else:
            add("potencia en MODELO", "modelo", modelo_cv, ref_cv, ref_cv_src, REVISAR,
                "los CV del texto de MODELO no coinciden con el documento")

    # ---- cubicaje
    sheet_cc = row.cubicaje if row else None
    doc_cc, src_cc = _first((parse_int(_get(permiso, "cilindrada_cc")), SRC_PERMISO),
                            (parse_int(_get(ficha, "cilindrada_cc")), SRC_FICHA))
    if doc_cc is not None:
        equal = sheet_cc is not None and (sheet_cc == doc_cc or sheet_cc == int(round(doc_cc / 100.0)) * 100)
        nota = "" if sheet_cc is None or sheet_cc == doc_cc else "la hoja tiene el valor redondeado a centenas"
        add("cubicaje", "cubicaje", sheet_cc, doc_cc, src_cc, _state(sheet_cc, doc_cc, equal), nota)
    else:
        add("cubicaje", "cubicaje", sheet_cc, None, "", SIN_DATO)

    # ---- caja (no figura en documentos oficiales): tokens de MODELO; si no, las fotos (verificar.caja_por_fotos)
    sheet_caja = normalize_caja(row.caja) if row else None
    from_modelo = infer_caja_from_modelo(row.modelo) if row else None
    if from_modelo:
        nota = "inferido del texto de MODELO; la caja no figura en los documentos oficiales"
        add("caja", "caja", sheet_caja, from_modelo, SRC_MODELO, _state(sheet_caja, from_modelo, sheet_caja == from_modelo), nota)
    else:
        add("caja", "caja", sheet_caja, None, "", SIN_DATO, "sin fuente: la caja no figura en los documentos oficiales")

    # ---- kms (informativo)
    sheet_kms = row.kms if row else None
    doc_kms = parse_int(_get(permiso, "kilometraje")) or parse_int(_get(ficha, "kilometraje"))
    kms_date = _get(permiso, "kilometraje_fecha") or _get(ficha, "kilometraje_fecha")
    if doc_kms is not None:
        src = f"{SRC_PERMISO} (a fecha {fmt_value(parse_date(kms_date)) or kms_date})" if kms_date else SRC_PERMISO
        if sheet_kms is None:
            add("kms", "kms", None, doc_kms, src, REVISAR, "informativo: lectura antigua del permiso (X se calcula desde Ventas, no se escribe)")
        elif sheet_kms >= doc_kms:
            add("kms", "kms", sheet_kms, doc_kms, src, OK, "informativo: la hoja es igual o superior a la lectura del documento")
        else:
            add("kms", "kms", sheet_kms, doc_kms, src, REVISAR, "la hoja tiene MENOS km que una lectura anterior del permiso")
    else:
        add("kms", "kms", sheet_kms, None, "", SIN_DATO)

    # ---- bastidor (AE): permiso E > ficha E > Ventas
    sheet_vin = (row.bastidor or None) if row else None
    fb, pb = normalize_vin(_get(ficha, "bastidor")) or None, normalize_vin(_get(permiso, "bastidor")) or None
    vv = normalize_vin(ventas_bastidor) or None
    doc_vin, src_vin = _first((pb, SRC_PERMISO), (fb, SRC_FICHA), (vv, SRC_VENTAS))
    if doc_vin is not None:
        nota = "" if validate_vin(doc_vin) else "formato dudoso (17 caracteres sin I/O/Q)"
        if src_vin == SRC_VENTAS:
            nota = ("sin bastidor leído en los documentos; se usa Ventas-Sevencars; " + nota).strip("; ")
        elif vv and vv != doc_vin:
            nota = (f"Ventas-Sevencars tiene {vv}; " + nota).strip("; ")
        add("bastidor", "bastidor", sheet_vin, doc_vin, src_vin, _state(sheet_vin, doc_vin, sheet_vin == doc_vin), nota)
    else:
        add("bastidor", "bastidor", sheet_vin, None, "", SIN_DATO, "sin bastidor en documentos ni en Ventas")

    # ---- combustible (AF): P.3 del permiso > P.3 de la ficha > MODELO (sin confirmar, nunca se escribe)
    sheet_fuel = normalizar_combustible(row.combustible) if row else None
    doc_fuel, src_fuel = _first((combustible_permiso(_get(permiso, "combustible")), SRC_PERMISO),
                                (combustible_permiso(_get(ficha, "combustible")), SRC_FICHA))
    if doc_fuel is not None:
        add("combustible", "combustible", sheet_fuel, doc_fuel, src_fuel,
            _state(sheet_fuel, doc_fuel, norm_text(sheet_fuel) == norm_text(doc_fuel)))
    else:
        guess, aviso = combustible_modelo(row.modelo if row else "")
        if sheet_fuel is None:
            add("combustible", "combustible", None, guess, SRC_MODELO, REVISAR,
                "sin confirmar: " + (aviso or "deducido del MODELO, no del permiso") + "; no se escribe")
        else:
            add("combustible", "combustible", sheet_fuel, guess, SRC_MODELO,
                OK if norm_text(sheet_fuel) == norm_text(guess) else REVISAR,
                "sin confirmar: deducido del MODELO, no del permiso")

    # ---- coherencia ficha vs permiso (bastidor)
    if fb and pb and fb != pb:
        add("bastidor (ficha vs permiso)", "", fb, pb, f"{SRC_FICHA} / {SRC_PERMISO}", REVISAR,
            "el bastidor no coincide entre la ficha y el permiso")

    cmp.sources = build_sources(row, ficha, permiso, doc_cv, from_modelo)
    return cmp


def build_sources(row, ficha, permiso, doc_cv, caja_modelo) -> list[SourceValues]:
    def g(doc, key):
        return _get(doc, key)
    rows = [
        SourceValues("matrícula", row.matricula if row else None, g(ficha, "matricula"), g(permiso, "matricula")),
        SourceValues("marca", None, g(ficha, "marca"), g(permiso, "marca")),
        SourceValues("denominación comercial", row.modelo if row else None, g(ficha, "denominacion_comercial"),
                     g(permiso, "denominacion_comercial")),
        SourceValues("tipo / variante", None, g(ficha, "tipo_variante"), g(permiso, "tipo_variante")),
        SourceValues("bastidor", None, g(ficha, "bastidor"), g(permiso, "bastidor")),
        SourceValues("fecha matriculación (I)", row.fecha_matriculacion if row else None,
                     parse_date(g(ficha, "fecha_matriculacion")), parse_date(g(permiso, "fecha_matriculacion"))),
        SourceValues("primera matriculación (B)", None, parse_date(g(ficha, "fecha_primera_matriculacion")),
                     parse_date(g(permiso, "fecha_primera_matriculacion"))),
        SourceValues("cilindrada (P.1)", row.cubicaje if row else None, g(ficha, "cilindrada_cc"),
                     g(permiso, "cilindrada_cc")),
        SourceValues("potencia kW (P.2)", None, g(ficha, "potencia_kw"), g(permiso, "potencia_kw")),
        SourceValues("potencia CV", row.motor_cv if row else None, kw_to_cv(g(ficha, "potencia_kw")),
                     kw_to_cv(g(permiso, "potencia_kw"))),
        SourceValues("combustible (P.3)", None, g(ficha, "combustible"), g(permiso, "combustible")),
        SourceValues("plazas (S.1)", None, g(ficha, "plazas"), g(permiso, "plazas")),
        SourceValues("masa en servicio (G)", None, g(ficha, "masa_servicio_kg"), g(permiso, "masa_servicio_kg")),
        SourceValues("CO2 (V.7)", None, g(ficha, "co2_g_km"), None),
        SourceValues("norma Euro (V.9)", None, g(ficha, "norma_euro"), None),
        SourceValues("neumáticos (F.7)", None, g(ficha, "neumaticos"), None),
        SourceValues("próxima ITV", None, g(ficha, "proxima_itv"), g(permiso, "proxima_itv")),
        SourceValues("kms", row.kms if row else None, g(ficha, "kilometraje"), g(permiso, "kilometraje")),
        SourceValues("caja", row.caja if row else None, None, None),
        SourceValues("híbrido", None, g(ficha, "hibrido"), g(permiso, "hibrido")),
        SourceValues("observaciones", None, g(ficha, "observaciones"), g(permiso, "observaciones")),
    ]
    if caja_modelo:
        rows[-3].hoja = f"{row.caja or ''} (MODELO sugiere {caja_modelo})".strip()
    rows.insert(5, SourceValues("bastidor (hoja AE)", row.bastidor if row else None, None, None))
    return rows


def doc_summary(ai: dict | None) -> dict:
    """Key document values used by the Ventas cross-check: vin, date, kms, kms_date, marca, denominacion."""
    ficha = (ai or {}).get("ficha_tecnica") or None
    permiso = (ai or {}).get("permiso_circulacion") or None
    vin = normalize_vin(_get(permiso, "bastidor")) or normalize_vin(_get(ficha, "bastidor")) or None
    doc_b = parse_date(_get(permiso, "fecha_primera_matriculacion")) or parse_date(_get(ficha, "fecha_primera_matriculacion"))
    doc_i = parse_date(_get(permiso, "fecha_matriculacion")) or parse_date(_get(ficha, "fecha_matriculacion"))
    kms_date = _get(permiso, "kilometraje_fecha") or _get(ficha, "kilometraje_fecha")
    return {
        "vin": vin,
        "date": doc_b or doc_i,
        "kms": parse_int(_get(permiso, "kilometraje")) or parse_int(_get(ficha, "kilometraje")),
        "kms_date": fmt_value(parse_date(kms_date)) or kms_date,
        "marca": _get(permiso, "marca") or _get(ficha, "marca"),
        "denominacion": _get(permiso, "denominacion_comercial") or _get(ficha, "denominacion_comercial"),
    }
