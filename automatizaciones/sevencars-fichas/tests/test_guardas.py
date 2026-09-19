"""Guardas de escritura: nunca se sobrescribe una celda con contenido (salvo la corrección explícita de doble
fuente), kms (X) nunca se escribe, columnas con fórmula no se tocan, y --restaurar."""
from datetime import date

import pytest

import identity as idm
import verificar
from compare import Finding
from sheet import NEVER_WRITE_FIELDS, WRITABLE_FIELDS, CellWrite, LiveSheet, SheetData, SheetError
from tests.test_identidad import COLUMNS, FOLDERS, VIN_H, VIN_T, ai, datos, datos_row, permiso
from locate import locate


def confirmed_identity():
    loc = locate(FOLDERS, ref="1082", plate="9028LXG")
    return idm.check_identity("9028LXG", loc, ai(permiso("9028LXG", VIN_H)))


def rellenar(campo, field, col, value):
    return Finding(campo, col, None, value, "permiso", "RELLENAR", "", field_name=field)


def test_kms_nunca_se_escribe():
    assert "kms" in NEVER_WRITE_FIELDS and "kms" not in WRITABLE_FIELDS
    data = datos(datos_row("1082", "9028LXG", kms=""))       # X vacía
    row = data.rows[0]
    findings = [rellenar("kms", "kms", "X", 24320), rellenar("cubicaje", "cubicaje", "Z", 1580)]
    writes = verificar.planned_writes(row, data, findings, confirmed_identity())
    assert [w.a1 for w in writes] == ["Z2"]


def test_planned_writes_solo_celdas_vacias():
    data = datos(datos_row("1082", "9028LXG", vin=VIN_T, kms="88858"))
    row = data.rows[0]
    findings = [rellenar("bastidor", "bastidor", "AE", VIN_H), rellenar("kms", "kms", "X", 24320),
                rellenar("modelo", "modelo", "C", "KIA XCEED"), rellenar("cubicaje", "cubicaje", "Z", 1580)]
    writes = verificar.planned_writes(row, data, findings, confirmed_identity())
    assert [w.a1 for w in writes] == ["Z2"] and all(not w.allow_overwrite for w in writes)


def test_columna_con_formula_no_se_escribe():
    header = ["300", "IVA", "MODELO", "MATRICULA", "FECHA MATRICULACION"] + [""] * 18 + [
        "kms", "motor cv", "cubicaje", "caja", "matriculacion", "matriculacion num", "", "bastidor"]
    values = [header, datos_row("1082", "9028LXG", kms="", vin="")]
    formulas = [header, [""] * 25 + ["=ARRAYFORMULA(IF(D2:D501=\"\";\"\";1))"] + [""] * 5]   # Z2 formula
    data = SheetData(values, formulas=formulas)
    assert data.is_formula_column("cubicaje") and not data.is_formula_column("bastidor")
    row = data.rows[0]
    findings = [rellenar("cubicaje", "cubicaje", "Z", 1580), rellenar("bastidor", "bastidor", "AE", VIN_H)]
    writes = verificar.planned_writes(row, data, findings, confirmed_identity())
    assert [w.a1 for w in writes] == ["AE2"]
    assert "fórmula" in findings[0].nota


class FakeWs:
    def __init__(self, current):
        self.current = current          # a1 -> current content ("" = empty)
        self.updates = []

    def batch_get(self, ranges, value_render_option=None):
        return [([[self.current[r]]] if self.current.get(r, "") != "" else []) for r in ranges]

    def batch_update(self, data, value_input_option=None):
        self.updates.append(data)


def test_live_write_rechaza_celdas_con_contenido():
    sheet = LiveSheet()
    sheet._ws = FakeWs({"X29": "83882", "Z29": "", "AE29": "=ARRAYFORMULA(1)", "D29": "2202KSC"})
    writes = [CellWrite(29, "kms", "X", 24320), CellWrite(29, "cubicaje", "Z", 999),
              CellWrite(29, "bastidor", "AE", VIN_H), CellWrite(29, "matricula", "D", "0000XXX", allow_overwrite=True)]
    refused = sheet.write(writes)
    assert [w.a1 for w in refused] == ["X29", "AE29"]
    assert sheet._ws.updates == [[{"range": "Z29", "values": [[999]]}, {"range": "D29", "values": [["0000XXX"]]}]]
    assert sheet.write([]) == []


def test_correction_writes_solo_corregir_puede_sobrescribir():
    props = [idm.Correction("referencia", "A", "referencia", "1088", "1087", "carpeta", idm.CORREGIR, "", 122),
             idm.Correction("bastidor", "AE", "bastidor", "", VIN_H, "permiso", idm.RELLENAR, "", 122),
             idm.Correction("bastidor", "AE", "bastidor", VIN_T, VIN_H, "permiso", idm.REVISAR, "", 122),
             idm.Correction("fecha matriculación", "E", "fecha_matriculacion", date(2020, 1, 1), date(2021, 6, 15),
                            "permiso", idm.CORREGIR, "", 122)]
    writes = verificar.correction_writes(props, 122)
    assert [(w.a1, w.value, w.allow_overwrite) for w in writes] == [
        ("A122", 1087, True), ("AE122", VIN_H, False), ("E122", "15/06/2021", True)]


def test_ningun_modo_propone_kms():
    row = datos(datos_row("1082", "9028LXG", kms="")).rows[0]
    loc = locate(FOLDERS, ref="1082", plate="9028LXG")
    props = idm.corrections(row, loc, ai(permiso("9028LXG", VIN_H, kms=24320, kms_date="2022-12-05")), VIN_H, COLUMNS,
                            escribir=True)[2]
    assert all(c.field_name != "kms" for c in props)


# ------------------------------------------------------------ --restaurar
HEADER = ["300", "IVA", "MODELO", "MATRICULA", "FECHA MATRICULACION"] + [""] * 18 + [
    "kms", "motor cv", "cubicaje", "caja", "matriculacion", "matriculacion num", "", "bastidor"]


def test_restore_plan_columna_formula_vacia_literales():
    live_vals = [HEADER, datos_row("1001", "1111AAA", kms="83882"), datos_row("1002", "2222BBB", kms="24320"),
                 datos_row("1003", "3333CCC", kms=""), datos_row("1004", "4444DDD", kms="0")]
    formulas = [HEADER, [""] * 23 + ["=ARRAYFORMULA(...)"] + [""] * 7, [""] * 31, [""] * 31, [""] * 31]
    live = SheetData(live_vals, formulas=formulas)
    backup = SheetData([HEADER, datos_row("1001", "1111AAA", kms=83882.0), datos_row("1002", "2222BBB", kms=101672.0),
                        datos_row("1003", "3333CCC", kms=None), datos_row("1004", "4444DDD", kms=11100.0)])
    plan = verificar.restore_plan(live, backup, "kms")
    assert [(e.row_number, e.accion, e.ahora, e.respaldo) for e in plan] == [
        (3, "vaciar", "24320", 101672.0), (5, "vaciar", "0", 11100.0)]      # row 2 holds the formula, row 4 empty
    plan = verificar.restore_plan(live, backup, "kms", rows=[5])
    assert [e.row_number for e in plan] == [5]


def test_restore_plan_columna_normal_escribe_respaldo():
    live = SheetData([HEADER, datos_row("1001", "1111AAA"), datos_row("1002", "2222BBB"), datos_row("1009", "9999ZZZ")])
    live.rows[0].raw["cubicaje"] = "1580"
    backup = SheetData([HEADER, datos_row("1001", "1111AAA"), datos_row("1002", "2222BBB"), datos_row("1003", "3333CCC")])
    backup.rows[0].raw["cubicaje"] = 1600.0
    plan = verificar.restore_plan(live, backup, "cubicaje", rows=[2, 3, 4])
    assert [(e.row_number, e.accion) for e in plan] == [(2, "escribir"), (4, "omitir")]
    assert plan[0].respaldo == 1600.0 and "referencia distinta" in plan[1].nota
    with pytest.raises(SheetError):
        verificar.restore_plan(live, backup, "inexistente")


def test_restore_plan_formula_vacia_todo_literal_aunque_coincida_o_no_haya_respaldo():
    live_vals = [HEADER, datos_row("1001", "1111AAA", kms="83882"), datos_row("1088", "2979NGK", kms="27773"),
                 datos_row("1090", "2848NRN", kms="39582")]
    formulas = [HEADER, [""] * 23 + ["=ARRAYFORMULA(...)"] + [""] * 7, [""] * 31, [""] * 31]
    live = SheetData(live_vals, formulas=formulas)
    backup = SheetData([HEADER, datos_row("1001", "1111AAA", kms=83882.0), datos_row("1088", "2979NGK", kms=27773.0)])
    plan = verificar.restore_plan(live, backup, "kms")
    # row 2 = formula cell (skipped); row 3 equals the backup -> still cleared; row 4 missing in backup -> still cleared
    assert [(e.row_number, e.accion, e.ahora, e.respaldo) for e in plan] == [
        (3, "vaciar", "27773", 27773.0), (4, "vaciar", "39582", None)]
    assert "sin valor de respaldo" in plan[1].nota
    plan = verificar.restore_plan(live, backup, "kms", rows=[3, 4])
    assert [e.accion for e in plan] == ["vaciar", "vaciar"]
