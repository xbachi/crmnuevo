#!/usr/bin/env python
"""Vigilante de fotos nuevas en 1_Ventas: cuando aparecen fotos en <coche>/fotos/ lanza publicar.py solo.

Uso: vigilar.py                        → bucle sin fin: revisa 1_Ventas cada --intervalo segundos
     vigilar.py --una-vez              → un solo ciclo (la primera vez solo registra el punto de partida)
     vigilar.py --ahora <ref|matrícula> → procesa ese coche ya mismo (sin esperas) y termina
     vigilar.py --estado               → tabla con el estado de cada carpeta
     vigilar.py --simular              → muestra qué haría, sin lanzar nada ni escribir archivos

Reglas: solo se publican solas las fotos que aparecen DESPUÉS de la primera ejecución (el punto de partida) y
cuando la carpeta fotos/ lleva --espera segundos sin cambios (las fotos se bajan por tandas). Un coche por ciclo.
Cada intento deja RESULTADO.txt en la carpeta del coche; el estado va en data/vigilar.json y el registro en
logs/vigilar.log. Un coche ya publicado nunca se vuelve a subir: sus fotos nuevas solo se ordenan (--solo-fotos).
inotify no funciona sobre /mnt/c (OneDrive), por eso se sondea.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import logging
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Callable

import fotos as fotos_mod
import locate
import report
from common import PROJECT_DIR

ESTADO_PATH = PROJECT_DIR / "data" / "vigilar.json"
LOCK_PATH = PROJECT_DIR / "data" / "vigilar.lock"
LOG_PATH = PROJECT_DIR / "logs" / "vigilar.log"
PYTHON = PROJECT_DIR.parent / ".venv" / "bin" / "python"
PUBLICAR = PROJECT_DIR / "publicar.py"
RESULTADO = "RESULTADO.txt"

INTERVALO, ESPERA, REINTENTO = 120, 180, 1800
TIMEOUT = 20 * 60
MAX_ERRORES = 5               # errores seguidos antes de abandonar la carpeta
MAX_CICLOS_OMITIDOS = 3       # ciclos de espera cuando hay archivos ilegibles (OneDrive sin descargar)
HISTORIAL = 3                 # intentos que conserva RESULTADO.txt
LATIDO = 3600                 # segundos entre líneas de "sigo vivo" en el log
LOG_BYTES, LOG_COPIAS = 1_000_000, 3
LINEAS_DETALLE = 15
PLACA_COMPLETA = 7            # matrícula completa (4 dígitos + 3 letras): se usa --matricula; si no, la referencia
EXIT_OK, EXIT_ERROR, EXIT_BLOQUEADO = 0, 1, 2

# estados de una carpeta en data/vigilar.json
PENDIENTE, PUBLICADO, YA_PUBLICADO = "pendiente", "publicado", "ya_publicado"
FALTA_HOJA, GOOGLE_AUTORIZAR, ERROR, ABANDONADO = "falta_hoja", "google_autorizar", "error", "abandonado"
FINALES = (PUBLICADO, YA_PUBLICADO)                 # el coche ya está en la web: fotos nuevas solo se ordenan
REINTENTAN = (FALTA_HOJA, GOOGLE_AUTORIZAR, ERROR)  # el reintento lo decide proximo_intento, no el plan de fotos
# resultados de una ejecución de publicar.py --solo-fotos
FOTOS_NORMALIZADAS, FOTOS_ERROR = "fotos_normalizadas", "fotos_error"

# acciones que decide el ciclo para una carpeta
ACC_PUBLICAR, ACC_SOLO_FOTOS, ACC_FIRMA, ACC_VISTA = "publicar", "solo_fotos", "firma", "vista"

# marcas en la salida de publicar.py que deciden el resultado
_RE_CREADO = re.compile(r"Producto (\d+) creado como (\w+): (\S+)")
MARCA_YA_REGISTRO = "Ya publicado según data/publicados.json"
MARCA_YA_WEB = "El coche ya existe en la web"
MARCA_FALTA_HOJA = "no está en la hoja Base_Datos"
MARCAS_GOOGLE = ("Please visit this URL", "Hace falta autorizar el acceso a Google")
MARCA_VERIFICAR = "== PARA VERIFICAR"
MARCA_LUNA = "Luna:"          # «Luna: precio1.jpg (12.) · … → <carpeta>/luna»: dónde quedaron las imágenes
_RE_URL = re.compile(r"https?://[^\s»)]+")
ORDEN_AUTORIZAR = "../.venv/bin/python verificar.py --probar-sheet"


# ------------------------------------------------------------------ utilidades
def hora(ts: float | None) -> str:
    return datetime.fromtimestamp(ts).strftime("%d/%m/%Y %H:%M") if ts else "-"


def _ignorado(nombre: str) -> bool:
    n = nombre.lower()
    return n.endswith(".tmp") or "zone.identifier" in n


def _archivos(fotos_dir: Path) -> list[Path]:
    try:
        return [p for p in Path(fotos_dir).iterdir() if p.is_file() and not _ignorado(p.name)]
    except OSError:                      # la carpeta desapareció (o OneDrive no responde) en mitad del ciclo
        return []


def calcular_firma(fotos_dir: Path) -> list[list]:
    """[nombre, tamaño, mtime_ns] de cada archivo de fotos/ (sin .tmp), ordenado: cambia si cambian las fotos."""
    out = []
    for p in _archivos(fotos_dir):
        try:
            st = p.stat()
        except OSError:
            continue
        out.append([p.name, st.st_size, st.st_mtime_ns])
    return sorted(out)


def ultima_modificacion(fotos_dir: Path) -> float:
    return max((p.stat().st_mtime for p in _archivos(fotos_dir) if p.exists()), default=0.0)


def nuevo_registro() -> dict:
    return {"estado": PENDIENTE, "intentos": 0, "errores": 0, "ultimo_intento": None, "proximo_intento": None,
            "firma": None, "firma_vista": None, "ciclos_omitidos": 0, "url": "", "historial": []}


def reiniciar(entry: dict) -> None:
    """Fotos nuevas tras abandonar: vuelve a contar desde cero (se conserva el historial)."""
    entry.update(estado=PENDIENTE, intentos=0, errores=0, proximo_intento=None, firma=None, firma_vista=None,
                 ciclos_omitidos=0)


def objetivo(folder: locate.CarFolder) -> list[str] | None:
    """Cómo se le nombra el coche a publicar.py: --matricula si el nombre trae la matrícula completa; si no,
    la referencia que implica el prefijo (82 → 1082). None si el nombre no da para identificarlo."""
    if folder.plate and len(folder.plate) >= PLACA_COMPLETA:
        return ["--matricula", folder.plate]
    ref = folder.ref_from_prefix()
    return [ref] if ref else None


def etiqueta(folder: locate.CarFolder) -> str:
    obj = objetivo(folder)
    return obj[-1] if obj else folder.name


def clasificar(rc: int, salida: str, solo_fotos: bool = False) -> tuple[str, str]:
    """(resultado, url) a partir del código de salida y la salida de publicar.py."""
    if any(m in salida for m in MARCAS_GOOGLE):
        return GOOGLE_AUTORIZAR, ""
    if solo_fotos:
        return (FOTOS_NORMALIZADAS, "") if rc == 0 else (FOTOS_ERROR, "")
    m = _RE_CREADO.search(salida)
    if rc == 0 and m:
        return PUBLICADO, m.group(3)
    for marca in (MARCA_YA_REGISTRO, MARCA_YA_WEB):
        for linea in salida.splitlines():
            if marca in linea:
                u = _RE_URL.search(linea)
                return YA_PUBLICADO, (u.group(0).rstrip(".") if u else "")
    if MARCA_FALTA_HOJA in salida:
        return FALTA_HOJA, ""
    return ERROR, ""


def bloque_verificar(salida: str) -> str:
    """El bloque «== PARA VERIFICAR» tal cual lo imprime publicar.py (hasta la primera línea en blanco)."""
    idx = salida.find(MARCA_VERIFICAR)
    if idx < 0:
        return ""
    lineas = []
    for linea in salida[idx:].splitlines():
        if lineas and not linea.strip():
            break
        lineas.append(linea.rstrip())
    return "\n".join(lineas)


def linea_luna(salida: str) -> str:
    """La línea «Luna: …» de publicar.py (las imágenes para la hoja de precios de la luna), o '' si no la hay."""
    for linea in salida.splitlines():
        if linea.startswith(MARCA_LUNA):
            return linea.strip()
    return ""


def ultimas_lineas(salida: str, n: int = LINEAS_DETALLE) -> str:
    lineas = [l.rstrip() for l in salida.splitlines() if l.strip()]
    return "\n".join(lineas[-n:])


def configurar_log(log_path: Path | None) -> logging.Logger:
    log = logging.getLogger("vigilar")
    log.setLevel(logging.INFO)
    for h in list(log.handlers):
        log.removeHandler(h)
        h.close()
    fmt = logging.Formatter("%(asctime)s %(message)s", "%d/%m/%Y %H:%M:%S")
    if log_path:
        Path(log_path).parent.mkdir(parents=True, exist_ok=True)
        fh = RotatingFileHandler(log_path, maxBytes=LOG_BYTES, backupCount=LOG_COPIAS, encoding="utf-8")
        fh.setFormatter(fmt)
        log.addHandler(fh)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(sh)
    return log


# ------------------------------------------------------------------ decisión por carpeta
@dataclass
class Decision:
    folder: locate.CarFolder
    accion: str | None = None
    motivo: str = ""
    firma: list = field(default_factory=list)
    fotos_dir: Path | None = None
    omitidos: list[str] = field(default_factory=list)
    visible: bool = False            # merece una línea en el log / en --simular
    reset: bool = False              # abandonado con fotos nuevas: se reinicia el contador
    esperar_omitidos: bool = False

    @property
    def lanza(self) -> bool:
        return self.accion in (ACC_PUBLICAR, ACC_SOLO_FOTOS)


@dataclass
class Resumen:
    primera_vez: bool = False
    decisiones: list[Decision] = field(default_factory=list)
    procesada: str | None = None
    resultado: str | None = None
    pendientes_previas: list[str] = field(default_factory=list)


@dataclass
class Vigilante:
    ventas_dir: Path = locate.DEFAULT_VENTAS_DIR
    estado_path: Path = ESTADO_PATH
    lock_path: Path = LOCK_PATH
    intervalo: int = INTERVALO
    espera: int = ESPERA
    reintento: int = REINTENTO
    python: Path = PYTHON
    publicar: Path = PUBLICAR
    timeout: int = TIMEOUT
    reloj: Callable[[], float] = field(default=time.time)
    log: logging.Logger = field(default_factory=lambda: logging.getLogger("vigilar"))
    _avisos: dict[str, str] = field(default_factory=dict, repr=False)
    _ultimo_latido: float | None = field(default=None, repr=False)
    _lock_fd = None

    # --------------------------------------------------------------- estado
    def cargar_estado(self) -> dict:
        try:
            data = json.loads(Path(self.estado_path).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        data.setdefault("inicio", None)
        data.setdefault("carpetas", {})
        return data

    def guardar_estado(self, estado: dict) -> None:
        path = Path(self.estado_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    def bloquear(self) -> bool:
        """Un solo vigilante a la vez (flock sobre data/vigilar.lock)."""
        Path(self.lock_path).parent.mkdir(parents=True, exist_ok=True)
        fd = open(self.lock_path, "a+")          # sin truncar: el pid del vigilante activo se conserva
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            fd.close()
            return False
        fd.seek(0)
        fd.truncate()
        fd.write(str(os.getpid()))
        fd.flush()
        self._lock_fd = fd
        return True

    def carpetas(self) -> list[locate.CarFolder]:
        """Las carpetas de coche que usa locate (raíz y grupos), sin vendidos ni «Coches R»."""
        return [f for f in locate.scan_folders(self.ventas_dir) if f.is_for_sale]

    # --------------------------------------------------------------- evaluación
    def tranquilo(self, fotos_dir: Path, now: float) -> bool:
        return now - ultima_modificacion(fotos_dir) >= self.espera

    def _plan(self, fotos_dir: Path) -> tuple[list, list[str]]:
        plan = fotos_mod.planificar_normalizacion(fotos_dir)
        pendientes = [it for it in plan if it.cambia]
        omitidos = [it.origen.name for it in plan if it.accion == fotos_mod.OMITIR]
        return pendientes, omitidos

    def _preparar(self, d: Decision, entry: dict, accion: str, omitidos: list[str], now: float) -> Decision:
        """Fotos listas para actuar: solo si la carpeta está en calma y no hay archivos ilegibles (o ya se esperó)."""
        if not self.tranquilo(d.fotos_dir, now):
            d.motivo, d.visible = "fotos nuevas: espero a que terminen de bajar", True
            return d
        if omitidos and entry.get("ciclos_omitidos", 0) < MAX_CICLOS_OMITIDOS:
            d.esperar_omitidos, d.visible = True, True
            d.motivo = (f"hay {len(omitidos)} archivo/s que no se pueden leer (¿sin descargar de OneDrive?): "
                        f"espero un ciclo más ({', '.join(omitidos[:3])})")
            return d
        d.accion, d.omitidos = accion, omitidos
        d.motivo = ("fotos nuevas en un coche ya publicado: solo se ordenan, no se vuelve a subir"
                    if accion == ACC_SOLO_FOTOS else "fotos nuevas: se lanza publicar.py")
        return d

    def evaluar(self, folder: locate.CarFolder, entry: dict, inicio: float | None, now: float) -> Decision:
        d = Decision(folder)
        fotos_dir = fotos_mod.carpeta_fotos(folder.path)
        if fotos_dir is None:
            d.motivo = "sin subcarpeta fotos/"
            return d
        d.fotos_dir, d.firma = fotos_dir, calcular_firma(fotos_dir)
        if objetivo(folder) is None:
            d.motivo = "el nombre de la carpeta no tiene ni prefijo numérico ni matrícula completa"
            return d
        estado = entry.get("estado", PENDIENTE)
        if estado in REINTENTAN:
            if now < (entry.get("proximo_intento") or 0):
                d.motivo = f"{estado}: reintento a las {hora(entry['proximo_intento'])}"
                return d
            if not self.tranquilo(fotos_dir, now):
                d.motivo, d.visible = "fotos recientes: espero a que terminen de bajar", True
                return d
            d.accion, d.motivo, d.visible = ACC_PUBLICAR, f"reintento tras {estado}", True
            return d
        if estado == ABANDONADO:
            if d.firma == entry.get("firma"):
                d.motivo = "abandonado: sin cambios en fotos/"
                return d
            d.reset, estado = True, PENDIENTE
        if estado in FINALES:
            if d.firma == entry.get("firma"):
                d.motivo = "sin cambios"
                return d
            if now < (entry.get("proximo_intento") or 0):
                d.motivo = f"fotos nuevas: reintento de ordenarlas a las {hora(entry['proximo_intento'])}"
                return d
            pendientes, omitidos = self._plan(fotos_dir)
            if not pendientes:
                d.accion, d.motivo = ACC_FIRMA, "fotos/ cambió pero ya está en orden"
                return d
            return self._preparar(d, entry, ACC_SOLO_FOTOS, omitidos, now)
        # pendiente (o abandonado con fotos nuevas)
        if not d.reset and d.firma == entry.get("firma_vista"):
            d.motivo = "sin cambios"
            return d
        pendientes, omitidos = self._plan(fotos_dir)
        if not pendientes:
            d.accion, d.motivo = ACC_VISTA, "fotos en orden"
            return d
        if inicio is not None and max(it.origen.stat().st_mtime for it in pendientes) <= inicio:
            d.accion, d.visible = ACC_VISTA, True
            d.motivo = (f"fotos pendientes anteriores al punto de partida: publicar a mano "
                        f"(publicar.py {' '.join(objetivo(folder))})")
            return d
        return self._preparar(d, entry, ACC_PUBLICAR, omitidos, now)

    # --------------------------------------------------------------- ciclo
    def _avisar(self, clave: str, folder: locate.CarFolder, motivo: str) -> None:
        """Una línea en el log por carpeta y motivo; no se repite en cada ciclo."""
        if self._avisos.get(clave) != motivo:
            self._avisos[clave] = motivo
            self.log.info("%s: %s", folder.name, motivo)

    def _primera_vez(self, estado: dict, folders: list[locate.CarFolder], now: float, simular: bool) -> Resumen:
        res = Resumen(primera_vez=True)
        previas = []
        for folder in folders:
            fotos_dir = fotos_mod.carpeta_fotos(folder.path)
            if fotos_dir is not None and self._plan(fotos_dir)[0]:
                previas.append(folder)
                res.pendientes_previas.append(folder.name)
        if simular:
            self.log.info("Simulación: primera ejecución, solo se registraría el punto de partida (%s).", hora(now))
        else:
            estado["inicio"] = now
            self.guardar_estado(estado)
            self.log.info("Primera ejecución: punto de partida registrado (%s). De ahora en más solo se publican solas "
                          "las fotos que aparezcan después. Carpetas con fotos pendientes de antes: %d.",
                          hora(now), len(previas))
        for folder in previas:
            self.log.info("  ya tenía fotos pendientes (no se publica sola): %s → publicar.py %s",
                          folder.name, " ".join(objetivo(folder) or [folder.name]))
        return res

    def ciclo(self, simular: bool = False) -> Resumen:
        now = self.reloj()
        estado = self.cargar_estado()
        folders = self.carpetas()
        if estado["inicio"] is None:
            return self._primera_vez(estado, folders, now, simular)
        carpetas = estado["carpetas"]
        res = Resumen()
        cambios, lanzada = False, False
        for folder in folders:
            clave = str(folder.path)
            entry = carpetas.get(clave) or nuevo_registro()
            d = self.evaluar(folder, entry, estado["inicio"], now)
            if d.fotos_dir is None:
                continue
            res.decisiones.append(d)
            if simular:
                continue
            tocada = d.reset or d.esperar_omitidos or d.accion is not None
            if d.reset:
                reiniciar(entry)
            if d.esperar_omitidos:
                entry["ciclos_omitidos"] = entry.get("ciclos_omitidos", 0) + 1
            if d.accion == ACC_FIRMA:
                entry["firma"] = d.firma
            elif d.accion == ACC_VISTA:
                entry["firma_vista"] = d.firma
            elif d.lanza:
                if lanzada:
                    d.visible, d.motivo = True, "en cola: este ciclo se procesa otro coche"
                    tocada = d.reset or d.esperar_omitidos
                else:
                    res.procesada, res.resultado = folder.name, self.procesar(folder, entry, d, now)
                    lanzada = True
            if d.visible:
                self._avisar(clave, folder, d.motivo)
            if tocada:
                carpetas[clave] = entry
                cambios = True
        for clave in [k for k in carpetas if not Path(k).is_dir()]:
            del carpetas[clave]
            cambios = True
        if cambios and not simular:
            self.guardar_estado(estado)
        if not lanzada and not simular:
            self._latido(now, len(res.decisiones))
        return res

    def _latido(self, now: float, n: int) -> None:
        if self._ultimo_latido is None:
            self._ultimo_latido = now
        elif now - self._ultimo_latido >= LATIDO:
            self._ultimo_latido = now
            self.log.info("sigo vigilando: %d carpetas con fotos/ revisadas, nada que hacer", n)

    # --------------------------------------------------------------- ejecución de publicar.py
    def comando(self, folder: locate.CarFolder, solo_fotos: bool) -> list[str]:
        cmd = [str(self.python), str(self.publicar), *objetivo(folder), "--si", "--ventas-dir", str(self.ventas_dir)]
        if solo_fotos:
            cmd.append("--solo-fotos")
        return cmd

    def ejecutar(self, cmd: list[str]) -> tuple[int, str]:
        env = dict(os.environ, FICHAS_NO_BROWSER="1", NO_COLOR="1", PYTHONIOENCODING="utf-8")
        try:
            proc = subprocess.run(cmd, cwd=str(PROJECT_DIR), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
                                  timeout=self.timeout, env=env)
            return proc.returncode, proc.stdout or ""
        except subprocess.TimeoutExpired as exc:
            salida = exc.output.decode("utf-8", "replace") if isinstance(exc.output, bytes) else (exc.output or "")
            return -1, f"{salida}\n(tiempo agotado: publicar.py no terminó en {self.timeout // 60} minutos)"
        except OSError as exc:
            return -1, f"(no se pudo lanzar publicar.py: {exc})"

    def procesar(self, folder: locate.CarFolder, entry: dict, d: Decision, now: float) -> str:
        solo = d.accion == ACC_SOLO_FOTOS
        cmd = self.comando(folder, solo)
        self.log.info("%s: lanzando publicar.py %s", folder.name, " ".join(cmd[2:]))
        rc, salida = self.ejecutar(cmd)
        resultado, url = clasificar(rc, salida, solo)
        etiq = self.aplicar(entry, resultado, url, now, calcular_firma(d.fotos_dir))
        que_paso, proximo = self.explicar(etiq, entry, folder, resultado)
        entry["historial"] = ([{"fecha": hora(now), "resultado": etiq, "resumen": que_paso}]
                              + entry.get("historial", []))[:HISTORIAL]
        texto = self.texto_resultado(folder, entry, etiq, que_paso, proximo, salida, d.omitidos)
        try:
            (folder.path / RESULTADO).write_text(texto, encoding="utf-8")
        except OSError as exc:
            self.log.info("%s: no se pudo escribir %s (%s)", folder.name, RESULTADO, exc)
        self.log.info("%s: %s (código %s) — %s", folder.name, etiq, rc, que_paso)
        return etiq

    def aplicar(self, entry: dict, resultado: str, url: str, now: float, firma_post: list) -> str:
        """Actualiza el registro de la carpeta según el resultado; devuelve la etiqueta final (p. ej. abandonado)."""
        entry["intentos"] = entry.get("intentos", 0) + 1
        entry["ultimo_intento"] = now
        entry["ciclos_omitidos"] = 0
        entry["firma_vista"] = None
        if resultado == FOTOS_NORMALIZADAS:
            entry.update(errores=0, proximo_intento=None, firma=firma_post)
        elif resultado == FOTOS_ERROR:
            entry["errores"] = entry.get("errores", 0) + 1
            if entry["errores"] >= MAX_ERRORES:          # se deja de intentar hasta que cambien las fotos
                entry.update(proximo_intento=None, firma=firma_post)
            else:
                entry["proximo_intento"] = now + self.reintento
        elif resultado in FINALES:
            entry.update(estado=resultado, errores=0, proximo_intento=None, firma=firma_post, url=url or entry.get("url", ""))
        elif resultado in (FALTA_HOJA, GOOGLE_AUTORIZAR):
            entry.update(estado=resultado, errores=0, proximo_intento=now + self.reintento)
        else:
            entry["errores"] = entry.get("errores", 0) + 1
            if entry["errores"] >= MAX_ERRORES:
                entry.update(estado=ABANDONADO, proximo_intento=None, firma=firma_post)
                return ABANDONADO
            entry.update(estado=ERROR, proximo_intento=now + self.reintento)
        return resultado

    # --------------------------------------------------------------- RESULTADO.txt
    def explicar(self, etiq: str, entry: dict, folder: locate.CarFolder, resultado: str) -> tuple[str, str]:
        """(qué pasó, próximo paso) en castellano llano para quien no programa."""
        minutos = max(1, self.reintento // 60)
        ident = etiqueta(folder)
        mando = f"../.venv/bin/python publicar.py {' '.join(objetivo(folder) or [ident])}"
        if etiq == PUBLICADO:
            return ("Se creó el borrador del coche en la web (sevencars.es).",
                    "Revisar el borrador en WordPress (enlace de arriba), completar lo que falte y publicarlo cuando esté bien.")
        if etiq == YA_PUBLICADO:
            return ("El coche ya estaba en la web: no se subió nada nuevo.",
                    "Si hay que cambiar algo del anuncio, hacerlo en WordPress (enlace de arriba).")
        if etiq == FOTOS_NORMALIZADAS:
            return ("Había fotos nuevas en fotos/ y se dejaron ordenadas (1.jpg…N.jpg). El coche ya estaba publicado, "
                    "así que NO se volvió a subir a la web.",
                    "Si esas fotos tienen que aparecer en el anuncio, subirlas a mano en WordPress.")
        if etiq == FOTOS_ERROR:
            reintenta = entry.get("proximo_intento") is not None
            nota = f" Hace falta autorizar Google: ejecutar en la terminal {ORDEN_AUTORIZAR}." if resultado == GOOGLE_AUTORIZAR else ""
            return ("Había fotos nuevas en fotos/ pero no se pudieron ordenar (el coche ya estaba publicado; la web no se toca)." + nota,
                    (f"Vuelvo a intentar en {minutos} min." if reintenta else "Dejo de intentar hasta que cambien las fotos.")
                    + f" Para ordenarlas a mano: {mando} --solo-fotos")
        if etiq == FALTA_HOJA:
            return (f"El coche no está cargado en la hoja Base_Datos (no encuentro {ident}).",
                    f"Cargar el coche en la hoja Base_Datos. Vuelvo a intentar en {minutos} min y sigo intentando hasta que aparezca.")
        if etiq == GOOGLE_AUTORIZAR:
            return ("Hace falta volver a autorizar el acceso a Google: la autorización caducó y no puedo leer la hoja.",
                    f"En la terminal de Ubuntu, dentro de sevencars-fichas, ejecutar: {ORDEN_AUTORIZAR} y completar el inicio "
                    f"de sesión en el navegador. Vuelvo a intentar en {minutos} min.")
        if etiq == ABANDONADO:
            return (f"La publicación falló {MAX_ERRORES} veces seguidas: dejo de intentar hasta que cambien las fotos de fotos/.",
                    f"Revisar el detalle de abajo, corregir lo que haga falta y lanzar a mano: {mando}  "
                    f"(o ../.venv/bin/python vigilar.py --ahora {ident}).")
        return (f"La publicación falló (intento {entry.get('errores', 1)} de {MAX_ERRORES}).",
                f"Vuelvo a intentar en {minutos} min. Si sigue fallando, revisar el detalle de abajo.")

    def texto_resultado(self, folder: locate.CarFolder, entry: dict, etiq: str, que_paso: str, proximo: str,
                        salida: str, omitidos: list[str]) -> str:
        partes = ["RESULTADO DEL VIGILANTE AUTOMÁTICO", f"Coche: {folder.name}",
                  f"Fecha: {hora(entry.get('ultimo_intento'))}", "", "QUÉ PASÓ", que_paso]
        url = entry.get("url") if etiq in FINALES else ""
        if url:
            partes.append(f"Enlace: {url}")
        luna = linea_luna(salida)
        if luna:
            partes.append(luna)
        bloque = bloque_verificar(salida)
        if bloque:
            partes += ["", bloque]
        partes += ["", "PRÓXIMO PASO", proximo]
        if omitidos:
            partes += ["", f"Nota: {len(omitidos)} archivo/s de fotos/ no se pudieron leer (¿sin descargar de OneDrive?) "
                           f"y se dejaron como estaban: {', '.join(omitidos)}."]
        if etiq in (ERROR, ABANDONADO, FOTOS_ERROR, GOOGLE_AUTORIZAR, FALTA_HOJA):
            partes += ["", "DETALLE (últimas líneas de publicar.py)", ultimas_lineas(salida) or "(sin salida)"]
        partes += ["", "-" * 60, f"HISTORIAL (últimos {HISTORIAL} intentos)"]
        for h in entry.get("historial", []):
            partes.append(f"{h['fecha']}  {h['resultado']:<18} {h['resumen']}")
        return "\n".join(partes) + "\n"

    # --------------------------------------------------------------- modos
    def ahora(self, pedido: str) -> int:
        """Procesa un coche ya mismo (sin punto de partida, espera ni reintento pendiente) y termina."""
        folders = self.carpetas()
        plate = locate.plate_from_name(pedido)
        loc = locate.locate(folders, plate=plate) if plate else locate.locate(folders, ref=locate.canonical_ref(pedido))
        if not loc.found:
            self.log.info("No encuentro la carpeta de «%s» en %s (%s).", pedido, self.ventas_dir, loc.describe())
            return EXIT_ERROR
        folder = loc.folder
        fotos_dir = fotos_mod.carpeta_fotos(folder.path)
        if fotos_dir is None:
            self.log.info("%s: %s", folder.name, fotos_mod.AVISO_SIN_CARPETA)
            return EXIT_ERROR
        estado = self.cargar_estado()
        clave = str(folder.path)
        entry = estado["carpetas"].get(clave) or nuevo_registro()
        if entry.get("estado") == ABANDONADO:
            reiniciar(entry)
        solo = entry.get("estado") in FINALES
        d = Decision(folder, ACC_SOLO_FOTOS if solo else ACC_PUBLICAR, fotos_dir=fotos_dir, firma=calcular_firma(fotos_dir))
        d.omitidos = self._plan(fotos_dir)[1]
        res = self.procesar(folder, entry, d, self.reloj())
        estado["carpetas"][clave] = entry
        self.guardar_estado(estado)
        return EXIT_OK if res in (PUBLICADO, YA_PUBLICADO, FOTOS_NORMALIZADAS) else EXIT_ERROR

    def simular(self) -> int:
        res = self.ciclo(simular=True)
        if res.primera_vez:
            return EXIT_OK
        lanzaria = next((d for d in res.decisiones if d.lanza), None)
        for d in res.decisiones:
            if d.lanza or d.visible:
                print(f"  {d.folder.name}: {d.motivo}")
        if lanzaria:
            print(f"Se lanzaría ahora: publicar.py {' '.join(self.comando(lanzaria.folder, lanzaria.accion == ACC_SOLO_FOTOS)[2:])}")
        else:
            print("No se lanzaría nada en este ciclo.")
        print(f"Simulación: {len(res.decisiones)} carpetas con fotos/ revisadas; no se escribió nada.")
        return EXIT_OK

    def tabla_estado(self) -> int:
        estado = self.cargar_estado()
        if estado["inicio"] is None:
            print("Sin estado todavía: el vigilante no se ejecutó nunca (la primera ejecución registra el punto de partida).")
            return EXIT_OK
        print(f"Punto de partida: {hora(estado['inicio'])}  ·  estado en {self.estado_path}")
        filas = []
        tranquilas = 0
        for clave, e in sorted(estado["carpetas"].items(), key=lambda kv: Path(kv[0]).name.lower()):
            if e.get("estado", PENDIENTE) == PENDIENTE and not e.get("intentos"):
                tranquilas += 1
                continue
            filas.append([Path(clave).name, e.get("estado", "-"), str(e.get("intentos", 0)),
                          hora(e.get("ultimo_intento")), hora(e.get("proximo_intento"))])
        if filas:
            report.print_table(["Carpeta", "Estado", "Intentos", "Último intento", "Próximo intento"], filas,
                               [40, 16, 8, 16, 16])
        else:
            print("Ninguna carpeta con intentos registrados.")
        print(f"{tranquilas} carpeta/s más sin novedades.")
        return EXIT_OK

    def bucle(self) -> int:
        self.log.info("Vigilante en marcha: %s cada %d s (espera %d s, reintento %d s).",
                      self.ventas_dir, self.intervalo, self.espera, self.reintento)
        while True:
            try:
                self.ciclo()
            except FileNotFoundError as exc:
                self._avisar("__ventas__", locate.CarFolder(Path(self.ventas_dir), ""), f"{exc} (¿OneDrive sin montar?)")
            except Exception:
                self.log.exception("Error inesperado en el ciclo; sigo vigilando")
            time.sleep(self.intervalo)


# ------------------------------------------------------------------ CLI
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="vigilar.py",
                                description="Vigila 1_Ventas y lanza publicar.py cuando aparecen fotos nuevas en fotos/")
    p.add_argument("--una-vez", action="store_true", help="un solo ciclo y salir (la primera vez solo registra el punto de partida)")
    p.add_argument("--ahora", metavar="REF|MATRÍCULA", help="procesar ese coche ya mismo, sin esperas, y salir")
    p.add_argument("--estado", action="store_true", help="mostrar el estado de cada carpeta y salir")
    p.add_argument("--simular", action="store_true", help="mostrar qué se haría en este ciclo sin lanzar nada ni escribir")
    p.add_argument("--intervalo", type=int, default=INTERVALO, help=f"segundos entre revisiones (por defecto {INTERVALO})")
    p.add_argument("--espera", type=int, default=ESPERA,
                   help=f"segundos sin cambios en fotos/ antes de actuar (por defecto {ESPERA})")
    p.add_argument("--reintento", type=int, default=REINTENTO,
                   help=f"segundos hasta el siguiente intento cuando algo falla (por defecto {REINTENTO})")
    p.add_argument("--ventas-dir", default=str(locate.DEFAULT_VENTAS_DIR), help="carpeta 1_Ventas de OneDrive")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    escribe = not (args.estado or args.simular)
    log = configurar_log(LOG_PATH if escribe else None)
    vig = Vigilante(ventas_dir=Path(args.ventas_dir), estado_path=ESTADO_PATH, lock_path=LOCK_PATH,
                    intervalo=args.intervalo, espera=args.espera, reintento=args.reintento, log=log)
    if args.estado:
        return vig.tabla_estado()
    try:
        if args.simular:
            return vig.simular()
        if not vig.bloquear():
            log.info("Ya hay un vigilante en marcha (%s): no se lanza otro.", LOCK_PATH)
            return EXIT_BLOQUEADO
        if args.ahora:
            return vig.ahora(args.ahora)
        if args.una_vez:
            vig.ciclo()
            return EXIT_OK
        return vig.bucle()
    except FileNotFoundError as exc:
        log.info("%s", exc)
        return EXIT_ERROR
    except KeyboardInterrupt:
        log.info("Vigilante detenido.")
        return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
