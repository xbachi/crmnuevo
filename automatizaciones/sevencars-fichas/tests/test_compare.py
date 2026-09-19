"""compare.py: unit helpers and the comparison rules between the sheet row and the documents."""
from datetime import date

import pytest

from compare import (DISCREPANCIA, OK, RELLENAR, REVISAR, SIN_DATO, SRC_FICHA, SRC_MODELO, SRC_PERMISO,
                     SRC_VENTAS, compare, cv_in_modelo, doc_summary, infer_caja_from_modelo, kw_to_cv,
                     normalize_caja)
from conftest import COLUMNS, KIA_FIELDS, VIN_A, VIN_B, VIN_BAD, ai_doc, ai_result, make_vehicle_row

AUDI_FIELDS = dict(modelo="Audi Q2 Design ed 1.0 TFSI 115CV S tronic", matricula="1234BCD",
                   fecha_matriculacion="05/12/2018")


def by_campo(cmp) -> dict:
    return {f.campo: f for f in cmp.findings}


def run(row, ficha=None, permiso=None, **kw):
    return by_campo(compare(row, ai=ai_result(ficha, permiso), columns=COLUMNS, **kw))


# --------------------------------------------------------------------- helpers
def test_kw_to_cv():
    assert kw_to_cv(85.0) == 116
    assert kw_to_cv(77.2) == 105
    assert kw_to_cv("85") == 116
    assert kw_to_cv(None) is None



def test_matricula_ok_y_discrepancia():
    row = make_vehicle_row(**KIA_FIELDS)
    f = run(row, permiso=ai_doc(matricula="9028 LXG"))
    assert (f["matrícula"].estado, f["matrícula"].fuente, f["matrícula"].columna_sheet) == (OK, SRC_PERMISO, "D")
    f = run(row, permiso=ai_doc(matricula="1234BCD"))
    assert f["matrícula"].estado == DISCREPANCIA


def test_matricula_ficha_y_permiso_distintos_deja_nota():
    f = run(make_vehicle_row(**KIA_FIELDS), ficha=ai_doc(matricula="1234BCD"), permiso=ai_doc(matricula="9028LXG"))
    assert f["matrícula"].estado == OK
    assert "no coinciden" in f["matrícula"].nota


def test_documento_no_presente_se_ignora():
    f = run(make_vehicle_row(**KIA_FIELDS), permiso=ai_doc(presente=False, matricula="1234BCD"))
    assert f["matrícula"].estado == SIN_DATO


# ---------------------------------------------------------------------- modelo
def test_modelo_ok_cuando_marca_y_denominacion_estan_en_modelo():
    f = run(make_vehicle_row(**KIA_FIELDS), ficha=ai_doc(marca="KIA", denominacion_comercial="xceed"))
    assert f["modelo"].estado == OK and f["modelo"].fuente == SRC_FICHA
    assert f["modelo"].valor_documento == "KIA xceed"


def test_modelo_es_insensible_a_acentos_y_mayusculas():
    row = make_vehicle_row(modelo="Citroen C4 Picasso 1.6 HDi", matricula="2394HRV")
    f = run(row, permiso=ai_doc(marca="CITROËN", denominacion_comercial="C4 PICASSO"))
    assert f["modelo"].estado == OK


def test_modelo_discrepancia_cuando_falta_la_denominacion():
    f = run(make_vehicle_row(**KIA_FIELDS), ficha=ai_doc(marca="Kia", denominacion_comercial="Sportage"))
    assert f["modelo"].estado == DISCREPANCIA
    assert "Sportage" in f["modelo"].nota and "Kia" not in f["modelo"].nota


# ----------------------------------------------------------------------- fecha
def test_fecha_comparada_por_dia():
    row = make_vehicle_row(**KIA_FIELDS)
    f = run(row, permiso=ai_doc(fecha_matriculacion="2022-04-11"))
    assert f["fecha matriculación"].estado == OK
    assert f["fecha matriculación"].valor_documento == date(2022, 4, 11)
    assert f["fecha matriculación"].fuente == SRC_PERMISO
    f = run(row, permiso=ai_doc(fecha_matriculacion="2022-04-12"))
    assert f["fecha matriculación"].estado == DISCREPANCIA


def test_fecha_prefiere_B_sobre_I_y_deriva_AB_AC():
    row = make_vehicle_row(**KIA_FIELDS)
    f = run(row, permiso=ai_doc(fecha_primera_matriculacion="2022-04-11", fecha_matriculacion="2023-01-15"))
    assert f["fecha matriculación"].estado == OK
    assert f["fecha matriculación"].valor_documento == date(2022, 4, 11)
    assert "se usa B" in f["fecha matriculación"].nota
    assert (f["matriculación (texto)"].valor_documento, f["matriculación (texto)"].estado) == ("Abr 2022", OK)
    assert (f["matriculación (num)"].valor_documento, f["matriculación (num)"].estado) == (202204, OK)
    assert f["matriculación (num)"].fuente == SRC_PERMISO


def test_fecha_de_ficha_cuando_el_permiso_no_la_tiene():
    row = make_vehicle_row(**{**KIA_FIELDS, "matriculacion": "Mar 2022"})
    f = run(row, ficha=ai_doc(fecha_matriculacion="2022-04-11"), permiso=ai_doc())
    assert f["fecha matriculación"].fuente == SRC_FICHA and f["fecha matriculación"].estado == OK
    assert f["matriculación (texto)"].estado == DISCREPANCIA


# -------------------------------------------------------------------- motor cv
def test_motor_cv_ok_dentro_de_tolerancia():
    row = make_vehicle_row(**AUDI_FIELDS, motor_cv="115")
    f = run(row, ficha=ai_doc(potencia_kw=85, combustible="Gasolina"))
    assert (f["motor cv"].estado, f["motor cv"].valor_documento) == (OK, 116)
    assert "85 kW" in f["motor cv"].fuente and f["motor cv"].columna_sheet == "Y"
    assert f["potencia en MODELO"].estado == OK
    assert f["potencia en MODELO"].valor_sheet == 115


def test_motor_cv_discrepancia_no_hibrido():
    row = make_vehicle_row(**AUDI_FIELDS, motor_cv="100")
    f = run(row, ficha=ai_doc(potencia_kw=85, combustible="Gasolina"))
    assert f["motor cv"].estado == DISCREPANCIA


def test_motor_cv_rellenar():
    f = run(make_vehicle_row(**AUDI_FIELDS), ficha=ai_doc(potencia_kw=85))
    assert (f["motor cv"].estado, f["motor cv"].valor_documento) == (RELLENAR, 116)


def test_motor_cv_hibrido_revisar():
    # hybrid without CV in MODELO -> nothing to write: REVISAR, the permiso only gives the combustion engine
    row = make_vehicle_row(**{**KIA_FIELDS, "modelo": "KIA XCeed GDi PHEV Edrive"}, motor_cv="140")
    cmp = compare(row, ai=ai_result(ficha=ai_doc(potencia_kw=77.2, hibrido=True)), columns=COLUMNS)
    f = by_campo(cmp)
    assert cmp.hybrid
    assert (f["motor cv"].estado, f["motor cv"].valor_documento) == (REVISAR, None)
    assert f["motor cv"].nota == "híbrido: falta la potencia total del sistema (el permiso solo da el motor térmico, 105 CV); sin confirmar, no se escribe"
    assert "potencia en MODELO" not in f
    # with the CV in MODELO the total comes from there and the cell is OK
    row = make_vehicle_row(**KIA_FIELDS, motor_cv="140")
    f = by_campo(compare(row, ai=ai_result(ficha=ai_doc(potencia_kw=77.2, hibrido=True)), columns=COLUMNS))
    assert (f["motor cv"].estado, f["motor cv"].valor_documento, f["motor cv"].fuente) == (OK, 140, "MODELO (hoja)")
    assert "potencia total del sistema" in f["motor cv"].nota and "105 CV" in f["motor cv"].nota
    assert "confirmar la potencia total" in f["motor cv"].nota


# -------------------------------------------------------------------- cubicaje
def test_cubicaje_redondeado_a_centenas_es_ok():
    f = run(make_vehicle_row(**AUDI_FIELDS, cubicaje="1600"), ficha=ai_doc(cilindrada_cc=1580))
    assert (f["cubicaje"].estado, f["cubicaje"].valor_documento, f["cubicaje"].fuente) == (OK, 1580, SRC_FICHA)
    assert "redondeado" in f["cubicaje"].nota


def test_cubicaje_discrepancia_y_rellenar():
    f = run(make_vehicle_row(**AUDI_FIELDS, cubicaje="1400"), ficha=ai_doc(cilindrada_cc=1580))
    assert f["cubicaje"].estado == DISCREPANCIA
    f = run(make_vehicle_row(**AUDI_FIELDS), permiso=ai_doc(cilindrada_cc="1580"))
    assert (f["cubicaje"].estado, f["cubicaje"].valor_documento, f["cubicaje"].fuente) == (RELLENAR, 1580, SRC_PERMISO)


# ------------------------------------------------------------------------ caja
# ------------------------------------------------------------------------- kms
def test_kms_informativo():
    permiso = ai_doc(kilometraje=61000, kilometraje_fecha="2023-05-10")
    f = run(make_vehicle_row(**KIA_FIELDS), permiso=permiso)
    assert f["kms"].estado == OK and "10/05/2023" in f["kms"].fuente
    f = run(make_vehicle_row(**{**KIA_FIELDS, "kms": "50000"}), permiso=permiso)
    assert f["kms"].estado == REVISAR
    f = run(make_vehicle_row(**{**KIA_FIELDS, "kms": ""}), permiso=permiso)
    assert (f["kms"].estado, f["kms"].valor_documento, f["kms"].columna_sheet) == (REVISAR, 61000, "X")   # X never written


# -------------------------------------------------------------------- bastidor
def test_bastidor_de_ficha_gana_a_ventas():
    f = run(make_vehicle_row(**KIA_FIELDS), ficha=ai_doc(bastidor=VIN_A), ventas_bastidor=VIN_B)
    b = f["bastidor"]
    assert (b.estado, b.valor_documento, b.fuente, b.columna_sheet) == (RELLENAR, VIN_A, SRC_FICHA, "AE")
    assert VIN_B in b.nota and "Ventas-Sevencars" in b.nota
    assert "bastidor (ficha vs permiso)" not in f


def test_bastidor_de_permiso_cuando_la_ficha_no_lo_tiene():
    f = run(make_vehicle_row(**KIA_FIELDS, bastidor=VIN_A), ficha=ai_doc(), permiso=ai_doc(bastidor=" vf1rfb00x12345678 "))
    assert (f["bastidor"].estado, f["bastidor"].valor_documento, f["bastidor"].fuente) == (DISCREPANCIA, VIN_B, SRC_PERMISO)


def test_bastidor_de_ventas_sin_documento():
    f = run(make_vehicle_row(**KIA_FIELDS), permiso=ai_doc(), ventas_bastidor=VIN_B)
    b = f["bastidor"]
    assert (b.estado, b.valor_documento, b.fuente) == (RELLENAR, VIN_B, SRC_VENTAS)
    assert b.fuente == "ventas" and "Ventas-Sevencars" in b.nota
    f = run(make_vehicle_row(**KIA_FIELDS, bastidor=VIN_A), ventas_bastidor=VIN_B)
    assert f["bastidor"].estado == DISCREPANCIA
    f = run(make_vehicle_row(**KIA_FIELDS, bastidor=VIN_B), ventas_bastidor=VIN_B)
    assert f["bastidor"].estado == OK


def test_bastidor_formato_dudoso():
    f = run(make_vehicle_row(**KIA_FIELDS), ficha=ai_doc(bastidor=VIN_BAD))
    assert f["bastidor"].valor_documento == VIN_BAD
    assert "formato dudoso" in f["bastidor"].nota
    f = run(make_vehicle_row(**KIA_FIELDS), ventas_bastidor=VIN_BAD)
    assert "formato dudoso" in f["bastidor"].nota and "Ventas-Sevencars" in f["bastidor"].nota


def test_bastidor_ficha_vs_permiso_distintos():
    f = run(make_vehicle_row(**KIA_FIELDS), ficha=ai_doc(bastidor=VIN_A), permiso=ai_doc(bastidor=VIN_B))
    assert f["bastidor"].valor_documento == VIN_B and f["bastidor"].fuente == "permiso circulación"
    extra = f["bastidor (ficha vs permiso)"]
    assert (extra.estado, extra.valor_sheet, extra.valor_documento) == (REVISAR, VIN_A, VIN_B)
    assert extra.columna_sheet == ""


# ----------------------------------------------------------------- doc_summary
def test_doc_summary():
    ai = ai_result(ficha=ai_doc(bastidor=VIN_A, marca="Kia", denominacion_comercial="XCeed",
                                fecha_matriculacion="2022-04-11"),
                   permiso=ai_doc(kilometraje=61000, kilometraje_fecha="2023-05-10",
                                  fecha_primera_matriculacion="2022-04-11"))
    assert doc_summary(ai) == {"vin": VIN_A, "date": date(2022, 4, 11), "kms": 61000, "kms_date": "10/05/2023",
                               "marca": "Kia", "denominacion": "XCeed"}
    empty = doc_summary(None)
    assert empty["vin"] is None and empty["date"] is None and empty["kms"] is None


def test_sources_table_includes_sheet_bastidor_row():
    cmp = compare(make_vehicle_row(**KIA_FIELDS, bastidor=VIN_A), ai=ai_result(ficha=ai_doc(bastidor=VIN_A)), columns=COLUMNS)
    campos = [s.campo for s in cmp.sources]
    assert "bastidor (hoja AE)" in campos and "potencia CV" in campos
    assert next(s for s in cmp.sources if s.campo == "bastidor (hoja AE)").hoja == VIN_A
