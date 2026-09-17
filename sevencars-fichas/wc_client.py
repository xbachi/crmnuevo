"""Cliente WordPress/WooCommerce de sevencars.es (espejo de editor-fotos-seven/woocommerce.py), testeable con una
sesión falsa. Las credenciales se leen del entorno por nombre y nunca se imprimen."""
from __future__ import annotations

import os
import time
from pathlib import Path

from common import PROJECT_DIR, normalize_plate

EDITOR_FOTOS_ENV = Path("/home/seb/editor-fotos-seven/.env")
ENV_VARS = ("WC_URL", "WC_KEY", "WC_SECRET", "WP_USER", "WP_APP_PASSWORD")
DEFAULT_URL = "https://www.sevencars.es"
PRECIO_RESERVA = "300"          # todos los coches se "compran" online con una reserva de 300 €
TIMEOUT = 120
PER_PAGE = 100
MAX_PAGES = 30
# Ficha de exposición: PDF que genera el tema (dompdf) en GET {WC_URL}/?pdf=<id>, sin credenciales.
TIMEOUT_FICHA = 60
MIN_FICHA_BYTES = 10 * 1024     # un PDF más chico es una página de error, no la ficha
PAUSA_REINTENTO_FICHA = 3       # segundos antes del único reintento

# Campos ACF de la ficha (clave de valor -> clave de campo), copiados de un producto real (editor-fotos-seven)
CAMPOS_ACF = {
    "_marca": "field_5db06fc8c402e",
    "_marca_completa": "field_5db29f05b36bf",
    "_modelo": "field_5daffaa57aa3e",
    "_modelo_listado": "field_5db06faec402d",
    "_combustible": "field_5dafface7aa40",
    "_cubicaje": "field_5db0704b783f9",
    "_cv": "field_5daffab07aa3f",
    "_caja": "field_5daffb4b7aa41",
    "_km": "field_5daffbad7aa42",
    "_matriculacion": "field_5daffbb57aa43",
    "_matriculacion_num": "field_5f8f08b509e0a",
    "_destacado": "field_5db06f88c402c",
    "_equipamiento": "field_5f089842a0066",
    "_precio": "field_5daffbe27aa45",
    "_cuota": "field_5daffbd77aa44",
    "_garantia": "field_5db2a4b364e40",
    "matricula": "field_5f8ea747c5994",
    "matricula_crm": "field_5fa128650ee24",
}
# Claves ACF adicionales cuyo field_key no se conoce todavía: se envían como meta plano (valor sin fila field_xxx).
# Cuando se conozca la clave, poner aquí "field_..." y pasarán a llevar la referencia ACF.
CAMPOS_ACF_EXTRA = {"_dto_renove": None, "_a_domicilio": None, "_tipo_vehiculo": None, "_fecha_matriculacion": None}
VALORES_FIJOS = {"_dto_renove": "850", "_a_domicilio": "290"}
# _tipo_vehiculo NO es fijo: sale de la tarifa de financiación (cuota.tipo_vehiculo_web: NORMAL "", ESPECIAL
# "especial", SIN DTO / Consultanos "especial_dto"). El tema de la web lo usa, junto con _precio y _dto_renove,
# para recalcular _precio_financiado en cada guardado desde wp-admin.
# _fecha_matriculacion: la fecha de matriculación en ISO (YYYY-MM-DD, vacía si no se conoce); el tema la lee para
# calcular la edad exacta del coche.
META_PLANA = ("_precio_financiado", "_yoast_wpseo_primary_product_cat")
# Al actualizar un anuncio ya publicado nunca se tocan: las fotos ya están subidas y el estado lo maneja el usuario.
CAMPOS_INTOCABLES = frozenset({"images", "status", "sku", "regular_price", "sale_price", "type"})


class WcError(Exception):
    pass


def cargar_env() -> list[str]:
    """Carga .env del proyecto y después el de editor-fotos-seven (override=False). Devuelve las variables que faltan."""
    from dotenv import load_dotenv
    load_dotenv(PROJECT_DIR / ".env", override=False)
    if EDITOR_FOTOS_ENV.is_file():
        load_dotenv(EDITOR_FOTOS_ENV, override=False)
    return [v for v in ENV_VARS if v != "WC_URL" and not os.environ.get(v)]


def _mensaje_http(r) -> str:
    code = r.status_code
    if code in (401, 403):
        return f"la web rechazó las credenciales ({code}): revisá WC_KEY/WC_SECRET o WP_USER/WP_APP_PASSWORD"
    if code == 413:
        return "la web rechazó el archivo por tamaño (413): reducí la foto"
    if code >= 500:
        return f"error del servidor de la web ({code}); probá más tarde"
    detalle = ""
    try:
        detalle = r.json().get("message", "")
    except Exception:
        detalle = (r.text or "")[:200]
    return f"error HTTP {code} de la web: {detalle}"


class WcClient:
    def __init__(self, url: str, wc_auth: tuple[str, str], wp_auth: tuple[str, str], session=None):
        self.url = url.rstrip("/")
        self._wc_auth = wc_auth
        self._wp_auth = wp_auth
        if session is None:
            import requests
            session = requests.Session()
        self.session = session

    @classmethod
    def desde_env(cls, session=None) -> "WcClient":
        faltan = cargar_env()
        if faltan:
            raise WcError("faltan credenciales de la web en el entorno/.env: " + ", ".join(faltan))
        return cls(os.environ.get("WC_URL") or DEFAULT_URL,
                   (os.environ["WC_KEY"], os.environ["WC_SECRET"]),
                   (os.environ["WP_USER"], os.environ["WP_APP_PASSWORD"]), session=session)

    # ------------------------------------------------------------ http
    def _request(self, method: str, path: str, auth, **kwargs):
        try:
            r = self.session.request(method, f"{self.url}{path}", auth=auth, timeout=TIMEOUT, **kwargs)
        except Exception as exc:          # network
            raise WcError(f"no se pudo conectar con la web: {exc}")
        if r.status_code >= 400:
            raise WcError(_mensaje_http(r))
        return r

    def _wc(self, method: str, path: str, **kwargs):
        return self._request(method, f"/wp-json/wc/v3{path}", self._wc_auth, **kwargs)

    def _wp(self, method: str, path: str, **kwargs):
        return self._request(method, f"/wp-json/wp/v2{path}", self._wp_auth, **kwargs)

    def admin_url(self, product_id: int) -> str:
        return f"{self.url}/wp-admin/post.php?post={product_id}&action=edit"

    def url_ficha(self, product_id: int) -> str:
        return f"{self.url}/?pdf={product_id}"

    def descargar_ficha_pdf(self, product_id: int) -> bytes:
        """La ficha de exposición en PDF del producto (GET /?pdf=<id>, sin credenciales). Si falla la conexión, la
        web responde un error o lo que llega no es un PDF de verdad (empieza por %PDF y pesa más de 10 KB), un
        reintento; después WcError con el motivo."""
        motivo = ""
        for intento in range(2):
            if intento and PAUSA_REINTENTO_FICHA:
                time.sleep(PAUSA_REINTENTO_FICHA)
            try:
                r = self.session.request("GET", self.url_ficha(product_id), auth=None, timeout=TIMEOUT_FICHA)
            except Exception as exc:          # network
                motivo = (f"la web no respondió en {TIMEOUT_FICHA} s" if "timeout" in type(exc).__name__.lower()
                          else f"no se pudo conectar con la web: {exc}")
                continue
            if r.status_code >= 400:
                motivo = f"la web respondió con error HTTP {r.status_code}"
                continue
            datos = r.content or b""
            if not datos.startswith(b"%PDF"):
                motivo = "la web no devolvió un PDF"
            elif len(datos) <= MIN_FICHA_BYTES:
                motivo = f"el PDF pesa solo {len(datos)} bytes"
            else:
                return datos
        raise WcError(motivo)

    # ------------------------------------------------------- productos
    def _resumen(self, p: dict) -> dict:
        return {"id": p.get("id"), "name": p.get("name"), "status": p.get("status"), "sku": p.get("sku"),
                "admin_url": self.admin_url(p.get("id"))}

    def buscar_por_matricula(self, plate: str) -> dict | None:
        """sku → search → barrido de meta_data.matricula / matricula_crm (status=any)."""
        plate = normalize_plate(plate)
        if not plate:
            return None
        for params in ({"sku": plate, "status": "any"}, {"search": plate, "status": "any", "per_page": 20}):
            for p in self._wc("GET", "/products", params=params).json() or []:
                if coincide_matricula(p, plate):
                    return self._resumen(p)
        for page in range(1, MAX_PAGES + 1):
            lote = self._wc("GET", "/products", params={"status": "any", "per_page": PER_PAGE, "page": page,
                                                        "_fields": "id,name,status,sku,meta_data"}).json() or []
            for p in lote:
                if coincide_matricula(p, plate):
                    return self._resumen(p)
            if len(lote) < PER_PAGE:
                break
        return None

    def obtener_producto(self, product_id: int) -> dict:
        return self._wc("GET", f"/products/{product_id}").json()

    def actualizar_producto(self, product_id: int, payload: dict) -> dict:
        """PUT parcial. Quien llama decide qué va: nunca imágenes, estado, sku ni precio (ver CAMPOS_INTOCABLES)."""
        prohibidos = sorted(set(payload) & CAMPOS_INTOCABLES)
        if prohibidos:
            raise WcError(f"actualizar_producto no puede tocar {', '.join(prohibidos)}")
        return self._wc("PUT", f"/products/{product_id}", json=payload).json()

    def crear_producto(self, payload: dict) -> tuple[int, str, dict]:
        p = self._wc("POST", "/products", json=payload).json()
        return p["id"], self.admin_url(p["id"]), p

    # ---------------------------------------------------------- medios
    def subir_imagen(self, data: bytes, filename: str, alt: str, title: str) -> int:
        r = self._wp("POST", "/media", data=data,
                     headers={"Content-Disposition": f'attachment; filename="{filename}"', "Content-Type": "image/jpeg"})
        media_id = r.json()["id"]
        self._wp("POST", f"/media/{media_id}", json={"alt_text": alt, "title": title, "caption": ""})
        return media_id

    def borrar_media(self, media_id: int) -> bool:
        try:
            self._wp("DELETE", f"/media/{media_id}", params={"force": "true"})
            return True
        except WcError:
            return False


# ---------------------------------------------------------------- payload
def construir_meta(campos: dict) -> list[dict]:
    """[{key, value}] con la fila de referencia ACF ('_'+clave → field_xxx) para las claves conocidas."""
    meta = []
    for clave, valor in campos.items():
        if valor is None:
            continue
        meta.append({"key": clave, "value": str(valor)})
        field_key = CAMPOS_ACF.get(clave) or CAMPOS_ACF_EXTRA.get(clave)
        if field_key:
            meta.append({"key": "_" + clave, "value": field_key})
    return meta


def coincide_matricula(producto: dict, plate: str) -> bool:
    """El producto lleva esa matrícula: como sku o en meta_data.matricula / matricula_crm."""
    plate = normalize_plate(plate)
    if not plate:
        return False
    if normalize_plate(producto.get("sku")) == plate:
        return True
    for m in producto.get("meta_data") or []:
        if m.get("key") in ("matricula", "matricula_crm") and normalize_plate(str(m.get("value") or "")) == plate:
            return True
    return False


def meta_actual(producto: dict) -> dict:
    """{clave: valor} de la meta_data de un producto tal como la devuelve la web."""
    return {str(m.get("key")): "" if m.get("value") is None else str(m.get("value"))
            for m in (producto.get("meta_data") or [])}


def construir_payload(titulo: str, sku: str, campos: dict, ids_imagenes: list[int], categoria_ids: list[int],
                      status: str = "draft", descripcion: str | None = None) -> dict:
    payload = {
        "name": titulo,
        "status": status,
        "type": "simple",
        "sku": sku,
        "regular_price": PRECIO_RESERVA,
        "manage_stock": False,
        "stock_status": "instock",
        "categories": [{"id": i} for i in categoria_ids],
        "images": [{"id": i} for i in ids_imagenes],
        "meta_data": construir_meta(campos),
    }
    if descripcion:
        payload["description"] = descripcion
    return payload
