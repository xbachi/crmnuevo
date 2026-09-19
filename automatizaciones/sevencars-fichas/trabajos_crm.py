"""Trabajos pedidos desde el CRM (botones de la ficha del coche): el vigilante los pide a la cola del CRM, ejecuta los
mismos comandos que los atajos de la terminal (publicar-cambioprecio, publicar-cambiofotos, publicar-cambioficha…) y
le devuelve el resultado.

Contrato: POST <CRM_URL>/api/automatizaciones/worker/reclamar y …/resultado, con la cabecera X-Worker-Secret.
Configuración, por variables de entorno o en sevencars-fichas/.env (se relee en cada vuelta, como la de avisos.py):
  CRM_URL (https://sevencars.vercel.app), CRM_WORKER_SECRET (el mismo valor que AUTOMATIZACIONES_WORKER_SECRET en
  Vercel) y CRM_TRABAJOS (activo por defecto si están las otras dos; 0 lo apaga).
Sin configuración no se hace ninguna llamada. Ningún fallo del CRM (red, HTTP, JSON) corta el vigilante: se anota en
el log una vez por tipo de fallo (hasta que vuelva a funcionar) y se sigue.

vigilar.py atiende la cola mientras espera la próxima vuelta del ciclo de fotos: un trabajo a la vez y en el mismo
hilo, así que nunca se pisa con la publicación automática ni con las escrituras de data/publicados.json.
"""
from __future__ import annotations

import logging
import re
import shlex
import subprocess
import threading
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Mapping, NamedTuple
from urllib.parse import urlparse

import requests

import avisos
import vigilar
from common import PROJECT_DIR

VARIABLES = ("CRM_URL", "CRM_WORKER_SECRET", "CRM_TRABAJOS")
WORKER = "pc-seb"
TIMEOUT_HTTP = 15
PROXIMO_DEFECTO = 45                  # segundos hasta la próxima consulta si el CRM no dice otra cosa (o falla)
PROXIMO_MIN, PROXIMO_MAX = 5, 600     # un proximo_s raro nunca hace martillar al CRM ni lo deja olvidado
LATIDO_CADA = 60                      # durante un trabajo: un latido (solo_latido) por minuto
MAX_SALIDA = 100 * 1024               # bytes de salida que se mandan al CRM (los últimos)
REINTENTOS_RESULTADO = (10, 30)       # esperas antes de reintentar mandar un resultado (red caída o error 5xx)
RUTA_RECLAMAR = "/api/automatizaciones/worker/reclamar"
RUTA_RESULTADO = "/api/automatizaciones/worker/resultado"
AVISO_RECORTE = "(… salida recortada: van las últimas líneas, hasta 100 KB)\n"

MODOS = ("simular", "aplicar")
_RE_MATRICULA = re.compile(r"^[0-9]{4}[A-Z]{3}$")
_RE_REFERENCIA = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")       # nunca empieza por «-» (no se cuela como opción)
_RE_ANSI = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])")
_RE_PRODUCTO = re.compile(r"^\s*Producto \d+")


class Paso(NamedTuple):
    script: str
    flags: tuple[str, ...]
    con_si: bool          # en modo aplicar lleva --si (publicar.py que pregunta antes de pisar: --actualizar,
                          # --cambiar-fotos y la creación); --solo-ficha y luna.py no


# Lo que ejecuta cada tipo de trabajo. Los pasos se encadenan como && en bash: cada uno solo corre si el anterior
# terminó con código 0. Tiene que coincidir con publicar-cambio.sh (tests/test_trabajos_crm.py lo comprueba).
PASOS: dict[str, tuple[Paso, ...]] = {
    "cambio_precio": (Paso("publicar.py", ("--actualizar", "--solo-financiacion"), True),
                      Paso("publicar.py", ("--solo-ficha",), False)),
    "cambio_fotos": (Paso("publicar.py", ("--cambiar-fotos",), True),),
    "publicar_borrador": (Paso("publicar.py", (), True),),
    "bajar_ficha": (Paso("publicar.py", ("--solo-ficha",), False),),
    "carteles": (Paso("luna.py", (), False),),
}


# ------------------------------------------------------------------ comandos
def seleccion(trabajo: Mapping) -> list[str]:
    """Cómo se le nombra el coche a publicar.py/luna.py: --matricula si la matrícula está completa (4 dígitos y 3
    letras); si no, la referencia sin «#» (el CRM guarda #1088, #D-28). ValueError si no hay ninguna utilizable."""
    matricula = re.sub(r"\s+", "", str(trabajo.get("matricula") or "")).upper()
    if _RE_MATRICULA.match(matricula):
        return ["--matricula", matricula]
    referencia = str(trabajo.get("referencia") or "").strip().lstrip("#").strip()
    if _RE_REFERENCIA.match(referencia):
        return [referencia]
    raise ValueError(f"sin matrícula completa ni referencia válida (matrícula {trabajo.get('matricula')!r}, "
                     f"referencia {trabajo.get('referencia')!r})")


def comandos(trabajo: Mapping, python: Path | str = vigilar.PYTHON, carpeta: Path | str = PROJECT_DIR) -> list[list[str]]:
    """argv de cada paso del trabajo (función pura). Encadenados: cada uno solo si el anterior dio código 0.
    ValueError si el tipo, el modo o el coche no valen."""
    tipo, modo = trabajo.get("tipo"), trabajo.get("modo")
    if tipo not in PASOS:
        raise ValueError(f"tipo de trabajo desconocido: {tipo!r}")
    if modo not in MODOS:
        raise ValueError(f"modo desconocido: {modo!r} (tiene que ser simular o aplicar)")
    sel = seleccion(trabajo)
    salida = []
    for paso in PASOS[tipo]:
        extra = ["--simular"] if modo == "simular" else (["--si"] if paso.con_si else [])
        salida.append([str(python), str(Path(carpeta) / paso.script), *sel, *paso.flags, *extra])
    return salida


def legible(cmd: list[str]) -> str:
    """«publicar.py --matricula 6913MDM --solo-ficha» (sin el intérprete ni la ruta)."""
    return shlex.join([Path(cmd[1]).name, *cmd[2:]]) if len(cmd) > 1 else shlex.join(cmd)


# ------------------------------------------------------------------ salida
def limpiar(texto: str) -> str:
    """Sin códigos de color ANSI y con saltos de línea de Unix."""
    return _RE_ANSI.sub("", texto or "").replace("\r\n", "\n")


def recortar(texto: str, limite: int = MAX_SALIDA) -> str:
    """Los últimos `limite` bytes (UTF-8) como mucho, empezando en una línea entera y avisando del recorte."""
    datos = texto.encode("utf-8")
    if len(datos) <= limite:
        return texto
    resto = datos[-(limite - len(AVISO_RECORTE.encode("utf-8"))):].decode("utf-8", "ignore")
    corte = resto.find("\n")
    if 0 <= corte < 2048:
        resto = resto[corte + 1:]
    return AVISO_RECORTE + resto


def lineas_verificar(salidas: list[str]) -> list[str]:
    """Las líneas de los bloques «== PARA VERIFICAR» (sin el título ni repetidas), en orden."""
    lineas: list[str] = []
    for salida in salidas:
        for linea in vigilar.bloque_verificar(salida).splitlines()[1:]:
            linea = linea.strip()
            if linea and linea not in lineas:
                lineas.append(linea)
    return lineas


def url_resultado(pasos: list[tuple[int, str]]) -> str | None:
    """El enlace del coche en la web: el del borrador creado o ya publicado (como en RESULTADO.txt) o, si no, el de
    la línea «Producto N …: <url>» que imprime publicar.py. Nunca otro (p. ej. el de autorizar Google)."""
    for rc, salida in pasos:
        url = vigilar.clasificar(rc, salida)[1]
        if url:
            return url
        for linea in salida.splitlines():
            m = vigilar._RE_URL.search(linea) if _RE_PRODUCTO.match(linea) else None
            if m:
                return m.group(0).rstrip(".")
    return None


def version_local() -> str:
    """Qué código corre en la PC (commit del repo), para que el CRM lo muestre. Nunca lanza."""
    try:
        proc = subprocess.run(["git", "-C", str(PROJECT_DIR), "log", "-1", "--format=%h %cs"], stdin=subprocess.DEVNULL,
                              capture_output=True, text=True, timeout=5)
        commit = proc.stdout.strip() if proc.returncode == 0 else ""
    except Exception:
        commit = ""
    return f"vigilar {commit}" if commit else "vigilar (sin git)"


# ------------------------------------------------------------------ configuración
def _url_valida(url: str) -> bool:
    u = urlparse(url)
    return bool(u.netloc) and (u.scheme == "https" or (u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1")))


@dataclass
class ConfigCRM:
    url: str = ""
    secreto: str = field(default="", repr=False)
    activos: bool = True
    faltan: list[str] = field(default_factory=list)
    problemas: list[str] = field(default_factory=list)

    @classmethod
    def cargar(cls, environ: Mapping[str, str] | None = None, env_path: Path | None = None) -> "ConfigCRM":
        v, problemas = avisos.leer_variables(environ, env_path, VARIABLES)
        url = v.get("CRM_URL", "").rstrip("/")
        faltan = [k for k in ("CRM_URL", "CRM_WORKER_SECRET") if not v.get(k)]
        if url and not _url_valida(url):
            faltan.append("CRM_URL (tiene que empezar por https://)")
        return cls(url=url, secreto=v.get("CRM_WORKER_SECRET", ""), activos=avisos._si(v.get("CRM_TRABAJOS")),
                   faltan=faltan, problemas=problemas)

    @property
    def activa(self) -> bool:
        return self.activos and not self.faltan

    def estado(self) -> str:
        """Para el log, sin el secreto."""
        if not self.activos:
            return "apagados (CRM_TRABAJOS=0)"
        if self.faltan:
            extra = f"; {'; '.join(self.problemas)}" if self.problemas else ""
            return f"apagados: faltan {', '.join(self.faltan)} (en {avisos.ENV_PATH} o en el entorno{extra})"
        return f"activos: {self.url}, esta PC es «{WORKER}»"


# ------------------------------------------------------------------ cliente HTTP
def _proximo(valor) -> float:
    if isinstance(valor, (int, float)) and not isinstance(valor, bool) and valor == valor:
        return float(min(max(valor, PROXIMO_MIN), PROXIMO_MAX))
    return float(PROXIMO_DEFECTO)


def _explicar_http(codigo: int, ruta: str) -> str:
    if codigo == 401:
        return ("el CRM rechazó el secreto (401): CRM_WORKER_SECRET no coincide con AUTOMATIZACIONES_WORKER_SECRET "
                "de Vercel")
    if codigo == 503:
        return "el CRM respondió 503 (¿falta cargar AUTOMATIZACIONES_WORKER_SECRET en Vercel?)"
    if codigo == 404:
        return "el CRM respondió 404 (¿CRM_URL correcta?)"
    if codigo == 409 and ruta == RUTA_RESULTADO:
        return "el CRM no aceptó el resultado (409): el trabajo ya no estaba en curso (¿pasaron más de 30 min?)"
    return f"el CRM respondió {codigo}"


def _validar_reclamo(datos: dict) -> str:
    trabajo = datos.get("trabajo")
    if trabajo is not None and not isinstance(trabajo, dict):
        return "el CRM respondió algo raro al pedir trabajo («trabajo» no es un objeto)"
    return ""


class ClienteCRM:
    """Las dos llamadas de la PC al CRM. Nunca lanza: ante cualquier fallo lo anota en el log (una vez por tipo de
    fallo, hasta que una llamada vuelva a salir bien) y devuelve None; `ultimo_error` dice qué pasó."""

    def __init__(self, url: str, secreto: str, log: logging.Logger | None = None,
                 http: Callable | None = None, timeout: float = TIMEOUT_HTTP):
        self.url = url.rstrip("/")
        self._secreto = secreto
        self.log = log
        self.http = http if http is not None else requests.post
        self.timeout = timeout
        self.ultimo_error: str | None = None
        self.reintentable = False        # el último fallo fue de red o del servidor (5xx): vale la pena reintentar
        self._anotados: set[str] = set()

    def reclamar(self, worker: str, version: str, solo_latido: bool = False) -> dict | None:
        """{"trabajo": dict | None, "proximo_s": segundos} o None si falló. Con solo_latido nunca trae trabajo."""
        datos = self._post(RUTA_RECLAMAR, {"worker": worker, "version": version, "solo_latido": bool(solo_latido)},
                           validar=_validar_reclamo)
        if datos is None:
            return None
        return {"trabajo": None if solo_latido else datos.get("trabajo"), "proximo_s": _proximo(datos.get("proximo_s"))}

    def resultado(self, id: int, worker: str, rc: int, salida: str, para_verificar: list[str],
                  url: str | None) -> dict | None:
        return self._post(RUTA_RESULTADO, {"id": id, "worker": worker, "rc": rc, "salida": salida,
                                           "para_verificar": list(para_verificar), "url": url or None})

    def _post(self, ruta: str, payload: dict, validar: Callable[[dict], str] | None = None) -> dict | None:
        try:
            resp = self.http(self.url + ruta, json=payload, headers={"X-Worker-Secret": self._secreto},
                             timeout=self.timeout)
        except requests.Timeout:
            return self._fallo("timeout", f"el CRM no respondió en {self.timeout:g} s", reintentable=True)
        except requests.RequestException as exc:
            return self._fallo("red", f"no se pudo conectar con el CRM ({self._describir(exc)})", reintentable=True)
        except Exception as exc:
            return self._fallo("inesperado", f"fallo inesperado al llamar al CRM ({self._describir(exc)})")
        try:
            codigo = int(resp.status_code)
        except Exception as exc:
            return self._fallo("inesperado", f"respuesta ilegible del CRM ({self._describir(exc)})")
        if codigo != 200:
            return self._fallo(f"http {codigo}", _explicar_http(codigo, ruta), reintentable=codigo >= 500)
        try:
            datos = resp.json()
        except Exception:
            return self._fallo("json", "el CRM respondió algo que no es JSON")
        if not isinstance(datos, dict):
            return self._fallo("json", "el CRM respondió un JSON que no es un objeto")
        problema = validar(datos) if validar else ""
        if problema:
            return self._fallo("json", problema)
        self._bien()
        return datos

    def _describir(self, exc: BaseException) -> str:
        texto = f"{type(exc).__name__}: {exc}"[:300]
        return texto.replace(self._secreto, "****") if self._secreto else texto

    def _fallo(self, clave: str, texto: str, reintentable: bool = False) -> None:
        self.ultimo_error, self.reintentable = texto, reintentable
        if clave not in self._anotados:
            self._anotados.add(clave)
            if self.log:
                self.log.warning("CRM: %s. Sigo probando; no se repite en el log hasta que vuelva a funcionar.", texto)
        return None

    def _bien(self) -> None:
        if self._anotados and self.log:
            self.log.info("CRM: la conexión volvió a funcionar.")
        self._anotados.clear()
        self.ultimo_error, self.reintentable = None, False


# ------------------------------------------------------------------ latido durante un trabajo
class Latido:
    """Hilo que manda un latido cada `cada` segundos mientras dura un trabajo (así el CRM no muestra la PC apagada
    durante una publicación de 20 min). `with Latido(...)` lo arranca y, al salir, lo para y lo espera."""

    def __init__(self, enviar: Callable[[], object], cada: float = LATIDO_CADA):
        self.enviar, self.cada = enviar, cada
        self._parar = threading.Event()
        self.hilo = threading.Thread(target=self._correr, name="crm-latido", daemon=True)

    def _correr(self) -> None:
        while not self._parar.wait(self.cada):
            try:
                self.enviar()
            except Exception:            # el cliente no lanza; esto es por las dudas: el latido nunca tumba nada
                pass

    def __enter__(self) -> "Latido":
        self.hilo.start()
        return self

    def __exit__(self, *exc) -> bool:
        self._parar.set()
        self.hilo.join(TIMEOUT_HTTP + 5)
        return False


# ------------------------------------------------------------------ la cola
class ColaCRM:
    """Atiende la cola de trabajos del CRM desde el vigilante: `atender()` pide como mucho un trabajo, lo ejecuta con
    el mismo lanzador que el vigilante (Vigilante.ejecutar: sin navegador, sin colores, sin stdin y con tiempo
    límite) y manda el resultado. Nunca lanza."""

    def __init__(self, ejecutar: Callable[[list[str]], tuple[int, str]], log: logging.Logger | None = None,
                 python: Path | str = vigilar.PYTHON, carpeta: Path | str = PROJECT_DIR, worker: str = WORKER,
                 version: str | None = None, cargar: Callable[[], ConfigCRM] = ConfigCRM.cargar,
                 http: Callable | None = None, latido_cada: float = LATIDO_CADA,
                 dormir: Callable[[float], None] = time.sleep, reintentos: tuple[float, ...] = REINTENTOS_RESULTADO):
        self.ejecutar = ejecutar
        self.log = log or logging.getLogger("vigilar")
        self.python, self.carpeta, self.worker = python, carpeta, worker
        self.version = version if version is not None else version_local()
        self._cargar, self.http = cargar, http
        self.latido_cada, self.dormir, self.reintentos = latido_cada, dormir, reintentos
        self.proximo = float(PROXIMO_DEFECTO)
        self.reclamo_ok: bool | None = None      # la última consulta al CRM salió bien
        self.ultimo: dict | None = None          # {"id", "tipo", "modo", "rc", "enviado"} del último trabajo
        self._cliente: ClienteCRM | None = None
        self._clave: tuple[str, str] | None = None
        self._anunciado: str | None = None

    # --------------------------------------------------------------- configuración
    def config(self) -> ConfigCRM:
        """La configuración actual (se relee en cada uso: un cambio en .env vale sin reiniciar el vigilante)."""
        try:
            return self._cargar()
        except Exception as exc:
            return ConfigCRM(faltan=[f"configuración ilegible ({type(exc).__name__})"])

    def anunciar(self, cfg: ConfigCRM | None = None) -> None:
        """Una línea en el log con el estado (activos / apagados y por qué), solo si cambió desde la anterior."""
        estado = (cfg or self.config()).estado()
        if estado != self._anunciado:
            self._anunciado = estado
            self.log.info("Trabajos del CRM %s.", estado)

    def activa(self) -> bool:
        cfg = self.config()
        self.anunciar(cfg)
        return cfg.activa

    def _cliente_para(self, cfg: ConfigCRM) -> ClienteCRM:
        clave = (cfg.url, cfg.secreto)
        if self._cliente is None or clave != self._clave:
            self._cliente, self._clave = ClienteCRM(cfg.url, cfg.secreto, log=self.log, http=self.http), clave
        return self._cliente

    # --------------------------------------------------------------- atender
    def atender(self) -> float:
        """Pide como mucho un trabajo y, si hay, lo ejecuta y manda el resultado. Devuelve cuántos segundos esperar
        hasta la próxima consulta (lo que dijo el CRM; 45 si no dijo nada o falló)."""
        try:
            cfg = self.config()
            self.anunciar(cfg)
            if not cfg.activa:
                self.proximo, self.reclamo_ok = float(PROXIMO_DEFECTO), None
                return self.proximo
            cliente = self._cliente_para(cfg)
            resp = cliente.reclamar(self.worker, self.version)
            self.reclamo_ok = resp is not None
            if resp is None:
                self.proximo = float(PROXIMO_DEFECTO)
                return self.proximo
            self.proximo = resp["proximo_s"]
            if resp["trabajo"]:
                self._trabajo(cliente, resp["trabajo"])
        except Exception:
            self.log.exception("CRM: error inesperado atendiendo los trabajos; sigo vigilando")
        return self.proximo

    def una_vez(self) -> int:
        """`vigilar.py --trabajos-una-vez`: 0 si la consulta salió bien y el trabajo (si hubo) terminó bien y se
        avisó al CRM; 1 si no (o si los trabajos del CRM están apagados)."""
        if not self.activa():
            return 1
        self.ultimo = None
        self.atender()
        if not self.reclamo_ok:
            return 1
        return 0 if self.ultimo is None or (self.ultimo["rc"] == 0 and self.ultimo["enviado"]) else 1

    def _trabajo(self, cliente: ClienteCRM, trabajo: dict) -> None:
        id_ = trabajo.get("id")
        if not isinstance(id_, int) or isinstance(id_, bool):
            self.log.warning("CRM: llegó un trabajo sin id válido (%r): no se ejecuta ni se puede responder.", id_)
            return
        tipo, modo = trabajo.get("tipo"), trabajo.get("modo")
        coche = " / ".join(str(trabajo[k]) for k in ("referencia", "matricula") if trabajo.get(k))
        titulo = f"CRM trabajo {id_} ({tipo}, {modo}, {coche or 'sin coche'})"
        try:
            pasos = comandos(trabajo, self.python, self.carpeta)
        except ValueError as exc:
            self.log.info("%s: no se ejecuta: %s", titulo, exc)
            rc, partes, salidas = 2, [f"Trabajo no válido: {exc}"], []
        else:
            self.log.info("%s: lanzando %s", titulo, " && ".join(legible(c) for c in pasos))
            with Latido(lambda: cliente.reclamar(self.worker, self.version, solo_latido=True), self.latido_cada):
                rc, partes, salidas = self._correr(pasos)
        salida = recortar("\n".join(partes).rstrip("\n") + "\n")
        verificar = lineas_verificar([s for _, s in salidas])
        url = url_resultado(salidas)
        enviado = self._mandar(cliente, id_, rc, salida, verificar, url)
        self.ultimo = {"id": id_, "tipo": tipo, "modo": modo, "rc": rc, "enviado": enviado}
        linea = f"{titulo}: {'ok' if rc == 0 else 'error'} (código {rc})"
        if verificar:
            linea += f", {len(verificar)} cosa/s para verificar"
        if url:
            linea += f" — {url}"
        if not enviado:
            linea += f" — NO se pudo mandar el resultado al CRM ({cliente.ultimo_error})"
        self.log.info("%s", linea)

    def _correr(self, pasos: list[list[str]]) -> tuple[int, list[str], list[tuple[int, str]]]:
        """Ejecuta los pasos encadenados (cada uno solo si el anterior dio 0): (código final, texto para el CRM,
        [(código, salida limpia)] de los que corrieron)."""
        rc, partes, salidas = 0, [], []
        for cmd in pasos:
            if rc != 0:
                partes.append(f"(no se ejecutó «{legible(cmd)}»: el paso anterior falló)")
                continue
            partes.append(f"$ {legible(cmd)}")
            try:
                rc, out = self.ejecutar(cmd)
            except Exception:
                rc, out = -1, f"(fallo al lanzar el comando)\n{traceback.format_exc()}"
            out = limpiar(out)
            salidas.append((rc, out))
            partes.append(out.rstrip("\n"))
            if rc != 0:
                partes.append(f"(terminó con código {rc})")
        return rc, partes, salidas

    def _mandar(self, cliente: ClienteCRM, id_: int, rc: int, salida: str, verificar: list[str],
                url: str | None) -> bool:
        """Manda el resultado; si falla por la red o el servidor (5xx) lo reintenta un par de veces."""
        for espera in (0, *self.reintentos):
            if espera:
                self.dormir(espera)
            if cliente.resultado(id_, self.worker, rc, salida, verificar, url) is not None:
                return True
            if not cliente.reintentable:
                return False
        return False


# ------------------------------------------------------------------ vigilar.py --probar-crm
def probar(salida: Callable[[str], None] = print, config: ConfigCRM | None = None, http: Callable | None = None,
           version: str | None = None) -> int:
    """Un latido (solo_latido: no reclama nada) y dice claramente qué pasó, sin mostrar el secreto. 0 si respondió."""
    try:
        config = config or ConfigCRM.cargar()
    except Exception as exc:
        salida(f"No se pudo leer la configuración de los trabajos del CRM ({type(exc).__name__}: {exc}).")
        return 1
    for p in config.problemas:
        salida(f"Ojo: {p}.")
    if config.faltan:
        salida(f"Faltan variables para los trabajos del CRM: {', '.join(config.faltan)}.")
        salida(f"Cargalas en {avisos.ENV_PATH} (ver .env.example) o en el entorno y volvé a probar.")
        return 1
    if not config.activos:
        salida("Ojo: CRM_TRABAJOS=0, el vigilante no atiende los trabajos del CRM (la prueba se hace igual).")
    salida(f"Probando la conexión con el CRM: {config.url} (esta PC es «{WORKER}»)…")
    cliente = ClienteCRM(config.url, config.secreto, http=http)
    resp = cliente.reclamar(WORKER, version if version is not None else version_local(), solo_latido=True)
    if resp is None:
        salida(f"FALLÓ: {cliente.ultimo_error}.")
        return 1
    salida(f"OK: el CRM respondió y anotó el latido de esta PC (próxima consulta en {resp['proximo_s']:g} s).")
    return 0
