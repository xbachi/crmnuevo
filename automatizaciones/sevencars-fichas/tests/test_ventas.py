"""ventas.py: normalization helpers, VentasData parsing and the read-only cross-check."""
from datetime import date

import pytest

from compare import DISCREPANCIA, OK, RELLENAR, SIN_DATO
from conftest import KIA_FIELDS, make_vehicle_row
from ventas import (NO_ENCONTRADO, PartialDate, VentasData, bastidores_bulk, compare_ventas, normalize_ventas_plate,
                    normalize_ventas_ref, parse_ventas_date, parse_ventas_kms)

VIN_KIA = "U5YH5811AML123456"
VIN_SEAT = "VSSZZZ5FZJR012345"
VIN_BAD = "WF0XXXGCDX7O12345"       # contains an 'O'


@pytest.mark.parametrize("value, expected", [
    ("#1082", "1082"), ("#C2", "C2"), ("#R7", "R7"), ("D5", "D5"), ("D-26", "D26"), ("R-11", "R11"),
    ("1065", "1065"), (1065.0, "1065"), (" r-11 ", "R11"), (None, ""),
])
def test_normalize_ventas_ref(value, expected):
    assert normalize_ventas_ref(value) == expected


@pytest.mark.parametrize("value, expected", [
    ("0110 LMK", "0110LMK"), ("Alemana/0703NLP", "0703NLP"), ("9028lxg", "9028LXG"),
    ("LMM", None), ("ALEMANA", None), ("", None), (None, None),
])
def test_normalize_ventas_plate(value, expected):
    assert normalize_ventas_plate(value) == expected


@pytest.mark.parametrize("value, expected", [
    ("88.858", 88858), ("160,922", 160922), ("101603", 101603), ("", None), (None, None), (88858, 88858),
])
def test_parse_ventas_kms(value, expected):
    assert parse_ventas_kms(value) == expected


@pytest.mark.parametrize("value, ymd", [
    ("11/04/2022", (2022, 4, 11)),
    ("7/11/2022", (2022, 11, 7)),
    ("04/08/09", (2009, 8, 4)),
    ("2022-04-11", (2022, 4, 11)),
    ("11/04/2022 10:30", (2022, 4, 11)),
])
def test_parse_ventas_date_full(value, ymd):
    pd = parse_ventas_date(value)
    assert (pd.year, pd.month, pd.day) == ymd
    assert pd.date == date(*ymd)
    assert not pd.empty


def test_parse_ventas_date_partial():
    year_only = parse_ventas_date("2007")
    assert (year_only.year, year_only.month, year_only.date, year_only.empty) == (2007, None, None, False)
    assert year_only.label() == "2007"
    month = parse_ventas_date("Abr 2022")
    assert (month.year, month.month, month.day) == (2022, 4, None)
    assert month.label() == "04/2022"
    assert (parse_ventas_date("04/2022").year, parse_ventas_date("04/2022").month) == (2022, 4)
    bad = parse_ventas_date("xx")
    assert bad.raw == "xx" and bad.empty and bad.label() == "xx"
    assert parse_ventas_date("").empty and parse_ventas_date(None).empty


def test_partial_date_matches():
    assert parse_ventas_date("11/04/2022").matches(date(2022, 4, 11)) == (True, "por día")
    assert parse_ventas_date("11/04/2022").matches(date(2022, 4, 12)) == (False, "por día")
    assert parse_ventas_date("04/2022").matches(date(2022, 4, 25)) == (True, "por mes")
    assert parse_ventas_date("04/2022").matches(date(2022, 5, 1)) == (False, "por mes")
    assert parse_ventas_date("2007").matches(date(2007, 12, 31)) == (True, "por año")
    assert PartialDate().matches(date(2022, 4, 11)) == (False, "")
    assert parse_ventas_date("2007").matches(None) == (False, "")


# ------------------------------------------------------------------- VentasData
@pytest.fixture
def ventas():
    entregas = [["REFERENCIA", "FECHA VENTA", "MARCA", "MODELO", "MATRICULA"],
                ["#1082", "01/06/2024", "KIA", "XCEED", "9028LXG"],
                ["#1091", "", "RENAULT", "CLIO", "0110 LMK"]]
    stock = [["", "MARCA", "MODELO", "2DA LLAVE", "MATRICULA", "BASTIDOR", "KMS", "FECHA MATRI", "CARPETA"],
             ["#1082", "KIA", "XCEED", "SI", "9028LXG", VIN_KIA, "88.858", "11/04/2022", "82-Kia Xceed"],
             ["#1091", "RENAULT", "CLIO", "NO", "0110 LMK", "", "45.000", "04/2022", ""],
             ["", "", "", "", "", "", "", "", ""]]
    deposito = [["751", "MARCA", "MODELO", "MATRICULA", "FECHA MATR", "BASTIDOR", "KMS"],
                ["D-5", "SEAT", "LEON", "5475 LKK", "2022-04-11", VIN_SEAT, "101603"],
                ["R-11", "FORD", "FOCUS", "Alemana/0703NLP", "2007", VIN_BAD, "160,922"]]
    return VentasData.from_values({"ENTREGAS": entregas, "STOCK": stock, "DEPOSITO": deposito})


def stock_row(ventas, ref):
    return next(r for r in ventas.tab("STOCK").rows if r.referencia == ref)


def test_tab_titles_and_columns(ventas):
    assert ventas.tab_titles == ["ENTREGAS", "STOCK", "DEPOSITO"]
    stock = ventas.tab("STOCK")
    assert stock.columns == {"marca": 1, "modelo": 2, "matricula": 4, "bastidor": 5, "kms": 6, "fecha": 7}
    assert stock.column_letter("bastidor") == "F" and stock.column_letter("inexistente") == ""
    assert "bastidor" not in ventas.tab("ENTREGAS").columns and "fecha" not in ventas.tab("ENTREGAS").columns
    assert ventas.tab("DEPOSITO").columns["fecha"] == 4
    assert ventas.tab("NOPE") is None


def test_find_by_ref_prefers_tab_with_bastidor(ventas):
    row = ventas.find_by_ref("1082")
    assert row.tab == "STOCK" and row.bastidor == VIN_KIA and row.row_number == 2
    assert ventas.find_by_ref("#1082") is row
    assert ventas.find_by_ref("d-5").tab == "DEPOSITO"
    assert ventas.find_by_ref("1999") is None


def test_find_by_plate(ventas):
    row = ventas.find_by_plate("0110 LMK")
    assert row.referencia == "1091" and row.matricula == "0110LMK"
    assert ventas.find_by_plate("0703 nlp").referencia == "R11"
    assert ventas.find_by_plate("") is None and ventas.find_by_plate("0000ZZZ") is None
    assert ventas.find("1999", "0110LMK").referencia == "1091"
    assert ventas.find(None, None) is None


def test_parsed_rows(ventas):
    kia = ventas.find_by_ref("1082")
    assert (kia.marca, kia.modelo, kia.matricula, kia.kms) == ("KIA", "XCEED", "9028LXG", 88858)
    assert kia.fecha.date == date(2022, 4, 11)
    clio = stock_row(ventas, "1091")            # find_by_ref would return the ENTREGAS hit (no VIN anywhere)
    assert clio.bastidor == "" and (clio.fecha.year, clio.fecha.month, clio.fecha.day) == (2022, 4, None)
    ford = ventas.find_by_ref("R11")
    assert (ford.matricula, ford.matricula_raw, ford.kms, ford.fecha.year) == ("0703NLP", "Alemana/0703NLP", 160922, 2007)
    assert "pestaña 'STOCK' fila 2" in kia.summary() and "88858" in kia.summary()


def test_empty_tab():
    data = VentasData.from_values({"VACIA": []})
    assert data.tab("VACIA").rows == [] and data.find_by_ref("1082") is None


# --------------------------------------------------------------- compare_ventas
def findings_by_campo(out):
    return {f.campo: f for f in out}


def test_compare_ventas_not_found():
    out = compare_ventas(None, None)
    assert len(out) == 1
    assert out[0].estado == NO_ENCONTRADO and out[0].fuente == "ventas"


def test_compare_ventas_full_match(ventas):
    vrow, vtab = ventas.find_by_ref("1082"), ventas.tab("STOCK")
    out = compare_ventas(vrow, make_vehicle_row(**KIA_FIELDS), doc_vin=VIN_KIA, doc_date=date(2022, 4, 11),
                         doc_kms=61000, doc_kms_date="10/05/2023", ficha_marca="Kia",
                         ficha_denominacion="XCeed 1.6 GDi", vtab=vtab)
    assert all(f.fuente == "ventas" for f in out)
    f = findings_by_campo(out)
    assert f["matrícula"].estado == OK
    assert (f["bastidor"].estado, f["bastidor"].columna_sheet) == (OK, "STOCK!F")
    assert f["fecha matriculación"].estado == OK and "por día" in f["fecha matriculación"].nota
    assert f["kms"].estado == OK
    assert all(n in f["kms"].nota for n in ("88858", "61000", "10/05/2023", "informativo"))
    assert f["marca"].estado == OK and f["modelo"].estado == OK


def test_compare_ventas_bastidor_discrepancia_y_sin_dato(ventas):
    f = findings_by_campo(compare_ventas(ventas.find_by_ref("1082"), None, doc_vin=VIN_SEAT))
    assert f["bastidor"].estado == DISCREPANCIA and f["bastidor"].valor_documento == VIN_KIA
    f = findings_by_campo(compare_ventas(ventas.find_by_ref("1091"), None, doc_vin=VIN_KIA))
    assert f["bastidor"].estado == SIN_DATO and VIN_KIA in f["bastidor"].nota
    assert f["bastidor"].columna_sheet == ""


def test_compare_ventas_bastidor_sin_documento_usa_base_datos(ventas):
    row = make_vehicle_row(**KIA_FIELDS, bastidor=VIN_KIA)
    f = findings_by_campo(compare_ventas(ventas.find_by_ref("1082"), row))
    assert f["bastidor"].estado == OK and "sin documento" in f["bastidor"].nota
    f = findings_by_campo(compare_ventas(ventas.find_by_ref("R11"), make_vehicle_row("R11", bastidor=VIN_BAD)))
    assert f["bastidor"].estado == OK and "formato dudoso" in f["bastidor"].nota


def test_compare_ventas_fecha_por_dia_y_por_mes(ventas):
    f = findings_by_campo(compare_ventas(ventas.find_by_ref("1082"), None, doc_date=date(2022, 4, 12)))
    assert f["fecha matriculación"].estado == DISCREPANCIA and "por día" in f["fecha matriculación"].nota
    clio = stock_row(ventas, "1091")            # fecha "04/2022" (only month)
    f = findings_by_campo(compare_ventas(clio, None, doc_date=date(2022, 4, 20)))
    assert f["fecha matriculación"].estado == OK and "por mes" in f["fecha matriculación"].nota
    f = findings_by_campo(compare_ventas(clio, None, doc_date=date(2022, 5, 1)))
    assert f["fecha matriculación"].estado == DISCREPANCIA
    f = findings_by_campo(compare_ventas(clio, make_vehicle_row(**KIA_FIELDS)))
    assert f["fecha matriculación"].estado == OK and "Base_Datos" in f["fecha matriculación"].nota
    f = findings_by_campo(compare_ventas(clio, None))
    assert f["fecha matriculación"].estado == SIN_DATO


def test_compare_ventas_kms_informativo_tres_numeros(ventas):
    row = make_vehicle_row(**{**KIA_FIELDS, "kms": "90000"})
    f = findings_by_campo(compare_ventas(ventas.find_by_ref("1082"), row, doc_kms=61000))
    assert f["kms"].estado == DISCREPANCIA
    assert all(n in f["kms"].nota for n in ("Ventas 88858", "Base_Datos 90000", "permiso 61000"))
    f = findings_by_campo(compare_ventas(ventas.find_by_ref("1082"), None))
    assert f["kms"].estado == SIN_DATO and "permiso -" in f["kms"].nota


def test_compare_ventas_marca_modelo(ventas):
    vrow = ventas.find_by_ref("1082")
    f = findings_by_campo(compare_ventas(vrow, None, ficha_marca="Hyundai", ficha_denominacion="xceed"))
    assert f["marca"].estado == DISCREPANCIA and f["modelo"].estado == OK
    f = findings_by_campo(compare_ventas(vrow, make_vehicle_row(**KIA_FIELDS)))
    assert f["marca"].estado == OK and "MODELO de Base_Datos" in f["marca"].nota
    assert f["modelo"].estado == OK
    f = findings_by_campo(compare_ventas(vrow, None))
    assert f["marca"].estado == SIN_DATO


# -------------------------------------------------------------- bastidores_bulk
def test_bastidores_bulk(ventas):
    rows = [
        make_vehicle_row("1082", matricula="9028LXG"),               # AE vacía + Ventas con VIN -> RELLENAR
        make_vehicle_row("D5", bastidor=VIN_SEAT),                    # coincide -> OK
        make_vehicle_row("1005", matricula="5475LKK", bastidor=VIN_KIA),  # encontrado por matrícula, distinto -> DISCREPANCIA
        make_vehicle_row("1091"),                                     # Ventas sin VIN -> SIN DATO
        make_vehicle_row("1999", matricula="0000ZZZ"),                # no está -> NO ENCONTRADO
        make_vehicle_row("R11"),                                      # VIN de Ventas con formato dudoso
    ]
    results = bastidores_bulk(rows, ventas)
    estados = [(r.referencia, r.estado) for r in results]
    assert estados == [("1082", RELLENAR), ("D5", OK), ("1005", DISCREPANCIA), ("1091", SIN_DATO),
                       ("1999", NO_ENCONTRADO), ("R11", RELLENAR)]
    assert (results[0].bastidor_ventas, results[0].tab, results[0].row_number) == (VIN_KIA, "STOCK", 2)
    assert results[2].bastidor_datos == VIN_KIA and results[2].bastidor_ventas == VIN_SEAT
    assert results[3].nota == "Ventas no tiene bastidor" and results[3].bastidor_ventas == ""
    assert results[4].nota == "no está en Ventas-Sevencars" and results[4].tab == ""
    assert results[5].bastidor_ventas == VIN_BAD and "formato dudoso" in results[5].nota
