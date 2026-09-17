"""publicar.py: borrador en WooCommerce a partir de hoja + carpeta + permiso, con cliente y hoja falsos."""
import argparse
import json
from datetime import date

import pytest
from PIL import Image

import caja_fotos
import descripcion_cochesnet as desc_mod
import extract_claude
import identity as idm
import locate
import luna
import publicar
import verificar
from caja_fotos import CajaVerdict
from sheet import SheetData
from tests.conftest import write_jpeg
from wc_client import WcError, construir_meta

_HEADER_CELLS = {0: "300", 1: "IVA", 2: "MODELO", 3: "MATRICULA", 4: "FECHA MATRICULACION", 5: "PRECIO CONTADO",
                 6: "URL IMAGEN", 9: "TARIFA FINANCIACION", 10: "GARANTIA", 13: "PRECIO CAMPAÑA",
                 14: "MESES GARANTIA FABRICA", 23: "kms",
                 24: "motor cv", 25: "cubicaje", 26: "caja", 27: "matriculacion", 28: "matriculacion num",
                 29: "cuota", 30: "bastidor"}
HEADER = [_HEADER_CELLS.get(i, "") for i in range(31)]
IDX = {"modelo": 2, "matricula": 3, "fecha_matriculacion": 4, "precio_contado": 5, "url_imagen": 6,
       "tarifa_financiacion": 9, "garantia": 10, "precio_campana": 13, "meses_garantia": 14, "kms": 23, "motor_cv": 24, "cubicaje": 25, "caja": 26,
       "matriculacion": 27, "matriculacion_num": 28, "cuota": 29, "bastidor": 30}
VIN = "U5YH5811AGL123456"
FOLDER_NAME = "82-Kia Xceed-9028LXG"
PORTADA = "https://x/1.jpg"

# Financiación del Kia con «hoy» = 08/09/2026 (conftest.hoy_fijo), regla de Presupuesto_2025:
#   tarifa: DAYS360(11/04/2022, 08/09/2026) = 1587 → 52,9 meses < 72 → NORMAL (M = 7 %)
#   dto = MROUND(min(16900/1,07·0,07 = 1105,6; 1400), 5) = 1105 → importe = 16900 − 1105 + 390 = 16185
#   edad = DATEDIF = 52 meses → meses_max 128 → plazo 120 (coef 0,0151) → 16185 · 0,0151 = 244,4 → 244 €/mes
# Precio campaña (N) = lo que la web recalcula: 16900 − MROUND(min((16900 − 850)/1,07·0,07 = 1050; 1400), 5) − 850 = 15000
KIA = dict(modelo="KIA XCeed  GDi PHEV 140cv Edrive", matricula="9028LXG", fecha_matriculacion="11/04/2022",
           precio_contado="16900", precio_campana="15000", garantia="SI", meses_garantia="24", kms="88858",
           cubicaje="1580")
CUOTA_KIA = 244


def fila(ref="1082", **fields):
    row = [""] * 31
    row[0] = ref
    for k, v in fields.items():
        row[IDX[k]] = "" if v is None else str(v)
    return row


def datos(*extra_rows, **over):
    campos = dict(KIA)
    campos.update(over)
    return SheetData([HEADER, fila(**campos)] + list(extra_rows), "test")


def ai_kia(plate="9028LXG", combustible="GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)"):
    return {"permiso_circulacion": {"presente": True, "matricula": plate, "bastidor": VIN,
                                    "fecha_matriculacion": "2022-04-11", "fecha_primera_matriculacion": None,
                                    "combustible": combustible, "cilindrada_cc": 1580, "potencia_kw": 77.2,
                                    "marca": "KIA", "denominacion_comercial": "XCEED"},
            "ficha_tecnica": {"presente": False}, "notas": ""}


# ---------------------------------------------------------------- dobles
class FakeClient:
    url = "https://example.test"

    def __init__(self, existente=None, fallo_subida=None, fallo_crear=False, producto=None):
        self.existente, self.fallo_subida, self.fallo_crear = existente, fallo_subida, fallo_crear
        self.producto = producto or {}
        self.calls, self.subidas, self.borrados = [], [], []

    def nombres(self):
        return [c[0] for c in self.calls]

    def buscar_por_matricula(self, plate):
        self.calls.append(("buscar", plate))
        return self.existente

    def subir_imagen(self, data, filename, alt, title):
        n = len(self.subidas) + 1
        self.calls.append(("subir", filename, alt, title))
        if self.fallo_subida == n:
            raise WcError("la web rechazó el archivo por tamaño (413)")
        assert data[:2] == b"\xff\xd8", "bytes JPEG"
        self.subidas.append(100 + n)
        return 100 + n

    def admin_url(self, product_id):
        return f"{self.url}/wp-admin/post.php?post={product_id}&action=edit"

    def obtener_producto(self, product_id):
        self.calls.append(("obtener", product_id))
        return self.producto

    def actualizar_producto(self, product_id, payload):
        self.calls.append(("actualizar", product_id, payload))
        prohibidos = set(payload) & {"images", "status", "sku", "regular_price"}
        assert not prohibidos, f"una actualización nunca toca {prohibidos}"
        return dict(self.producto, **payload)

    def crear_producto(self, payload):
        self.calls.append(("crear", payload))
        if self.fallo_crear:
            raise WcError("error del servidor de la web (500)")
        return 555, f"{self.url}/wp-admin/post.php?post=555&action=edit", {"id": 555, "images": [{"src": PORTADA}]}

    def borrar_media(self, media_id):
        self.calls.append(("borrar", media_id))
        self.borrados.append(media_id)
        return True

    def payload(self):
        return next(c[1] for c in self.calls if c[0] == "crear")


class Factory:
    def __init__(self, client):
        self.client, self.calls = client, 0

    def __call__(self):
        self.calls += 1
        return self.client


class FakeSheetSrc:
    can_write = True
    label = "test"

    def __init__(self):
        self.writes, self.last_notes = [], []

    def write(self, writes):
        self.writes.append(list(writes))
        return []


def make_args(**over):
    base = dict(referencia="82", matricula=[], fila=[], simular=False, categoria=None, publicar_directo=False,
                forzar=False, sin_hoja=False, sin_fotos_caja=True, motor=None, actualizar=False, si=False,
                sin_normalizar_fotos=False, solo_fotos=False, solo_financiacion=False, sin_luna=False)
    base.update(over)
    return argparse.Namespace(**base)


def meta_dict(payload) -> dict:
    return {m["key"]: m["value"] for m in payload["meta_data"]}


PARTES_DESC = {"reclamo": "SUV híbrido enchufable", "parrafo": "Un SUV compacto y eficiente.",
               "cierre": "Una compra segura y con etiqueta CERO.",
               "tecnologia": ["Pantalla táctil de gran formato"], "confort": ["Climatizador bizona"],
               "exterior": ["Llantas de aleación"], "seguridad": ["Cámara de visión trasera"]}


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    """Ni CLI de Claude ni plantilla de descripción del proyecto; la descripción sale de un doble."""
    def boom(*a, **k):
        raise AssertionError("no se debe invocar el CLI de Claude en los tests")
    monkeypatch.setattr(extract_claude.subprocess, "run", boom)
    monkeypatch.setattr(publicar, "render_plantilla", lambda nombre, datos, plantillas_dir=None: None)
    # Las imágenes de la luna se escriben de verdad (textos, rutas, JPEG) pero con un dibujo mínimo en vez de
    # la plantilla A4 con la fuente de Windows: el render real lo prueba test_luna.
    monkeypatch.setattr(luna, "renderizar", lambda plantilla, texto, fuente=None: Image.new("RGB", (60, 40), "white"))

    def fake_generar(datos, fotos, folder_name, force=False, cache_dir=None, plantilla=None):
        piezas = desc_mod.despiezar(datos, PARTES_DESC)
        return desc_mod.Descripcion("texto", "bloque", "caché", piezas=piezas)
    monkeypatch.setattr(desc_mod, "generar", fake_generar)


@pytest.fixture
def lectura(monkeypatch):
    holder = {"ai": ai_kia()}
    monkeypatch.setattr(verificar, "read_documents",
                        lambda state, loc, plate, docs, allow_ai=True: (holder["ai"], "ok", "caché"))
    return holder


@pytest.fixture
def caja(monkeypatch):
    calls = []

    def fake(modelo_texto, combustible=None, fotos=None, folder_name="", force=False, sin_fotos=False, cache_dir=None):
        calls.append(dict(modelo=modelo_texto, combustible=combustible, fotos=[p.name for p in (fotos or [])],
                          folder_name=folder_name, force=force, sin_fotos=sin_fotos))
        return CajaVerdict("Duda", "ninguna", "baja", motivo="test")
    monkeypatch.setattr(caja_fotos, "detectar_caja", fake)
    return calls


@pytest.fixture
def carpeta(tmp_path):
    root = tmp_path / FOLDER_NAME
    (root / "fotos").mkdir(parents=True)
    for n in ("1.jpg", "2.jpg", "3.jpg"):
        write_jpeg(root / "fotos" / n)
    write_jpeg(root / "Permiso de circulación cara 1.jpeg")
    return locate.make_car_folder(root, "1_Ventas")


@pytest.fixture
def registro(tmp_path):
    return tmp_path / "publicados.json"


def run(args, data, carpeta, registro, client=None, src=None):
    client = client or FakeClient()
    factory = Factory(client)
    src = src or FakeSheetSrc()
    rc = publicar.publicar(args, src, data, [carpeta], client_factory=factory, registro_path=registro)
    return rc, client, factory, src


# ------------------------------------------------------------- guardas
def test_identidad_no_confirmada(lectura, caja, carpeta, registro, capsys):
    lectura["ai"] = ai_kia(plate="1111AAA")
    rc, client, factory, src = run(make_args(), datos(), carpeta, registro)
    assert rc == 1 and factory.calls == 0 and client.calls == [] and caja == [] and src.writes == []
    out = capsys.readouterr().out
    assert "Identidad no confirmada" in out and "IDENTIDAD NO CONFIRMADA" in out
    assert not registro.exists()


def test_referencia_inexistente_o_repetida(lectura, caja, carpeta, registro, capsys):
    rc, _, factory, _ = run(make_args(referencia="99"), datos(), carpeta, registro)
    assert rc == 1 and factory.calls == 0 and "no está en la hoja" in capsys.readouterr().out
    data = datos(fila("1082", **KIA))
    rc, _, factory, _ = run(make_args(), data, carpeta, registro)
    assert rc == 1 and factory.calls == 0 and "--fila" in capsys.readouterr().out
    rc, client, _, _ = run(make_args(fila=[3]), data, carpeta, registro)
    assert rc == 0 and client.nombres()[-1] == "crear"


def test_ya_publicado_en_registro(lectura, caja, carpeta, registro, capsys):
    registro.write_text(json.dumps({"9028LXG": {"product_id": 321, "admin_url": "https://example.test/wp-admin/post.php?post=321"}}))
    rc, client, factory, _ = run(make_args(), datos(), carpeta, registro)
    assert rc == 1 and factory.calls == 0 and client.calls == []
    out = capsys.readouterr().out
    assert "Ya publicado" in out and "321" in out


def test_duplicado_en_la_web(lectura, caja, carpeta, registro, capsys):
    existente = {"id": 9, "name": "Kia XCeed", "status": "publish", "sku": "9028LXG",
                 "admin_url": "https://example.test/wp-admin/post.php?post=9&action=edit"}
    rc, client, factory, src = run(make_args(), datos(), carpeta, registro, FakeClient(existente=existente))
    assert rc == 1 and factory.calls == 1 and client.nombres() == ["buscar"] and src.writes == []
    out = capsys.readouterr().out
    assert "ya existe en la web" in out and "producto 9" in out and not registro.exists()


def test_error_del_cliente(lectura, caja, carpeta, registro, capsys):
    def factory_roto():
        raise WcError("faltan credenciales de la web en el entorno/.env: WC_KEY")
    rc = publicar.publicar(make_args(), FakeSheetSrc(), datos(), [carpeta], client_factory=factory_roto, registro_path=registro)
    assert rc == 1 and "WC_KEY" in capsys.readouterr().out

    class Roto(FakeClient):
        def buscar_por_matricula(self, plate):
            raise WcError("no se pudo conectar con la web: dns")
    rc, client, _, _ = run(make_args(), datos(), carpeta, registro, Roto())
    assert rc == 1 and "No se pudo comprobar" in capsys.readouterr().out


# ------------------------------------------------------------ simulación
def test_simular(lectura, caja, carpeta, registro, capsys):
    rc, client, factory, src = run(make_args(simular=True), datos(), carpeta, registro)
    assert rc == 0 and factory.calls == 1 and client.nombres() == ["buscar"] and client.calls[0] == ("buscar", "9028LXG")
    assert src.writes == [] and not registro.exists()
    out = capsys.readouterr().out
    assert "Simulación" in out and "se escribiría AD (cuota) = 244" in out
    assert "se escribiría G (URL IMAGEN) = URL de la portada" in out
    assert "Kia XCeed" in out and "Duplicado: no existe en la web" in out


def test_simular_celdas_con_valor(lectura, caja, carpeta, registro, capsys):
    rc, _, _, _ = run(make_args(simular=True), datos(url_imagen="https://old/1.jpg", cuota="244"), carpeta, registro)
    assert rc == 0
    out = capsys.readouterr().out
    assert "G (URL IMAGEN) ya tiene valor: se conserva" in out and "AD ya tiene valor (244): se conserva" in out
    assert "se escribiría" not in out


# ------------------------------------------------------------ flujo real
def test_flujo_completo(lectura, caja, carpeta, registro, capsys):
    rc, client, factory, src = run(make_args(), datos(), carpeta, registro)
    assert rc == 0 and factory.calls == 1
    assert client.nombres() == ["buscar", "subir", "subir", "subir", "crear"]
    assert [c[1] for c in client.calls[1:4]] == ["kia-xceed-9028lxg-01.jpg", "kia-xceed-9028lxg-02.jpg", "kia-xceed-9028lxg-03.jpg"]
    assert [c[2] for c in client.calls[1:4]] == ["Kia XCeed 9028LXG · foto 01", "Kia XCeed 9028LXG · foto 02", "Kia XCeed 9028LXG · foto 03"]
    assert [c[3] for c in client.calls[1:4]] == ["Kia XCeed 9028LXG 01", "Kia XCeed 9028LXG 02", "Kia XCeed 9028LXG 03"]

    payload = client.payload()
    assert payload["name"] == "Kia XCeed" and payload["status"] == "draft" and payload["sku"] == "9028LXG"
    assert payload["regular_price"] == "300" and payload["type"] == "simple"
    assert payload["images"] == [{"id": 101}, {"id": 102}, {"id": 103}]
    assert payload["categories"] == [{"id": 27}, {"id": 28}] and "description" not in payload
    meta = meta_dict(payload)
    esperado = {"_marca": "Kia", "_marca_completa": "Kia XCeed", "_modelo": "XCeed GDi PHEV 140cv Edrive",
                "_modelo_listado": "XCeed", "_combustible": "Híbrido", "_cubicaje": "1580", "_cv": "140",
                "_caja": "", "_km": "88.858", "_matriculacion": "Abr 2022", "_matriculacion_num": "202204",
                "_precio": "16900", "_precio_financiado": "15000", "_cuota": "244 €/mes", "_garantia": "PREMIUM",
                "matricula": "9028LXG", "matricula_crm": "9028LXG", "_dto_renove": "850", "_a_domicilio": "290",
                "_tipo_vehiculo": "", "_fecha_matriculacion": "2022-04-11", "_yoast_wpseo_primary_product_cat": "27",
                "__marca": "field_5db06fc8c402e", "_matricula": "field_5f8ea747c5994"}
    for k, v in esperado.items():
        assert meta.get(k) == v, k
    assert "__dto_renove" not in meta and "__precio_financiado" not in meta and "__fecha_matriculacion" not in meta

    reg = json.loads(registro.read_text(encoding="utf-8"))["9028LXG"]
    assert reg["product_id"] == 555 and reg["referencia"] == "1082" and reg["fila"] == 2 and reg["status"] == "draft"
    assert reg["fotos"] == 3 and reg["portada"] == PORTADA and reg["titulo"] == "Kia XCeed" and reg["admin_url"].endswith("post=555&action=edit")

    assert len(src.writes) == 1
    assert [(w.a1, w.field_name, w.value) for w in src.writes[0]] == [("AD2", "cuota", 244), ("G2", "url_imagen", PORTADA)]
    assert caja == [dict(modelo="KIA XCeed  GDi PHEV 140cv Edrive", combustible="Híbrido", fotos=["1.jpg", "2.jpg", "3.jpg"],
                         folder_name=FOLDER_NAME, force=False, sin_fotos=True)]
    out = capsys.readouterr().out
    assert "Producto 555 creado como draft" in out and "Hoja: escrito fila 2, columna AD: 244" in out
    assert "== PARA VERIFICAR" in out and "híbrido" in out and "caja: sin confirmar" in out
    # imágenes de la luna: 16900 − 1105 (dto NORMAL) = 15795 → «15.» y «795»; cuota 244
    luna_dir = carpeta.path / luna.CARPETA_SALIDA
    assert f"Luna: precio1.jpg (15.) · precio2.jpg (795) · cuota.jpg (244) → {luna_dir}" in out
    assert sorted(p.name for p in luna_dir.iterdir()) == ["cuota.jpg", "precio1.jpg", "precio2.jpg"]
    with Image.open(luna_dir / "precio1.jpg") as im:
        assert im.format == "JPEG"


def test_sin_luna_no_genera_imagenes(lectura, caja, carpeta, registro, capsys):
    rc, client, _, _ = run(make_args(sin_luna=True), datos(), carpeta, registro)
    assert rc == 0 and client.nombres()[-1] == "crear"
    assert not (carpeta.path / luna.CARPETA_SALIDA).exists() and "Luna:" not in capsys.readouterr().out


def test_simular_ni_fallo_generan_luna(lectura, caja, carpeta, registro, capsys):
    run(make_args(simular=True), datos(), carpeta, registro)
    run(make_args(), datos(), carpeta, registro, FakeClient(fallo_crear=True))
    assert not (carpeta.path / luna.CARPETA_SALIDA).exists() and "Luna:" not in capsys.readouterr().out


def test_luna_no_detiene_la_publicacion(lectura, caja, carpeta, registro, capsys, monkeypatch):
    def roto(*a, **k):
        raise luna.LunaError("No encuentro la fuente de los dígitos de la luna: x.ttf")
    monkeypatch.setattr(luna, "renderizar", roto)
    rc, client, _, src = run(make_args(), datos(), carpeta, registro)
    out = capsys.readouterr().out
    assert rc == 0 and client.nombres()[-1] == "crear" and len(src.writes) == 1
    assert "Luna: no se generaron las imágenes (No encuentro la fuente" in out


def test_g_con_valor_solo_escribe_ad(lectura, caja, carpeta, registro):
    rc, _, _, src = run(make_args(), datos(url_imagen="https://old/1.jpg"), carpeta, registro)
    assert rc == 0 and [(w.a1, w.value) for w in src.writes[0]] == [("AD2", 244)]


def test_ad_con_valor_solo_escribe_g(lectura, caja, carpeta, registro):
    rc, _, _, src = run(make_args(), datos(cuota="244"), carpeta, registro)
    assert rc == 0 and [(w.a1, w.value) for w in src.writes[0]] == [("G2", PORTADA)]


def test_nada_que_escribir_en_hoja(lectura, caja, carpeta, registro, capsys):
    rc, _, _, src = run(make_args(), datos(cuota="244", url_imagen="https://old/1.jpg"), carpeta, registro)
    assert rc == 0 and src.writes == [] and "nada que escribir" in capsys.readouterr().out


def test_hoja_xlsx_no_escribe(lectura, caja, carpeta, registro, capsys):
    class Xlsx(FakeSheetSrc):
        can_write = False
    src = Xlsx()
    rc, _, _, _ = run(make_args(), datos(), carpeta, registro, src=src)
    assert rc == 0 and src.writes == [] and "no se escribe (export xlsx)" in capsys.readouterr().out


def test_publicar_directo_y_sin_hoja(lectura, caja, carpeta, registro, capsys):
    rc, client, _, src = run(make_args(publicar_directo=True, sin_hoja=True), datos(), carpeta, registro)
    assert rc == 0 and client.payload()["status"] == "publish" and src.writes == []
    assert json.loads(registro.read_text(encoding="utf-8"))["9028LXG"]["status"] == "publish"
    assert "creado como publish" in capsys.readouterr().out


def test_fallo_en_segunda_subida(lectura, caja, carpeta, registro, capsys):
    rc, client, _, src = run(make_args(), datos(), carpeta, registro, FakeClient(fallo_subida=2))
    assert rc == 1 and client.nombres() == ["buscar", "subir", "subir", "borrar"]
    assert client.borrados == [101] and src.writes == [] and not registro.exists()
    assert "Fallo subiendo fotos" in capsys.readouterr().out


def test_fallo_en_crear_producto(lectura, caja, carpeta, registro, capsys):
    rc, client, _, src = run(make_args(), datos(), carpeta, registro, FakeClient(fallo_crear=True))
    assert rc == 1 and client.borrados == [101, 102, 103] and src.writes == [] and not registro.exists()
    assert "No se pudo crear el producto" in capsys.readouterr().out


def test_caja_de_la_hoja_no_llama_a_detectar(lectura, caja, carpeta, registro):
    rc, client, _, _ = run(make_args(), datos(caja="automatica"), carpeta, registro)
    assert rc == 0 and caja == [] and meta_dict(client.payload())["_caja"] == "Automático"


def test_caja_por_fotos_alta_se_publica(lectura, monkeypatch, carpeta, registro):
    monkeypatch.setattr(caja_fotos, "detectar_caja", lambda *a, **k: CajaVerdict("Manual", "fotos", "alta", "3.jpg", "tres pedales"))
    rc, client, _, _ = run(make_args(sin_fotos_caja=False), datos(), carpeta, registro)
    assert rc == 0 and meta_dict(client.payload())["_caja"] == "Manual"


def test_hibrido_sin_cv_en_modelo(lectura, caja, carpeta, registro, capsys):
    rc, client, _, _ = run(make_args(), datos(modelo="KIA XCeed GDi PHEV Edrive"), carpeta, registro)
    assert rc == 0 and meta_dict(client.payload())["_cv"] == ""
    out = capsys.readouterr().out
    assert "cv: híbrido, falta la potencia total" in out


def test_hibrido_con_y_en_hoja(lectura, caja, carpeta, registro):
    rc, client, _, _ = run(make_args(), datos(motor_cv="141"), carpeta, registro)
    assert rc == 0 and meta_dict(client.payload())["_cv"] == "141"


def test_no_hibrido_cv_del_permiso(lectura, caja, carpeta, registro):
    lectura["ai"] = ai_kia(combustible="GASOLINA")
    rc, client, _, _ = run(make_args(), datos(modelo="Kia XCeed 1.6 GDi"), carpeta, registro)
    meta = meta_dict(client.payload())
    assert rc == 0 and meta["_cv"] == "105" and meta["_combustible"] == "Gasolina"       # 77,2 kW × 1,36


def test_categoria_override(lectura, caja, carpeta, registro, capsys):
    rc, client, _, _ = run(make_args(categoria="urbano"), datos(), carpeta, registro)
    assert rc == 0 and client.payload()["categories"] == [{"id": 24}]
    assert meta_dict(client.payload())["_yoast_wpseo_primary_product_cat"] == "24"
    rc, client, factory, _ = run(make_args(categoria="camion"), datos(), carpeta, registro)
    assert rc == 1 and factory.calls == 0 and "camion" in capsys.readouterr().out


def test_modelo_sin_categoria_va_a_verificar(lectura, caja, carpeta, registro, capsys):
    rc, client, _, _ = run(make_args(), datos(modelo="Ford Raptor 3.0"), carpeta, registro)
    assert rc == 0 and client.payload()["categories"] == []
    assert "_yoast_wpseo_primary_product_cat" not in meta_dict(client.payload())
    assert "categoría:" in capsys.readouterr().out


def test_fila_sin_matricula_usa_la_del_permiso(lectura, caja, carpeta, registro):
    rc, client, _, _ = run(make_args(), datos(matricula=""), carpeta, registro)
    assert rc == 0 and client.payload()["sku"] == "9028LXG" and client.calls[0] == ("buscar", "9028LXG")


# ------------------------------------------------------ construir_borrador
def borrador(carpeta, ai=None, **over):
    row = datos(**over).rows[0]
    ai = ai or ai_kia()
    return publicar.construir_borrador(row, carpeta, idm.permiso_data(ai), ai, sin_fotos_caja=True)


def test_garantia_texto():
    """La garantía comercial es siempre 12 meses: la columna O (garantía de fábrica restante) no se publica."""
    for garantia, meses in (("SI", "24"), ("sí", ""), ("NO", "24"), ("", "")):
        assert publicar.garantia_texto(datos(garantia=garantia, meses_garantia=meses).rows[0]) == "12 meses"
    assert publicar.garantia_texto() == "12 meses"


def test_construir_borrador_valores(caja, carpeta):
    b = borrador(carpeta)
    assert (b.titulo, b.sku, b.marca, b.modelo, b.version) == ("Kia XCeed", "9028LXG", "Kia", "XCeed", "GDi PHEV 140cv Edrive")
    assert (b.combustible, b.caja, b.km, b.cv, b.cubicaje) == ("Híbrido", None, "88.858", 140, 1580)
    assert (b.matriculacion, b.matriculacion_num, b.garantia) == ("Abr 2022", 202204, "12 meses")
    assert (b.precio, b.precio_financiado, b.cuota) == (16900.0, 15000.0, CUOTA_KIA)
    f = b.financiacion
    assert (f.tarifa, f.dto, f.importe, f.edad_meses, f.plazo, f.cuota) == ("NORMAL", 1105, 16185, 52, 120, 244)
    assert b.tarifa == "NORMAL" and not any(x.startswith("precio financiado") for x in b.para_verificar)
    assert b.categorias == ["suv-4x4", "familiar"] and b.categoria_ids == [27, 28]
    assert [f.nombre for f in b.fotos] == ["kia-xceed-9028lxg-01.jpg", "kia-xceed-9028lxg-02.jpg", "kia-xceed-9028lxg-03.jpg"]
    assert b.fotos[0].alt == "Kia XCeed 9028LXG · foto 01" and b.fotos[0].path.name == "1.jpg"
    assert any("híbrido" in x for x in b.para_verificar) and any(x.startswith("caja:") for x in b.para_verificar)
    assert b.avisos == []


def test_construir_borrador_campos_acf(caja, carpeta):
    campos = borrador(carpeta).campos_acf()
    assert set(campos) == {"_marca", "_marca_completa", "_modelo", "_modelo_listado", "_combustible", "_cubicaje", "_cv",
                           "_caja", "_km", "_matriculacion", "_matriculacion_num", "_precio", "_precio_financiado",
                           "_cuota", "_garantia", "_destacado", "_equipamiento", "matricula", "matricula_crm",
                           "_dto_renove", "_a_domicilio", "_tipo_vehiculo", "_fecha_matriculacion",
                           "_yoast_wpseo_primary_product_cat"}
    assert campos["_cuota"] == "244 €/mes" and campos["_precio_financiado"] == "15000" and campos["_dto_renove"] == "850"
    assert campos["_precio"] == "16900" and campos["_tipo_vehiculo"] == "" and campos["_fecha_matriculacion"] == "2022-04-11"


def test_fecha_matriculacion_iso_en_los_campos_acf(caja, carpeta):
    """_fecha_matriculacion: la fecha E en ISO (la web calcula con ella la edad exacta del coche); sin E, la del
    permiso; sin ninguna, vacía (y _matriculacion sigue saliendo de AB)."""
    b = borrador(carpeta)
    assert b.fecha_matriculacion == date(2022, 4, 11) and b.campos_acf()["_fecha_matriculacion"] == "2022-04-11"
    b = borrador(carpeta, fecha_matriculacion="")
    assert b.campos_acf()["_fecha_matriculacion"] == "2022-04-11" and b.cuota == CUOTA_KIA
    ai = ai_kia()
    ai["permiso_circulacion"]["fecha_matriculacion"] = None
    b = borrador(carpeta, ai, fecha_matriculacion="", matriculacion="Abr 2022", matriculacion_num="202204")
    campos = b.campos_acf()
    assert b.fecha_matriculacion is None and campos["_fecha_matriculacion"] == "" and campos["_matriculacion"] == "Abr 2022"
    # meta plano: sin fila field_xxx
    assert [m["key"] for m in construir_meta(campos) if "fecha_matriculacion" in m["key"]] == ["_fecha_matriculacion"]


def test_tipo_vehiculo_y_precio_financiado_segun_tarifa(caja, carpeta):
    """_tipo_vehiculo sale de la tarifa; la web recalcula _precio_financiado con él, así que si N no coincide
    con ese recálculo se avisa en PARA VERIFICAR con los dos números."""
    # ESPECIAL escrito en J: dto = MROUND(16900/1,03·0,03 = 492,2) = 490 → importe 16800 → 120 meses → 253,7 → 254
    b = borrador(carpeta, tarifa_financiacion="ESPECIAL")
    assert b.tarifa == "ESPECIAL" and b.financiacion.tarifa_de_hoja and b.cuota == 254
    campos = b.campos_acf()
    assert campos["_tipo_vehiculo"] == "especial" and campos["_cuota"] == "254 €/mes"
    # la web recalcularía 16900 − MROUND(16050/1,03·0,03 = 467,5 → 465) − 850 = 15585 ≠ 15000 de la hoja
    aviso = next(x for x in b.para_verificar if x.startswith("precio financiado"))
    assert "15000" in aviso and "15585" in aviso and "ESPECIAL" in aviso
    b = borrador(carpeta, tarifa_financiacion="SIN DTO")
    assert b.campos_acf()["_tipo_vehiculo"] == "especial_dto" and b.cuota == 261     # 17290 · 0,0151
    aviso = next(x for x in b.para_verificar if x.startswith("precio financiado"))
    assert "16050" in aviso
    # N = lo que la web recalcula para NORMAL (15000): sin aviso; N distinto (15455): aviso
    assert not any(x.startswith("precio financiado") for x in borrador(carpeta).para_verificar)
    aviso = next(x for x in borrador(carpeta, precio_campana="15455").para_verificar if x.startswith("precio financiado"))
    assert "15455" in aviso and "15000" in aviso and "NORMAL" in aviso


def test_coche_sin_plazo_posible(caja, carpeta):
    """Matriculado en 2013: Consultanos, ningún plazo entra → sin cuota, AD no se escribe, aviso en PARA VERIFICAR."""
    b = borrador(carpeta, fecha_matriculacion="08/06/2013", matriculacion="Jun 2013", matriculacion_num="201306")
    assert b.tarifa == "Consultanos" and b.cuota is None and b.financiacion.importe == 17290
    campos = b.campos_acf()
    assert campos["_cuota"] == "" and campos["_tipo_vehiculo"] == "especial_dto"
    assert any(x == "cuota: sin plazo de financiación posible (coche de 159 meses)" for x in b.para_verificar)
    assert publicar.planificar_hoja(b, datos()) == ["se escribiría G (URL IMAGEN) = URL de la portada"]
    publicar.imprimir_resumen(b)                        # sin cuota: no debe fallar


def test_campos_acf_destacado_y_equipamiento(caja, carpeta):
    """Una sola generación alimenta los dos campos ACF, cada uno con su formato."""
    b = borrador(carpeta)
    campos = b.campos_acf()
    assert campos["_destacado"].startswith("En SEVENCARS llevamos más de 15 años")
    assert campos["_destacado"].rstrip().endswith("SEVENCARS – Calidad en cada detalle")
    assert "- Financiación sin entrada disponible" in campos["_destacado"]
    assert "Una compra segura y con etiqueta CERO." in campos["_destacado"]      # párrafo de cierre
    assert campos["_equipamiento"].startswith("///// Datos técnicos:")
    assert "//// Confort / Interior" in campos["_equipamiento"] and "🎯" not in campos["_equipamiento"]
    assert "Climatizador bizona" in campos["_equipamiento"]
    # en la web _garantia es el nombre del plan; los "12 meses" que ve el cliente salen del tema y del pie
    assert campos["_garantia"] == "PREMIUM" and b.garantia == "12 meses"
    assert "12 meses de garantía (ampliable)" in campos["_destacado"]
    # y viajan como meta ACF normales, con su fila field_xxx
    meta = {m["key"]: m["value"] for m in construir_meta(campos)}
    assert meta["__destacado"] == "field_5db06f88c402c" and meta["__equipamiento"] == "field_5f089842a0066"
    assert any(x == desc_mod.AVISO_VERIFICAR for x in b.para_verificar)


def test_simular_muestra_un_extracto_de_los_dos_campos(lectura, caja, carpeta, registro, capsys):
    rc, client, _, src = run(make_args(simular=True), datos(), carpeta, registro)
    assert rc == 0 and client.nombres() == ["buscar"] and src.writes == []
    salida = capsys.readouterr().out
    assert "== _destacado" in salida and "== _equipamiento" in salida
    assert "líneas" in salida and "caracteres" in salida
    assert "En SEVENCARS llevamos más de 15 años" in salida and "///// Datos técnicos:" in salida
    # --simular enseña los dos campos enteros (así se previsualiza la descripción sin tocar la web ni la hoja)
    assert "_destacado (" in salida and "— completo" in salida and "— extracto" not in salida
    for linea in ("SEVENCARS – Calidad en cada detalle", "//// Seguridad / Asistencia", "Cámara de visión trasera",
                  "Etiqueta medioambiental CERO", "== PARA VERIFICAR", "versión identificada por la IA"):
        assert linea in salida, linea


def test_sin_simular_el_resumen_sigue_siendo_un_extracto(caja, carpeta, capsys):
    publicar.imprimir_resumen(borrador(carpeta))
    salida = capsys.readouterr().out
    assert "— extracto" in salida and "//// Seguridad / Asistencia" not in salida


def test_la_descripcion_recibe_los_datos_de_identificacion(caja, carpeta, monkeypatch):
    """Marca, modelo, versión, fecha, cilindrada, kW y CV, combustible, caja, plazas, bastidor y códigos del permiso
    llegan a DatosCoche; versión, confianza y fuentes de la IA van a PARA VERIFICAR."""
    recibidos = []
    partes = dict(PARTES_DESC, version_identificada="Kia XCeed (CD) 1.6 GDi PHEV Emotion", confianza="media",
                  fuentes=["https://www.km77.com/xceed"], motor="1.6 GDi PHEV", cambio="automático de doble "
                  "embrague de 6 velocidades", color="Blanco", puertas=5, traccion="delantera")

    def fake_generar(datos, fotos, folder_name, force=False, cache_dir=None, plantilla=None):
        recibidos.append(datos)
        return desc_mod.Descripcion("texto", "bloque", "ia", piezas=desc_mod.despiezar(datos, partes))
    monkeypatch.setattr(desc_mod, "generar", fake_generar)
    ai = ai_kia()
    ai["permiso_circulacion"].update(plazas=5, tipo_variante="CD/PHEV1", codigo_variante="7", homologacion="e5*2007/46*1234")
    ai["ficha_tecnica"] = {"presente": True, "norma_euro": "EURO 6D", "plazas": 7}
    b = borrador(carpeta, ai, bastidor=VIN)
    d = recibidos[0]
    assert (d.marca, d.modelo, d.version) == ("Kia", "XCeed", "GDi PHEV 140cv Edrive")
    assert d.fecha == date(2022, 4, 11) and d.anio == 2022 and d.cilindrada == 1580 and d.kw == 77.2 and d.cv == 140
    assert d.combustible == "Híbrido" and d.p3.startswith("GASOLINA - HÍBRIDO ENCHUFABLE") and d.gas == ""
    assert d.plazas == 5 and d.bastidor == VIN and d.tipo_variante == "CD/PHEV1" and d.codigo_variante == "7"
    assert d.homologacion == "e5*2007/46*1234" and d.norma_euro == "EURO 6D" and d.denominacion == "XCEED"
    assert "Motor 1.6 GDi PHEV" in b.equipamiento and "Color: Blanco" in b.equipamiento
    assert "Etiqueta medioambiental CERO" in b.equipamiento
    assert any("versión identificada por la IA: Kia XCeed (CD) 1.6 GDi PHEV Emotion (confianza media)" in x
               for x in b.para_verificar)
    assert "descripción: fuentes: https://www.km77.com/xceed" in b.para_verificar
    assert any("confianza media" in x and "revisar equipamiento" in x for x in b.para_verificar)
    # enchufable sin autonomía conocida: CERO por fecha y a confirmar en la DGT
    assert any(x.startswith("etiqueta DGT: CERO") and "dgt.es" in x for x in b.para_verificar)
    assert "km77" not in b.campos_acf()["_equipamiento"] and "km77" not in b.campos_acf()["_destacado"]


def test_glp_gasolina_en_la_web_y_gas_aparte(caja, carpeta, monkeypatch):
    """«GAS LICUADO DE PETROLEO»: _combustible sigue siendo Gasolina (el select no admite otra cosa); el gas va
    aparte a la descripción y pone la etiqueta ECO."""
    recibidos = []

    def fake_generar(datos, fotos, folder_name, force=False, cache_dir=None, plantilla=None):
        recibidos.append(datos)
        return desc_mod.Descripcion("texto", "bloque", "ia", piezas=desc_mod.despiezar(datos, PARTES_DESC))
    monkeypatch.setattr(desc_mod, "generar", fake_generar)
    b = borrador(carpeta, ai_kia(combustible="GAS LICUADO DE PETROLEO"), modelo="Dacia Sandero 1.0 TCe 100 GLP Essential")
    assert b.combustible == "Gasolina" and b.campos_acf()["_combustible"] == "Gasolina" and b.gas == "GLP"
    assert recibidos[0].gas == "GLP" and recibidos[0].etiqueta == "ECO"
    assert "Etiqueta medioambiental ECO" in b.equipamiento and "Doble combustible: gasolina y GLP" in b.equipamiento
    assert not any(x.startswith("gas:") for x in b.para_verificar)
    # solo el MODELO lo dice: se usa, pero queda a confirmar
    b = borrador(carpeta, ai_kia(combustible="GASOLINA"), modelo="Dacia Sandero 1.0 TCe ECO-G 100")
    assert b.gas == "GLP" and b.campos_acf()["_combustible"] == "Gasolina"
    assert any(x.startswith("gas: GLP según el texto de MODELO") for x in b.para_verificar)


def test_sin_descripcion_deja_los_campos_vacios(caja, carpeta, monkeypatch):
    def no_llamar(*a, **k):
        raise AssertionError("con --sin-descripcion no se genera nada")
    monkeypatch.setattr(desc_mod, "generar", no_llamar)
    b = publicar.construir_borrador(datos().rows[0], carpeta, None, ai_kia(), sin_fotos_caja=True,
                                    sin_descripcion=True)
    assert b.destacado == "" and b.equipamiento == ""
    assert b.campos_acf()["_destacado"] == ""


def test_un_fallo_de_la_descripcion_no_rompe_el_borrador(caja, carpeta, monkeypatch):
    monkeypatch.setattr(desc_mod, "generar",
                        lambda *a, **k: desc_mod.Descripcion(fuente="fallo", error="límite de uso"))
    b = publicar.construir_borrador(datos().rows[0], carpeta, None, ai_kia(), sin_fotos_caja=True)
    assert b.destacado == "" and b.equipamiento == ""
    assert any("no se pudo generar" in a for a in b.avisos)


def test_construir_borrador_portada_dudosa_y_sin_fotos(caja, carpeta):
    (carpeta.path / "fotos" / "1.jpg").unlink()
    b = borrador(carpeta)
    assert [f.path.name for f in b.fotos] == ["2.jpg", "3.jpg"] and b.fotos[0].nombre.endswith("-01.jpg")
    assert any("portada dudosa" in x and "2.jpg" in x for x in b.para_verificar)
    for p in (carpeta.path / "fotos").iterdir():
        p.unlink()
    b = borrador(carpeta)
    assert b.fotos == [] and any("sin fotos" in a for a in b.avisos)


def test_construir_borrador_avisos_precio_y_cubicaje(caja, carpeta):
    ai = ai_kia()
    ai["permiso_circulacion"]["cilindrada_cc"] = None
    b = borrador(carpeta, ai, precio_campana="", precio_contado="", cubicaje="")
    assert b.precio is None and b.precio_financiado is None and b.cuota is None and b.cubicaje is None
    assert any("PRECIO CONTADO" in a for a in b.avisos) and any("cubicaje" in a for a in b.avisos)
    assert b.campos_acf()["_cuota"] == "" and b.campos_acf()["_precio"] == ""
    b = borrador(carpeta, precio_campana="")
    # la cuota sale del precio contado, no de N: no cambia; pero N vacía → se publicaría 16900 y la web pondrá 15000
    assert b.precio_financiado == 16900.0 and b.cuota == CUOTA_KIA and any("precio contado" in a for a in b.avisos)
    assert any(x.startswith("precio financiado") and "15000" in x for x in b.para_verificar)


def test_construir_borrador_combustible_sin_permiso(caja, carpeta):
    ai = ai_kia(combustible=None)
    b = borrador(carpeta, ai, modelo="Vw Golf VII 1.6 TDI")
    assert b.combustible is None and any(x.startswith("combustible: Diésel sin confirmar") for x in b.para_verificar)
    assert caja[-1]["combustible"] is None
    assert b.cv == 105 and b.categorias == ["compacto"]


def test_construir_borrador_categoria_invalida(caja, carpeta):
    row = datos().rows[0]
    with pytest.raises(ValueError):
        publicar.construir_borrador(row, carpeta, None, ai_kia(), categoria_override="camion", sin_fotos_caja=True)


def test_imprimir_resumen(caja, carpeta, capsys):
    b = borrador(carpeta)
    b.avisos.append("aviso de prueba")
    publicar.imprimir_resumen(b)
    out = capsys.readouterr().out
    assert "Resumen del borrador" in out and "Kia XCeed" in out and "244 €/mes" in out and "aviso de prueba" in out
    assert "tarifa NORMAL" in out and "120 meses" in out and "16.185 € financiados" in out and "Tipo vehículo" in out
    assert "suv-4x4, familiar" in out and "kia-xceed-9028lxg-01.jpg" in out
    b2 = borrador(carpeta, precio_campana="", precio_contado="")
    publicar.imprimir_resumen(b2)                       # sin precio ni cuota: no debe fallar
    assert "Cuota" in capsys.readouterr().out


def test_datos_plantilla_y_planificar_hoja(caja, carpeta):
    b = borrador(carpeta)
    d = publicar.datos_plantilla(b)
    assert d["marca"] == "Kia" and d["cuota"] == "244 €/mes" and d["matricula"] == "9028LXG" and d["cv"] == 140
    assert publicar.planificar_hoja(b, datos()) == ["se escribiría AD (cuota) = 244", "se escribiría G (URL IMAGEN) = URL de la portada"]
    sin_ad = SheetData([HEADER[:29], fila(**KIA)[:29]])
    b2 = borrador(carpeta)
    b2.row = sin_ad.rows[0]
    assert publicar.planificar_hoja(b2, sin_ad) == ["no existe la columna 'cuota'",
                                                    "se escribiría G (URL IMAGEN) = URL de la portada"]


def test_registro(tmp_path):
    path = tmp_path / "sub" / "publicados.json"
    assert publicar.cargar_registro(path) == {}
    publicar.guardar_registro("9028LXG", {"product_id": 1}, path)
    publicar.guardar_registro("1111BBB", {"product_id": 2}, path)
    assert publicar.cargar_registro(path) == {"9028LXG": {"product_id": 1}, "1111BBB": {"product_id": 2}}
    path.write_text("{roto", encoding="utf-8")
    assert publicar.cargar_registro(path) == {}


# ------------------------------------------------------- actualizar (--actualizar)
PRODUCTO_ID = 37288


def producto_web(campos_extra=None, name="Kia XCeed", categorias=None):
    """Producto tal como lo devuelve la web: la meta del borrador actual con los retoques que pida el test."""
    campos = dict(KIA_ACF_BASE)
    campos.update(campos_extra or {})
    ids = KIA_CATS if categorias is None else categorias
    return {"id": PRODUCTO_ID, "name": name, "status": "draft", "sku": "9028LXG",
            "categories": [{"id": i} for i in ids], "images": [{"id": 1}, {"id": 2}],
            "meta_data": [{"key": k, "value": v} for k, v in campos.items()]}


def run_actualizar(args, data, carpeta, registro, client):
    factory = Factory(client)
    rc = publicar.actualizar(args, FakeSheetSrc(), data, [carpeta], client_factory=factory, registro_path=registro)
    return rc, client, factory


@pytest.fixture
def acf_base(carpeta):
    """La meta y las categorías que produciría el borrador actual: el punto de partida para simular la web."""
    global KIA_ACF_BASE, KIA_CATS
    b = borrador(carpeta)
    KIA_ACF_BASE = {m["key"]: m["value"] for m in construir_meta(b.campos_acf())}
    KIA_CATS = list(b.categoria_ids)
    return KIA_ACF_BASE


def test_actualizar_solo_manda_los_campos_que_cambian(lectura, caja, carpeta, registro, acf_base, capsys):
    """El caso del Polo: el anuncio es viejo y le faltan _destacado, _equipamiento y el mes abreviado."""
    viejo = dict(acf_base, _matriculacion="Abril 2022", _destacado="", _equipamiento="")
    cliente = FakeClient(producto=producto_web(viejo))
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(make_args(actualizar=True, si=True), datos(), carpeta, registro, cliente)
    assert rc == 0
    enviado = next(c for c in client.calls if c[0] == "actualizar")[2]
    assert set(enviado) == {"meta_data"}                      # ni fotos, ni estado, ni sku, ni precio
    cambiados = {m["key"] for m in enviado["meta_data"]}
    assert cambiados == {"_matriculacion", "_destacado", "_equipamiento"}
    valores = {m["key"]: m["value"] for m in enviado["meta_data"]}
    assert valores["_matriculacion"] == "Abr 2022"
    assert valores["_destacado"].startswith("En SEVENCARS") and valores["_equipamiento"].startswith("///// Datos")
    # el registro guarda cuándo y qué se tocó
    guardado = json.loads(registro.read_text(encoding="utf-8"))["9028LXG"]
    assert guardado["actualizado"] and sorted(guardado["campos_actualizados"]) == sorted(cambiados)


def test_actualizar_no_toca_las_fotos_ni_el_estado(lectura, caja, carpeta, registro, acf_base):
    cliente = FakeClient(producto=producto_web({"_destacado": ""}))
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(make_args(actualizar=True, si=True), datos(), carpeta, registro, cliente)
    assert rc == 0
    enviado = next(c for c in client.calls if c[0] == "actualizar")[2]
    for prohibido in ("images", "status", "sku", "regular_price", "type"):
        assert prohibido not in enviado
    assert client.subidas == [] and not any(c[0] == "subir" for c in client.calls)


def test_actualizar_muestra_la_tabla_y_simular_no_envia(lectura, caja, carpeta, registro, acf_base, capsys):
    viejo = dict(acf_base, _matriculacion="Abril 2022", _destacado="")
    cliente = FakeClient(producto=producto_web(viejo))
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(make_args(actualizar=True, simular=True), datos(), carpeta, registro, cliente)
    assert rc == 0 and not any(c[0] == "actualizar" for c in client.calls)
    salida = capsys.readouterr().out
    assert "== Diferencias con la web" in salida and "En la web" in salida
    assert "_matriculacion" in salida and "Abril 2022" in salida and "Abr 2022" in salida
    assert "(vacío)" in salida                                  # _destacado estaba vacío
    assert "No se tocan las fotos" in salida and "Simulación" in salida


def test_actualizar_sin_cambios_no_envia_nada(lectura, caja, carpeta, registro, acf_base, capsys):
    cliente = FakeClient(producto=producto_web())
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(make_args(actualizar=True), datos(), carpeta, registro, cliente)
    assert rc == 0 and not any(c[0] == "actualizar" for c in client.calls)
    assert "ya está al día" in capsys.readouterr().out


def test_actualizar_producto_ausente_da_error_sin_escribir(lectura, caja, carpeta, registro, capsys):
    cliente = FakeClient(existente=None)
    rc, client, _ = run_actualizar(make_args(actualizar=True, si=True), datos(), carpeta, registro, cliente)
    assert rc == 1
    assert client.nombres() == ["buscar"] and not any(c[0] in ("actualizar", "crear") for c in client.calls)
    salida = capsys.readouterr().out
    assert "no está publicado en la web" in salida and "Publicalo primero" in salida


def test_actualizar_busca_por_matricula_si_no_esta_en_el_registro(lectura, caja, carpeta, registro, acf_base):
    cliente = FakeClient(existente={"id": PRODUCTO_ID, "name": "Kia XCeed", "status": "draft", "sku": "9028LXG",
                                    "admin_url": "x"},
                         producto=producto_web({"_destacado": ""}))
    rc, client, _ = run_actualizar(make_args(actualizar=True, si=True), datos(), carpeta, registro, cliente)
    assert rc == 0 and client.nombres()[0] == "buscar"
    assert any(c[0] == "actualizar" for c in client.calls)


def test_actualizar_incluye_titulo_y_categorias_si_cambiaron(lectura, caja, carpeta, registro, acf_base):
    cliente = FakeClient(producto=producto_web(name="Kia Ceed viejo", categorias=[99]))
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(make_args(actualizar=True, si=True), datos(), carpeta, registro, cliente)
    assert rc == 0
    enviado = next(c for c in client.calls if c[0] == "actualizar")[2]
    assert enviado["name"] == "Kia XCeed" and enviado["categories"] == [{"id": i} for i in borrador(carpeta).categoria_ids]


def test_actualizar_identidad_no_confirmada_no_llama_a_la_web(lectura, caja, carpeta, registro):
    lectura["ai"] = ai_kia(plate="1111AAA")
    cliente = FakeClient()
    rc, client, factory = run_actualizar(make_args(actualizar=True, si=True), datos(), carpeta, registro, cliente)
    assert rc == 1 and factory.calls == 0 and client.calls == []


# ------------------------------------------------- actualizar --solo-financiacion
METAS_FIN = {"_precio", "_precio_financiado", "_cuota", "_tipo_vehiculo", "_fecha_matriculacion"}


@pytest.fixture
def sin_documentos(monkeypatch, caja, acf_base):
    """En este modo no se leen documentos ni se detecta la caja: si algo lo intenta, el test falla. (Se arma después
    de `acf_base`, que sí construye el borrador completo para simular la web.)"""
    def boom(*a, **k):
        raise AssertionError("--solo-financiacion no debe leer documentos")
    monkeypatch.setattr(verificar, "read_documents", boom)
    monkeypatch.setattr(caja_fotos, "detectar_caja", boom)


def args_fin(**over):
    return make_args(actualizar=True, solo_financiacion=True, **over)


def test_solo_financiacion_manda_solo_los_metas_de_financiacion(sin_documentos, carpeta, registro, acf_base, capsys):
    """El precio bajó en la hoja y el anuncio es viejo (título, categorías, _destacado y _matriculacion distintos,
    sin _fecha_matriculacion): solo van los metas de financiación que cambian, sin leer documentos."""
    viejo = dict(acf_base, _destacado="", _matriculacion="Abril 2022", _fecha_matriculacion="")   # anuncio viejo
    cliente = FakeClient(producto=producto_web(viejo, name="Kia Ceed viejo", categorias=[99]))
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    # 15900 NORMAL: dto = MROUND(15900/1,07·0,07 = 1040,2) = 1040 → importe 15250 → 120 meses · 0,0151 = 230,3 → 230
    rc, client, _ = run_actualizar(args_fin(si=True), datos(precio_contado="15900", precio_campana="14200"),
                                   carpeta, registro, cliente)
    assert rc == 0 and client.nombres() == ["obtener", "actualizar"]
    enviado = next(c for c in client.calls if c[0] == "actualizar")[2]
    assert set(enviado) == {"meta_data"}                     # ni name, ni categories, ni fotos, ni estado
    valores = {m["key"]: m["value"] for m in enviado["meta_data"]}
    assert valores == {"_precio": "15900", "_precio_financiado": "14200", "_cuota": "230 €/mes",
                       "_fecha_matriculacion": "2022-04-11"}
    salida = capsys.readouterr().out
    assert "Identidad: OK" in salida and "lectura:" not in salida and "Carpeta:" not in salida
    assert "Solo se tocan _precio, _precio_financiado, _cuota, _tipo_vehiculo, _fecha_matriculacion" in salida
    assert "Recordá: la web recalcula _precio_financiado" in salida
    assert "precio financiado: la hoja (N) dice 14200" in salida and "14065" in salida   # la web recalculará 14065
    guardado = json.loads(registro.read_text(encoding="utf-8"))["9028LXG"]
    assert sorted(guardado["campos_actualizados"]) == sorted(valores) and guardado["titulo"] == "Kia Ceed viejo"


def test_solo_financiacion_regenera_la_luna(sin_documentos, carpeta, registro, acf_base, capsys):
    """El precio bajó a 15900 (NORMAL: dto 1040 → 14860, cuota 230): tras actualizar la web se rehacen las imágenes."""
    cliente = FakeClient(producto=producto_web(dict(acf_base, _destacado=""), name="Kia Ceed viejo"))
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(args_fin(si=True), datos(precio_contado="15900", precio_campana="14200"),
                                   carpeta, registro, cliente)
    assert rc == 0 and client.nombres() == ["obtener", "actualizar"]
    luna_dir = carpeta.path / luna.CARPETA_SALIDA
    assert f"Luna: precio1.jpg (14.) · precio2.jpg (860) · cuota.jpg (230) → {luna_dir}" in capsys.readouterr().out
    assert sorted(p.name for p in luna_dir.iterdir()) == ["cuota.jpg", "precio1.jpg", "precio2.jpg"]
    # --sin-luna: la web se actualiza igual pero no se tocan las imágenes
    for p in luna_dir.iterdir():
        p.unlink()
    rc, _, _ = run_actualizar(args_fin(si=True, sin_luna=True), datos(precio_contado="15500"), carpeta, registro, cliente)
    assert rc == 0 and list(luna_dir.iterdir()) == [] and "Luna:" not in capsys.readouterr().out


AJENO = {"_marca": "Hyundai", "_marca_completa": "Hyundai I10"}     # metas de otro coche en el mismo producto


@pytest.mark.parametrize("modelo, nombre, metas, error, aviso", [
    ("CITROËN C3 Aircross 1.2", "Citroen C3 Aircross", {"_marca": "", "_marca_completa": ""}, False, False),
    ("citroen c3", "CITROËN C3", {"_marca": "", "_marca_completa": ""}, False, False),
    ("ALFA ROMEO Giulietta 1.6", "Alfa-Romeo Giulietta", {"_marca": "", "_marca_completa": ""}, False, False),
    ("Fiat 500 Hybrid 70CV", "Hyundai I10", AJENO, True, False),
    ("Fiat 500 Hybrid 70CV", "I10", {"_marca": "Fiat", "_marca_completa": ""}, False, True),   # marca solo en la meta
])
def test_comprobar_modelo(modelo, nombre, metas, error, aviso):
    row = datos(modelo=modelo).rows[0]
    producto = {"id": 36022, "name": nombre, "meta_data": [{"key": k, "value": v} for k, v in metas.items()]}
    err, avi = publicar.comprobar_modelo(producto, row, 36022)
    assert bool(err) == error and bool(avi) == aviso
    if error:
        assert err == (f"el producto 36022 se llama «{nombre}» pero la hoja dice «{modelo}» para la matrícula 9028LXG: "
                       "revisá la matrícula cargada en la web")


def test_actualizar_para_si_la_marca_de_la_hoja_no_esta_en_el_producto(sin_documentos, carpeta, registro, acf_base, capsys):
    """El caso del Hyundai I10 con la matrícula del Fiat 500: el producto no lleva la marca de la hoja → no se escribe."""
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    ajeno = FakeClient(producto=producto_web(AJENO, name="Hyundai I10"))
    rc, client, _ = run_actualizar(args_fin(si=True), datos(precio_contado="15900"), carpeta, registro, ajeno)
    salida = capsys.readouterr().out
    assert rc == 1 and client.nombres() == ["obtener"] and not (carpeta.path / luna.CARPETA_SALIDA).exists()
    assert f"Modelo: el producto {PRODUCTO_ID} se llama «Hyundai I10» pero la hoja dice «KIA XCeed" in salida
    assert "para la matrícula 9028LXG: revisá la matrícula cargada en la web. No se toca la web" in salida
    # --forzar: avisa y actualiza igual
    rc, client, _ = run_actualizar(args_fin(si=True, forzar=True), datos(precio_contado="15900"), carpeta, registro,
                                   FakeClient(producto=producto_web(AJENO, name="Hyundai I10")))
    salida = capsys.readouterr().out
    assert rc == 0 and client.nombres() == ["obtener", "actualizar"] and "(--forzar: se sigue igual)" in salida


def test_actualizar_completo_tambien_comprueba_la_marca(lectura, caja, carpeta, registro, acf_base, capsys):
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(make_args(actualizar=True, si=True), datos(), carpeta, registro,
                                   FakeClient(producto=producto_web(AJENO, name="Hyundai I10")))
    assert rc == 1 and client.nombres() == ["obtener"] and "revisá la matrícula cargada en la web" in capsys.readouterr().out
    rc, client, _ = run_actualizar(make_args(actualizar=True, si=True), datos(), carpeta, registro,
                                   FakeClient(producto=producto_web({"_destacado": ""}, name="KIA XCEED")))
    assert rc == 0 and client.nombres() == ["obtener", "actualizar"] and "Modelo: OK" in capsys.readouterr().out


def test_solo_financiacion_simular_muestra_la_tabla_y_no_envia(sin_documentos, carpeta, registro, acf_base, capsys):
    viejo = dict(acf_base, _destacado="", _tipo_vehiculo="especial")
    cliente = FakeClient(producto=producto_web(viejo, name="Kia Ceed viejo"))
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(args_fin(simular=True), datos(), carpeta, registro, cliente)
    assert rc == 0 and client.nombres() == ["obtener"]
    salida = capsys.readouterr().out
    assert "== Financiación según la hoja" in salida and "== Diferencias con la web (1 campo/s)" in salida
    assert "_tipo_vehiculo" in salida and "especial" in salida and "Simulación: no se envía nada" in salida
    assert "_destacado" not in salida.split("== Diferencias")[1] and "name" not in salida.split("== Diferencias")[1]
    assert not (carpeta.path / luna.CARPETA_SALIDA).exists() and "Luna:" not in salida


def test_solo_financiacion_sin_cambios_ni_documentos(sin_documentos, carpeta, registro, acf_base, capsys):
    cliente = FakeClient(producto=producto_web({"_destacado": "", "_matriculacion": "Abril 2022"}, name="otro"))
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(args_fin(), datos(), carpeta, registro, cliente)
    assert rc == 0 and client.nombres() == ["obtener"]
    salida = capsys.readouterr().out
    assert "ya está al día" in salida
    # sin cambios en la web también se rehacen las imágenes (el coche pudo publicarse antes de que existieran)
    assert "Luna: precio1.jpg (15.) · precio2.jpg (795) · cuota.jpg (244)" in salida
    assert (carpeta.path / luna.CARPETA_SALIDA / "precio1.jpg").exists()


def test_solo_financiacion_exige_que_el_producto_lleve_la_matricula(sin_documentos, carpeta, registro, acf_base, capsys):
    """La puerta de identidad de este modo: matrícula de la hoja = sku (o meta matricula) del producto."""
    viejo = dict(acf_base, _precio="1", matricula="1111AAA", matricula_crm="1111AAA")
    producto = dict(producto_web(viejo), sku="1111AAA")
    cliente = FakeClient(producto=producto)
    registro.write_text(json.dumps({"9028LXG": {"product_id": PRODUCTO_ID}}), encoding="utf-8")
    rc, client, _ = run_actualizar(args_fin(si=True), datos(), carpeta, registro, cliente)
    assert rc == 1 and client.nombres() == ["obtener"]
    assert "no lleva la matrícula 9028LXG" in capsys.readouterr().out
    # con la matrícula solo en la meta (sku distinto) sí pasa
    cliente = FakeClient(producto=dict(producto_web({"_precio": "1"}), sku="9028-LXG"))
    rc, client, _ = run_actualizar(args_fin(si=True), datos(), carpeta, registro, cliente)
    assert rc == 0 and client.nombres() == ["obtener", "actualizar"]


def test_solo_financiacion_guardas_de_la_hoja(sin_documentos, carpeta, registro, capsys):
    """Sin matrícula, sin precio o sin fecha E no se busca nada en la web (no hay permiso del que sacarlos)."""
    for campo, aviso in (("matricula", "Sin matrícula en la hoja (D)"), ("precio_contado", "PRECIO CONTADO (F) vacío"),
                         ("fecha_matriculacion", "FECHA MATRICULACION (E) vacía")):
        cliente = FakeClient(producto=producto_web())
        rc, client, factory = run_actualizar(args_fin(si=True), datos(**{campo: ""}), carpeta, registro, cliente)
        assert rc == 1 and factory.calls == 0 and client.calls == [], campo
        assert aviso in capsys.readouterr().out, campo


def test_solo_financiacion_en_el_parser():
    args = publicar.build_parser().parse_args(["82", "--actualizar", "--solo-financiacion", "--simular"])
    assert args.actualizar and args.solo_financiacion and args.simular
    with pytest.raises(SystemExit):
        publicar.main(["82", "--solo-financiacion"])         # va con --actualizar


# ------------------------------------------------------ normalizar fotos/
def _png_nueva(carpeta, nombre="ChatGPT Image 5 sept 2026, 10_23_45.png"):
    from PIL import Image
    p = carpeta.path / "fotos" / nombre
    Image.new("RGB", (300, 200), (1, 2, 3)).save(p, format="PNG")
    return p


def _archivos(carpeta) -> list[str]:
    return sorted(x.name for x in (carpeta.path / "fotos").iterdir() if x.is_file())


def test_flags_de_fotos_en_el_parser():
    args = publicar.build_parser().parse_args(["82", "--solo-fotos", "--sin-normalizar-fotos"])
    assert args.solo_fotos and args.sin_normalizar_fotos
    args = publicar.build_parser().parse_args(["82"])
    assert not args.solo_fotos and not args.sin_normalizar_fotos


def test_simular_muestra_el_plan_sin_tocar_la_carpeta(lectura, caja, carpeta, registro, capsys):
    p = _png_nueva(carpeta)
    antes = _archivos(carpeta)
    rc, client, _, src = run(make_args(simular=True), datos(), carpeta, registro)
    assert rc == 0 and client.nombres() == ["buscar"] and src.writes == []
    assert _archivos(carpeta) == antes and p.is_file() and not (carpeta.path / "fotos" / "originales").exists()
    out = capsys.readouterr().out
    assert f"fotos/: se haría: 4 fotos listas (1 cambio: '{p.name}' -> 4.jpg (convertida); los originales irían a fotos/originales/)" in out


def test_publicar_normaliza_y_sube_la_nueva(lectura, caja, carpeta, registro, capsys):
    p = _png_nueva(carpeta)
    rc, client, _, _ = run(make_args(), datos(), carpeta, registro)
    assert rc == 0 and client.nombres() == ["buscar", "subir", "subir", "subir", "subir", "crear"]
    assert client.calls[4][1] == "kia-xceed-9028lxg-04.jpg"
    assert _archivos(carpeta) == ["1.jpg", "2.jpg", "3.jpg", "4.jpg"]
    assert sorted(x.name for x in (carpeta.path / "fotos" / "originales").iterdir()) == [p.name]
    assert caja[0]["fotos"] == ["1.jpg", "2.jpg", "3.jpg", "4.jpg"]
    out = capsys.readouterr().out
    assert f"fotos/: 4 fotos listas (1 cambio: '{p.name}' -> 4.jpg (convertida); originales en fotos/originales/)" in out
    assert "portada dudosa" not in out


def test_sin_normalizar_fotos_deja_la_carpeta(lectura, caja, carpeta, registro, capsys):
    p = _png_nueva(carpeta)
    rc, client, _, _ = run(make_args(sin_normalizar_fotos=True), datos(), carpeta, registro)
    assert rc == 0 and p.is_file() and not (carpeta.path / "fotos" / "originales").exists()
    assert client.nombres().count("subir") == 4              # se sube igual, convertida al vuelo
    assert "fotos/:" not in capsys.readouterr().out


def test_actualizar_no_normaliza_las_fotos(lectura, caja, carpeta, registro, capsys):
    p = _png_nueva(carpeta)
    cliente = FakeClient(existente={"id": 9, "name": "Kia XCeed", "status": "publish", "sku": "9028LXG",
                                    "admin_url": "https://example.test/wp-admin/post.php?post=9&action=edit"},
                         producto={"id": 9, "name": "Kia XCeed", "meta_data": [], "categories": []})
    rc = publicar.actualizar(make_args(actualizar=True, simular=True), FakeSheetSrc(), datos(), [carpeta],
                             client_factory=Factory(cliente), registro_path=registro)
    assert rc == 0 and p.is_file() and not (carpeta.path / "fotos" / "originales").exists()
    assert "fotos/:" not in capsys.readouterr().out


def test_solo_fotos_no_toca_web_ni_hoja(lectura, caja, carpeta, registro, capsys):
    p = _png_nueva(carpeta)
    rc = publicar.solo_fotos(make_args(solo_fotos=True), datos(), [carpeta])
    assert rc == 0 and caja == [] and not registro.exists()
    assert _archivos(carpeta) == ["1.jpg", "2.jpg", "3.jpg", "4.jpg"]
    assert (carpeta.path / "fotos" / "originales" / p.name).is_file()
    out = capsys.readouterr().out
    assert "fotos/: 4 fotos listas" in out and "Identidad" not in out and "Duplicado" not in out
    assert publicar.solo_fotos(make_args(solo_fotos=True, simular=True), datos(), [carpeta]) == 0
    assert "fotos/: 4 fotos ya normalizadas" in capsys.readouterr().out


def test_solo_fotos_sin_fila_sin_carpeta_o_sin_subcarpeta(lectura, caja, carpeta, registro, capsys):
    import shutil
    assert publicar.solo_fotos(make_args(referencia="99"), datos(), [carpeta]) == 1
    assert "no está en la hoja" in capsys.readouterr().out
    assert publicar.solo_fotos(make_args(), datos(), []) == 1
    assert "no hay fotos que normalizar" in capsys.readouterr().out
    shutil.rmtree(carpeta.path / "fotos")
    assert publicar.solo_fotos(make_args(), datos(), [carpeta]) == 1
    assert "las fotos van en <carpeta del coche>/fotos/" in capsys.readouterr().out


def test_sin_subcarpeta_fotos_avisa_donde_van(lectura, caja, carpeta, registro, capsys):
    import shutil
    shutil.rmtree(carpeta.path / "fotos")
    write_jpeg(carpeta.path / "1.jpg")                        # en la raíz no se mira
    rc, client, _, _ = run(make_args(simular=True), datos(), carpeta, registro)
    assert rc == 0 and (carpeta.path / "1.jpg").is_file()
    out = capsys.readouterr().out
    assert "las fotos van en <carpeta del coche>/fotos/" in out and "sin fotos editadas en la carpeta (fotos/)" in out


# ------------------------------------------------------------- --matricula sin referencia
def test_matricula_sin_referencia(lectura, caja, carpeta, registro, capsys):
    rc, client, _, _ = run(make_args(referencia=None, matricula=["9028 LXG"]), datos(), carpeta, registro)
    assert rc == 0 and client.nombres()[-1] == "crear"
    rc, _, factory, _ = run(make_args(referencia=None, matricula=["1111AAA"]), datos(), carpeta, registro)
    assert rc == 1 and factory.calls == 0 and "'1111AAA' no está en la hoja" in capsys.readouterr().out


def test_parser_exige_referencia_o_matricula():
    args = publicar.build_parser().parse_args(["--matricula", "9028LXG", "--si"])
    assert args.referencia is None and args.matricula == ["9028LXG"] and args.si
    with pytest.raises(SystemExit):
        publicar.main([])


def test_forzar_descripcion_solo_rehace_la_descripcion(caja, carpeta, monkeypatch):
    """--forzar-descripcion no relee el permiso ni la caja: solo pasa force a la generación de la descripción."""
    llamadas = []

    def fake_generar(datos, fotos, folder_name, force=False, cache_dir=None, plantilla=None):
        llamadas.append(dict(force=force, datos=datos))
        return desc_mod.Descripcion("texto", "bloque", "ia", piezas=desc_mod.despiezar(datos, PARTES_DESC))
    monkeypatch.setattr(desc_mod, "generar", fake_generar)
    args = publicar.build_parser().parse_args(["82", "--simular", "--forzar-descripcion"])
    assert args.forzar_descripcion and not args.forzar
    row = datos().rows[0]
    publicar.construir_borrador(row, carpeta, None, ai_kia(), sin_fotos_caja=False, force=args.forzar,
                                forzar_descripcion=args.forzar_descripcion)
    assert llamadas[-1]["force"] is True and caja[-1]["force"] is False
    publicar.construir_borrador(row, carpeta, None, ai_kia(), sin_fotos_caja=False)
    assert llamadas[-1]["force"] is False


def test_piso_de_seguridad_con_la_b_del_permiso_y_los_importados(caja, carpeta, monkeypatch):
    recibidos = []

    def fake_generar(datos, fotos, folder_name, force=False, cache_dir=None, plantilla=None):
        recibidos.append(datos)
        return desc_mod.Descripcion("texto", "bloque", "ia", piezas=desc_mod.despiezar(datos, PARTES_DESC))
    monkeypatch.setattr(desc_mod, "generar", fake_generar)
    b = borrador(carpeta)
    assert recibidos[-1].importado is False and recibidos[-1].fecha_primera is None
    assert "ABS\nControl electrónico de estabilidad" in b.equipamiento
    assert desc_mod.AVISO_IMPORTADO not in b.para_verificar
    # importado sin B: sin piso y a PARA VERIFICAR
    b = borrador(carpeta, modelo="KIA XCeed GDi PHEV 140cv Edrive importado Alemania")
    assert recibidos[-1].importado is True and "Control electrónico de estabilidad" not in b.equipamiento
    assert desc_mod.AVISO_IMPORTADO in b.para_verificar
    # la subcarpeta ------IMPORTACION de 1_Ventas también cuenta como importado
    importacion = locate.make_car_folder(carpeta.path, "------IMPORTACION")
    publicar.construir_borrador(datos().rows[0], importacion, None, ai_kia(), sin_fotos_caja=True)
    assert recibidos[-1].importado is True
    # con B (primera matriculación en el extranjero, 2013) manda la B: ABS sí, 661/2009 no
    ai = ai_kia()
    ai["permiso_circulacion"]["fecha_primera_matriculacion"] = "2013-06-01"
    b = borrador(carpeta, ai, modelo="KIA XCeed GDi PHEV 140cv Edrive importado Alemania")
    assert recibidos[-1].fecha_primera == date(2013, 6, 1)
    assert "ABS" in b.equipamiento and "Control electrónico de estabilidad" not in b.equipamiento
    assert desc_mod.AVISO_IMPORTADO not in b.para_verificar
