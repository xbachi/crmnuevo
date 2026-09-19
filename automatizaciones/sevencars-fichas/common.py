"""Shared helpers: text normalization, plates, numbers, Spanish months."""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent

MONTHS_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
MONTH_ABBR_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                 "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
# Extra abbreviations seen in the wild ("Sept", "Set", "Dec"...)
_MONTH_ALIASES = {"set": 9, "sept": 9, "dec": 12, "jan": 1, "apr": 4, "aug": 8}


def strip_accents(text: str) -> str:
    """Remove diacritics: 'Ficha técnica' -> 'Ficha tecnica'."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch))


def norm_text(text: str | None) -> str:
    """Lowercase, accent-insensitive, single-spaced text for comparisons."""
    if text is None:
        return ""
    return re.sub(r"\s+", " ", strip_accents(str(text)).lower()).strip()


def normalize_plate(value: str | None) -> str:
    """Uppercase and drop anything that is not a letter or digit ('5475 LKK' -> '5475LKK')."""
    if value is None:
        return ""
    return re.sub(r"[^A-Z0-9]", "", strip_accents(str(value)).upper())


def normalize_ref(value) -> str:
    """Sheet/CLI reference to canonical form: 1082.0 -> '1082', 'd-5' -> 'D5', CRM style ' #D-28 ' -> 'D28'."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    text = re.sub(r"[\s\-_]", "", strip_accents(str(value)).upper()).lstrip("#")
    if re.fullmatch(r"\d+\.0+", text):
        text = text.split(".")[0]
    return text


def month_from_text(text: str) -> int | None:
    """'Abril' / 'abr' / 'Oct' -> month number."""
    key = norm_text(text).rstrip(".")
    if not key:
        return None
    if key in _MONTH_ALIASES:
        return _MONTH_ALIASES[key]
    for idx, name in enumerate(MONTHS_ES, start=1):
        if name == key or (len(key) >= 3 and name.startswith(key)):
            return idx
    return None


def parse_month_year(text: str | None) -> tuple[int, int] | None:
    """'Abril 2022' / 'Abr 2022' / '04/2022' -> (2022, 4)."""
    if not text:
        return None
    text = str(text).strip()
    m = re.search(r"([A-Za-zÁ-ú\.]+)\s+(\d{4})", text)
    if m:
        month = month_from_text(m.group(1))
        if month:
            return int(m.group(2)), month
    m = re.search(r"(\d{1,2})\s*[/\-]\s*(\d{4})", text)
    if m and 1 <= int(m.group(1)) <= 12:
        return int(m.group(2)), int(m.group(1))
    return None


def month_year_label(year: int, month: int) -> str:
    """(2022, 4) -> 'Abr 2022' (the format used in the sheet column 'matriculacion')."""
    return f"{MONTH_ABBR_ES[month - 1]} {year}"


def parse_date(value) -> date | None:
    """Accept datetime/date or strings '11/04/2022', '2022-04-11', '11-04-2022', '05-12-2018'."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y", "%Y/%m/%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(text[:10] if fmt.startswith("%Y") else text.split(" ")[0], fmt).date()
        except ValueError:
            continue
    return None


def parse_number(value) -> float | None:
    """Accept int/float or strings like '88858', '88.858', '1.500', '110,5', '141 CV'."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    m = re.search(r"-?\d[\d.,]*", text)
    if not m:
        return None
    num = m.group(0)
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+", num):      # thousands with dots
        num = num.replace(".", "")
    elif re.fullmatch(r"-?\d{1,3}(,\d{3})+", num):     # thousands with commas
        num = num.replace(",", "")
    else:
        num = num.replace(",", ".")
    try:
        return float(num)
    except ValueError:
        return None


def parse_int(value) -> int | None:
    num = parse_number(value)
    return int(round(num)) if num is not None else None


def fmt_value(value) -> str:
    """Human display of any value (dates, floats without trailing .0, None -> '')."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "sí" if value else "no"
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else f"{value:.1f}"
    return str(value)
