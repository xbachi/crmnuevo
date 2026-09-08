"""Reglas de seguridad de datos: emparejamiento Datos↔Ventas por referencia + matrícula, bastidores repetidos,
referencias/matrículas duplicadas en Datos."""
import pytest

from compare import OK, RELLENAR, REVISAR
from sheet import SheetData, duplicates
from ventas import NO_ENCONTRADO, VentasData, bastidores_bulk, compare_ventas

HEADER = (["300", "IVA", "MODELO", "MATRICULA", "FECHA MATRICULACION"] + [""] * 18
          + ["kms", "motor cv", "cubicaje", "caja", "matriculacion", "matriculacion num", "", "bastidor"])
TESLA_VIN = "LRW3E7FD5PC818006"
HYUNDAI_VIN = "NLHB251AAMZ123456"


def datos_row(ref, plate, modelo="X", vin=""):
    return [ref, "", modelo, plate, "11/04/2022"] + [""] * 18 + ["1000", "", "", "", "", "", "", vin]


def datos(*rows):
    return SheetData([HEADER] + list(rows))


VENTAS_HEADER = ["", "MARCA", "MODELO", "MATRICULA", "BASTIDOR", "KMS", "FECHA MATRI"]


def ventas(*rows):
    return VentasData.from_values({"Stock": [VENTAS_HEADER] + list(rows)})


@pytest.fixture
def ventas_1087_1088():
    return ventas(["#1087", "HYUNDAI", "I20", "2979NGK", HYUNDAI_VIN, "50.000", "01/02/2021"],
                  ["#1088", "TESLA", "MODEL 3", "2848NRN", TESLA_VIN, "30.000", "05/06/2023"])


# ------------------------------------------------------------ regla 1: referencia + matrícula
def test_match_por_referencia_con_matricula_coincidente(ventas_1087_1088):
    m = ventas_1087_1088.match("1088", "2848NRN")
    assert m.by == "referencia" and m.row.bastidor == TESLA_VIN and not m.nota and not m.conflict


def test_match_referencia_con_matricula_distinta_cae_a_matricula(ventas_1087_1088):
    m = ventas_1087_1088.match("1088", "2979NGK")
    assert m.by == "matricula"
    assert m.row.referencia == "1087" and m.row.bastidor == HYUNDAI_VIN
    assert m.nota == "referencia en Datos (1088) no coincide con Ventas (#1087); emparejado por matrícula"


def test_match_conflicto_sin_matricula_en_ventas(ventas_1087_1088):
    m = ventas_1087_1088.match("1088", "0000XXX")
    assert m.row is None and m.conflict
    assert "1088" in m.nota and "2848NRN" in m.nota and "0000XXX" in m.nota


def test_match_referencia_con_datos_sin_matricula_se_acepta(ventas_1087_1088):
    m = ventas_1087_1088.match("1088", "")
    assert m.by == "referencia" and m.row.bastidor == TESLA_VIN


def test_match_referencia_ausente_pero_matricula_presente(ventas_1087_1088):
    m = ventas_1087_1088.match("1099", "2979NGK")
    assert m.by == "matricula" and m.row.referencia == "1087" and "1099" in m.nota


def test_match_matricula_ilegible_en_ventas_no_confirma():
    vd = ventas(["#1090", "OPEL", "ASTRA", "LMM", "W0L000000000000001", "", ""])
    m = vd.match("1090", "0483MBJ")
    assert m.row is None and m.conflict and "LMM" in m.nota


def test_bulk_escenario_1088_tesla_hyundai(ventas_1087_1088):
    data = datos(datos_row("1088", "2848NRN", "Tesla Model 3"), datos_row("1088", "2979NGK", "Hyundai i20"))
    results = {r.matricula: r for r in bastidores_bulk(data.rows, ventas_1087_1088)}
    assert results["2848NRN"].estado == RELLENAR and results["2848NRN"].bastidor_ventas == TESLA_VIN
    assert results["2979NGK"].estado == RELLENAR and results["2979NGK"].bastidor_ventas == HYUNDAI_VIN
    assert "emparejado por matrícula" in results["2979NGK"].nota
    # nunca se propone el VIN del Tesla para el Hyundai
    assert TESLA_VIN not in results["2979NGK"].bastidor_ventas


def test_bulk_conflicto_es_revisar_y_no_se_escribe(ventas_1087_1088):
    data = datos(datos_row("1088", "1111BBB"))
    (r,) = bastidores_bulk(data.rows, ventas_1087_1088)
    assert r.estado == REVISAR and r.bastidor_ventas == "" and "1111BBB" in r.nota


def test_compare_ventas_conflicto_genera_un_solo_revisar(ventas_1087_1088):
    data = datos(datos_row("1088", "1111BBB"))
    m = ventas_1087_1088.match("1088", "1111BBB")
    findings = compare_ventas(m.row, data.rows[0], match=m)
    assert [f.estado for f in findings] == [REVISAR] and findings[0].fuente == "ventas"


def test_compare_ventas_emparejado_por_matricula_lo_indica(ventas_1087_1088):
    data = datos(datos_row("1088", "2979NGK", "Hyundai i20"))
    m = ventas_1087_1088.match("1088", "2979NGK")
    findings = compare_ventas(m.row, data.rows[0], match=m, vtab=ventas_1087_1088.tab("Stock"))
    f = findings[0]
    assert f.campo == "emparejamiento" and f.estado == OK and "#1087" in f.nota and f.valor_documento == "#1087"


# ------------------------------------------------------------ regla 2: bastidor repetido
def test_bulk_bastidor_repetido_es_revisar_y_se_excluye():
    vd = ventas(["#1001", "A", "B", "1111AAA", TESLA_VIN, "", ""],
                ["#1002", "A", "B", "2222BBB", TESLA_VIN, "", ""])
    data = datos(datos_row("1001", "1111AAA"), datos_row("1002", "2222BBB"))
    results = bastidores_bulk(data.rows, vd)
    assert [r.estado for r in results] == [REVISAR, REVISAR]
    assert all("bastidor repetido en filas 2, 3" in r.nota for r in results)
    assert not [r for r in results if r.estado == RELLENAR]


def test_bulk_bastidor_repetido_tambien_si_uno_ya_estaba():
    vd = ventas(["#1001", "A", "B", "1111AAA", TESLA_VIN, "", ""],
                ["#1002", "A", "B", "2222BBB", TESLA_VIN, "", ""])
    data = datos(datos_row("1001", "1111AAA", vin=TESLA_VIN), datos_row("1002", "2222BBB"))
    results = bastidores_bulk(data.rows, vd)
    assert [r.estado for r in results] == [REVISAR, REVISAR]


def test_bulk_bastidores_distintos_no_se_marcan():
    vd = ventas(["#1001", "A", "B", "1111AAA", TESLA_VIN, "", ""],
                ["#1002", "A", "B", "2222BBB", HYUNDAI_VIN, "", ""])
    data = datos(datos_row("1001", "1111AAA"), datos_row("1002", "2222BBB"))
    assert [r.estado for r in bastidores_bulk(data.rows, vd)] == [RELLENAR, RELLENAR]


# ------------------------------------------------------------ regla 3: duplicados en Datos
def test_duplicates_en_datos():
    data = datos(datos_row("1088", "2848NRN"), datos_row("1088", "2979NGK"), datos_row("1090", "2979NGK"),
                 datos_row("1091", ""), datos_row("1092", ""))
    dup_refs, dup_plates = data.duplicates()
    assert dup_refs == {"1088": [2, 3]}
    assert dup_plates == {"2979NGK": [3, 4]}
    assert duplicates([]) == ({}, {})


def test_bulk_referencia_repetida_sin_matricula_es_revisar(ventas_1087_1088):
    data = datos(datos_row("1088", ""), datos_row("1088", "2848NRN"))
    results = bastidores_bulk(data.rows, ventas_1087_1088)
    assert [r.estado for r in results] == [REVISAR, REVISAR]  # mismo VIN propuesto dos veces + ref repetida sin matrícula
    assert "referencia repetida en Datos (filas 2, 3)" in results[0].nota


def test_safety_findings_por_coche():
    import verificar
    from compare import Finding
    data = datos(datos_row("1088", "2848NRN", vin=TESLA_VIN), datos_row("1088", "2979NGK"))
    row = data.rows[1]
    findings = [Finding("bastidor", "AE", None, TESLA_VIN, "ventas", RELLENAR, "", field_name="bastidor")]
    verificar.safety_findings(findings, data, row)
    estados = {f.campo: f for f in findings}
    assert estados["bastidor"].estado == REVISAR and "bastidor repetido en filas 3, 2" in estados["bastidor"].nota
    assert estados["referencia repetida en Datos"].estado == REVISAR and "filas 2, 3" in estados["referencia repetida en Datos"].nota
    assert "matrícula repetida en Datos" not in estados


def test_no_encontrado_sigue_igual(ventas_1087_1088):
    data = datos(datos_row("1050", "5555CCC"))
    (r,) = bastidores_bulk(data.rows, ventas_1087_1088)
    assert r.estado == NO_ENCONTRADO
