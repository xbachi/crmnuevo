"""trabajos_crm.py y su enganche en vigilar.py: la cola de trabajos del CRM, con el CRM doblado (nunca HTTP real) y
publicar.py doblado con el FakeRun de test_vigilar (así se comprueba que se usa el mismo lanzador del vigilante)."""
import logging
import re
import threading
import time
from pathlib import Path

import pytest
import requests

import avisos
import trabajos_crm
import vigilar
from common import PROJECT_DIR
from tests.test_vigilar import FakeRun, SALIDA_OK, URL, buzon, entorno, publicar_falso, vigilante  # noqa: F401

CRM = "https://crm.ejemplo.test"
SECRETO = "secreto-de-prueba-9f8e7d"
PY = str(vigilar.PYTHON)
PUBLICAR = str(PROJECT_DIR / "publicar.py")
LUNA = str(PROJECT_DIR / "luna.py")
ADMIN = "https://www.sevencars.es/wp-admin/post.php?post=345&action=edit"
SALIDA_ACTUALIZAR = (f"Producto 345 (por búsqueda por matrícula en la web): {ADMIN}\n"
                     "Precio: 14.000 → 13.500\n\n== PARA VERIFICAR\n  ! cuota: revisar la tarifa\n\n")
SALIDA_FICHA = (f"Producto 345 (por búsqueda por matrícula en la web): {ADMIN}\n"
                "Ficha: /1_Ventas/33-Seat Ibiza-6913MDM/ficha-expo.pdf\n")


def trabajo(tipo="cambio_precio", modo="simular", id=12, referencia="#1033", matricula="6913MDM", **extra):
    return {"id": id, "tipo": tipo, "modo": modo, "referencia": referencia, "matricula": matricula,
            "vehiculo_id": 345, **extra}


# ---------------------------------------------------------------- dobles
class Resp:
    NO_JSON = object()

    def __init__(self, status=200, datos=None):
        self.status_code, self.datos = status, datos

    def json(self):
        if self.datos is Resp.NO_JSON:
            raise requests.JSONDecodeError("no es JSON", "<html>", 0)
        return self.datos


class FakeCRM:
    """El CRM doblado: guion de respuestas para reclamar (sin contar los latidos) y para resultado. Cada elemento es
    un dict (JSON con 200), un Resp o una excepción a lanzar."""

    def __init__(self, *reclamos, resultados=()):
        self.reclamos, self.resultados = list(reclamos), list(resultados)
        self.llamadas = []
        self.hilos = set()

    def __call__(self, url, json=None, headers=None, timeout=None):
        self.llamadas.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        self.hilos.add(threading.current_thread().name)
        if url.endswith(trabajos_crm.RUTA_RECLAMAR):
            if json["solo_latido"]:
                item = {"trabajo": None, "proximo_s": 45}
            else:
                item = self.reclamos.pop(0) if self.reclamos else {"trabajo": None, "proximo_s": 45}
        else:
            item = self.resultados.pop(0) if self.resultados else {"ok": True}
        if isinstance(item, BaseException):
            raise item
        return item if isinstance(item, Resp) else Resp(200, item)

    def de(self, ruta, latido=None):
        return [c for c in self.llamadas if c["url"].endswith(ruta)
                and (latido is None or c["json"].get("solo_latido") == latido)]

    @property
    def reclamos_hechos(self):
        return self.de(trabajos_crm.RUTA_RECLAMAR, latido=False)

    @property
    def latidos(self):
        return self.de(trabajos_crm.RUTA_RECLAMAR, latido=True)

    @property
    def enviados(self):
        return [c["json"] for c in self.de(trabajos_crm.RUTA_RESULTADO)]


class Crono:
    """Reloj monotónico falso: `dormir` lo adelanta; `cola` puede adelantarlo también (un trabajo que tarda)."""

    def __init__(self):
        self.t, self.sueños = 0.0, []

    def __call__(self):
        return self.t

    def dormir(self, s):
        self.sueños.append(s)
        self.t += s


class ColaFalsa:
    def __init__(self, crono, proximo=45, duraciones=(), activa=True):
        self.crono, self.proximo, self.duraciones, self._activa = crono, proximo, list(duraciones), activa
        self.momentos, self.anuncios = [], 0

    def activa(self):
        return self._activa

    def anunciar(self):
        self.anuncios += 1

    def atender(self):
        self.momentos.append(self.crono.t)
        self.crono.t += self.duraciones.pop(0) if self.duraciones else 0
        return self.proximo


# ---------------------------------------------------------------- fixtures
@pytest.fixture(autouse=True)
def sin_crm_real(monkeypatch):
    """Sin CRM_* del entorno (el .env ya lo apunta a tmp el fixture buzon), sin git y sin HTTP real: si algo
    llegara a requests.post sin doblar, el test falla al final."""
    for k in trabajos_crm.VARIABLES:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(trabajos_crm, "version_local", lambda: "test")
    reales = []
    monkeypatch.setattr(trabajos_crm.requests, "post", lambda *a, **kw: reales.append(a) or Resp(599))
    yield
    assert reales == [], "hubo HTTP real al CRM"


@pytest.fixture
def crm_config(monkeypatch):
    monkeypatch.setenv("CRM_URL", CRM + "/")
    monkeypatch.setenv("CRM_WORKER_SECRET", SECRETO)


@pytest.fixture
def crm(monkeypatch):
    """Instala un FakeCRM como requests.post (para lo que se arma desde main)."""
    def armar(*reclamos, resultados=()):
        fake = FakeCRM(*reclamos, resultados=resultados)
        monkeypatch.setattr(trabajos_crm.requests, "post", fake)
        return fake
    return armar


def cola(entorno_dir, http, **over):
    """Una ColaCRM con el lanzador real del vigilante (subprocess.run doblado por publicar_falso)."""
    vig = vigilante(entorno_dir)
    base = dict(ejecutar=vig.ejecutar, log=logging.getLogger("vigilar"), version="test", http=http,
                dormir=lambda s: None)
    base.update(over)
    return trabajos_crm.ColaCRM(**base)


# ---------------------------------------------------------------- configuración
def test_sin_config_no_hay_http_y_se_anuncia_una_vez(entorno, publicar_falso, caplog, monkeypatch):
    caplog.set_level(logging.INFO, logger="vigilar")
    fake_run, http = publicar_falso(), FakeCRM(trabajo())
    c = cola(entorno, http)
    assert [c.atender() for _ in range(3)] == [45, 45, 45] and not c.activa()
    assert http.llamadas == [] and fake_run.calls == []
    assert caplog.text.count("Trabajos del CRM apagados: faltan CRM_URL, CRM_WORKER_SECRET") == 1
    monkeypatch.setenv("CRM_URL", CRM)                       # solo la URL: sigue apagado
    c.atender()
    monkeypatch.setenv("CRM_WORKER_SECRET", SECRETO)
    monkeypatch.setenv("CRM_TRABAJOS", "0")                  # 0 lo apaga aunque esté todo
    c.atender()
    assert http.llamadas == [] and "apagados (CRM_TRABAJOS=0)" in caplog.text
    monkeypatch.setenv("CRM_URL", "http://crm.ejemplo.test")  # sin https: el secreto no viaja en claro
    monkeypatch.delenv("CRM_TRABAJOS")
    assert c.atender() == 45 and http.llamadas == [] and "tiene que empezar por https://" in caplog.text
    assert SECRETO not in caplog.text


def test_config_desde_el_env_y_activa_por_defecto(tmp_path, monkeypatch):
    env = tmp_path / "crm.env"
    env.write_text(f"CRM_URL={CRM}/\nCRM_WORKER_SECRET={SECRETO}\n", encoding="utf-8")
    cfg = trabajos_crm.ConfigCRM.cargar(environ={}, env_path=env)
    assert cfg.activa and cfg.url == CRM and cfg.secreto == SECRETO
    assert SECRETO not in cfg.estado() and SECRETO not in repr(cfg) and CRM in cfg.estado()
    cfg = trabajos_crm.ConfigCRM.cargar(environ={"CRM_TRABAJOS": "0"}, env_path=env)
    assert not cfg.activa and cfg.estado() == "apagados (CRM_TRABAJOS=0)"


# ---------------------------------------------------------------- reclamar
def test_reclamar_sin_trabajo_no_ejecuta_nada(entorno, publicar_falso, crm_config):
    fake_run, http = publicar_falso(), FakeCRM({"trabajo": None, "proximo_s": 10})
    assert cola(entorno, http).atender() == 10
    assert fake_run.calls == [] and http.enviados == []
    [llamada] = http.llamadas
    assert llamada["url"] == CRM + trabajos_crm.RUTA_RECLAMAR and llamada["timeout"] == 15
    assert llamada["headers"] == {"X-Worker-Secret": SECRETO}
    assert llamada["json"] == {"worker": "pc-seb", "version": "test", "solo_latido": False}


@pytest.mark.parametrize("proximo, esperado", [(10, 10), (0, 5), (-3, 5), (10_000, 600), ("raro", 45), (None, 45),
                                               (True, 45)])
def test_proximo_s_se_acota(entorno, publicar_falso, crm_config, proximo, esperado):
    publicar_falso()
    assert cola(entorno, FakeCRM({"trabajo": None, "proximo_s": proximo})).atender() == esperado


# ---------------------------------------------------------------- comandos
@pytest.mark.parametrize("tipo, modo, esperado", [
    ("cambio_precio", "simular", [[PUBLICAR, "--matricula", "6913MDM", "--actualizar", "--solo-financiacion", "--simular"],
                                  [PUBLICAR, "--matricula", "6913MDM", "--solo-ficha", "--simular"]]),
    ("cambio_precio", "aplicar", [[PUBLICAR, "--matricula", "6913MDM", "--actualizar", "--solo-financiacion", "--si"],
                                  [PUBLICAR, "--matricula", "6913MDM", "--solo-ficha"]]),
    ("cambio_fotos", "simular", [[PUBLICAR, "--matricula", "6913MDM", "--cambiar-fotos", "--simular"]]),
    ("cambio_fotos", "aplicar", [[PUBLICAR, "--matricula", "6913MDM", "--cambiar-fotos", "--si"]]),
    ("publicar_borrador", "simular", [[PUBLICAR, "--matricula", "6913MDM", "--simular"]]),
    ("publicar_borrador", "aplicar", [[PUBLICAR, "--matricula", "6913MDM", "--si"]]),
    ("bajar_ficha", "simular", [[PUBLICAR, "--matricula", "6913MDM", "--solo-ficha", "--simular"]]),
    ("bajar_ficha", "aplicar", [[PUBLICAR, "--matricula", "6913MDM", "--solo-ficha"]]),
    ("carteles", "simular", [[LUNA, "--matricula", "6913MDM", "--simular"]]),
    ("carteles", "aplicar", [[LUNA, "--matricula", "6913MDM"]]),
])
def test_comandos_por_tipo_y_modo(tipo, modo, esperado):
    assert trabajos_crm.comandos(trabajo(tipo, modo)) == [[PY, *argv] for argv in esperado]


@pytest.mark.parametrize("referencia, matricula, sel", [
    ("#1033", "6913MDM", ["--matricula", "6913MDM"]),
    ("#1033", " 6913 mdm ", ["--matricula", "6913MDM"]),       # mayúsculas y sin espacios
    ("#1088", "2848NR", ["1088"]),                             # matrícula incompleta: la referencia sin #
    ("#D-28", None, ["D-28"]),
    ("1090", "", ["1090"]),
    ("#1033", "6913-MDM", ["1033"]),
])
def test_seleccion(referencia, matricula, sel):
    assert trabajos_crm.seleccion({"referencia": referencia, "matricula": matricula}) == sel
    assert trabajos_crm.comandos(trabajo("bajar_ficha", referencia=referencia, matricula=matricula))[0][2:-2] == sel


@pytest.mark.parametrize("cambios", [dict(tipo="borrar_todo"), dict(modo="ya"), dict(modo=None),
                                     dict(referencia="", matricula=None), dict(referencia="--si", matricula="12AB"),
                                     dict(referencia="#10 33", matricula=None)])
def test_comandos_rechaza_trabajos_no_validos(cambios):
    with pytest.raises(ValueError):
        trabajos_crm.comandos(trabajo(**cambios))


# ---------------------------------------------------------------- ejecución y resultado
def test_cambio_precio_simular_de_punta_a_punta(entorno, publicar_falso, crm_config, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    fake_run = publicar_falso((0, SALIDA_ACTUALIZAR), (0, SALIDA_FICHA))
    http = FakeCRM({"trabajo": trabajo(), "proximo_s": 10})
    c = cola(entorno, http)
    assert c.atender() == 10
    assert fake_run.calls == [[PY, PUBLICAR, "--matricula", "6913MDM", "--actualizar", "--solo-financiacion", "--simular"],
                              [PY, PUBLICAR, "--matricula", "6913MDM", "--solo-ficha", "--simular"]]
    [res] = http.enviados
    assert res["id"] == 12 and res["worker"] == "pc-seb" and res["rc"] == 0 and res["url"] == ADMIN
    assert res["para_verificar"] == ["! cuota: revisar la tarifa"]
    assert res["salida"].startswith(
        "$ publicar.py --matricula 6913MDM --actualizar --solo-financiacion --simular\nProducto 345")
    assert "$ publicar.py --matricula 6913MDM --solo-ficha --simular\n" in res["salida"] and "Ficha: " in res["salida"]
    assert http.llamadas[-1]["url"] == CRM + trabajos_crm.RUTA_RESULTADO
    assert http.llamadas[-1]["headers"] == {"X-Worker-Secret": SECRETO}
    assert c.ultimo == {"id": 12, "tipo": "cambio_precio", "modo": "simular", "rc": 0, "enviado": True}
    lineas = [r.getMessage() for r in caplog.records if r.getMessage().startswith("CRM trabajo 12")]
    assert len(lineas) == 2 and "lanzando publicar.py" in lineas[0] and " && " in lineas[0]
    assert "ok (código 0), 1 cosa/s para verificar" in lineas[1] and ADMIN in lineas[1]


def test_cambio_precio_si_falla_el_primer_paso_no_baja_la_ficha(entorno, publicar_falso, crm_config):
    fake_run = publicar_falso((1, "⚠ Identidad no confirmada: no se toca la web.\n"))
    http = FakeCRM({"trabajo": trabajo(modo="aplicar", simulacion_id=11), "proximo_s": 10})
    c = cola(entorno, http)
    c.atender()
    assert len(fake_run.calls) == 1 and all("--solo-ficha" not in call for call in fake_run.calls)
    assert fake_run.argumentos(0) == ["--matricula", "6913MDM", "--actualizar", "--solo-financiacion", "--si"]
    [res] = http.enviados
    assert res["rc"] == 1 and res["url"] is None and res["para_verificar"] == []
    assert "Identidad no confirmada" in res["salida"] and "(terminó con código 1)" in res["salida"]
    assert "no se ejecutó «publicar.py --matricula 6913MDM --solo-ficha»" in res["salida"]
    assert c.ultimo["rc"] == 1


def test_publicar_borrador_devuelve_el_enlace_del_creado(entorno, publicar_falso, crm_config):
    fake_run = publicar_falso((0, SALIDA_OK))
    http = FakeCRM({"trabajo": trabajo("publicar_borrador", "aplicar"), "proximo_s": 10})
    cola(entorno, http).atender()
    assert fake_run.argumentos() == ["--matricula", "6913MDM", "--si"]
    [res] = http.enviados
    assert res["rc"] == 0 and res["url"] == URL
    assert res["para_verificar"] == ["! caja: sin confirmar (revisar en el borrador)", "! categoría: modelo desconocido"]


def test_el_enlace_de_google_nunca_pasa_por_enlace_del_coche(entorno, publicar_falso, crm_config):
    publicar_falso((3, "Please visit this URL to authorize this application: https://accounts.google.com/o/x\n"))
    http = FakeCRM({"trabajo": trabajo("carteles"), "proximo_s": 10})
    cola(entorno, http).atender()
    assert http.enviados[0]["url"] is None and http.enviados[0]["rc"] == 3


def test_tiempo_agotado_y_fallo_al_lanzar(entorno, publicar_falso, crm_config):
    import subprocess
    publicar_falso(subprocess.TimeoutExpired(["x"], 1200, output="salida parcial"))
    http = FakeCRM({"trabajo": trabajo("bajar_ficha"), "proximo_s": 10})
    cola(entorno, http).atender()
    assert http.enviados[0]["rc"] == -1 and "tiempo agotado" in http.enviados[0]["salida"]

    def explota(cmd):
        raise RuntimeError("bug")
    http = FakeCRM({"trabajo": trabajo("bajar_ficha"), "proximo_s": 10})
    cola(entorno, http, ejecutar=explota).atender()
    assert http.enviados[0]["rc"] == -1 and "RuntimeError: bug" in http.enviados[0]["salida"]


def test_trabajo_no_valido_se_responde_sin_ejecutar(entorno, publicar_falso, crm_config):
    fake_run = publicar_falso()
    http = FakeCRM({"trabajo": trabajo(tipo="formatear_disco"), "proximo_s": 10},
                   {"trabajo": {"tipo": "carteles", "modo": "simular"}, "proximo_s": 10})
    c = cola(entorno, http)
    c.atender()
    assert fake_run.calls == [] and http.enviados[0]["rc"] == 2 and "formatear_disco" in http.enviados[0]["salida"]
    c.atender()                                                # sin id: no se puede ni ejecutar ni responder
    assert fake_run.calls == [] and len(http.enviados) == 1


def test_salida_sin_ansi_y_recortada_a_100_kb(entorno, publicar_falso, crm_config):
    salida = "\x1b[1m\x1b[31mcabecera roja\x1b[0m\r\n" + "línea de relleno ñ\n" * 12_000 + "\x1b[32mfinal ñandú\x1b[0m\n"
    publicar_falso((0, salida))
    http = FakeCRM({"trabajo": trabajo("bajar_ficha"), "proximo_s": 10})
    cola(entorno, http).atender()
    enviada = http.enviados[0]["salida"]
    assert "\x1b" not in enviada and "\r" not in enviada
    assert len(enviada.encode("utf-8")) <= 100 * 1024
    assert enviada.startswith(trabajos_crm.AVISO_RECORTE) and enviada.endswith("final ñandú\n")
    assert enviada[len(trabajos_crm.AVISO_RECORTE):].startswith("línea de relleno ñ\n")   # empieza en línea entera
    assert "cabecera roja" not in enviada


def test_recortar_y_limpiar():
    assert trabajos_crm.recortar("corta") == "corta"
    texto = "ñ" * 1000                                          # 2000 bytes, sin saltos: corta en un carácter entero
    recortado = trabajos_crm.recortar(texto, limite=500)
    assert len(recortado.encode("utf-8")) <= 500 and recortado.endswith("ñ" * 10)
    assert recortado.encode("utf-8").decode("utf-8") == recortado
    assert trabajos_crm.limpiar("\x1b[2mgris\x1b[0m \x1b]0;título\x07ok\r\n") == "gris ok\n"


# ---------------------------------------------------------------- errores del CRM
@pytest.mark.parametrize("falla, clave", [
    (requests.Timeout("lento"), "no respondió en 15 s"),
    (requests.ConnectionError("sin red"), "no se pudo conectar"),
    (RuntimeError("raro"), "fallo inesperado"),
    (Resp(500, {"error": "x"}), "respondió 500"),
    (Resp(401, {"error": "x"}), "rechazó el secreto"),
    (Resp(503, {"error": "x"}), "AUTOMATIZACIONES_WORKER_SECRET"),
    (Resp(200, Resp.NO_JSON), "no es JSON"),
    (Resp(200, [1, 2]), "no es un objeto"),
    (Resp(200, {"trabajo": "12", "proximo_s": 10}), "«trabajo» no es un objeto"),
])
def test_errores_del_crm_no_escapan_y_se_anotan_una_vez(entorno, publicar_falso, crm_config, caplog, falla, clave):
    caplog.set_level(logging.INFO, logger="vigilar")
    fake_run = publicar_falso()
    http = FakeCRM(falla, falla, falla, {"trabajo": None, "proximo_s": 10}, falla)
    c = cola(entorno, http)
    assert [c.atender() for _ in range(3)] == [45, 45, 45] and fake_run.calls == []
    avisos_crm = [r for r in caplog.records if r.levelno == logging.WARNING and r.getMessage().startswith("CRM:")]
    assert len(avisos_crm) == 1 and clave in avisos_crm[0].getMessage()
    assert c.atender() == 10 and "la conexión volvió a funcionar" in caplog.text
    c.atender()                                                # vuelve a fallar: se anota otra vez
    assert len([r for r in caplog.records if r.levelno == logging.WARNING]) == 2
    assert SECRETO not in caplog.text


def test_resultado_se_reintenta_si_falla_la_red(entorno, publicar_falso, crm_config, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    publicar_falso((0, SALIDA_FICHA))
    esperas = []
    http = FakeCRM({"trabajo": trabajo("bajar_ficha"), "proximo_s": 10},
                   resultados=[requests.ConnectionError("x"), Resp(502), {"ok": True}])
    c = cola(entorno, http, dormir=esperas.append)
    c.atender()
    assert len(http.enviados) == 3 and esperas == [10, 30] and c.ultimo["enviado"]
    assert "NO se pudo mandar" not in caplog.text


def test_resultado_409_no_se_reintenta_y_queda_en_el_log(entorno, publicar_falso, crm_config, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    publicar_falso((0, SALIDA_FICHA))
    esperas = []
    http = FakeCRM({"trabajo": trabajo("bajar_ficha"), "proximo_s": 10}, resultados=[Resp(409, {"error": "x"})])
    c = cola(entorno, http, dormir=esperas.append)
    c.atender()
    assert len(http.enviados) == 1 and esperas == [] and not c.ultimo["enviado"]
    assert "NO se pudo mandar el resultado al CRM" in caplog.text and "ya no estaba en curso" in caplog.text


# ---------------------------------------------------------------- latido
def test_latido_durante_un_trabajo_largo_y_se_para_al_terminar(entorno, crm_config):
    http = FakeCRM({"trabajo": trabajo("cambio_fotos", "aplicar"), "proximo_s": 10})

    def lento(cmd):
        time.sleep(0.25)
        return 0, SALIDA_FICHA
    c = cola(entorno, http, ejecutar=lento, latido_cada=0.02)
    c.atender()
    latidos = len(http.latidos)
    assert latidos >= 3 and len(http.reclamos_hechos) == 1 and "crm-latido" in http.hilos
    assert all(ll["json"]["worker"] == "pc-seb" for ll in http.latidos)
    assert not any(t.name == "crm-latido" for t in threading.enumerate())
    time.sleep(0.1)
    assert len(http.latidos) == latidos                         # parado: no manda más
    assert http.llamadas[-1]["url"].endswith(trabajos_crm.RUTA_RESULTADO)


def test_latido_que_falla_no_rompe_y_se_para():
    llamadas = []

    def enviar():
        llamadas.append(1)
        raise RuntimeError("x")
    with trabajos_crm.Latido(enviar, cada=0.01) as latido:
        time.sleep(0.08)
    assert len(llamadas) >= 2 and not latido.hilo.is_alive()


# ---------------------------------------------------------------- enganche en el bucle del vigilante
def test_esperar_atiende_varias_veces_dentro_del_intervalo(entorno):
    crono = Crono()
    c = ColaFalsa(crono, proximo=45)
    vig = vigilante(entorno, intervalo=120, cola=c, dormir=crono.dormir, cronometro=crono)
    vig.esperar()
    assert c.momentos == [0, 45, 90] and crono.sueños == [45, 45, 30] and crono.t == 120


def test_esperar_con_un_trabajo_largo_no_duerme_de_mas(entorno):
    crono = Crono()
    c = ColaFalsa(crono, proximo=10, duraciones=[0, 50])       # el segundo atender tarda 50 s (un trabajo)
    vig = vigilante(entorno, intervalo=120, cola=c, dormir=crono.dormir, cronometro=crono)
    vig.esperar()
    assert c.momentos == [0, 10, 70, 80, 90, 100, 110] and crono.t == 120
    crono = Crono()
    c = ColaFalsa(crono, proximo=10, duraciones=[1300])        # un trabajo más largo que el intervalo
    vig = vigilante(entorno, intervalo=120, cola=c, dormir=crono.dormir, cronometro=crono)
    vig.esperar()
    assert c.momentos == [0] and crono.sueños == []             # vuelve enseguida al ciclo de fotos


def test_bucle_mantiene_la_cadencia_del_ciclo_de_fotos(entorno, monkeypatch):
    crono = Crono()
    c = ColaFalsa(crono, proximo=45)
    vig = vigilante(entorno, intervalo=120, cola=c, dormir=crono.dormir, cronometro=crono)
    vueltas = []

    class Basta(Exception):
        pass

    def vuelta():
        vueltas.append(crono.t)
        if len(vueltas) == 4:
            raise Basta
    monkeypatch.setattr(vig, "vuelta", vuelta)
    with pytest.raises(Basta):
        vig.bucle()
    assert vueltas == [0, 120, 240, 360] and len(c.momentos) == 9 and c.anuncios == 1


@pytest.mark.parametrize("con_cola", [False, True])
def test_sin_crm_el_bucle_duerme_como_siempre(entorno, crm, con_cola, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    http = crm()
    sueños = []
    c = trabajos_crm.ColaCRM(ejecutar=lambda cmd: (0, ""), version="test") if con_cola else None
    vig = vigilante(entorno, intervalo=120, cola=c, dormir=sueños.append)
    for _ in range(3):
        vig.esperar()
    assert sueños == [120, 120, 120] and http.llamadas == []
    assert caplog.text.count("Trabajos del CRM apagados") == (1 if con_cola else 0)


def test_bucle_anuncia_si_los_trabajos_estan_activos(entorno, crm, crm_config, caplog, monkeypatch):
    caplog.set_level(logging.INFO, logger="vigilar")
    crm()
    vig = vigilante(entorno, cola=trabajos_crm.ColaCRM(ejecutar=lambda cmd: (0, ""), version="test"))

    def vuelta():
        raise KeyboardInterrupt
    monkeypatch.setattr(vig, "vuelta", vuelta)
    with pytest.raises(KeyboardInterrupt):
        vig.bucle()
    assert f"Trabajos del CRM activos: {CRM}, esta PC es «pc-seb»." in caplog.text and SECRETO not in caplog.text


# ---------------------------------------------------------------- CLI
def test_probar_crm_sin_config(entorno, crm, capsys):
    http = crm()
    assert vigilar.main(["--probar-crm"]) == 1
    out = capsys.readouterr().out
    assert "Faltan variables para los trabajos del CRM: CRM_URL, CRM_WORKER_SECRET" in out and http.llamadas == []
    assert not vigilar.LOG_PATH.exists()


def test_probar_crm_ok(entorno, crm, crm_config, capsys):
    http = crm()
    assert vigilar.main(["--probar-crm"]) == 0
    out = capsys.readouterr().out
    assert f"Probando la conexión con el CRM: {CRM}" in out and "OK: el CRM respondió" in out
    assert "próxima consulta en 45 s" in out and SECRETO not in out
    [llamada] = http.llamadas
    assert llamada["json"] == {"worker": "pc-seb", "version": "test", "solo_latido": True}


@pytest.mark.parametrize("falla, texto", [(Resp(401, {}), "rechazó el secreto"),
                                          (Resp(200, Resp.NO_JSON), "no es JSON"),
                                          (requests.ConnectionError("sin red"), "no se pudo conectar")])
def test_probar_crm_con_error(entorno, crm_config, capsys, monkeypatch, falla, texto):
    def http(url, **kw):
        if isinstance(falla, BaseException):
            raise falla
        return falla
    monkeypatch.setattr(trabajos_crm.requests, "post", http)
    assert vigilar.main(["--probar-crm"]) == 1
    out = capsys.readouterr().out
    assert "FALLÓ: " in out and texto in out and SECRETO not in out


def test_trabajos_una_vez(entorno, publicar_falso, crm, crm_config):
    fake_run = publicar_falso((0, SALIDA_FICHA))
    http = crm({"trabajo": trabajo("bajar_ficha", "aplicar"), "proximo_s": 10})
    assert vigilar.main(["--trabajos-una-vez", "--ventas-dir", str(entorno)]) == 0
    assert fake_run.argumentos() == ["--matricula", "6913MDM", "--solo-ficha"]
    assert http.enviados[0]["rc"] == 0 and "CRM trabajo 12" in vigilar.LOG_PATH.read_text(encoding="utf-8")
    assert vigilar.main(["--trabajos-una-vez", "--ventas-dir", str(entorno)]) == 0   # nada pendiente
    assert len(fake_run.calls) == 1


def test_trabajos_una_vez_sin_config_o_con_otro_vigilante(entorno, publicar_falso, crm, capsys, monkeypatch):
    import fcntl
    fake_run, http = publicar_falso(), crm({"trabajo": trabajo(), "proximo_s": 10})
    assert vigilar.main(["--trabajos-una-vez", "--ventas-dir", str(entorno)]) == 1
    assert "Trabajos del CRM apagados" in capsys.readouterr().out and http.llamadas == []
    monkeypatch.setenv("CRM_URL", CRM)
    monkeypatch.setenv("CRM_WORKER_SECRET", SECRETO)
    vigilar.LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(vigilar.LOCK_PATH, "w") as otro:                  # el vigilante del arranque tiene el cerrojo
        fcntl.flock(otro, fcntl.LOCK_EX | fcntl.LOCK_NB)
        assert vigilar.main(["--trabajos-una-vez", "--ventas-dir", str(entorno)]) == 2
    assert http.llamadas == [] and fake_run.calls == []


# ---------------------------------------------------------------- los atajos de la terminal y comandos()
ATAJOS = {"publicar-cambioprecio": "cambio_precio", "publicar-cambiofotos": "cambio_fotos",
          "publicar-cambioficha": "bajar_ficha"}


def _ramas_del_atajo() -> dict[str, str]:
    texto = (PROJECT_DIR / "publicar-cambio.sh").read_text(encoding="utf-8")
    bloque = texto.split('case "$MODO" in', 1)[1].split("esac", 1)[0]
    return {m.group(1): m.group(2) for m in re.finditer(r"^\s*(publicar-[a-z]+)\)(.*?);;", bloque, re.M | re.S)}


def _comandos_del_atajo(rama: str) -> list[list[str]]:
    """[script, flags fijos…] de cada "$PY" <script> "${SEL[@]}" <flags> "${FLAGS[@]}" de la rama, en orden."""
    patron = r'"\$PY" (\S+\.py) "\$\{SEL\[@\]\}"((?: --[a-z-]+)*) "\$\{FLAGS\[@\]\}"'
    return [[script, *flags.split()] for script, flags in re.findall(patron, rama)]


def test_atajos_de_la_terminal_coinciden_con_comandos():
    ramas = _ramas_del_atajo()
    assert set(ATAJOS) <= set(ramas)
    for atajo, tipo in ATAJOS.items():
        del_atajo = _comandos_del_atajo(ramas[atajo])
        assert del_atajo, atajo
        for modo, extra in (("simular", {"--simular"}), ("aplicar", {"--si"})):
            for sel in (["--matricula", "6913MDM"], ["1033"]):
                t = trabajo(tipo, modo, matricula=sel[-1] if len(sel) == 2 else "", referencia="#1033")
                nuestros = [[Path(c[1]).name, *[a for a in c[2 + len(sel):] if a not in extra]]
                            for c in trabajos_crm.comandos(t)]
                assert [c[2:2 + len(sel)] for c in trabajos_crm.comandos(t)] == [sel] * len(del_atajo)
                assert nuestros == del_atajo, (atajo, modo)
    # cambio de precio: la ficha solo si el primer paso salió bien (if …; then), igual que comandos() encadenado
    rama = ramas["publicar-cambioprecio"]
    assert re.search(r'if "\$PY" publicar\.py "\$\{SEL\[@\]\}" --actualizar --solo-financiacion "\$\{FLAGS\[@\]\}"; '
                     r'then\s+"\$PY" publicar\.py "\$\{SEL\[@\]\}" --solo-ficha', rama)
    # misma regla de matrícula completa (4 dígitos + 3 letras, sin distinguir mayúsculas) → --matricula
    assert '[[ "$C" =~ ^[0-9]{4}[A-Za-z]{3}$ ]]; then SEL=(--matricula "${C^^}")' in \
        (PROJECT_DIR / "publicar-cambio.sh").read_text(encoding="utf-8")
