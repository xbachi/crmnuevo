"""Avisos por mail (los usa el vigilante): SMTP con SSL si el puerto es 465 y STARTTLS en cualquier otro, texto plano UTF-8.

Configuración, por variables de entorno o en sevencars-fichas/.env (y, si AVISOS_ENV_FILE apunta a otro archivo,
también de ese; el primero que la defina gana y el entorno real manda sobre los archivos):
  SMTP_HOST, SMTP_PORT (465 por defecto), SMTP_USER, SMTP_PASS, SMTP_FROM (SMTP_USER si falta), SMTP_FROMNAME,
  AVISOS_TO (uno o varios, separados por coma), AVISOS_BORRADOR (1: avisar también de cada borrador creado),
  AVISOS_ACTIVOS (1: 0 apaga todos los avisos).
Un mail nunca tumba al que lo manda: sin configuración se anota una sola vez en el log y, si el envío falla, se
anota el fallo y se sigue.
"""
from __future__ import annotations

import logging
import os
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from typing import Callable, Mapping

from common import PROJECT_DIR

ENV_PATH = PROJECT_DIR / ".env"
VARIABLES = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "SMTP_FROMNAME", "AVISOS_TO",
             "AVISOS_BORRADOR", "AVISOS_ACTIVOS")
OBLIGATORIAS = ("SMTP_HOST", "SMTP_USER", "SMTP_PASS", "AVISOS_TO")
PUERTO_SSL = 465
TIMEOUT = 30
PREFIJO = "[Sevencars]"
_NO = ("0", "no", "false", "off")


def _archivos_env(environ: Mapping[str, str], env_path: Path) -> list[Path]:
    """sevencars-fichas/.env y el de AVISOS_ENV_FILE (del entorno o del propio .env), en ese orden."""
    from dotenv import dotenv_values
    archivos = [Path(env_path)]
    extra = environ.get("AVISOS_ENV_FILE")
    if not extra and Path(env_path).is_file():
        try:
            extra = dotenv_values(env_path).get("AVISOS_ENV_FILE")
        except OSError:
            extra = None
    if extra and Path(extra).expanduser() != Path(env_path):
        archivos.append(Path(extra).expanduser())
    return archivos


def leer_variables(environ: Mapping[str, str] | None = None, env_path: Path | None = None) -> tuple[dict, list[str]]:
    """({variable: valor} de las de VARIABLES, avisos sobre archivos que no se pudieron leer). Nunca lanza."""
    from dotenv import dotenv_values
    environ = os.environ if environ is None else environ
    valores: dict[str, str] = {}
    problemas: list[str] = []
    for archivo in _archivos_env(environ, ENV_PATH if env_path is None else env_path):
        if not archivo.is_file():
            continue
        try:
            leidos = dotenv_values(archivo)
        except (OSError, UnicodeError) as exc:
            problemas.append(f"no se pudo leer {archivo} ({type(exc).__name__})")
            continue
        for k in VARIABLES:
            if k not in valores and leidos.get(k):
                valores[k] = leidos[k].strip()
    for k in VARIABLES:
        if environ.get(k):
            valores[k] = environ[k].strip()
    return valores, problemas


def _si(valor: str | None, defecto: bool = True) -> bool:
    return defecto if not valor else valor.strip().lower() not in _NO


@dataclass
class Config:
    host: str = ""
    port: int = PUERTO_SSL
    user: str = ""
    password: str = field(default="", repr=False)
    remitente: str = ""
    nombre: str = ""
    destinatarios: list[str] = field(default_factory=list)
    borrador: bool = True
    activos: bool = True
    faltan: list[str] = field(default_factory=list)
    problemas: list[str] = field(default_factory=list)

    @classmethod
    def cargar(cls, environ: Mapping[str, str] | None = None, env_path: Path | None = None) -> "Config":
        v, problemas = leer_variables(environ, env_path)
        faltan = [k for k in OBLIGATORIAS if not v.get(k)]
        try:
            port = int(v.get("SMTP_PORT") or PUERTO_SSL)
        except ValueError:
            port = PUERTO_SSL
            faltan.append("SMTP_PORT (no es un número)")
        destinatarios = [d.strip() for d in (v.get("AVISOS_TO") or "").split(",") if d.strip()]
        if v.get("AVISOS_TO") and not destinatarios:
            faltan.append("AVISOS_TO")
        return cls(host=v.get("SMTP_HOST", ""), port=port, user=v.get("SMTP_USER", ""), password=v.get("SMTP_PASS", ""),
                   remitente=v.get("SMTP_FROM") or v.get("SMTP_USER", ""), nombre=v.get("SMTP_FROMNAME", ""),
                   destinatarios=destinatarios, borrador=_si(v.get("AVISOS_BORRADOR")),
                   activos=_si(v.get("AVISOS_ACTIVOS")), faltan=faltan, problemas=problemas)

    @property
    def completa(self) -> bool:
        return not self.faltan

    def describir(self) -> str:
        """Servidor, usuario y destinatarios, sin la contraseña."""
        modo = "SSL" if self.port == PUERTO_SSL else "STARTTLS"
        return (f"servidor {self.host}:{self.port} ({modo}), usuario {self.user}, remitente {self.remitente}, "
                f"para {', '.join(self.destinatarios)}")


def asunto(titulo: str, resumen: str) -> str:
    return f"{PREFIJO} {titulo}: {resumen}"


def mensaje(config: Config, asunto_: str, cuerpo: str) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = asunto_
    msg["From"] = formataddr((config.nombre, config.remitente)) if config.nombre else config.remitente
    msg["To"] = ", ".join(config.destinatarios)
    msg.set_content(cuerpo, charset="utf-8")
    return msg


def enviar(config: Config, asunto_: str, cuerpo: str) -> None:
    """Manda el mail. Lanza si falla (red, autenticación…): quien llama decide qué hacer."""
    msg = mensaje(config, asunto_, cuerpo)
    ctx = ssl.create_default_context()
    if config.port == PUERTO_SSL:
        with smtplib.SMTP_SSL(config.host, config.port, context=ctx, timeout=TIMEOUT) as s:
            s.login(config.user, config.password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(config.host, config.port, timeout=TIMEOUT) as s:
            s.starttls(context=ctx)
            s.login(config.user, config.password)
            s.send_message(msg)


def describir_error(exc: BaseException, config: Config) -> str:
    texto = f"{type(exc).__name__}: {exc}"
    return texto.replace(config.password, "****") if config.password else texto


class Avisador:
    """Envío tolerante a fallos: `enviar` devuelve True si el mail salió y nunca lanza."""

    def __init__(self, log: logging.Logger | None = None,
                 cargar: Callable[[], Config] = Config.cargar):
        self.log = log or logging.getLogger("vigilar")
        self._cargar = cargar
        self._aviso_config = False

    def config(self) -> Config:
        """La configuración actual (se relee en cada uso: un cambio en .env vale sin reiniciar)."""
        try:
            return self._cargar()
        except Exception as exc:                      # p. ej. python-dotenv ausente: sin avisos, pero sin caerse
            return Config(faltan=[f"configuración ilegible ({type(exc).__name__})"])

    def comprobar(self, config: Config | None = None) -> bool:
        """True si se pueden mandar avisos. Si no, lo anota en el log una sola vez por ejecución."""
        config = config or self.config()
        if config.activos and config.completa:
            return True
        if not self._aviso_config:
            self._aviso_config = True
            if not config.activos:
                self.log.info("Avisos por mail desactivados (AVISOS_ACTIVOS=0).")
            else:
                extra = f"; {'; '.join(config.problemas)}" if config.problemas else ""
                self.log.warning("Avisos por mail sin configurar: faltan %s (en %s o en el entorno%s). Sigo sin "
                                 "mandar mails.", ", ".join(config.faltan), ENV_PATH, extra)
        return False

    def enviar(self, asunto_: str, cuerpo: str) -> bool:
        config = self.config()
        if not self.comprobar(config):
            return False
        try:
            enviar(config, asunto_, cuerpo)
        except Exception as exc:
            self.log.warning("No se pudo mandar el aviso por mail «%s» (%s).", asunto_, describir_error(exc, config))
            return False
        self.log.info("Aviso por mail enviado: %s", asunto_)
        return True


def probar(salida: Callable[[str], None] = print, config: Config | None = None) -> int:
    """`vigilar.py --probar-mail`: manda un mail de prueba y dice claramente qué pasó. 0 si salió, 1 si no."""
    try:
        config = config or Config.cargar()
    except Exception as exc:
        salida(f"No se pudo leer la configuración de avisos ({type(exc).__name__}: {exc}).")
        return 1
    for p in config.problemas:
        salida(f"Ojo: {p}.")
    if not config.completa:
        salida(f"Faltan variables para los avisos por mail: {', '.join(config.faltan)}.")
        salida(f"Cargalas en {ENV_PATH} (ver .env.example) o en el entorno y volvé a probar.")
        return 1
    if not config.activos:
        salida("Ojo: AVISOS_ACTIVOS=0, el vigilante no manda avisos (la prueba se manda igual).")
    salida(f"Mandando mail de prueba: {config.describir()}…")
    cuerpo = ("Mail de prueba del vigilante de Sevencars (vigilar.py --probar-mail).\n\n"
              "Si te llegó, los avisos por mail están bien configurados: el vigilante va a escribir a esta dirección "
              "cuando un coche necesite atención (borrador listo, error, falta en la hoja, autorizar Google…).\n")
    try:
        enviar(config, asunto("Vigilante", "mail de prueba"), cuerpo)
    except Exception as exc:
        salida(f"FALLÓ el envío: {describir_error(exc, config)}")
        if isinstance(exc, smtplib.SMTPAuthenticationError):
            salida("El servidor rechazó el usuario o la contraseña (SMTP_USER / SMTP_PASS).")
        return 1
    salida("Mail de prueba enviado. Revisá la bandeja de entrada (y la de spam).")
    return 0
