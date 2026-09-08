"""sheet.py: column helpers, VIN validation, SheetData parsing and the local xlsx source."""
from datetime import date, datetime

import pytest

from conftest import SHEET_HEADER, VIN_A, sheet_values_row
from sheet import (CellWrite, SheetData, SheetError, XlsxSheet, col_index, col_letter, header_write_for_bastidor,
                   normalize_vin, validate_vin)


@pytest.mark.parametrize("index, letter", [(0, "A"), (25, "Z"), (26, "AA"), (30, "AE"), (51, "AZ"), (52, "BA")])
def test_col_letter_and_index_round_trip(index, letter):
    assert col_letter(index) == letter
    assert col_index(letter) == index


def test_col_index_ae():
    assert col_index("AE") == 30
    assert col_index("ae") == 30


@pytest.mark.parametrize("vin, expected", [
    ("WAUZZZGA2KA020714", True),
    ("wauzzzga2ka020714", True),
    ("WAUZZZGA2KA02071", False),          # 16 chars
    ("WAUZZZGA2KA02O714", False),         # O
    ("WAUZZZGA2KA02I714", False),         # I
    ("WAUZZZGA2KA02Q714", False),         # Q
    ("", False),
])
def test_validate_vin(vin, expected):
    assert validate_vin(vin) is expected


def test_normalize_vin():
    assert normalize_vin(" wauzzz ga2ka020714 ") == "WAUZZZGA2KA020714"
    assert normalize_vin(None) == ""


# --------------------------------------------------------------------- SheetData
@pytest.fixture
def datos():
    values = [
        SHEET_HEADER,
        sheet_values_row("1082", modelo="KIA XCeed  GDi PHEV 140cv Edrive", matricula="9028LXG",
                         fecha_matriculacion="11/04/2022", kms="88.858", matriculacion="Abr 2022",
                         matriculacion_num="202204"),
        sheet_values_row("D5", modelo="Seat Leon", matricula="1111BBB", fecha_matriculacion="2022-04-11",
                         kms="101603", motor_cv="110", cubicaje="1500", caja="manual", bastidor=" vssz zz5fzjr012345"),
        sheet_values_row("", modelo="fila sin referencia (se salta)"),
        sheet_values_row("1026.0", modelo="Nissan Qashqai", matricula="5475 LKK"),
    ]
    return SheetData(values, "test")


def test_columns_first_header_occurrence_wins(datos):
    assert datos.column_letters() == {"referencia": "A", "modelo": "C", "matricula": "D", "fecha_matriculacion": "E",
                                      "kms": "X", "motor_cv": "Y", "cubicaje": "Z", "caja": "AA",
                                      "matriculacion": "AB", "matriculacion_num": "AC", "bastidor": "AE"}
    assert datos.column_letter("modelo") == "C"
    assert datos.column_letter("inexistente") is None
    assert datos.has_bastidor_column


def test_rows_skip_empty_reference_and_keep_row_numbers(datos):
    assert [r.referencia for r in datos.rows] == ["1082", "D5", "1026"]
    assert [r.row_number for r in datos.rows] == [2, 3, 5]


def test_find_by_ref_and_plate(datos):
    assert datos.find_by_ref("1082").row_number == 2
    assert datos.find_by_ref(1082.0).row_number == 2
    assert datos.find_by_ref("d-5").referencia == "D5"
    assert datos.find_by_ref("1026").modelo == "Nissan Qashqai"
    assert datos.find_by_plate("5475 lkk").referencia == "1026"
    assert datos.find_by_ref("1999") is None and datos.find_by_plate("0000ZZZ") is None


def test_parsed_fields(datos):
    kia, seat = datos.find_by_ref("1082"), datos.find_by_ref("D5")
    assert kia.fecha_matriculacion == date(2022, 4, 11) == seat.fecha_matriculacion
    assert kia.kms == 88858 and seat.kms == 101603
    assert kia.matricula == "9028LXG" and kia.matriculacion_num == 202204 and kia.matriculacion == "Abr 2022"
    assert kia.is_empty("motor_cv") and kia.is_empty("bastidor")
    assert not seat.is_empty("motor_cv")
    assert (seat.motor_cv, seat.cubicaje, seat.caja) == (110.0, 1500, "manual")
    assert seat.bastidor == "VSSZZZ5FZJR012345"
    assert kia.raw["referencia"] == "1082" and kia.raw["kms"] == "88.858"


def test_empty_sheet_raises():
    with pytest.raises(SheetError):
        SheetData([])


# ------------------------------------------------------------ bastidor column
def test_bastidor_target_when_column_exists(datos):
    assert datos.bastidor_target_column() == ("AE", "existe")
    assert header_write_for_bastidor(datos) is None


def test_bastidor_target_when_header_is_shorter_than_ae():
    data = SheetData([SHEET_HEADER[:29], sheet_values_row("1082")[:29]])
    assert not data.has_bastidor_column
    letter, msg = data.bastidor_target_column()
    assert letter == "AE" and "crear" in msg
    write = header_write_for_bastidor(data)
    assert (write.row_number, write.column, write.value, write.field_name) == (1, "AE", "bastidor", "bastidor")
    assert write.a1 == "AE1"


def test_bastidor_target_skips_occupied_ae():
    header = SHEET_HEADER[:30] + ["otra cosa"]
    data = SheetData([header, sheet_values_row("1082")])
    letter, _ = data.bastidor_target_column()
    assert letter == "AF"
    assert header_write_for_bastidor(data).a1 == "AF1"


def test_cell_write_describe():
    w = CellWrite(row_number=7, field_name="kms", column="X", value=1234)
    assert w.a1 == "X7" and w.describe() == "fila 7, columna X: 1234"


# -------------------------------------------------------------------- XlsxSheet
@pytest.fixture
def xlsx_path(tmp_path):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Datos"
    ws.append([300, "IVA", "MODELO", "MATRICULA", "FECHA MATRICULACION"] + [None] * 18
              + ["kms", "motor cv", "cubicaje", "caja", "matriculacion", "matriculacion num", None, "bastidor"])
    ws.append([1082.0, "", "KIA XCeed", "9028LXG", datetime(2022, 4, 11)] + [None] * 18
              + [88858, None, None, None, "Abr 2022", 202204, None, VIN_A])
    path = tmp_path / "base.xlsx"
    wb.save(path)
    return path


def test_xlsx_sheet_load(xlsx_path):
    data = XlsxSheet(xlsx_path).load()
    assert data.column_letters()["kms"] == "X" and data.column_letters()["bastidor"] == "AE"
    assert "base.xlsx" in data.source_label
    row = data.find_by_ref("1082")
    assert row is not None and row.row_number == 2
    assert row.fecha_matriculacion == date(2022, 4, 11)
    assert (row.kms, row.matriculacion_num, row.bastidor, row.matricula) == (88858, 202204, VIN_A, "9028LXG")
    assert row.is_empty("motor_cv")


def test_xlsx_sheet_errors(xlsx_path, tmp_path):
    with pytest.raises(SheetError):
        XlsxSheet(xlsx_path, tab="Otra").load()
    with pytest.raises(SheetError):
        XlsxSheet(tmp_path / "no-existe.xlsx").load()


def test_xlsx_sheet_is_read_only(xlsx_path):
    sheet = XlsxSheet(xlsx_path)
    assert not sheet.can_write
    with pytest.raises(SheetError):
        sheet.write([CellWrite(2, "kms", "X", 1)])
