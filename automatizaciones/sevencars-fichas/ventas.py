"""Read-only cross-check against the 'Ventas-Sevencars' spreadsheet (several tabs, varying headers)."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime

from common import fmt_value, norm_text, normalize_plate, parse_int, strip_accents
from gauth import describe_google_error, gspread_client
from sheet import SheetError, VehicleRow, col_letter, duplicates, normalize_vin, validate_vin

DEFAULT_VENTAS_SHEET_ID = "1RwnqBYlPMXj2rUJ3XqegrSQ-kM5RIJG61uGALy-pEH8"

ALIASES = {
    "marca": ("MARCA",),
    "modelo": ("MODELO",),
    "matricula": ("MATRICULA",),
    "bastidor": ("BASTIDOR",),
    "kms": ("KMS",),
    "fecha": ("FECHA MATRI", "FECHA MATR", "FECHA MATRIC", "FECHA MATRICULACION"),
}
SRC_VENTAS = "ventas"
NO_ENCONTRADO = "NO ENCONTRADO"
_PLATE_RE = re.compile(r"^\d{4}[A-Z]{3}$")


# ---------------------------------------------------------- normalization
def normalize_ventas_ref(value) -> str:
    """'#1082' -> '1082', '#C2' -> 'C2', 'D-26' -> 'D26', ' r-11 ' -> 'R11', 1065.0 -> '1065'."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = strip_accents(str(value)).upper()
    text = re.sub(r"[#\-\s_]", "", text)
    if re.fullmatch(r"\d+\.0+", text):
        text = text.split(".")[0]
    return text


def normalize_ventas_plate(value) -> str | None:
    """'0110 LMK' -> '0110LMK'; 'Alemana/0703NLP' -> '0703NLP'; 'LMM' / 'ALEMANA' -> None."""
    if value is None:
        return None
    text = str(value)
    if "/" in text:
        text = text.rsplit("/", 1)[1]
    plate = normalize_plate(text)
    return plate if _PLATE_RE.match(plate) else None


def parse_ventas_kms(value) -> int | None:
    """'88.858' -> 88858; '160,922' -> 160922; '' -> None."""
    if value is None or str(value).strip() == "":
        return None
    text = str(value).strip()
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+", text):
        return int(re.sub(r"[.,]", "", text))
    return parse_int(text)


@dataclass
class PartialDate:
    raw: str = ""
    year: int | None = None
    month: int | None = None
    day: int | None = None

    @property
    def date(self) -> date | None:
        if self.year and self.month and self.day:
            try:
                return date(self.year, self.month, self.day)
            except ValueError:
                return None
        return None

    @property
    def empty(self) -> bool:
        return self.year is None

    def label(self) -> str:
        if self.date:
            return fmt_value(self.date)
        if self.year and self.month:
            return f"{self.month:02d}/{self.year}"
        if self.year:
            return str(self.year)
        return self.raw

    def matches(self, other: date | None) -> tuple[bool, str]:
        """Compare with an exact date: by day if we have one, else by month, else by year."""
        if other is None or self.empty:
            return False, ""
        if self.day is not None:
            return self.date == other, "por día"
        if self.month is not None:
            return (self.year, self.month) == (other.year, other.month), "por mes"
        return self.year == other.year, "por año"


def parse_ventas_date(value) -> PartialDate:
    """Lenient: '11/04/2022', '7/11/2022', '04/08/09', '2022-04-11', '2007', 'Abr 2022'; raw kept when unparsable."""
    if value is None:
        return PartialDate()
    if isinstance(value, datetime):
        return PartialDate(str(value), value.year, value.month, value.day)
    if isinstance(value, date):
        return PartialDate(str(value), value.year, value.month, value.day)
    raw = str(value).strip()
    if not raw:
        return PartialDate()
    text = raw.split(" ")[0] if re.match(r"^\d", raw) else raw
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y"):
        try:
            d = datetime.strptime(text, fmt)
            return PartialDate(raw, d.year, d.month, d.day)
        except ValueError:
            continue
    m = re.fullmatch(r"(\d{1,2})[/\-](\d{4})", text)
    if m and 1 <= int(m.group(1)) <= 12:
        return PartialDate(raw, int(m.group(2)), int(m.group(1)))
    m = re.fullmatch(r"(\d{4})", text)
    if m:
        return PartialDate(raw, int(m.group(1)))
    from common import parse_month_year
    ym = parse_month_year(raw)
    if ym:
        return PartialDate(raw, ym[0], ym[1])
    return PartialDate(raw)


# ------------------------------------------------------------------ model
@dataclass
class VentasRow:
    tab: str
    row_number: int
    referencia: str
    raw: dict = field(default_factory=dict)
    marca: str = ""
    modelo: str = ""
    matricula: str | None = None
    matricula_raw: str = ""
    bastidor: str = ""
    kms: int | None = None
    fecha: PartialDate = field(default_factory=PartialDate)

    def summary(self) -> str:
        return (f"pestaña '{self.tab}' fila {self.row_number}: ref {self.referencia} | {self.marca} {self.modelo} | "
                f"matrícula {self.matricula or self.matricula_raw or '-'} | bastidor {self.bastidor or '-'} | "
                f"kms {fmt_value(self.kms) or '-'} | fecha {self.fecha.label() or '-'}")


@dataclass
class VentasMatch:
    """Result of a safe lookup in Ventas (see VentasData.match)."""
    row: VentasRow | None
    by: str | None = None          # "referencia" | "matricula"
    nota: str = ""
    conflict: bool = False         # referencia found but plates disagree and no plate match

    @property
    def found(self) -> bool:
        return self.row is not None


def _prefer_vin(rows: list[VentasRow]) -> VentasRow:
    return next((r for r in rows if r.bastidor), rows[0])


def _join_notes(*parts: str) -> str:
    return "; ".join(p for p in parts if p)


@dataclass
class VentasTab:
    title: str
    columns: dict[str, int]
    rows: list[VentasRow]

    def column_letter(self, key: str) -> str:
        idx = self.columns.get(key)
        return col_letter(idx) if idx is not None else ""


def _map_columns(header: list) -> dict[str, int]:
    cols: dict[str, int] = {}
    normalized = [norm_text(h) for h in header]
    for key, names in ALIASES.items():
        targets = [norm_text(n) for n in names]
        for idx, h in enumerate(normalized):
            if h in targets and key not in cols:
                cols[key] = idx
    return cols


def parse_tab(title: str, values: list[list]) -> VentasTab:
    if not values:
        return VentasTab(title, {}, [])
    cols = _map_columns(values[0])
    rows: list[VentasRow] = []

    def cell(row, key):
        idx = cols.get(key)
        if idx is None or idx >= len(row):
            return None
        v = row[idx]
        return None if v is None or str(v).strip() == "" else v

    for r, row in enumerate(values[1:], start=2):
        ref = normalize_ventas_ref(row[0] if row else None)
        if not ref:
            continue
        raw = {k: cell(row, k) for k in ALIASES}
        rows.append(VentasRow(
            tab=title, row_number=r, referencia=ref, raw=raw,
            marca=str(raw.get("marca") or "").strip(),
            modelo=str(raw.get("modelo") or "").strip(),
            matricula=normalize_ventas_plate(raw.get("matricula")),
            matricula_raw=str(raw.get("matricula") or "").strip(),
            bastidor=normalize_vin(raw.get("bastidor")),
            kms=parse_ventas_kms(raw.get("kms")),
            fecha=parse_ventas_date(raw.get("fecha")),
        ))
    return VentasTab(title, cols, rows)


class VentasData:
    def __init__(self, tabs: list[VentasTab]):
        self.tabs = tabs

    @classmethod
    def from_values(cls, values_by_tab: dict[str, list[list]]) -> "VentasData":
        return cls([parse_tab(title, values) for title, values in values_by_tab.items()])

    @property
    def tab_titles(self) -> list[str]:
        return [t.title for t in self.tabs]

    def tab(self, title: str) -> VentasTab | None:
        return next((t for t in self.tabs if t.title == title), None)

    def find_by_ref(self, ref: str) -> VentasRow | None:
        ref = normalize_ventas_ref(ref)
        hits = [r for t in self.tabs for r in t.rows if r.referencia == ref]
        if not hits:
            return None
        with_vin = [r for r in hits if r.bastidor]
        return (with_vin or hits)[0]

    def find_by_plate(self, plate: str) -> VentasRow | None:
        plate = normalize_plate(plate)
        if not plate:
            return None
        hits = [r for t in self.tabs for r in t.rows if r.matricula == plate]
        if not hits:
            return None
        with_vin = [r for r in hits if r.bastidor]
        return (with_vin or hits)[0]

    def find_all_by_ref(self, ref: str) -> list[VentasRow]:
        ref = normalize_ventas_ref(ref)
        return [r for t in self.tabs for r in t.rows if r.referencia == ref]

    def find(self, ref: str | None, plate: str | None) -> VentasRow | None:
        return self.match(ref, plate).row

    def match(self, ref: str | None, plate: str | None) -> VentasMatch:
        """Safe lookup. A referencia hit is accepted only if the plates agree (or Datos has no plate);
        otherwise fall back to the plate, and report a conflict when nothing agrees."""
        plate_n = normalize_plate(plate) or None
        by_ref = self.find_all_by_ref(ref) if ref else []
        if by_ref:
            if plate_n is None:
                return VentasMatch(_prefer_vin(by_ref), "referencia")
            agree = [r for r in by_ref if r.matricula == plate_n]
            if agree:
                return VentasMatch(_prefer_vin(agree), "referencia")
            ventas_plates = ", ".join(sorted({r.matricula or r.matricula_raw or "-" for r in by_ref}))
            by_plate = self.find_by_plate(plate_n)
            if by_plate is not None:
                return VentasMatch(by_plate, "matricula",
                                   nota=f"referencia en Datos ({ref}) no coincide con Ventas (#{by_plate.referencia}); "
                                        f"emparejado por matrícula")
            return VentasMatch(None, None, conflict=True,
                               nota=f"la referencia {ref} en Ventas tiene matrícula '{ventas_plates}', distinta de la de "
                                    f"Datos ({plate_n}), y la matrícula no se encontró en Ventas")
        if plate_n:
            by_plate = self.find_by_plate(plate_n)
            if by_plate is not None:
                nota = (f"referencia {ref} no está en Ventas; emparejado por matrícula (#{by_plate.referencia})"
                        if ref else "emparejado por matrícula")
                return VentasMatch(by_plate, "matricula", nota=nota)
        return VentasMatch(None, None)


class VentasSheet:
    """Live read of every tab of Ventas-Sevencars (read only; never written)."""

    def __init__(self, sheet_id: str | None = None, allow_browser: bool = True):
        self.sheet_id = sheet_id or os.environ.get("VENTAS_SHEET_ID") or DEFAULT_VENTAS_SHEET_ID
        self.allow_browser = allow_browser
        self.title = ""

    def load(self) -> VentasData:
        import gspread
        client = gspread_client(self.allow_browser)
        try:
            spreadsheet = client.open_by_key(self.sheet_id)
            self.title = spreadsheet.title
            values_by_tab = {ws.title: ws.get_all_values() for ws in spreadsheet.worksheets()}
        except gspread.exceptions.SpreadsheetNotFound:
            raise SheetError("No se encontró la hoja Ventas-Sevencars. ¿La cuenta autorizada tiene acceso?")
        except Exception as exc:
            raise SheetError(f"No se pudo leer Ventas-Sevencars: {describe_google_error(exc)}")
        return VentasData.from_values(values_by_tab)


# --------------------------------------------------------------- compare
def compare_ventas(vrow: VentasRow | None, sheet_row: VehicleRow | None, doc_vin: str | None = None,
                   doc_date: date | None = None, doc_kms: int | None = None, doc_kms_date: str | None = None,
                   ficha_marca: str | None = None, ficha_denominacion: str | None = None,
                   vtab: VentasTab | None = None, match: VentasMatch | None = None) -> list:
    """Findings for the Ventas section (fuente='ventas'). Never produces writes."""
    from compare import DISCREPANCIA, OK, REVISAR, SIN_DATO, Finding
    out: list[Finding] = []
    if match is not None and match.conflict:
        out.append(Finding(campo="ventas", columna_sheet="", valor_sheet=None, valor_documento=None,
                           fuente=SRC_VENTAS, estado=REVISAR, nota=match.nota))
        return out

    def add(campo, col_key, v_ventas, v_ref, estado, nota=""):
        col = f"{vrow.tab}!{vtab.column_letter(col_key)}" if (vrow and vtab and vtab.column_letter(col_key)) else ""
        out.append(Finding(campo=campo, columna_sheet=col, valor_sheet=v_ref, valor_documento=v_ventas,
                           fuente=SRC_VENTAS, estado=estado, nota=nota, field_name=""))

    if vrow is None:
        out.append(Finding(campo="ventas", columna_sheet="", valor_sheet=None, valor_documento=None,
                           fuente=SRC_VENTAS, estado=NO_ENCONTRADO,
                           nota="el vehículo no aparece en Ventas-Sevencars (ni por referencia ni por matrícula)"))
        return out

    if match is not None and match.nota:
        add("emparejamiento", "", f"#{vrow.referencia}", sheet_row.referencia if sheet_row else None, OK, match.nota)

    # matrícula
    base_plate = sheet_row.matricula if sheet_row else None
    if vrow.matricula:
        ref_plate = base_plate
        if ref_plate:
            add("matrícula", "matricula", vrow.matricula, ref_plate, OK if vrow.matricula == ref_plate else DISCREPANCIA,
                "Ventas vs Base_Datos")
    elif vrow.matricula_raw:
        add("matrícula", "matricula", vrow.matricula_raw, base_plate, SIN_DATO, "matrícula incompleta en Ventas")

    # bastidor (key check)
    vin_ventas = vrow.bastidor or None
    nota_vin = "" if not vin_ventas or validate_vin(vin_ventas) else "formato dudoso (17 caracteres sin I/O/Q)"
    if doc_vin:
        ref_vin = normalize_vin(doc_vin)
        if vin_ventas is None:
            add("bastidor", "bastidor", None, ref_vin, SIN_DATO, "Ventas no tiene bastidor; documento: " + ref_vin)
        else:
            add("bastidor", "bastidor", vin_ventas, ref_vin, OK if vin_ventas == ref_vin else DISCREPANCIA,
                ("Ventas vs ficha técnica/permiso; " + nota_vin).strip("; "))
    else:
        base_vin = sheet_row.bastidor if sheet_row else None
        if vin_ventas is None:
            add("bastidor", "bastidor", None, base_vin, SIN_DATO, "Ventas no tiene bastidor")
        elif base_vin:
            add("bastidor", "bastidor", vin_ventas, base_vin, OK if vin_ventas == base_vin else DISCREPANCIA,
                ("Ventas vs Base_Datos (sin documento leído); " + nota_vin).strip("; "))
        else:
            add("bastidor", "bastidor", vin_ventas, None, SIN_DATO,
                ("sin documento leído ni bastidor en Base_Datos; " + nota_vin).strip("; "))

    # fecha
    ref_date, ref_label = (doc_date, "permiso") if doc_date else ((sheet_row.fecha_matriculacion, "Base_Datos") if sheet_row else (None, ""))
    if vrow.fecha.empty:
        add("fecha matriculación", "fecha", vrow.fecha.raw or None, ref_date, SIN_DATO,
            "sin fecha (o ilegible) en Ventas" if not vrow.fecha.raw else f"fecha no interpretable en Ventas: '{vrow.fecha.raw}'")
    elif ref_date is None:
        add("fecha matriculación", "fecha", vrow.fecha.label(), None, SIN_DATO, "sin fecha de referencia")
    else:
        same, how = vrow.fecha.matches(ref_date)
        add("fecha matriculación", "fecha", vrow.fecha.label(), ref_date, OK if same else DISCREPANCIA,
            f"Ventas vs {ref_label}, comparado {how}")

    # kms (informativo: tres números)
    base_kms = sheet_row.kms if sheet_row else None
    trio = (f"Ventas {fmt_value(vrow.kms) or '-'} | Base_Datos {fmt_value(base_kms) or '-'} | "
            f"permiso {fmt_value(doc_kms) or '-'}" + (f" (a fecha {doc_kms_date})" if doc_kms and doc_kms_date else ""))
    if vrow.kms is None:
        add("kms", "kms", None, base_kms, SIN_DATO, trio)
    elif base_kms is None:
        add("kms", "kms", vrow.kms, None, SIN_DATO, trio)
    else:
        add("kms", "kms", vrow.kms, base_kms, OK if vrow.kms == base_kms else DISCREPANCIA, "informativo: " + trio)

    # marca / modelo
    for campo, key, ventas_val, ref_val, ref_label in (
            ("marca", "marca", vrow.marca, ficha_marca, "ficha D.1"),
            ("modelo", "modelo", vrow.modelo, ficha_denominacion, "ficha D.3")):
        if not ventas_val:
            add(campo, key, None, ref_val, SIN_DATO, f"sin {campo} en Ventas")
            continue
        if ref_val:
            ok = norm_text(ref_val) in norm_text(ventas_val) or norm_text(ventas_val) in norm_text(ref_val)
            add(campo, key, ventas_val, ref_val, OK if ok else DISCREPANCIA, f"Ventas vs {ref_label}")
        elif sheet_row and sheet_row.modelo:
            tokens = [t for t in norm_text(ventas_val).split() if len(t) > 1]
            ok = all(t in norm_text(sheet_row.modelo) for t in tokens)
            add(campo, key, ventas_val, sheet_row.modelo, OK if ok else DISCREPANCIA, "Ventas vs MODELO de Base_Datos")
        else:
            add(campo, key, ventas_val, None, SIN_DATO, "sin referencia para comparar")
    return out


# ------------------------------------------------------------ --bastidores
@dataclass
class BastidorResult:
    referencia: str
    matricula: str
    row_number: int
    bastidor_datos: str
    bastidor_ventas: str
    estado: str
    nota: str = ""
    tab: str = ""


def bastidores_bulk(sheet_rows: list[VehicleRow], ventas: VentasData) -> list[BastidorResult]:
    """One result per Datos row. Safety rules: plate must agree with a referencia match; a VIN proposed for
    more than one row is never written (REVISAR); duplicated referencias without plate are REVISAR."""
    from compare import DISCREPANCIA, OK, RELLENAR, REVISAR, SIN_DATO
    dup_refs, _ = duplicates(sheet_rows)
    results: list[BastidorResult] = []
    for row in sheet_rows:
        m = ventas.match(row.referencia, row.matricula)
        if m.conflict:
            results.append(BastidorResult(row.referencia, row.matricula, row.row_number, row.bastidor, "", REVISAR, m.nota))
            continue
        if m.row is None:
            results.append(BastidorResult(row.referencia, row.matricula, row.row_number, row.bastidor, "", NO_ENCONTRADO,
                                          "no está en Ventas-Sevencars"))
            continue
        vrow = m.row
        vin = vrow.bastidor
        nota = "" if not vin or validate_vin(vin) else "formato dudoso (17 caracteres sin I/O/Q)"
        if not vin:
            estado = SIN_DATO
            nota = "Ventas no tiene bastidor"
        elif not row.bastidor:
            estado = RELLENAR
        elif row.bastidor == vin:
            estado = OK
        else:
            estado = DISCREPANCIA
        if estado == RELLENAR and row.referencia in dup_refs and not row.matricula:
            estado = REVISAR
            nota = _join_notes(nota, "referencia repetida en Datos (filas "
                               + ", ".join(str(n) for n in dup_refs[row.referencia]) + ") y sin matrícula para confirmar")
        results.append(BastidorResult(row.referencia, row.matricula, row.row_number, row.bastidor, vin, estado,
                                      _join_notes(m.nota, nota), vrow.tab))
    # A Ventas VIN proposed for more than one Datos row is never written
    by_vin: dict[str, list[BastidorResult]] = {}
    for r in results:
        if r.bastidor_ventas:
            by_vin.setdefault(r.bastidor_ventas, []).append(r)
    for group in by_vin.values():
        if len(group) < 2:
            continue
        filas = ", ".join(str(g.row_number) for g in group)
        if any(g.estado == RELLENAR for g in group):
            for g in group:
                g.estado = REVISAR
                g.nota = _join_notes(g.nota, f"bastidor repetido en filas {filas}")
        else:  # nothing would be written; only inform
            for g in group:
                g.nota = _join_notes(g.nota, f"mismo bastidor de Ventas en filas {filas}")
    return results
