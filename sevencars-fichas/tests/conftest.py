"""Shared helpers for the sevencars-fichas tests. Everything is in-memory or under tmp_path
(no OneDrive, no Google, no OpenAI)."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

import cuota as cuota_mod
from sheet import SheetData, VehicleRow

HOY = date(2026, 9, 8)


@pytest.fixture(autouse=True)
def hoy_fijo(monkeypatch):
    """La financiación depende de la fecha (tarifa por antigüedad, plazo por edad): todos los tests calculan
    al 08/09/2026, la fecha con la que se comprobaron los valores contra Presupuesto_2025."""
    monkeypatch.setattr(cuota_mod, "hoy_por_defecto", lambda: HOY)

# Header row mimicking the 'Datos' tab (as strings, like gspread.get_all_values()):
# A=referencia, C=MODELO, D=MATRICULA, E=FECHA MATRICULACION, P=MODELO (duplicate that must be ignored),
# X..AC = kms, motor cv, cubicaje, caja, matriculacion, matriculacion num; AE = bastidor.
_HEADER_CELLS = {0: "300", 1: "IVA", 2: "MODELO", 3: "MATRICULA", 4: "FECHA MATRICULACION", 15: "MODELO",
                 23: "kms", 24: "motor cv", 25: "cubicaje", 26: "caja", 27: "matriculacion",
                 28: "matriculacion num", 30: "bastidor"}
SHEET_HEADER = [_HEADER_CELLS.get(i, "") for i in range(31)]

FIELD_INDEX = {"modelo": 2, "matricula": 3, "fecha_matriculacion": 4, "kms": 23, "motor_cv": 24, "cubicaje": 25,
               "caja": 26, "matriculacion": 27, "matriculacion_num": 28, "bastidor": 30}
COLUMNS = {"modelo": "C", "matricula": "D", "fecha_matriculacion": "E", "kms": "X", "motor_cv": "Y",
           "cubicaje": "Z", "caja": "AA", "matriculacion": "AB", "matriculacion_num": "AC", "bastidor": "AE"}

KIA_FIELDS = dict(modelo="KIA XCeed  GDi PHEV 140cv Edrive", matricula="9028LXG", fecha_matriculacion="11/04/2022",
                  kms="88858", matriculacion="Abr 2022", matriculacion_num="202204")
KIA_EXPO = {"modelo": "Kia Xceed", "matriculacion_texto": "Abril 2022", "matriculacion_anio": 2022,
            "matriculacion_mes": 4, "kms": 88000, "combustible": "Híbrido", "potencia_cv": 141,
            "cubicaje": 1600, "cambio": "Automático"}

VIN_A = "WAUZZZGA2KA020714"
VIN_B = "VF1RFB00X12345678"
VIN_BAD = "WAUZZZGA2KA02O714"      # 17 chars but contains an 'O'


def sheet_values_row(referencia, **fields) -> list[str]:
    """One data row of the 'Datos' tab (all strings) with the given logical fields."""
    row = [""] * len(SHEET_HEADER)
    row[0] = str(referencia)
    for name, value in fields.items():
        row[FIELD_INDEX[name]] = "" if value is None else str(value)
    return row


def make_vehicle_row(referencia="1082", **fields) -> VehicleRow:
    """VehicleRow parsed through SheetData, so `raw` and the derived fields are filled the real way."""
    return SheetData([SHEET_HEADER, sheet_values_row(referencia, **fields)], "test").rows[0]


def ai_doc(**overrides) -> dict:
    """A ficha/permiso dict as produced by the extraction (only the keys compare() reads)."""
    base = {"presente": True, "matricula": None, "fecha_primera_matriculacion": None, "fecha_matriculacion": None,
            "marca": None, "denominacion_comercial": None, "bastidor": None, "cilindrada_cc": None,
            "potencia_kw": None, "combustible": None, "hibrido": None, "kilometraje": None, "kilometraje_fecha": None}
    base.update(overrides)
    return base


def ai_result(ficha: dict | None = None, permiso: dict | None = None) -> dict:
    return {"ficha_tecnica": ficha, "permiso_circulacion": permiso, "notas": ""}


def write_pdf(path: Path, text: str) -> Path:
    """Small one-page PDF containing `text` (pymupdf)."""
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    doc.save(str(path))
    doc.close()
    return path


def write_jpeg(path: Path, size=(64, 48), orientation: int | None = None) -> Path:
    """Small JPEG, optionally with an EXIF orientation tag."""
    from PIL import Image
    img = Image.new("RGB", size, (200, 30, 30))
    kwargs = {}
    if orientation is not None:
        exif = img.getexif()
        exif[274] = orientation
        kwargs["exif"] = exif
    img.save(path, format="JPEG", **kwargs)
    return path
