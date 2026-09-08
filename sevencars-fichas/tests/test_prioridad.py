"""Prioridad permiso > ficha y potencia total en híbridos."""
import io

from PIL import Image

from compare import DISCREPANCIA, OK, RELLENAR, REVISAR, compare, text_says_hybrid
from docs import KIND_FICHA, KIND_PERMISO, Document, load_document_images
from tests.conftest import COLUMNS, KIA_FIELDS, VIN_A, VIN_B, ai_doc, ai_result, make_vehicle_row


def by_campo(cmp):
    return {f.campo: f for f in cmp.findings}


# ------------------------------------------------------------ permiso primero
def test_permiso_gana_en_campos_comunes():
    ficha = ai_doc(marca="KIA-F", denominacion_comercial="XCEED-F", bastidor=VIN_A, cilindrada_cc=1500, potencia_kw=70)
    permiso = ai_doc(marca="KIA", denominacion_comercial="XCEED", bastidor=VIN_B, cilindrada_cc=1580, potencia_kw=85)
    row = make_vehicle_row(**{**KIA_FIELDS, "modelo": "KIA XCEED 1.6 T-GDi"})
    f = by_campo(compare(row, ai=ai_result(ficha=ficha, permiso=permiso), columns=COLUMNS))
    assert (f["modelo"].valor_documento, f["modelo"].fuente) == ("KIA XCEED", "permiso circulación")
    assert (f["bastidor"].valor_documento, f["bastidor"].fuente) == (VIN_B, "permiso circulación")
    assert (f["cubicaje"].valor_documento, f["cubicaje"].fuente) == (1580, "permiso circulación")
    assert f["motor cv"].valor_documento == 116 and f["motor cv"].fuente.startswith("permiso circulación")


def test_ficha_complementa_lo_que_falta_en_permiso():
    ficha = ai_doc(marca="KIA", denominacion_comercial="XCEED", bastidor=VIN_A, cilindrada_cc=1580, potencia_kw=85)
    permiso = ai_doc(matricula="9028LXG")  # legible but without technical fields
    row = make_vehicle_row(**{**KIA_FIELDS, "modelo": "KIA XCEED 1.6 T-GDi"})
    f = by_campo(compare(row, ai=ai_result(ficha=ficha, permiso=permiso), columns=COLUMNS))
    assert f["bastidor"].fuente == "ficha técnica" and f["bastidor"].valor_documento == VIN_A
    assert f["cubicaje"].fuente == "ficha técnica" and f["motor cv"].fuente.startswith("ficha técnica")
    assert f["matrícula"].fuente == "permiso circulación"


def test_permiso_se_envia_con_mas_resolucion(tmp_path):
    big = Image.new("RGB", (2544, 3504), "white")
    for name, kind, expected in (("permiso.jpeg", KIND_PERMISO, 2600), ("ficha.jpeg", KIND_FICHA, 2000)):
        big.save(tmp_path / name, format="JPEG")
        doc = Document(path=tmp_path / name, kind=kind)
        (img,) = load_document_images(doc)
        assert img.height == expected and img.width == round(2544 * expected / 3504)


# ------------------------------------------------------------ híbridos
def test_text_says_hybrid():
    assert text_says_hybrid("GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)")
    assert text_says_hybrid("Híbrido")
    assert text_says_hybrid("ELECTRICO/GASOLINA")
    assert text_says_hybrid("KIA XCeed PHEV")
    assert text_says_hybrid("Toyota Yaris HEV")
    assert not text_says_hybrid("ELECTRICO")
    assert not text_says_hybrid("GASOLINA")
    assert not text_says_hybrid("Chevrolet Aveo")
    assert not text_says_hybrid(None)


def test_hibrido_total_desde_modelo_cuando_no_hay_expo():
    row = make_vehicle_row(**KIA_FIELDS)
    f = by_campo(compare(row, ai=ai_result(permiso=ai_doc(potencia_kw=77.2, hibrido=True)), columns=COLUMNS))
    assert (f["motor cv"].estado, f["motor cv"].valor_documento, f["motor cv"].fuente) == (RELLENAR, 140, "MODELO (hoja)")
    assert "potencia en MODELO" not in f


def test_hibrido_sin_fuente_total_es_revisar():
    row = make_vehicle_row(**{**KIA_FIELDS, "modelo": "KIA XCeed PHEV"})
    f = by_campo(compare(row, ai=ai_result(permiso=ai_doc(potencia_kw=77.2, hibrido=True)), columns=COLUMNS))
    assert (f["motor cv"].estado, f["motor cv"].valor_documento) == (REVISAR, None)
    assert f["motor cv"].nota == "híbrido: falta la potencia total del sistema (el permiso solo da el motor térmico, 105 CV); sin confirmar, no se escribe"


def test_hibrido_total_vs_celda_existente():
    permiso = ai_doc(potencia_kw=77.2, combustible="GASOLINA/ELECTRICO")
    ok = by_campo(compare(make_vehicle_row(**KIA_FIELDS, motor_cv="141"), ai=ai_result(permiso=permiso), columns=COLUMNS))
    assert ok["motor cv"].estado == OK                      # 141 vs 140 (MODELO) within tolerance
    bad = by_campo(compare(make_vehicle_row(**KIA_FIELDS, motor_cv="105"), ai=ai_result(permiso=permiso), columns=COLUMNS))
    assert bad["motor cv"].estado == DISCREPANCIA and bad["motor cv"].valor_documento == 140


def test_hibrido_total_desde_modelo_y_para_verificar():
    row = make_vehicle_row(**KIA_FIELDS)     # motor cv vacío, MODELO dice 140cv
    permiso = ai_doc(potencia_kw=77.2, combustible="GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)", cilindrada_cc=1580)
    f = by_campo(compare(row, ai=ai_result(permiso=permiso), columns=COLUMNS))
    m = f["motor cv"]
    assert (m.estado, m.valor_documento, m.fuente) == (RELLENAR, 140, "MODELO (hoja)")
    assert "el permiso solo da el motor térmico, 105 CV" in m.nota and "confirmar la potencia total" in m.nota
    assert "potencia en MODELO" not in f
    assert f["cubicaje"].valor_documento == 1580
    import verificar
    assert any(item.startswith("motor cv:") for item in verificar.items_para_verificar(list(f.values())))


def test_no_hibrido_mantiene_kw_y_anota_modelo():
    row = make_vehicle_row(modelo="Audi Q2 1.0 TFSI 150CV", matricula="2202KSC")
    f = by_campo(compare(row, ai=ai_result(permiso=ai_doc(potencia_kw=85, combustible="GASOLINA")), columns=COLUMNS))
    assert (f["motor cv"].estado, f["motor cv"].valor_documento) == (RELLENAR, 116)
    assert "el texto de MODELO dice 150 CV" in f["motor cv"].nota
    assert f["potencia en MODELO"].estado == REVISAR
    row = make_vehicle_row(modelo="Audi Q2 1.0 TFSI 115CV", matricula="2202KSC")
    f = by_campo(compare(row, ai=ai_result(permiso=ai_doc(potencia_kw=85, combustible="GASOLINA")), columns=COLUMNS))
    assert f["motor cv"].nota == "" and f["potencia en MODELO"].estado == OK
