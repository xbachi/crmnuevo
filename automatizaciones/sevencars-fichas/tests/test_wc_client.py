"""Cliente WooCommerce/WordPress con sesión falsa: búsqueda por matrícula, medios, producto, errores y payload."""
import pytest

import wc_client
from wc_client import CAMPOS_ACF, PER_PAGE, WcClient, WcError, construir_meta, construir_payload

URL = "https://example.test"
WC_AUTH = ("ck_test", "cs_test")
WP_AUTH = ("usuario", "app-pass")


class FakeResponse:
    def __init__(self, status=200, payload=None, text=""):
        self.status_code = status
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("sin json")
        return self._payload


class FakeSession:
    """`handler(method, path, kwargs)` -> FakeResponse | Exception. Registra cada petición."""

    def __init__(self, handler):
        self.handler = handler
        self.calls = []

    def request(self, method, url, auth=None, timeout=None, **kwargs):
        assert url.startswith(URL + "/"), url
        path = url[len(URL):]
        self.calls.append({"method": method, "path": path, "auth": auth, "timeout": timeout, **kwargs})
        r = self.handler(method, path, kwargs)
        if isinstance(r, BaseException):
            raise r
        return r


def client(handler) -> tuple[WcClient, FakeSession]:
    session = FakeSession(handler)
    return WcClient(URL + "/", WC_AUTH, WP_AUTH, session=session), session


def producto(pid, sku="", meta=None, name="Kia XCeed", status="draft"):
    return {"id": pid, "name": name, "status": status, "sku": sku, "meta_data": meta or []}


# ----------------------------------------------------------------- payload
def test_construir_meta_referencias_acf():
    meta = construir_meta({"_marca": "Kia", "matricula": "9028LXG", "_precio_financiado": "15455",
                           "_tipo_vehiculo": "", "_x": None})
    assert meta == [
        {"key": "_marca", "value": "Kia"}, {"key": "__marca", "value": "field_5db06fc8c402e"},
        {"key": "matricula", "value": "9028LXG"}, {"key": "_matricula", "value": "field_5f8ea747c5994"},
        {"key": "_precio_financiado", "value": "15455"},
        {"key": "_tipo_vehiculo", "value": ""},
    ]


def test_construir_meta_valores_como_texto():
    meta = construir_meta({"_cv": 140, "_dto_renove": 850})
    assert meta == [{"key": "_cv", "value": "140"}, {"key": "__cv", "value": CAMPOS_ACF["_cv"]},
                    {"key": "_dto_renove", "value": "850"}]


def test_construir_payload():
    campos = {"_marca": "Kia", "matricula": "9028LXG"}
    payload = construir_payload("Kia XCeed", "9028LXG", campos, [2, 1, 3], [27, 28])
    assert payload["name"] == "Kia XCeed" and payload["status"] == "draft" and payload["type"] == "simple"
    assert payload["sku"] == "9028LXG" and payload["regular_price"] == "300"
    assert payload["manage_stock"] is False and payload["stock_status"] == "instock"
    assert payload["categories"] == [{"id": 27}, {"id": 28}]
    assert payload["images"] == [{"id": 2}, {"id": 1}, {"id": 3}]
    assert payload["meta_data"] == construir_meta(campos)
    assert "description" not in payload


def test_construir_payload_publicado_con_descripcion():
    payload = construir_payload("Kia XCeed", "9028LXG", {}, [], [], status="publish", descripcion="<p>Hola</p>")
    assert payload["status"] == "publish" and payload["description"] == "<p>Hola</p>"
    assert payload["images"] == [] and payload["categories"] == []
    assert "description" not in construir_payload("K", "S", {}, [], [], descripcion="")


# ------------------------------------------------------ buscar_por_matricula
def test_buscar_por_sku():
    def handler(method, path, kw):
        assert method == "GET" and path == "/wp-json/wc/v3/products"
        if kw["params"].get("sku") == "9028LXG":
            return FakeResponse(200, [producto(7, sku="9028lxg")])
        raise AssertionError("no debería seguir buscando")

    c, s = client(handler)
    found = c.buscar_por_matricula("9028 LXG")
    assert found == {"id": 7, "name": "Kia XCeed", "status": "draft", "sku": "9028lxg",
                     "admin_url": f"{URL}/wp-admin/post.php?post=7&action=edit"}
    assert len(s.calls) == 1
    assert s.calls[0]["params"] == {"sku": "9028LXG", "status": "any"}
    assert s.calls[0]["auth"] == WC_AUTH and s.calls[0]["timeout"] == wc_client.TIMEOUT


def test_buscar_por_search_con_meta():
    def handler(method, path, kw):
        p = kw["params"]
        if "sku" in p:
            return FakeResponse(200, [])
        if "search" in p:
            return FakeResponse(200, [producto(1, sku="OTRA"),
                                      producto(8, meta=[{"key": "matricula", "value": "9028 lxg"}], status="publish")])
        raise AssertionError("no debería barrer")

    c, s = client(handler)
    found = c.buscar_por_matricula("9028LXG")
    assert found["id"] == 8 and found["status"] == "publish"
    assert s.calls[1]["params"] == {"search": "9028LXG", "status": "any", "per_page": 20}


def test_buscar_barrido_por_paginas():
    pages = {1: [producto(i, sku=f"0000AA{i}") for i in range(PER_PAGE)],
             2: [producto(500, sku="1111BBB"), producto(501, meta=[{"key": "matricula_crm", "value": " 9028-lxg "}]),
                 producto(502)]}

    def handler(method, path, kw):
        p = kw["params"]
        if "sku" in p or "search" in p:
            return FakeResponse(200, [])
        return FakeResponse(200, pages[p["page"]])

    c, s = client(handler)
    found = c.buscar_por_matricula("9028LXG")
    assert found["id"] == 501
    assert [call["params"].get("page") for call in s.calls] == [None, None, 1, 2]
    assert s.calls[2]["params"] == {"status": "any", "per_page": PER_PAGE, "page": 1, "_fields": "id,name,status,sku,meta_data"}


def test_buscar_sin_coincidencia_devuelve_none():
    def handler(method, path, kw):
        p = kw["params"]
        if "sku" in p or "search" in p:
            return FakeResponse(200, [])
        return FakeResponse(200, [producto(1, sku="1111BBB"), producto(2, meta=[{"key": "matricula", "value": "2222CCC"}])])

    c, s = client(handler)
    assert c.buscar_por_matricula("9028LXG") is None
    assert len(s.calls) == 3                    # sku, search, página 1 (corta -> fin)


def test_buscar_matricula_vacia_sin_peticiones():
    c, s = client(lambda *a: FakeResponse(200, []))
    assert c.buscar_por_matricula("") is None and c.buscar_por_matricula(None) is None
    assert s.calls == []


def test_buscar_json_nulo():
    class NullResponse(FakeResponse):
        def json(self):
            return None

    c, s = client(lambda m, p, kw: NullResponse(200))
    assert c.buscar_por_matricula("9028LXG") is None
    assert len(s.calls) == 3


# ------------------------------------------------------------------ errores
@pytest.mark.parametrize("status,texto", [(401, "credenciales"), (403, "credenciales"), (413, "tamaño"),
                                          (500, "servidor"), (503, "servidor")])
def test_errores_http(status, texto):
    c, _ = client(lambda m, p, kw: FakeResponse(status, {"message": "x"}))
    with pytest.raises(WcError) as exc:
        c.buscar_por_matricula("9028LXG")
    assert texto in str(exc.value) and str(status) in str(exc.value)


def test_error_http_generico_con_mensaje():
    c, _ = client(lambda m, p, kw: FakeResponse(400, {"message": "sku duplicado"}))
    with pytest.raises(WcError) as exc:
        c.crear_producto({"sku": "X"})
    assert "400" in str(exc.value) and "sku duplicado" in str(exc.value)
    c, _ = client(lambda m, p, kw: FakeResponse(404, None, text="Not found"))
    with pytest.raises(WcError) as exc:
        c.obtener_producto(1)
    assert "Not found" in str(exc.value)


def test_error_de_red():
    c, _ = client(lambda m, p, kw: ConnectionError("dns"))
    with pytest.raises(WcError) as exc:
        c.buscar_por_matricula("9028LXG")
    assert "conectar" in str(exc.value)


# ------------------------------------------------------------------- medios
def test_subir_imagen():
    def handler(method, path, kw):
        if path == "/wp-json/wp/v2/media":
            return FakeResponse(201, {"id": 41})
        if path == "/wp-json/wp/v2/media/41":
            return FakeResponse(200, {"id": 41})
        raise AssertionError(path)

    c, s = client(handler)
    assert c.subir_imagen(b"JPEGDATA", "kia-xceed-01.jpg", "alt", "title") == 41
    assert len(s.calls) == 2
    up, meta = s.calls
    assert up["method"] == "POST" and up["path"] == "/wp-json/wp/v2/media" and up["auth"] == WP_AUTH
    assert up["data"] == b"JPEGDATA"
    assert up["headers"] == {"Content-Disposition": 'attachment; filename="kia-xceed-01.jpg"', "Content-Type": "image/jpeg"}
    assert meta["method"] == "POST" and meta["path"] == "/wp-json/wp/v2/media/41" and meta["auth"] == WP_AUTH
    assert meta["json"] == {"alt_text": "alt", "title": "title", "caption": ""}


def test_subir_imagen_error_de_tamano():
    c, _ = client(lambda m, p, kw: FakeResponse(413, {"message": "too big"}))
    with pytest.raises(WcError) as exc:
        c.subir_imagen(b"x", "a.jpg", "alt", "title")
    assert "413" in str(exc.value)


def test_borrar_media():
    c, s = client(lambda m, p, kw: FakeResponse(200, {"deleted": True}))
    assert c.borrar_media(41) is True
    assert s.calls[0]["method"] == "DELETE" and s.calls[0]["path"] == "/wp-json/wp/v2/media/41"
    assert s.calls[0]["params"] == {"force": "true"} and s.calls[0]["auth"] == WP_AUTH
    c, _ = client(lambda m, p, kw: FakeResponse(500, {"message": "boom"}))
    assert c.borrar_media(41) is False
    c, _ = client(lambda m, p, kw: ConnectionError("red"))
    assert c.borrar_media(41) is False


# ---------------------------------------------------------------- producto
def test_crear_producto():
    payload = {"name": "Kia XCeed", "sku": "9028LXG"}
    body = {"id": 555, "name": "Kia XCeed", "images": [{"src": "https://x/1.jpg"}]}
    c, s = client(lambda m, p, kw: FakeResponse(201, body))
    assert c.crear_producto(payload) == (555, f"{URL}/wp-admin/post.php?post=555&action=edit", body)
    assert s.calls[0]["method"] == "POST" and s.calls[0]["path"] == "/wp-json/wc/v3/products"
    assert s.calls[0]["auth"] == WC_AUTH and s.calls[0]["json"] == payload


def test_url_sin_barra_final():
    c, _ = client(lambda *a: FakeResponse(200, {}))
    assert c.url == URL and c.admin_url(9) == f"{URL}/wp-admin/post.php?post=9&action=edit"


# ---------------------------------------------------------------- desde_env
def test_desde_env_faltan_variables(monkeypatch):
    monkeypatch.setattr(wc_client, "cargar_env", lambda: ["WC_KEY", "WP_APP_PASSWORD"])
    with pytest.raises(WcError) as exc:
        WcClient.desde_env(session=FakeSession(lambda *a: None))
    assert "WC_KEY" in str(exc.value) and "WP_APP_PASSWORD" in str(exc.value)


def test_desde_env_con_variables(monkeypatch):
    monkeypatch.setattr(wc_client, "cargar_env", lambda: [])
    for name in wc_client.ENV_VARS:
        monkeypatch.setenv(name, f"dummy-{name.lower()}")
    monkeypatch.setenv("WC_URL", "https://dummy.test/")
    session = FakeSession(lambda *a: None)
    c = WcClient.desde_env(session=session)
    assert c.url == "https://dummy.test" and c.session is session
    assert c._wc_auth == ("dummy-wc_key", "dummy-wc_secret") and c._wp_auth == ("dummy-wp_user", "dummy-wp_app_password")
    monkeypatch.delenv("WC_URL")
    assert WcClient.desde_env(session=session).url == wc_client.DEFAULT_URL


# ------------------------------------------------- actualización de un anuncio
def test_actualizar_producto_rechaza_los_campos_intocables():
    """La red de seguridad del cliente: una actualización nunca puede tocar fotos, estado, sku ni precio."""
    from wc_client import CAMPOS_INTOCABLES

    def boom(method, path, kwargs):
        raise AssertionError("no se debe llegar a la web con un payload prohibido")
    cli, session = client(boom)
    for campo in ("images", "status", "sku", "regular_price"):
        assert campo in CAMPOS_INTOCABLES
        with pytest.raises(WcError) as exc:
            cli.actualizar_producto(1, {"meta_data": [], campo: "lo que sea"})
        assert campo in str(exc.value)
    assert session.calls == []


def test_actualizar_producto_manda_un_put_parcial():
    def handler(method, path, kwargs):
        assert (method, path) == ("PUT", "/wp-json/wc/v3/products/37288")
        return FakeResponse(payload={"id": 37288, **kwargs["json"]})
    cli, session = client(handler)
    salida = cli.actualizar_producto(37288, {"meta_data": [{"key": "_km", "value": "1"}]})
    assert salida["id"] == 37288 and session.calls[0]["json"]["meta_data"][0]["key"] == "_km"


def test_meta_actual_normaliza_la_meta_del_producto():
    from wc_client import meta_actual
    producto = {"meta_data": [{"key": "_km", "value": "88.858"}, {"key": "_cv", "value": 140},
                              {"key": "_destacado", "value": None}]}
    assert meta_actual(producto) == {"_km": "88.858", "_cv": "140", "_destacado": ""}
    assert meta_actual({}) == {}


# ------------------------------------------------------ ficha de exposición
PDF = b"%PDF-1.7\n" + b"x" * 12_000


def respuesta_pdf(status=200, content=PDF) -> FakeResponse:
    r = FakeResponse(status)
    r.content = content
    return r


def test_descargar_ficha_pdf_sin_credenciales(monkeypatch):
    monkeypatch.setattr(wc_client, "PAUSA_REINTENTO_FICHA", 0)
    c, session = client(lambda m, p, k: respuesta_pdf())
    assert c.url_ficha(555) == URL + "/?pdf=555"
    assert c.descargar_ficha_pdf(555) == PDF
    assert [(x["method"], x["path"], x["auth"], x["timeout"]) for x in session.calls] == [
        ("GET", "/?pdf=555", None, wc_client.TIMEOUT_FICHA)]


@pytest.mark.parametrize("respuestas, motivo", [
    ([respuesta_pdf(content=b"<html>"), respuesta_pdf(content=b"<html>")], "la web no devolvió un PDF"),
    ([respuesta_pdf(content=b"%PDF-1.7"), respuesta_pdf(content=b"%PDF-1.7" + b"x" * 10_000)],
     "el PDF pesa solo 10008 bytes"),
    ([TimeoutError("lento"), type("ReadTimeout", (Exception,), {})("lento")], "la web no respondió en 60 s"),
    ([ConnectionError("dns"), respuesta_pdf(404, b"")], "la web respondió con error HTTP 404"),
])
def test_descargar_ficha_pdf_reintenta_una_vez_y_falla_con_motivo(monkeypatch, respuestas, motivo):
    monkeypatch.setattr(wc_client, "PAUSA_REINTENTO_FICHA", 0)
    pendientes = list(respuestas)
    c, session = client(lambda m, p, k: pendientes.pop(0))
    with pytest.raises(WcError) as exc:
        c.descargar_ficha_pdf(555)
    assert str(exc.value) == motivo and len(session.calls) == 2


def test_descargar_ficha_pdf_el_reintento_salva(monkeypatch):
    pausas = []
    monkeypatch.setattr(wc_client.time, "sleep", pausas.append)
    pendientes = [ConnectionError("caída"), respuesta_pdf()]
    c, session = client(lambda m, p, k: pendientes.pop(0))
    assert c.descargar_ficha_pdf(7) == PDF and len(session.calls) == 2 and pausas == [wc_client.PAUSA_REINTENTO_FICHA]


# ------------------------------------------------------- galería (--cambiar-fotos)
def test_reemplazar_imagenes_manda_solo_la_galeria_en_orden():
    def handler(method, path, kwargs):
        assert (method, path) == ("PUT", "/wp-json/wc/v3/products/555")
        return FakeResponse(payload={"id": 555, "images": [dict(im, src="s") for im in kwargs["json"]["images"]]})
    cli, session = client(handler)
    salida = cli.reemplazar_imagenes(555, [103, 101, 102])
    assert session.calls[0]["json"] == {"images": [{"id": 103}, {"id": 101}, {"id": 102}]}
    assert session.calls[0]["auth"] == WC_AUTH and wc_client.ids_imagenes(salida) == [103, 101, 102]


def test_reemplazar_imagenes_nunca_deja_el_anuncio_sin_fotos():
    def boom(method, path, kwargs):
        raise AssertionError("no se debe llegar a la web")
    cli, session = client(boom)
    with pytest.raises(WcError):
        cli.reemplazar_imagenes(555, [])
    assert session.calls == []


def test_ids_imagenes():
    assert wc_client.ids_imagenes({"images": [{"id": 7, "src": "a"}, {"id": 0, "src": "placeholder"}, {"id": 9}]}) == [7, 9]
    assert wc_client.ids_imagenes({}) == [] and wc_client.ids_imagenes({"images": None}) == []
