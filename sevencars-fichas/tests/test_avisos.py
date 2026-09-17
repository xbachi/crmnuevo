"""avisos.py: configuración desde .env/entorno y envío SMTP, siempre con smtplib doblado (nunca se manda nada real)."""
import logging
import smtplib

import pytest

import avisos

CONFIG = {"SMTP_HOST": "smtp.ejemplo.test", "SMTP_PORT": "465", "SMTP_USER": "vigilante@ejemplo.test",
          "SMTP_PASS": "clave-secreta-123", "AVISOS_TO": "duenio@ejemplo.test"}


class Buzon:
    """smtplib.SMTP y SMTP_SSL doblados: guarda conexiones, logins y mensajes; `falla` hace fallar el login."""

    def __init__(self):
        self.conexiones, self.logins, self.enviados = [], [], []
        self.falla: BaseException | None = None

    def clase(self, ssl_: bool):
        buzon = self

        class Conexion:
            def __init__(self, host, port, **kw):
                self.tls = False
                buzon.conexiones.append({"ssl": ssl_, "host": host, "port": port, **kw})

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def starttls(self, context=None):
                self.tls = True
                buzon.conexiones[-1]["starttls"] = True

            def login(self, user, password):
                if buzon.falla is not None:
                    raise buzon.falla
                buzon.logins.append((user, password))

            def send_message(self, msg):
                buzon.enviados.append(msg)

        return Conexion

    @property
    def asuntos(self) -> list[str]:
        return [m["Subject"] for m in self.enviados]


def instalar_buzon(monkeypatch, tmp_path) -> Buzon:
    """Sin .env real ni variables del entorno, y smtplib doblado."""
    monkeypatch.setattr(avisos, "ENV_PATH", tmp_path / "no-existe.env")
    for k in avisos.VARIABLES + ("AVISOS_ENV_FILE",):
        monkeypatch.delenv(k, raising=False)
    buzon = Buzon()
    monkeypatch.setattr(avisos.smtplib, "SMTP", buzon.clase(False))
    monkeypatch.setattr(avisos.smtplib, "SMTP_SSL", buzon.clase(True))
    return buzon


@pytest.fixture(autouse=True)
def buzon(monkeypatch, tmp_path):
    return instalar_buzon(monkeypatch, tmp_path)


def configurar(monkeypatch, **over):
    for k, v in {**CONFIG, **over}.items():
        monkeypatch.setenv(k, v)


# ---------------------------------------------------------------- configuración
def test_config_desde_env_del_proyecto_y_el_entorno_manda(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text("SMTP_HOST=smtp.archivo.test\nSMTP_PORT=587\nSMTP_USER=u@archivo.test\nSMTP_PASS=x\n"
                   "AVISOS_TO=a@x.test, b@x.test ,\nAVISOS_BORRADOR=0\nOTRA=1\n", encoding="utf-8")
    monkeypatch.setattr(avisos, "ENV_PATH", env)
    monkeypatch.setenv("SMTP_HOST", "smtp.entorno.test")
    c = avisos.Config.cargar()
    assert c.completa and c.host == "smtp.entorno.test" and c.port == 587 and c.user == "u@archivo.test"
    assert c.destinatarios == ["a@x.test", "b@x.test"] and c.remitente == "u@archivo.test"
    assert c.borrador is False and c.activos is True and "password" not in repr(c)


def test_config_avisos_env_file_completa_lo_que_falta(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text(f"SMTP_HOST=smtp.proyecto.test\nAVISOS_ENV_FILE={tmp_path / 'otro.env'}\n", encoding="utf-8")
    (tmp_path / "otro.env").write_text("SMTP_HOST=smtp.otro.test\nSMTP_USER=u@otro.test\nSMTP_PASS=p\n"
                                       "AVISOS_TO=d@otro.test\nSMTP_FROM=avisos@otro.test\nSMTP_FROMNAME=Vigilante\n"
                                       "AVISOS_ACTIVOS=0\n", encoding="utf-8")
    monkeypatch.setattr(avisos, "ENV_PATH", env)
    c = avisos.Config.cargar()
    assert c.completa and c.host == "smtp.proyecto.test" and c.user == "u@otro.test" and c.port == 465
    assert c.remitente == "avisos@otro.test" and c.nombre == "Vigilante" and c.activos is False
    # AVISOS_ENV_FILE también vale desde el entorno
    monkeypatch.setattr(avisos, "ENV_PATH", tmp_path / "no-existe.env")
    monkeypatch.setenv("AVISOS_ENV_FILE", str(tmp_path / "otro.env"))
    assert avisos.Config.cargar().host == "smtp.otro.test"


def test_config_incompleta(monkeypatch):
    c = avisos.Config.cargar()
    assert not c.completa and c.faltan == ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "AVISOS_TO"]
    configurar(monkeypatch, SMTP_PORT="abc", AVISOS_TO=" , ")
    assert avisos.Config.cargar().faltan == ["SMTP_PORT (no es un número)", "AVISOS_TO"]


# ---------------------------------------------------------------- envío
def test_enviar_ssl_en_465(monkeypatch, buzon):
    configurar(monkeypatch, SMTP_FROMNAME="Vigilante Sevencars", AVISOS_TO="a@x.test,b@x.test")
    avisos.enviar(avisos.Config.cargar(), avisos.asunto("82-Kia", "borrador listo"), "Qué pasó: ñandú €\n")
    assert buzon.conexiones == [{"ssl": True, "host": "smtp.ejemplo.test", "port": 465,
                                 "context": buzon.conexiones[0]["context"], "timeout": avisos.TIMEOUT}]
    assert buzon.logins == [("vigilante@ejemplo.test", "clave-secreta-123")]
    msg = buzon.enviados[0]
    assert msg["Subject"] == "[Sevencars] 82-Kia: borrador listo" and msg["To"] == "a@x.test, b@x.test"
    assert msg["From"] == "Vigilante Sevencars <vigilante@ejemplo.test>"
    assert msg.get_content_type() == "text/plain" and msg.get_content_charset() == "utf-8"
    assert msg.get_content() == "Qué pasó: ñandú €\n"


def test_enviar_starttls_en_otro_puerto(monkeypatch, buzon):
    configurar(monkeypatch, SMTP_PORT="587")
    avisos.enviar(avisos.Config.cargar(), "asunto", "cuerpo")
    assert buzon.conexiones[0]["ssl"] is False and buzon.conexiones[0]["port"] == 587
    assert buzon.conexiones[0]["starttls"] is True and len(buzon.enviados) == 1


def test_avisador_sin_config_avisa_una_vez_y_no_manda(buzon, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    av = avisos.Avisador(logging.getLogger("vigilar"))
    assert [av.enviar("a", "b") for _ in range(3)] == [False, False, False]
    assert buzon.conexiones == [] and caplog.text.count("Avisos por mail sin configurar") == 1
    assert "SMTP_HOST" in caplog.text


def test_avisador_desactivado(monkeypatch, buzon, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    configurar(monkeypatch, AVISOS_ACTIVOS="0")
    av = avisos.Avisador(logging.getLogger("vigilar"))
    assert av.enviar("a", "b") is False and av.enviar("a", "b") is False and buzon.conexiones == []
    assert caplog.text.count("desactivados") == 1


def test_avisador_fallo_smtp_no_lanza_ni_muestra_la_clave(monkeypatch, buzon, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    configurar(monkeypatch)
    buzon.falla = smtplib.SMTPAuthenticationError(535, b"bad credentials clave-secreta-123")
    av = avisos.Avisador(logging.getLogger("vigilar"))
    assert av.enviar("[Sevencars] x: y", "cuerpo") is False
    assert "No se pudo mandar el aviso" in caplog.text and "clave-secreta-123" not in caplog.text
    buzon.falla = OSError("red caída")
    assert av.enviar("otro", "cuerpo") is False and "red caída" in caplog.text
    buzon.falla = None
    assert av.enviar("ahora sí", "cuerpo") is True and buzon.asuntos == ["ahora sí"]


# ---------------------------------------------------------------- --probar-mail
def test_probar_sin_config(buzon):
    lineas = []
    assert avisos.probar(lineas.append) == 1
    texto = "\n".join(lineas)
    assert "Faltan variables" in texto and "SMTP_HOST" in texto and "AVISOS_TO" in texto and buzon.conexiones == []


def test_probar_ok_y_fallo_sin_mostrar_la_clave(monkeypatch, buzon):
    configurar(monkeypatch)
    lineas = []
    assert avisos.probar(lineas.append) == 0
    assert buzon.asuntos == ["[Sevencars] Vigilante: mail de prueba"] and "enviado" in lineas[-1]
    buzon.falla = smtplib.SMTPAuthenticationError(535, b"no")
    lineas.clear()
    assert avisos.probar(lineas.append) == 1
    texto = "\n".join(lineas)
    assert "FALLÓ" in texto and "SMTP_USER / SMTP_PASS" in texto and "clave-secreta-123" not in texto
