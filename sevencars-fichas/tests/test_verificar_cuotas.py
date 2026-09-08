"""verificar --cuotas: tabla de financiación, simulación, escritura solo de las AD vacías y --corregir.
Cálculos con «hoy» = 08/09/2026 (fixture hoy_fijo de conftest)."""
import argparse

import verificar
from sheet import SheetData

_HEADER_CELLS = {0: "300", 2: "MODELO", 3: "MATRICULA", 4: "FECHA MATRICULACION", 5: "PRECIO CONTADO",
                 9: "TARIFA FINANCIACION", 13: "PRECIO CAMPAÑA", 29: "cuota"}
HEADER = [_HEADER_CELLS.get(i, "") for i in range(30)]


def fila(ref, contado="", fecha="", cuota="", tarifa=""):
    row = [""] * 30
    row[0], row[2], row[3] = str(ref), "Opel Astra", "1234ABC"
    row[4], row[5], row[9], row[29] = str(fecha), str(contado), str(tarifa), str(cuota)
    return row


# Astra 12 485 € del 29/11/2019 → ESPECIAL, 96 meses, 12 510 € financiados, 214 €/mes.
# Kia 16 900 € del 11/04/2022 → NORMAL, 120 meses, 16 185 € financiados, 244 €/mes.
VALUES = [HEADER,
          fila(1001, contado=12485, fecha="29/11/2019"),              # fila 2: RELLENAR 214
          fila(1002, contado=12485, fecha="29/11/2019", cuota=214),   # fila 3: OK
          fila(1003, contado=12485, fecha="29/11/2019", cuota=250),   # fila 4: DISCREPANCIA
          fila(1004),                                                 # fila 5: SIN PRECIO
          fila(1005, contado=16900, fecha="11/04/2022")]              # fila 6: RELLENAR 244


class FakeSheetSrc:
    can_write = True
    label = "test"

    def __init__(self, refused=None):
        self.writes = []
        self.refused = refused or []
        self.last_notes = []

    def write(self, writes):
        self.writes.append(list(writes))
        return list(self.refused)


def make_args(**over):
    base = dict(referencias=[], matricula=[], fila=[], escribir=False, corregir=False, sin_ia=True, forzar=False,
                debug=False, sin_fotos_caja=True)
    base.update(over)
    return argparse.Namespace(**base)


def state(data, src=None, **over):
    return verificar.RunState(args=make_args(**over), sheet_src=src or FakeSheetSrc(), data=data, ventas=None, model="x")


def test_run_cuotas_tabla_y_simulacion(capsys):
    st = state(SheetData(VALUES))
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    out = capsys.readouterr().out
    assert "Presupuesto_2025" in out and "columna AD" in out
    for col in ("Precio contado", "Tarifa", "Plazo", "Importe", "AD actual", "Cuota", "Estado"):
        assert col in out
    for estado in ("RELLENAR", "OK", "DISCREPANCIA", "SIN PRECIO"):
        assert estado in out
    assert "ESPECIAL" in out and "NORMAL" in out and "12510" in out and "16185" in out
    assert "RELLENAR: 2" in out and "OK: 1" in out and "DISCREPANCIA: 1" in out and "SIN PRECIO: 1" in out
    assert "no se sobrescribe" in out and "sin precio contado" in out
    assert "Se escribiría en Base_Datos" in out and "--corregir:" not in out
    lineas = [l.strip() for l in out.splitlines() if l.strip().startswith("·")]
    assert lineas == ["· fila 2, columna AD: 214", "· fila 6, columna AD: 244"]
    assert st.sheet_src.writes == [] and st.writes_done == 0


def test_run_cuotas_tarifa_de_la_hoja_y_sin_plazo(capsys):
    values = [HEADER, fila(1001, contado=12485, fecha="29/11/2019", tarifa="NORMAL"),
              fila(1002, contado=12485, fecha="08/06/2013", cuota=150)]
    st = state(SheetData(values))
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    out = capsys.readouterr().out
    assert "206" in out and "SIN PLAZO" in out and "Consultanos" in out
    assert "sin plazo de financiación posible (coche de 159 meses)" in out
    lineas = [l.strip() for l in out.splitlines() if l.strip().startswith("·")]
    assert lineas == ["· fila 2, columna AD: 206"]


def test_run_cuotas_escribir_solo_rellenar(capsys):
    src = FakeSheetSrc()
    st = state(SheetData(VALUES), src, escribir=True)
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    assert len(src.writes) == 1
    assert [(w.a1, w.field_name, w.value, w.allow_overwrite) for w in src.writes[0]] == [
        ("AD2", "cuota", 214, False), ("AD6", "cuota", 244, False)]
    assert st.writes_done == 2
    out = capsys.readouterr().out
    assert "escrito: fila 2, columna AD: 214" in out and "escrito: fila 6, columna AD: 244" in out


def test_run_cuotas_corregir_pisa_discrepancias(capsys):
    src = FakeSheetSrc()
    st = state(SheetData(VALUES), src, escribir=True, corregir=True)
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    assert [(w.a1, w.value, w.allow_overwrite) for w in src.writes[0]] == [
        ("AD2", 214, False), ("AD4", 214, True), ("AD6", 244, False)]
    assert st.writes_done == 3
    out = capsys.readouterr().out
    assert "--corregir: 1 celda/s AD" in out and "AD antes" in out and "AD después" in out
    tabla = out.split("== --corregir:")[1]
    assert "1003" in tabla and "250" in tabla and "214" in tabla
    assert "escrito: fila 4, columna AD: 214" in out


def test_run_cuotas_corregir_sin_escribir_solo_muestra(capsys):
    src = FakeSheetSrc()
    st = state(SheetData(VALUES), src, corregir=True)
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    assert src.writes == [] and st.writes_done == 0
    out = capsys.readouterr().out
    assert "--corregir: 1 celda/s AD" in out
    lineas = [l.strip() for l in out.splitlines() if l.strip().startswith("·")]
    assert lineas == ["· fila 2, columna AD: 214", "· fila 4, columna AD: 214", "· fila 6, columna AD: 244"]


def test_run_cuotas_corregir_sin_discrepancias(capsys):
    values = [HEADER, fila(1002, contado=12485, fecha="29/11/2019", cuota=214)]
    src = FakeSheetSrc()
    st = state(SheetData(values), src, escribir=True, corregir=True)
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    assert src.writes == [] and "--corregir: 0 celda/s" in capsys.readouterr().out


def test_main_corregir_exige_cuotas(capsys):
    assert verificar.main(["--corregir", "--sin-ia"]) == verificar.EXIT_ERROR
    assert "--corregir solo va con --cuotas" in capsys.readouterr().out


def test_run_cuotas_escribir_rechazadas(capsys):
    class Src(FakeSheetSrc):
        def write(self, writes):          # la hoja rechaza la primera (contenido nuevo desde la carga)
            self.writes.append(list(writes))
            return [writes[0]]

    src = Src()
    st = state(SheetData(VALUES), src, escribir=True)
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    assert st.writes_done == 1 and len(src.writes[0]) == 2
    out = capsys.readouterr().out
    assert "NO escrito" in out and "fila 2, columna AD: 214" in out and "escrito: fila 6, columna AD: 244" in out


def test_run_cuotas_filas_seleccionadas(capsys):
    src = FakeSheetSrc()
    st = state(SheetData(VALUES), src, escribir=True, referencias=["1005"], fila=[3])
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    assert [w.a1 for w in src.writes[0]] == ["AD6"]
    out = capsys.readouterr().out
    assert "1001" not in out.split("Resumen")[0]


def test_run_cuotas_xlsx_no_escribe(capsys):
    class Xlsx(FakeSheetSrc):
        can_write = False
    src = Xlsx()
    st = state(SheetData(VALUES), src, escribir=True)
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    assert src.writes == [] and "--escribir ignorado" in capsys.readouterr().out


def test_run_cuotas_sin_columna(capsys):
    values = [HEADER[:29]] + [r[:29] for r in VALUES[1:]]
    src = FakeSheetSrc()
    st = state(SheetData(values), src, escribir=True)
    assert verificar.run_cuotas(st) == verificar.EXIT_ERROR
    out = capsys.readouterr().out
    assert "no tiene la columna 'cuota'" in out and "AD (no existe)" in out and "RELLENAR" in out
    assert src.writes == []


def test_run_cuotas_columna_con_formula(capsys):
    formulas = [HEADER, [""] * 29 + ["=ARRAYFORMULA(N2:N/76)"]] + [[""] * 30] * 4
    src = FakeSheetSrc()
    st = state(SheetData(VALUES, formulas=formulas), src, escribir=True, corregir=True)
    assert verificar.run_cuotas(st) == verificar.EXIT_ERROR
    assert "fórmula" in capsys.readouterr().out and src.writes == []


def test_run_cuotas_nada_que_escribir(capsys):
    values = [HEADER, fila(1002, contado=12485, fecha="29/11/2019", cuota=214), fila(1004)]
    src = FakeSheetSrc()
    st = state(SheetData(values), src, escribir=True)
    assert verificar.run_cuotas(st) == verificar.EXIT_OK
    assert src.writes == [] and "Nada que escribir" in capsys.readouterr().out
