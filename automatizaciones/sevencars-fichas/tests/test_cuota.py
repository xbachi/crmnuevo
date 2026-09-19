"""Financiación como Presupuesto_2025 (ESTANDAR): tarifa, descuento, importe, plazo, cuota; funciones de fecha de
Google Sheets (DAYS360, DATEDIF, MROUND) y planificación de la columna AD 'cuota'.
Todos los cálculos se hacen «hoy» = 08/09/2026 (fixture hoy_fijo de conftest)."""
from datetime import date

import pytest

import cuota as cuota_mod
from cuota import (COEFICIENTES_ESTANDAR, DISCREPANCIA, OK, RELLENAR, SIN_FECHA, SIN_PLAZO, SIN_PRECIO, TARIFA_CONSULTANOS, TARIFA_ESPECIAL,
                   TARIFA_NORMAL, TARIFA_SIN_DTO, calcular_financiacion, cuota_entera, cuota_texto, cuota_writes,
                   datedif_meses, days360_us, descuento_financiacion, formato_cuota, mround, normalizar_tarifa,
                   planificar_cuotas, plazos_permitidos, precio_financiado, precio_financiado_web,
                   tarifa_por_antiguedad, tipo_vehiculo_web)
from sheet import SheetData

HOY = date(2026, 9, 8)
ASTRA_FECHA = date(2019, 11, 29)

# A=referencia, E=FECHA MATRICULACION, F=PRECIO CONTADO, J=TARIFA FINANCIACION, N=PRECIO CAMPAÑA, AD=cuota
_HEADER_CELLS = {0: "300", 2: "MODELO", 3: "MATRICULA", 4: "FECHA MATRICULACION", 5: "PRECIO CONTADO",
                 9: "TARIFA FINANCIACION", 13: "PRECIO CAMPAÑA", 29: "cuota"}
HEADER = [_HEADER_CELLS.get(i, "") for i in range(30)]


def fila(ref, contado="", fecha="", cuota="", tarifa="", campana=""):
    row = [""] * 30
    row[0], row[2], row[3] = str(ref), "Opel Astra", "1234ABC"
    row[4], row[5], row[9], row[13], row[29] = str(fecha), str(contado), str(tarifa), str(campana), str(cuota)
    return row


# ------------------------------------------------------------ referencia
def test_referencia_opel_astra():
    """Comprobado contra la hoja Presupuesto_2025: 12 485 € contado, matriculado el 29/11/2019, hoy 08/09/2026."""
    f = calcular_financiacion(12485, ASTRA_FECHA, hoy=HOY)
    assert f.tarifa == TARIFA_ESPECIAL and not f.tarifa_de_hoja
    assert f.dto == 365 and f.importe == 12510
    assert f.edad_meses == 81 and f.meses_max == 99
    assert f.plazo == 96 and f.coeficiente == 0.0171
    assert f.cuota == 214 and f.nota == ""
    assert f.descripcion() == "tarifa ESPECIAL (por antigüedad) · 96 meses · 12.510 € financiados"


def test_cuota_entera_y_texto():
    assert cuota_entera(12485, ASTRA_FECHA, hoy=HOY) == 214
    assert cuota_texto(12485, ASTRA_FECHA, hoy=HOY) == "214 €/mes"
    assert cuota_texto("12485", "29/11/2019", hoy=HOY) == "214 €/mes"       # acepta texto como la hoja
    assert cuota_entera(None, ASTRA_FECHA, hoy=HOY) is None and cuota_texto(None, ASTRA_FECHA, hoy=HOY) == ""
    assert formato_cuota(214) == "214 €/mes" and formato_cuota(None) == ""


def test_hoy_por_defecto_es_la_fecha_fijada_en_los_tests(monkeypatch):
    assert calcular_financiacion(12485, ASTRA_FECHA).cuota == 214
    monkeypatch.setattr(cuota_mod, "hoy_por_defecto", date.today)
    assert cuota_mod.hoy_por_defecto() == date.today()


# ------------------------------------------------------------ fechas Sheets
@pytest.mark.parametrize("d1,d2,esperado", [
    (date(2019, 11, 29), date(2026, 9, 8), 2439),      # Astra: 2439/30 = 81,3 meses → ESPECIAL
    (date(2020, 1, 15), date(2020, 2, 15), 30),
    (date(2021, 1, 31), date(2021, 2, 28), 28),        # 31 de inicio → 30; el 28/2 final no se ajusta
    (date(2020, 1, 30), date(2020, 3, 31), 60),        # inicio 30 → el 31 final cuenta como 30
    (date(2020, 1, 15), date(2020, 3, 31), 76),        # inicio < 30 → el 31 final cuenta como día 31
    (date(2020, 2, 29), date(2020, 3, 31), 30),        # último día de febrero (bisiesto) de inicio → 30
    (date(2021, 2, 28), date(2021, 3, 31), 30),        # último día de febrero (no bisiesto) de inicio → 30
    (date(2021, 2, 27), date(2021, 3, 31), 34),        # 27/2 no es el último día → no se ajusta
    (date(2020, 3, 31), date(2020, 4, 30), 30),
    (date(2020, 4, 30), date(2020, 5, 31), 30),
    (date(2020, 12, 31), date(2021, 1, 31), 30),
    (date(2020, 9, 8), date(2026, 9, 8), 2160),
])
def test_days360_us(d1, d2, esperado):
    assert days360_us(d1, d2) == esperado


@pytest.mark.parametrize("d1,d2,esperado", [
    (date(2019, 11, 29), date(2026, 9, 8), 81),        # el día 8 no llega al 29: mes incompleto
    (date(2019, 11, 8), date(2026, 9, 8), 82),
    (date(2020, 1, 31), date(2020, 2, 28), 0),
    (date(2020, 1, 31), date(2020, 3, 1), 1),
    (date(2020, 1, 31), date(2020, 3, 31), 2),
    (date(2022, 4, 11), date(2026, 9, 8), 52),
    (date(2022, 4, 11), date(2026, 9, 11), 53),
])
def test_datedif_meses(d1, d2, esperado):
    assert datedif_meses(d1, d2) == esperado


def test_days360_y_datedif_difieren_en_fin_de_mes():
    """La tarifa usa DAYS360/30 (meses de 30 días) y el plazo DATEDIF (meses completos): no siempre coinciden."""
    assert days360_us(date(2019, 1, 31), date(2019, 3, 1)) / 30 == pytest.approx(31 / 30)
    assert datedif_meses(date(2019, 1, 31), date(2019, 3, 1)) == 1
    assert days360_us(date(2019, 1, 31), date(2019, 2, 28)) / 30 == pytest.approx(28 / 30)
    assert datedif_meses(date(2019, 1, 31), date(2019, 2, 28)) == 0
    # matriculado el 31/8/2020: DAYS360 da 72,3 meses (ESPECIAL) aunque DATEDIF solo cuenta 72 completos
    assert days360_us(date(2020, 8, 31), HOY) / 30 == pytest.approx(2168 / 30)
    assert datedif_meses(date(2020, 8, 31), HOY) == 72
    assert tarifa_por_antiguedad(date(2020, 8, 31), HOY) == TARIFA_ESPECIAL
    # matriculado el 30/9/2020: DAYS360 71,27 (NORMAL) y DATEDIF 71
    assert days360_us(date(2020, 9, 30), HOY) == 2138 and datedif_meses(date(2020, 9, 30), HOY) == 71
    assert tarifa_por_antiguedad(date(2020, 9, 30), HOY) == TARIFA_NORMAL


@pytest.mark.parametrize("valor,esperado", [
    (362.5, 365), (357.5, 360), (362.4, 360), (362.6, 365), (362.4999, 360), (2.5, 5), (7.5, 10), (12.5, 15),
    (1400, 1400), (0, 0), (363.6407766990291, 365), (1105.607476635514, 1105), (1078.4579439252337, 1080),
])
def test_mround_multiplo_de_5_mitad_hacia_arriba(valor, esperado):
    assert mround(valor, 5) == esperado


def test_mround_otros_multiplos():
    assert mround(12.5, 1) == 13 and mround(11.5, 1) == 12 and mround(125, 10) == 130


# -------------------------------------------------------------- tarifa
@pytest.mark.parametrize("texto,esperado", [
    ("NORMAL", TARIFA_NORMAL), (" normal ", TARIFA_NORMAL), ("Especial", TARIFA_ESPECIAL), ("SIN DTO", TARIFA_SIN_DTO),
    ("sin dto", TARIFA_SIN_DTO), ("Sin descuento", TARIFA_SIN_DTO), ("Consultanos", TARIFA_CONSULTANOS),
    ("CONSÚLTANOS", TARIFA_CONSULTANOS), ("", None), (None, None), ("raro", None),
])
def test_normalizar_tarifa(texto, esperado):
    assert normalizar_tarifa(texto) == esperado


@pytest.mark.parametrize("fecha,esperado", [
    (date(2026, 9, 1), TARIFA_NORMAL),
    (date(2020, 9, 9), TARIFA_NORMAL),          # 71,97 meses
    (date(2020, 9, 8), TARIFA_ESPECIAL),        # 72,0 meses: ya no es < 72
    (date(2016, 9, 9), TARIFA_ESPECIAL),        # 119,97
    (date(2016, 9, 8), TARIFA_SIN_DTO),         # 120
    (date(2013, 9, 9), TARIFA_SIN_DTO),         # 155,97
    (date(2013, 9, 8), TARIFA_CONSULTANOS),     # 156
    (date(2005, 1, 1), TARIFA_CONSULTANOS),
])
def test_tarifa_por_antiguedad(fecha, esperado):
    assert tarifa_por_antiguedad(fecha, HOY) == esperado


@pytest.mark.parametrize("precio,tarifa,esperado", [
    (12485, TARIFA_ESPECIAL, 365),        # 12485/1,03·0,03 = 363,64 → 365
    (16900, TARIFA_NORMAL, 1105),         # 16900/1,07·0,07 = 1105,6 → 1105
    (30000, TARIFA_NORMAL, 1400),         # tope M·20 000 = 1400
    (30000, TARIFA_ESPECIAL, 600),        # tope 600
    (12485, TARIFA_SIN_DTO, 0), (12485, TARIFA_CONSULTANOS, 0),
])
def test_descuento_financiacion(precio, tarifa, esperado):
    assert descuento_financiacion(precio, tarifa) == esperado


# ---------------------------------------------------------------- plazos
@pytest.mark.parametrize("meses_max,tarifa,esperado", [
    (128, TARIFA_NORMAL, [120, 108, 96, 84, 72]),
    (120, TARIFA_NORMAL, [120, 108, 96, 84, 72]),      # edad 60
    (119, TARIFA_NORMAL, [108, 96, 84, 72]),           # edad 61
    (99, TARIFA_ESPECIAL, [96, 84, 72]),               # Astra
    (72, TARIFA_NORMAL, [72]),
    (71, TARIFA_NORMAL, [60]),                         # 72 no entra → 60 sí
    (65, TARIFA_CONSULTANOS, [60]),                    # Consultanos sigue la regla PLAZO NORMAL
    (60, TARIFA_NORMAL, [60]),
    (59, TARIFA_NORMAL, []),                           # nunca 48/36/24
    (40, TARIFA_ESPECIAL, []),
    (128, TARIFA_SIN_DTO, [120, 108, 96, 84, 72, 60, 48, 36, 24]),
    (52, TARIFA_SIN_DTO, [48, 36, 24]),
    (40, TARIFA_SIN_DTO, [36, 24]),
    (30, TARIFA_SIN_DTO, [24]),
    (24, TARIFA_SIN_DTO, [24]),
    (23, TARIFA_SIN_DTO, []),
])
def test_plazos_permitidos(meses_max, tarifa, esperado):
    assert plazos_permitidos(meses_max, tarifa) == esperado


def test_coeficientes_decrecen_con_el_plazo():
    """Por eso «la cuota mínima» es siempre la del plazo más largo permitido."""
    plazos = sorted(COEFICIENTES_ESTANDAR)
    assert all(COEFICIENTES_ESTANDAR[a] > COEFICIENTES_ESTANDAR[b] for a, b in zip(plazos, plazos[1:]))
    assert set(cuota_mod.COEFICIENTES_MEJOR_OPCION) == set(range(36, 121, 12))    # documentada, sin uso


# ------------------------------------------------------- casos de cálculo
def test_edad_60_plazo_120():
    f = calcular_financiacion(16900, date(2021, 9, 8), hoy=HOY)
    assert (f.tarifa, f.edad_meses, f.meses_max, f.plazo) == (TARIFA_NORMAL, 60, 120, 120)
    assert f.dto == 1105 and f.importe == 16185 and f.cuota == 244        # 16185 · 0,0151 = 244,4


def test_edad_61_plazo_108():
    f = calcular_financiacion(16900, date(2021, 8, 8), hoy=HOY)
    assert (f.edad_meses, f.meses_max, f.plazo, f.coeficiente) == (61, 119, 108, 0.016)
    assert f.cuota == 259                                                 # 16185 · 0,016 = 258,96


def test_72_no_entra_pero_60_si():
    f = calcular_financiacion(9000, date(2017, 1, 8), hoy=HOY)
    assert (f.tarifa, f.edad_meses, f.meses_max, f.plazo) == (TARIFA_ESPECIAL, 116, 64, 60)
    assert f.dto == 260 and f.importe == 9130 and f.cuota == 219          # 9000/1,03·0,03 = 262,1 → 260; 9130 · 0,024


def test_sin_dto_admite_48_36_24():
    f48 = calcular_financiacion(6000, date(2016, 1, 8), hoy=HOY)          # 128 meses → meses_max 52
    assert (f48.tarifa, f48.dto, f48.importe, f48.plazo, f48.cuota) == (TARIFA_SIN_DTO, 0, 6390, 48, 179)
    f36 = calcular_financiacion(6000, date(2015, 1, 8), hoy=HOY)          # 140 meses → meses_max 40
    assert (f36.tarifa, f36.plazo, f36.cuota) == (TARIFA_SIN_DTO, 36, 224)     # 6390 · 0,035 = 223,65
    f24 = calcular_financiacion(6000, date(2014, 8, 8), hoy=HOY)          # 145 meses → meses_max 35
    assert (f24.tarifa, f24.plazo, f24.cuota) == (TARIFA_SIN_DTO, 24, 320)     # 6390 · 0,05 = 319,5 → 320


def test_consultanos_sin_plazo_posible():
    f = calcular_financiacion(5000, date(2013, 6, 8), hoy=HOY)            # 159 meses
    assert f.tarifa == TARIFA_CONSULTANOS and f.edad_meses == 159 and f.meses_max == 21
    assert f.dto == 0 and f.importe == 5390                               # el importe sí se calcula
    assert f.plazo is None and f.coeficiente is None and f.cuota is None
    assert f.nota == "sin plazo de financiación posible (coche de 159 meses)"
    assert f.descripcion() == "tarifa Consultanos (por antigüedad) · 5.390 € financiados"


def test_tarifa_de_la_hoja_manda_sobre_la_calculada():
    f = calcular_financiacion(12485, ASTRA_FECHA, tarifa="NORMAL", hoy=HOY)
    assert f.tarifa == TARIFA_NORMAL and f.tarifa_de_hoja
    assert f.dto == 815 and f.importe == 12060 and f.plazo == 96 and f.cuota == 206   # 12060 · 0,0171 = 206,2
    assert f.descripcion() == "tarifa NORMAL · 96 meses · 12.060 € financiados"
    # SIN DTO en J para un coche joven: sin descuento y con la regla de plazos por edad
    f = calcular_financiacion(16900, date(2022, 4, 11), tarifa="sin dto", hoy=HOY)
    assert (f.tarifa, f.dto, f.importe, f.plazo, f.cuota) == (TARIFA_SIN_DTO, 0, 17290, 120, 261)
    # Consultanos escrito en J con un coche joven: sí hay plazo (regla PLAZO NORMAL)
    f = calcular_financiacion(16900, date(2022, 4, 11), tarifa="Consultanos", hoy=HOY)
    assert (f.tarifa, f.dto, f.plazo, f.cuota) == (TARIFA_CONSULTANOS, 0, 120, 261)


def test_tarifa_desconocida_en_la_hoja_se_calcula_y_avisa():
    f = calcular_financiacion(12485, ASTRA_FECHA, tarifa="rara", hoy=HOY)
    assert f.tarifa == TARIFA_ESPECIAL and not f.tarifa_de_hoja and f.cuota == 214
    assert "tarifa 'rara' no reconocida" in f.nota


def test_sin_precio_o_sin_fecha():
    for precio in (None, "", 0, -100, "abc"):
        f = calcular_financiacion(precio, ASTRA_FECHA, hoy=HOY)
        assert f.cuota is None and f.dto is None and "sin precio contado" in f.nota
    f = calcular_financiacion(12485, None, hoy=HOY)
    assert f.tarifa is None and f.dto is None and f.edad_meses is None and f.cuota is None
    assert "sin fecha de matriculación" in f.nota
    f = calcular_financiacion(12485, None, tarifa="ESPECIAL", hoy=HOY)     # tarifa sí, fecha no: dto e importe
    assert (f.tarifa, f.dto, f.importe, f.cuota) == (TARIFA_ESPECIAL, 365, 12510, None)


# --------------------------------------------------------------- web
def test_tipo_vehiculo_web():
    assert tipo_vehiculo_web(TARIFA_NORMAL) == "" and tipo_vehiculo_web(None) == ""
    assert tipo_vehiculo_web(TARIFA_ESPECIAL) == "especial"
    assert tipo_vehiculo_web(TARIFA_SIN_DTO) == "especial_dto" and tipo_vehiculo_web(TARIFA_CONSULTANOS) == "especial_dto"


def test_precio_financiado_web():
    """precio − MROUND(min((precio − 850)/(1+M)·M, M·20 000), 5) − 850, como el tema de sevencars.es."""
    assert precio_financiado_web(16485, TARIFA_NORMAL) == 14610      # Nissan Qashqai real: coincide con N
    assert precio_financiado_web(16900, TARIFA_NORMAL) == 15000      # 16050/1,07·0,07 = 1050
    assert precio_financiado_web(12485, TARIFA_ESPECIAL) == 11295    # 11635/1,03·0,03 = 338,9 → 340
    assert precio_financiado_web(12485, TARIFA_SIN_DTO) == 11635
    assert precio_financiado_web(12485, TARIFA_CONSULTANOS) == 11635
    assert precio_financiado_web(40000, TARIFA_NORMAL) == 37750      # tope 1400
    assert precio_financiado_web(None, TARIFA_NORMAL) is None and precio_financiado_web(12485, None) is None


# ------------------------------------------------------------ planificación
def test_precio_financiado_prefiere_campana():
    data = SheetData([HEADER, fila(1001, contado=16900, campana=15000), fila(1002, contado=17415), fila(1003)])
    assert precio_financiado(data.rows[0]) == (15000.0, "")
    precio, nota = precio_financiado(data.rows[1])
    assert precio == 17415.0 and "precio contado" in nota
    assert precio_financiado(data.rows[2]) == (None, "")


def test_tarifa_se_lee_de_la_columna_j():
    data = SheetData([HEADER, fila(1001, contado=12485, fecha="29/11/2019", tarifa="NORMAL"),
                      fila(1002, contado=12485, fecha="29/11/2019")])
    assert data.column_letter("tarifa_financiacion") == "J"
    assert data.rows[0].tarifa_financiacion == "NORMAL" and data.rows[1].tarifa_financiacion == ""
    plans = planificar_cuotas(data)
    assert [(p.tarifa, p.cuota) for p in plans] == [(TARIFA_NORMAL, 206), (TARIFA_ESPECIAL, 214)]


def test_planificar_cuotas_estados():
    data = SheetData([HEADER,
                      fila(1001, contado=12485, fecha="29/11/2019"),                # AD vacía -> RELLENAR
                      fila(1002, contado=12485, fecha="29/11/2019", cuota=215),     # ±1 -> OK
                      fila(1003, contado=12485, fecha="29/11/2019", cuota=250),     # otro valor -> DISCREPANCIA
                      fila(1004),                                                   # sin F -> SIN PRECIO
                      fila(1005, contado=12485),                                    # sin E -> SIN FECHA
                      fila(1006, contado=12485, fecha="08/06/2013"),                # Consultanos -> SIN PLAZO
                      fila(1007, contado=16900, fecha="11/04/2022", campana=15000)])  # N no influye
    plans = planificar_cuotas(data)
    assert [(p.referencia, p.fila, p.estado, p.cuota) for p in plans] == [
        ("1001", 2, RELLENAR, 214), ("1002", 3, OK, 214), ("1003", 4, DISCREPANCIA, 214),
        ("1004", 5, SIN_PRECIO, None), ("1005", 6, SIN_FECHA, None), ("1006", 7, SIN_PLAZO, None),
        ("1007", 8, RELLENAR, 244)]
    assert (plans[0].tarifa, plans[0].plazo, plans[0].importe, plans[0].edad_meses) == (TARIFA_ESPECIAL, 96, 12510, 81)
    assert plans[0].precio == 12485.0 and plans[0].nota == ""
    assert plans[1].cuota_actual == 215.0
    assert "no se sobrescribe" in plans[2].nota and "--corregir" in plans[2].nota
    assert "sin fecha" in plans[4].nota
    assert plans[5].nota == "sin plazo de financiación posible (coche de 159 meses)" and plans[5].tarifa == TARIFA_CONSULTANOS
    assert (plans[6].tarifa, plans[6].plazo, plans[6].importe) == (TARIFA_NORMAL, 120, 16185)


def test_planificar_cuotas_subconjunto_de_filas():
    data = SheetData([HEADER, fila(1001, contado=12485, fecha="29/11/2019"), fila(1002, contado=12485, fecha="29/11/2019")])
    plans = planificar_cuotas(data, [data.rows[1]])
    assert [p.fila for p in plans] == [3]


def test_cuota_writes_solo_rellenar():
    data = SheetData([HEADER, fila(1001, contado=12485, fecha="29/11/2019"),
                      fila(1002, contado=12485, fecha="29/11/2019", cuota=214),
                      fila(1003, contado=12485, fecha="29/11/2019", cuota=250),
                      fila(1004), fila(1005, contado=16900, fecha="11/04/2022")])
    writes = cuota_writes(data, planificar_cuotas(data))
    assert [(w.a1, w.field_name, w.value, w.allow_overwrite) for w in writes] == [
        ("AD2", "cuota", 214, False), ("AD6", "cuota", 244, False)]


def test_cuota_writes_corregir_pisa_solo_discrepancias():
    data = SheetData([HEADER, fila(1001, contado=12485, fecha="29/11/2019"),
                      fila(1002, contado=12485, fecha="29/11/2019", cuota=214),
                      fila(1003, contado=12485, fecha="29/11/2019", cuota=250),
                      fila(1004, contado=12485, fecha="08/06/2013", cuota=99),      # SIN PLAZO: no se toca
                      fila(1005, contado=16900, fecha="11/04/2022")])
    writes = cuota_writes(data, planificar_cuotas(data), corregir=True)
    assert [(w.a1, w.value, w.allow_overwrite) for w in writes] == [
        ("AD2", 214, False), ("AD4", 214, True), ("AD6", 244, False)]


def test_cuota_writes_nada_si_columna_con_formula():
    values = [HEADER, fila(1001, contado=12485, fecha="29/11/2019"), fila(1002, contado=12485, fecha="29/11/2019", cuota=1)]
    formulas = [HEADER, [""] * 29 + ["=ARRAYFORMULA(N2:N/10)"], [""] * 30]
    data = SheetData(values, formulas=formulas)
    assert data.is_formula_column("cuota")
    plans = planificar_cuotas(data)
    assert [p.estado for p in plans] == [RELLENAR, DISCREPANCIA]
    assert cuota_writes(data, plans) == [] and cuota_writes(data, plans, corregir=True) == []


def test_cuota_writes_omite_celda_con_formula_puntual():
    values = [HEADER, fila(1001, contado=12485, fecha="29/11/2019"), fila(1002, contado=12485, fecha="29/11/2019")]
    formulas = [HEADER, [""] * 30, [""] * 29 + ["=N3/10"]]
    data = SheetData(values, formulas=formulas)
    assert data.is_formula_column("cuota")          # una fórmula en datos marca la columna
    assert cuota_writes(data, planificar_cuotas(data)) == []


def test_cuota_writes_nada_sin_columna():
    header = [h for h in HEADER[:29]]                 # sin AD
    values = [header, fila(1001, contado=12485, fecha="29/11/2019")[:29]]
    data = SheetData(values)
    assert data.column_letter("cuota") is None
    plans = planificar_cuotas(data)
    assert plans[0].estado == RELLENAR and plans[0].cuota == 214
    assert cuota_writes(data, plans) == []
