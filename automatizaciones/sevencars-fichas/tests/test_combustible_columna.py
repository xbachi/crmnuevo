"""Columna 'combustible' (AF): creación de cabecera sin colisión con 'bastidor', hallazgo de compare y escritura en la
hoja en vivo ampliando la cuadrícula."""
import identity as idm
import verificar
from compare import DISCREPANCIA, OK, RELLENAR, REVISAR, SRC_MODELO, SRC_PERMISO, compare
from sheet import CellWrite, LiveSheet, SheetData, header_write_for
from tests.test_identidad import ai
from tests.test_identidad import permiso as permiso_base

BASE = ["300", "IVA", "MODELO", "MATRICULA", "FECHA MATRICULACION"] + [""] * 18 + [
    "kms", "motor cv", "cubicaje", "caja", "matriculacion", "matriculacion num", ""]      # A..AD (30 columnas)
HEADER_AE = BASE + ["bastidor"]                                                            # A..AE (31)
HEADER_AF = HEADER_AE + ["combustible"]                                                    # A..AF (32)


def fila(ref="1082", plate="9028LXG", modelo="KIA XCeed  GDi PHEV 140cv Edrive", vin="", combustible=None, n=32):
    row = [ref, "", modelo, plate, "11/04/2022"] + [""] * 18 + ["88858", "", "", "", "", "", "", vin]
    if combustible is not None:
        row.append(combustible)
    return (row + [""] * n)[:n]


def confirmed():
    return idm.IdentityCheck(idm.OK, "ok", True, True)


def permiso(plate, vin=None, combustible=None):
    """Permiso de test_identidad más el P.3 (combustible)."""
    return dict(permiso_base(plate, vin), combustible=combustible)


# ------------------------------------------------------------- header_target
def test_header_target_combustible_al_final():
    data = SheetData([HEADER_AE, fila(n=31)])
    assert not data.has_column("combustible") and data.has_column("bastidor")
    letter, msg = data.header_target("combustible")
    assert letter == "AF" and "crear" in msg and "añadiendo" in msg


def test_header_target_combustible_salta_cabecera_ocupada():
    data = SheetData([HEADER_AE + ["otra"], fila()])
    letter, msg = data.header_target("combustible")
    assert letter == "AG" and "crear" in msg
    assert data.header_target("combustible", exclude={"AG"})[0] == "AH"


def test_header_target_excluye_reservadas():
    data = SheetData([HEADER_AE, fila(n=31)])
    assert data.header_target("combustible", exclude={"AF"})[0] == "AG"
    data = SheetData([HEADER_AE + ["otra", "otra2"], fila(n=33)])
    assert data.header_target("combustible")[0] == "AH"
    assert data.header_target("combustible", exclude={"AH"})[0] == "AI"


def test_header_target_sin_celda_libre():
    data = SheetData([HEADER_AE, fila(n=31)])
    letter, msg = data.header_target("combustible", exclude={"AF", "AG"})     # ventana: 2 celdas más allá de la cabecera
    assert letter is None and "no hay celda de cabecera libre" in msg and "AF" in msg


def test_header_target_existe_y_no_creable():
    data = SheetData([HEADER_AF, fila()])
    assert data.header_target("combustible") == ("AF", "existe")
    letter, msg = data.header_target("cuota")
    assert letter is None and "no se crea" in msg


def test_reserve_header():
    data = SheetData([HEADER_AE, fila(n=31)])
    data.reserve_header("combustible", "AF")
    assert data.has_column("combustible") and data.column_letter("combustible") == "AF"
    assert data.header[31] == "combustible" and len(data.header) == 32
    assert data.header_target("combustible") == ("AF", "existe")


def test_header_write_for_combustible():
    data = SheetData([HEADER_AE, fila(n=31)])
    w = header_write_for("combustible", data)
    assert (w.row_number, w.field_name, w.column, w.value, w.a1) == (1, "combustible", "AF", "combustible", "AF1")
    assert header_write_for("combustible", SheetData([HEADER_AF, fila()])) is None


def test_header_writes_for_bastidor_y_combustible_sin_colision(capsys):
    data = SheetData([BASE, fila(n=30)])                     # ni AE ni AF
    writes = [CellWrite(2, "bastidor", "AE", "VIN"), CellWrite(2, "combustible", "AF", "Gasolina"),
              CellWrite(2, "cubicaje", "Z", 1580)]
    headers, kept = verificar.header_writes_for(data, writes)
    assert [(h.a1, h.value) for h in headers] == [("AE1", "bastidor"), ("AF1", "combustible")]
    assert kept == writes
    out = capsys.readouterr().out
    assert "AE1" in out and "AF1" in out and "se añade la columna AF" in out


def test_header_writes_for_con_ae_ocupada():
    data = SheetData([BASE + ["otra"], fila(n=31)])
    writes = [CellWrite(2, "bastidor", "AE", "VIN"), CellWrite(2, "combustible", "AF", "Gasolina")]
    headers, kept = verificar.header_writes_for(data, writes, quiet=True)
    assert [(h.a1, h.value) for h in headers] == [("AF1", "bastidor"), ("AG1", "combustible")]
    assert len(kept) == 2


def test_header_writes_for_solo_las_columnas_usadas():
    data = SheetData([BASE, fila(n=30)])
    headers, kept = verificar.header_writes_for(data, [CellWrite(2, "combustible", "AF", "Gasolina")], quiet=True)
    assert [h.a1 for h in headers] == ["AF1"]
    headers, kept = verificar.header_writes_for(SheetData([HEADER_AF, fila()]), [CellWrite(2, "combustible", "AF", "x")], quiet=True)
    assert headers == []


# ---------------------------------------------------------------- compare
def columns(data):
    cols = data.column_letters()
    cols.setdefault("bastidor", "AE")
    cols.setdefault("combustible", "AF")
    return cols


def finding(data, ai_result):
    row = data.rows[0]
    return row, next(f for f in compare(row, ai_result, columns(data)).findings if f.field_name == "combustible")


def test_combustible_permiso_rellenar():
    data = SheetData([HEADER_AF, fila(combustible="")])
    row, f = finding(data, ai(permiso("9028LXG", combustible="GASOLINA")))
    assert (f.estado, f.valor_documento, f.fuente, f.valor_sheet, f.columna_sheet) == (RELLENAR, "Gasolina", SRC_PERMISO, None, "AF")
    writes = verificar.planned_writes(row, data, [f], confirmed())
    assert [(w.a1, w.value) for w in writes] == [("AF2", "Gasolina")]


def test_combustible_permiso_ok_y_discrepancia():
    data = SheetData([HEADER_AF, fila(combustible="gasolina")])
    _, f = finding(data, ai(permiso("9028LXG", combustible="GASOLINA")))
    assert f.estado == OK and f.valor_sheet == "Gasolina"
    data = SheetData([HEADER_AF, fila(combustible="Diésel")])
    row, f = finding(data, ai(permiso("9028LXG", combustible="GASOLINA")))
    assert f.estado == DISCREPANCIA and f.valor_sheet == "Diésel" and f.valor_documento == "Gasolina"
    assert verificar.planned_writes(row, data, [f], confirmed()) == []


def test_combustible_permiso_hibrido_desde_ficha():
    data = SheetData([HEADER_AF, fila(combustible="")])
    _, f = finding(data, ai(permiso("9028LXG"), {"presente": True, "combustible": "DIESEL - HÍBRIDOS (HEV)"}))
    assert f.estado == RELLENAR and f.valor_documento == "Híbrido" and f.fuente != SRC_PERMISO


def test_combustible_sin_p3_deducido_del_modelo_nunca_se_escribe():
    data = SheetData([HEADER_AF, fila(modelo="Vw Golf VII 1.6 TDI", combustible="")])
    row, f = finding(data, ai(permiso("9028LXG")))
    assert (f.estado, f.valor_documento, f.fuente) == (REVISAR, "Diésel", SRC_MODELO)
    assert "sin confirmar" in f.nota and "no se escribe" in f.nota
    assert verificar.planned_writes(row, data, [f], confirmed()) == []
    items = verificar.items_para_verificar([f])
    assert len(items) == 1 and items[0].startswith("combustible:") and "sin confirmar" in items[0]


def test_combustible_sin_p3_con_valor_en_hoja():
    data = SheetData([HEADER_AF, fila(modelo="Vw Golf VII 1.6 TDI", combustible="diesel")])
    _, f = finding(data, ai(permiso("9028LXG")))
    assert f.estado == OK and "sin confirmar" in f.nota
    assert verificar.items_para_verificar([f]) == []                     # OK no va a PARA VERIFICAR
    data = SheetData([HEADER_AF, fila(modelo="Vw Golf VII 1.6 TDI", combustible="Gasolina")])
    _, f = finding(data, ai(permiso("9028LXG")))
    assert f.estado == REVISAR and f.valor_documento == "Diésel"


def test_combustible_sin_columna_se_planifica_en_af():
    data = SheetData([HEADER_AE, fila(n=31)])
    row, f = finding(data, ai(permiso("9028LXG", combustible="GASOLINA")))
    assert f.estado == RELLENAR and f.columna_sheet == "AF"
    writes = verificar.planned_writes(row, data, [f], confirmed())
    assert [(w.a1, w.value) for w in writes] == [("AF2", "Gasolina")]
    headers, kept = verificar.header_writes_for(data, writes, quiet=True)
    assert [h.a1 for h in headers] == ["AF1"] and kept == writes


def test_combustible_sin_columna_y_sin_bastidor_planifica_ae_y_af():
    data = SheetData([BASE, fila(n=30)])
    row = data.rows[0]
    findings = compare(row, ai(permiso("9028LXG", vin="NLHBM51H6SZ680880", combustible="GASOLINA")), columns(data)).findings
    writes = verificar.planned_writes(row, data, findings, confirmed())
    assert {(w.field_name, w.a1) for w in writes} >= {("bastidor", "AE2"), ("combustible", "AF2")}


# ------------------------------------------------------------- LiveSheet
class FakeWs:
    def __init__(self, current, col_count=31):
        self.current = current
        self.col_count = col_count
        self.updates, self.gets, self.added = [], [], []

    def batch_get(self, ranges, value_render_option=None):
        self.gets.append(list(ranges))
        return [([[self.current[r]]] if self.current.get(r, "") != "" else []) for r in ranges]

    def batch_update(self, data, value_input_option=None):
        self.updates.append(data)

    def add_cols(self, n):
        self.added.append(n)
        self.col_count += n


def live(ws) -> LiveSheet:
    sheet = LiveSheet()
    sheet._ws = ws
    return sheet


def test_live_write_amplia_la_hoja_hasta_af():
    ws = FakeWs({}, col_count=31)
    sheet = live(ws)
    refused = sheet.write([CellWrite(1, "combustible", "AF", "combustible"), CellWrite(2, "combustible", "AF", "Gasolina")])
    assert refused == [] and ws.added == [1] and ws.gets == []
    assert ws.updates == [[{"range": "AF1", "values": [["combustible"]]}, {"range": "AF2", "values": [["Gasolina"]]}]]
    assert len(sheet.last_notes) == 1 and "columna" in sheet.last_notes[0] and "AF" in sheet.last_notes[0]


def test_live_write_dentro_de_la_cuadricula_no_amplia():
    ws = FakeWs({"AE2": ""}, col_count=31)
    sheet = live(ws)
    assert sheet.write([CellWrite(2, "bastidor", "AE", "VIN")]) == []
    assert ws.added == [] and ws.gets == [["AE2"]] and sheet.last_notes == []
    assert ws.updates == [[{"range": "AE2", "values": [["VIN"]]}]]


def test_live_write_varias_columnas_nuevas():
    ws = FakeWs({}, col_count=31)
    sheet = live(ws)
    sheet.write([CellWrite(2, "combustible", "AF", "x"), CellWrite(2, "otra", "AH", "y")])
    assert ws.added == [3] and "3 columnas" in sheet.last_notes[0] and "AH" in sheet.last_notes[0]


def test_current_values_mas_alla_de_la_cuadricula():
    ws = FakeWs({"AE2": "VIN", "D2": ""}, col_count=31)
    sheet = live(ws)
    assert sheet.current_values(["AF2", "AG3"]) == ["", ""] and ws.gets == []
    assert sheet.current_values(["AE2", "AF2", "D2"]) == ["VIN", "", ""]
    assert ws.gets == [["AE2", "D2"]]


def test_current_values_sin_col_count_consulta_todo():
    ws = FakeWs({"AF2": "ya"}, col_count=0)
    sheet = live(ws)
    assert sheet.current_values(["AF2"]) == ["ya"] and ws.gets == [["AF2"]]
    assert [w.a1 for w in sheet.write([CellWrite(2, "combustible", "AF", "x")])] == ["AF2"]      # rechazada
    assert ws.added == [] and ws.updates == []
