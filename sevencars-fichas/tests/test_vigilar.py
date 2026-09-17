"""vigilar.py: vigilante de fotos nuevas, con un 1_Ventas falso en tmp_path y publicar.py doblado (subprocess.run)."""
import fcntl
import json
import logging
import os
import subprocess
import time
from pathlib import Path

import pytest
import smtplib
from PIL import Image

import vigilar
from tests.conftest import write_jpeg
from tests.test_avisos import CONFIG, instalar_buzon

KIA = "82-Kia Xceed-9028LXG"
CLIO = "58-Renault Clio-0110MLK"
URL = "https://www.sevencars.es/wp-admin/post.php?post=555&action=edit"
LUNA = "Luna: precio1.jpg (15.) · precio2.jpg (795) · cuota.jpg (244) → /1_Ventas/82-Kia Xceed-9028LXG/precios"
SALIDA_OK = ("Hoja Base_Datos: test — 10 filas con referencia\nfotos/: 3 fotos listas (1 cambio: 'nueva.png' -> 1.jpg)\n"
             f"Producto 555 creado como draft: {URL}\nHoja: escrito AD (cuota) = 250\n{LUNA}\n\n"
             "== PARA VERIFICAR\n  ! caja: sin confirmar (revisar en el borrador)\n  ! categoría: modelo desconocido\n")
SALIDA_YA_REGISTRO = ("⚠ Ya publicado según data/publicados.json (producto 321): "
                      "https://www.sevencars.es/wp-admin/post.php?post=321&action=edit\n")
SALIDA_YA_WEB = ("⚠ El coche ya existe en la web (draft, producto 400 «Kia Xceed»): "
                 "https://www.sevencars.es/wp-admin/post.php?post=400&action=edit. No se crea otro.\n")
SALIDA_FALTA_HOJA = "Hoja Base_Datos: test — 10 filas\n⚠ '9028LXG' no está en la hoja Base_Datos (test).\n"
SALIDA_GOOGLE = "Please visit this URL to authorize this application: https://accounts.google.com/o/oauth2/auth?x=y\n"
SALIDA_GOOGLE_2 = "Hace falta autorizar el acceso a Google: no se pudo renovar el token\n"
SALIDA_ERROR = "Identidad: IDENTIDAD NO CONFIRMADA — la matrícula no coincide\n⚠ Identidad no confirmada: no se toca la web.\n"


# ---------------------------------------------------------------- dobles y ayudas
@pytest.fixture(autouse=True)
def buzon(monkeypatch, tmp_path):
    """Ningún test lee el .env real ni manda mails: sin configuración por defecto y smtplib doblado."""
    return instalar_buzon(monkeypatch, tmp_path)


@pytest.fixture
def mail(monkeypatch, buzon):
    """Avisos por mail configurados (contra el buzón doblado)."""
    for k, v in CONFIG.items():
        monkeypatch.setenv(k, v)
    return buzon


class Reloj:
    def __init__(self, t=None):
        self.t = time.time() if t is None else t

    def __call__(self):
        return self.t


class FakeRun:
    """subprocess.run doblado: devuelve un guion de (código, salida) o lanza la excepción indicada."""

    def __init__(self, *guion):
        self.guion, self.calls = list(guion), []

    def __call__(self, cmd, **kw):
        self.calls.append([str(c) for c in cmd])
        assert kw["stdin"] is subprocess.DEVNULL and kw["env"]["FICHAS_NO_BROWSER"] == "1" and kw["timeout"] > 0
        item = self.guion.pop(0) if self.guion else (0, SALIDA_OK)
        if isinstance(item, BaseException):
            raise item
        return subprocess.CompletedProcess(cmd, item[0], stdout=item[1], stderr="")

    def argumentos(self, i=-1):
        """Los argumentos que recibió publicar.py (sin el intérprete ni el script)."""
        return self.calls[i][2:]


@pytest.fixture
def entorno(tmp_path, monkeypatch):
    ventas = tmp_path / "1_Ventas"
    (ventas / "----VENDIDOS").mkdir(parents=True)
    monkeypatch.setattr(vigilar, "ESTADO_PATH", tmp_path / "data" / "vigilar.json")
    monkeypatch.setattr(vigilar, "LOCK_PATH", tmp_path / "data" / "vigilar.lock")
    monkeypatch.setattr(vigilar, "LOG_PATH", tmp_path / "logs" / "vigilar.log")
    return ventas


@pytest.fixture
def publicar_falso(monkeypatch):
    def armar(*guion):
        fake = FakeRun(*guion)
        monkeypatch.setattr(vigilar.subprocess, "run", fake)
        return fake
    return armar


def png(path: Path, edad: float = 500) -> Path:
    Image.new("RGB", (64, 48), (10, 120, 200)).save(path, format="PNG")
    envejecer(path, edad)
    return path


def envejecer(path: Path, edad: float) -> None:
    t = time.time() - edad
    os.utime(path, (t, t))


def coche(ventas: Path, nombre=KIA, fotos=("nueva.png",), edad=500, grupo="") -> Path:
    carpeta = ventas / grupo / nombre if grupo else ventas / nombre
    (carpeta / "fotos").mkdir(parents=True)
    write_jpeg(carpeta / "fotos" / "1.jpg")
    envejecer(carpeta / "fotos" / "1.jpg", 5000)
    for f in fotos:
        png(carpeta / "fotos" / f, edad)
    return carpeta


def vigilante(ventas: Path, **over) -> vigilar.Vigilante:
    base = dict(ventas_dir=ventas, estado_path=vigilar.ESTADO_PATH, lock_path=vigilar.LOCK_PATH, espera=0, reintento=0)
    base.update(over)
    return vigilar.Vigilante(**base)


def punto_de_partida(vig: vigilar.Vigilante, hace: float = 1000) -> None:
    vig.guardar_estado({"inicio": time.time() - hace, "carpetas": {}})


def registro(vig: vigilar.Vigilante, carpeta: Path) -> dict:
    return vig.cargar_estado()["carpetas"].get(str(carpeta), {})


def resultado_txt(carpeta: Path) -> str:
    return (carpeta / vigilar.RESULTADO).read_text(encoding="utf-8")


def ciclos(vig, n):
    return [vig.ciclo() for _ in range(n)]


# ---------------------------------------------------------------- punto de partida y disparo
def test_primera_ejecucion_solo_registra_el_punto_de_partida(entorno, publicar_falso, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    fake = publicar_falso()
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    res = vig.ciclo()
    assert res.primera_vez and res.pendientes_previas == [KIA] and fake.calls == []
    assert vig.cargar_estado()["inicio"] == pytest.approx(time.time(), abs=5)
    assert "publicar.py --matricula 9028LXG" in caplog.text and "punto de partida" in caplog.text
    # las fotos que ya estaban no se publican solas en los ciclos siguientes
    ciclos(vig, 2)
    assert fake.calls == [] and not (carpeta / vigilar.RESULTADO).exists()


def test_fotos_anteriores_al_punto_de_partida_se_ignoran(entorno, publicar_falso):
    fake = publicar_falso()
    carpeta = coche(entorno, edad=500)
    vig = vigilante(entorno)
    punto_de_partida(vig, hace=100)
    res = vig.ciclo()
    assert fake.calls == [] and "publicar a mano" in res.decisiones[0].motivo
    png(carpeta / "fotos" / "otra.png", edad=10)        # una foto nueva después del punto de partida
    vig.ciclo()
    assert fake.argumentos() == ["--matricula", "9028LXG", "--si", "--ventas-dir", str(entorno)]


def test_fotos_ya_ordenadas_despues_del_punto_de_partida_se_publican(entorno, publicar_falso):
    fake = publicar_falso()
    carpeta = coche(entorno, fotos=())
    fotos = carpeta / "fotos"
    envejecer(fotos / "1.jpg", 500)
    envejecer(write_jpeg(fotos / "2.jpg"), 500)
    vig = vigilante(entorno)
    punto_de_partida(vig, hace=1000)
    assert vig._plan(fotos) == ([], [])                        # nada que ordenar: igual es una tanda nueva
    res = vig.ciclo()
    assert res.resultado == "publicado" and res.decisiones[0].accion == vigilar.ACC_PUBLICAR
    assert fake.argumentos() == ["--matricula", "9028LXG", "--si", "--ventas-dir", str(entorno)]


def test_fotos_ya_ordenadas_anteriores_al_punto_de_partida_se_publican_a_mano(entorno, publicar_falso):
    fake = publicar_falso()
    carpeta = coche(entorno, fotos=())                          # 1.jpg en orden, de antes del punto de partida
    vig = vigilante(entorno)
    punto_de_partida(vig, hace=1000)
    d = vig.ciclo().decisiones[0]
    assert fake.calls == [] and d.accion == vigilar.ACC_VISTA and d.visible
    assert "publicar a mano" in d.motivo and "publicar.py --matricula 9028LXG" in d.motivo
    assert vig.ciclo().decisiones[0].motivo == "sin cambios" and fake.calls == []
    envejecer(write_jpeg(carpeta / "fotos" / "2.jpg"), 10)      # llega otra ya en orden: ahora sí se publica
    assert vig.ciclo().resultado == "publicado" and len(fake.calls) == 1


def test_fotos_vacia_no_lanza_y_originales_no_cuenta(entorno, publicar_falso):
    fake = publicar_falso()
    carpeta = coche(entorno, fotos=())
    (carpeta / "fotos" / "1.jpg").unlink()
    (carpeta / "fotos" / "originales").mkdir()
    envejecer(write_jpeg(carpeta / "fotos" / "originales" / "1.jpg"), 10)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    d = vig.ciclo().decisiones[0]
    assert fake.calls == [] and d.accion == vigilar.ACC_VISTA and d.motivo == "fotos/ vacía"


def test_solo_archivos_ilegibles_se_revisan_cada_ciclo_hasta_poder_leerlos(entorno, publicar_falso, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    fake = publicar_falso()
    carpeta = coche(entorno, fotos=())
    foto = carpeta / "fotos" / "1.jpg"
    jpeg = foto.read_bytes()                                   # la foto buena, ya en orden
    foto.write_bytes(b"\0" * len(jpeg))                        # OneDrive sin descargar: mismo nombre y tamaño
    envejecer(foto, 10)
    mtime_ns = foto.stat().st_mtime_ns
    vig = vigilante(entorno)
    punto_de_partida(vig)
    for _ in range(3):
        d = vig.ciclo().decisiones[0]
        assert d.accion is None and d.visible and "no se pueden leer" in d.motivo and "1.jpg" in d.motivo
    assert fake.calls == [] and registro(vig, carpeta) == {}   # no se guardó firma_vista
    assert caplog.text.count("espero a que se puedan leer") == 1
    firma = vigilar.calcular_firma(carpeta / "fotos")
    foto.write_bytes(jpeg)                                     # se descargó: mismos nombre, tamaño y mtime
    os.utime(foto, ns=(mtime_ns, mtime_ns))
    assert vigilar.calcular_firma(carpeta / "fotos") == firma
    assert vig.ciclo().resultado == "publicado" and len(fake.calls) == 1


def test_publicado_con_fotos_nuevas_ya_ordenadas_no_relanza(entorno, publicar_falso):
    fake = publicar_falso((0, SALIDA_OK))
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "publicado"
    for f in (carpeta / "fotos").iterdir():                    # como si publicar.py las hubiera ordenado
        f.unlink()
    for n in (1, 2, 3):
        envejecer(write_jpeg(carpeta / "fotos" / f"{n}.jpg"), 10)
    d = vig.ciclo().decisiones[0]
    assert d.accion == vigilar.ACC_FIRMA and "ya está en orden" in d.motivo and len(fake.calls) == 1
    assert vig.ciclo().decisiones[0].motivo == "sin cambios" and len(fake.calls) == 1
    assert registro(vig, carpeta)["estado"] == "publicado"


def test_periodo_de_calma(entorno, publicar_falso):
    fake = publicar_falso()
    carpeta = coche(entorno, edad=10)
    vig = vigilante(entorno, espera=300)
    punto_de_partida(vig)
    res = vig.ciclo()
    assert fake.calls == [] and "espero a que terminen de bajar" in res.decisiones[0].motivo
    envejecer(carpeta / "fotos" / "nueva.png", 400)
    vig.ciclo()
    assert len(fake.calls) == 1


def test_un_coche_por_ciclo(entorno, publicar_falso):
    fake = publicar_falso()
    coche(entorno, KIA)
    coche(entorno, CLIO)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    res = vig.ciclo()
    assert len(fake.calls) == 1 and res.procesada == CLIO
    res = vig.ciclo()
    assert len(fake.calls) == 2 and res.procesada == KIA
    assert vig.ciclo().procesada is None and len(fake.calls) == 2


def test_vendidos_y_sin_fotos_se_ignoran(entorno, publicar_falso):
    fake = publicar_falso()
    coche(entorno, "12-Seat Leon-1234BBB", grupo="----VENDIDOS")
    (entorno / "77-Audi A3-7777CCC").mkdir()                    # sin subcarpeta fotos/
    vig = vigilante(entorno)
    punto_de_partida(vig)
    res = vig.ciclo()
    assert fake.calls == [] and res.decisiones == []


def test_sin_matricula_completa_usa_la_referencia(entorno, publicar_falso):
    fake = publicar_falso()
    coche(entorno, "88- Tesla Model 3-2848NR")               # matrícula truncada: se usa el prefijo + 1000
    vig = vigilante(entorno)
    punto_de_partida(vig)
    vig.ciclo()
    assert fake.argumentos()[:2] == ["1088", "--si"]


# ---------------------------------------------------------------- resultados
def test_publicado(entorno, publicar_falso):
    fake = publicar_falso((0, SALIDA_OK))
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    res = vig.ciclo()
    e = registro(vig, carpeta)
    assert res.resultado == "publicado" and e["estado"] == "publicado" and e["url"] == URL and e["intentos"] == 1
    txt = resultado_txt(carpeta)
    assert f"Coche: {KIA}" in txt and "Fecha: " + time.strftime("%d/%m/%Y") in txt
    assert "Se creó el borrador" in txt and f"Enlace: {URL}\n{LUNA}\n" in txt
    assert "== PARA VERIFICAR\n  ! caja: sin confirmar (revisar en el borrador)\n  ! categoría: modelo desconocido" in txt
    assert "Revisar el borrador en WordPress" in txt and "HISTORIAL" in txt and "DETALLE" not in txt
    ciclos(vig, 2)
    assert len(fake.calls) == 1                                # nada cambió: no se vuelve a lanzar


@pytest.mark.parametrize("salida, post", [(SALIDA_YA_REGISTRO, "321"), (SALIDA_YA_WEB, "400")])
def test_ya_publicado(entorno, publicar_falso, salida, post):
    fake = publicar_falso((1, salida))
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "ya_publicado"
    e = registro(vig, carpeta)
    assert e["estado"] == "ya_publicado" and e["url"] == f"https://www.sevencars.es/wp-admin/post.php?post={post}&action=edit"
    assert "ya estaba en la web" in resultado_txt(carpeta) and e["url"] in resultado_txt(carpeta)
    vig.ciclo()
    assert len(fake.calls) == 1


def test_falta_hoja_reintenta_hasta_que_aparezca(entorno, publicar_falso):
    fake = publicar_falso((1, SALIDA_FALTA_HOJA), (1, SALIDA_FALTA_HOJA), (0, SALIDA_OK))
    carpeta = coche(entorno)
    vig = vigilante(entorno, reintento=1800)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "falta_hoja"
    e = registro(vig, carpeta)
    assert e["estado"] == "falta_hoja" and e["proximo_intento"] == pytest.approx(time.time() + 1800, abs=5)
    txt = resultado_txt(carpeta)
    assert "no está cargado en la hoja Base_Datos" in txt and "Vuelvo a intentar en 30 min" in txt and "DETALLE" in txt
    res = vig.ciclo()
    assert len(fake.calls) == 1 and "reintento a las" in res.decisiones[0].motivo
    vig.reintento = 0
    vig.ciclo()                                                # aún dentro del plazo de 1800 s
    assert len(fake.calls) == 1
    estado = vig.cargar_estado()
    estado["carpetas"][str(carpeta)]["proximo_intento"] = time.time() - 1
    vig.guardar_estado(estado)
    assert vig.ciclo().resultado == "falta_hoja" and len(fake.calls) == 2
    assert vig.ciclo().resultado == "publicado" and registro(vig, carpeta)["estado"] == "publicado"
    assert registro(vig, carpeta)["errores"] == 0 and registro(vig, carpeta)["intentos"] == 3


@pytest.mark.parametrize("salida", [SALIDA_GOOGLE, SALIDA_GOOGLE_2])
def test_google_autorizar(entorno, publicar_falso, salida):
    fake = publicar_falso((3, salida), (0, SALIDA_OK))
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "google_autorizar" and registro(vig, carpeta)["estado"] == "google_autorizar"
    txt = resultado_txt(carpeta)
    assert "autorizar el acceso a Google" in txt and "../.venv/bin/python verificar.py --probar-sheet" in txt
    assert vig.ciclo().resultado == "publicado" and len(fake.calls) == 2


def test_error_reintenta_y_abandona_a_los_cinco(entorno, publicar_falso):
    fake = publicar_falso(*[(1, SALIDA_ERROR)] * 6)
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "error"
    e = registro(vig, carpeta)
    assert e["estado"] == "error" and e["errores"] == 1
    txt = resultado_txt(carpeta)
    assert "falló (intento 1 de 5)" in txt and "Identidad no confirmada" in txt
    resultados = [vig.ciclo().resultado for _ in range(4)]
    assert resultados == ["error", "error", "error", "abandonado"] and len(fake.calls) == 5
    e = registro(vig, carpeta)
    assert e["estado"] == "abandonado" and e["intentos"] == 5 and e["proximo_intento"] is None
    txt = resultado_txt(carpeta)
    assert "falló 5 veces seguidas" in txt and "vigilar.py --ahora 9028LXG" in txt
    historial = txt.split("HISTORIAL (últimos 3 intentos)\n")[1].strip().splitlines()
    assert len(historial) == 3 and historial[0].split()[2] == "abandonado" and historial[1].split()[2] == "error"
    ciclos(vig, 2)
    assert len(fake.calls) == 5                                # abandonado: no se insiste
    # fotos nuevas: se reinicia el contador y se vuelve a intentar
    png(carpeta / "fotos" / "otra.png", edad=10)
    assert vig.ciclo().resultado == "error" and len(fake.calls) == 6
    e = registro(vig, carpeta)
    assert e["estado"] == "error" and e["errores"] == 1 and e["intentos"] == 1


def test_tiempo_agotado_cuenta_como_error(entorno, publicar_falso):
    publicar_falso(subprocess.TimeoutExpired(["x"], 1200, output="salida parcial"))
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "error"
    assert "tiempo agotado" in resultado_txt(carpeta) and "salida parcial" in resultado_txt(carpeta)


def test_publicado_con_fotos_nuevas_solo_las_ordena(entorno, publicar_falso):
    fake = publicar_falso((0, SALIDA_OK), (0, "fotos/: 4 fotos listas (1 cambio: 'otra.png' -> 4.jpg)\n"))
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "publicado"
    png(carpeta / "fotos" / "otra.png", edad=10)
    assert vig.ciclo().resultado == "fotos_normalizadas"
    assert fake.argumentos() == ["--matricula", "9028LXG", "--si", "--ventas-dir", str(entorno), "--solo-fotos"]
    e = registro(vig, carpeta)
    assert e["estado"] == "publicado" and e["url"] == URL and e["historial"][0]["resultado"] == "fotos_normalizadas"
    txt = resultado_txt(carpeta)
    assert "NO se volvió a subir a la web" in txt and f"Enlace: {URL}" not in txt
    vig.ciclo()
    assert len(fake.calls) == 2


def test_archivos_ilegibles_esperan_tres_ciclos(entorno, publicar_falso):
    fake = publicar_falso()
    carpeta = coche(entorno)
    (carpeta / "fotos" / "rota.jpg").write_bytes(b"esto no es una imagen")
    envejecer(carpeta / "fotos" / "rota.jpg", 400)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    motivos = [vig.ciclo().decisiones[0].motivo for _ in range(3)]
    assert fake.calls == [] and all("no se pueden leer" in m and "rota.jpg" in m for m in motivos)
    assert registro(vig, carpeta)["ciclos_omitidos"] == 3
    assert vig.ciclo().resultado == "publicado" and len(fake.calls) == 1
    assert "rota.jpg" in resultado_txt(carpeta) and "no se pudieron leer" in resultado_txt(carpeta)


# ---------------------------------------------------------------- CLI
def test_ahora_procesa_sin_esperar(entorno, publicar_falso, capsys):
    fake = publicar_falso()
    carpeta = coche(entorno, edad=1)                          # sin punto de partida y con fotos recién bajadas
    rc = vigilar.main(["--ahora", "9028LXG", "--ventas-dir", str(entorno), "--espera", "600"])
    assert rc == 0 and fake.argumentos()[:2] == ["--matricula", "9028LXG"]
    assert (carpeta / vigilar.RESULTADO).exists() and vigilar.LOG_PATH.exists()
    assert json.loads(vigilar.ESTADO_PATH.read_text())["carpetas"][str(carpeta)]["estado"] == "publicado"
    rc = vigilar.main(["--ahora", "82", "--ventas-dir", str(entorno)])
    assert rc == 0 and fake.argumentos()[-1] == "--solo-fotos"    # ya publicado: solo se ordenan las fotos
    rc = vigilar.main(["--ahora", "1099", "--ventas-dir", str(entorno)])
    assert rc == 1 and len(fake.calls) == 2 and "No encuentro la carpeta" in capsys.readouterr().out


def test_simular_no_lanza_ni_escribe(entorno, publicar_falso, capsys):
    fake = publicar_falso()
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    antes = vigilar.ESTADO_PATH.read_text()
    rc = vigilar.main(["--simular", "--ventas-dir", str(entorno), "--espera", "0"])
    out = capsys.readouterr().out
    assert rc == 0 and fake.calls == []
    assert "Se lanzaría ahora: publicar.py --matricula 9028LXG" in out and "no se escribió nada" in out
    assert vigilar.ESTADO_PATH.read_text() == antes and not (carpeta / vigilar.RESULTADO).exists()
    assert not vigilar.LOG_PATH.exists() and not vigilar.LOCK_PATH.exists()


def test_simular_en_la_primera_ejecucion(entorno, publicar_falso, capsys):
    publicar_falso()
    coche(entorno)
    rc = vigilar.main(["--simular", "--ventas-dir", str(entorno)])
    out = capsys.readouterr().out
    assert rc == 0 and "solo se registraría el punto de partida" in out and KIA in out
    assert not vigilar.ESTADO_PATH.exists()


def test_estado_muestra_la_tabla(entorno, publicar_falso, capsys):
    publicar_falso((1, SALIDA_FALTA_HOJA))
    coche(entorno)
    coche(entorno, CLIO, fotos=())                              # de antes del punto de partida: no en la tabla
    rc = vigilar.main(["--estado", "--ventas-dir", str(entorno)])
    assert rc == 0 and "no se ejecutó nunca" in capsys.readouterr().out
    vig = vigilante(entorno, reintento=1800)
    punto_de_partida(vig)
    vig.ciclo()
    assert "publicar a mano" in capsys.readouterr().out         # el aviso del ciclo va al log, no a la tabla
    rc = vigilar.main(["--estado", "--ventas-dir", str(entorno)])
    out = capsys.readouterr().out
    assert rc == 0 and KIA in out and "falta_hoja" in out and CLIO not in out and "1 carpeta/s más" in out


def test_cerrojo_impide_un_segundo_vigilante(entorno, publicar_falso, capsys):
    fake = publicar_falso()
    coche(entorno)
    vigilar.LOCK_PATH.parent.mkdir(parents=True)
    with open(vigilar.LOCK_PATH, "w") as otro:
        fcntl.flock(otro, fcntl.LOCK_EX | fcntl.LOCK_NB)
        rc = vigilar.main(["--una-vez", "--ventas-dir", str(entorno)])
    assert rc == 2 and fake.calls == [] and "Ya hay un vigilante en marcha" in capsys.readouterr().out
    assert not vigilar.ESTADO_PATH.exists()
    rc = vigilar.main(["--una-vez", "--ventas-dir", str(entorno)])   # liberado: ahora sí (primera ejecución)
    assert rc == 0 and vigilar.ESTADO_PATH.exists()


def test_ventas_dir_inexistente(entorno, publicar_falso, capsys):
    publicar_falso()
    rc = vigilar.main(["--una-vez", "--ventas-dir", str(entorno / "no-existe")])
    assert rc == 1 and "No existe la carpeta de ventas" in capsys.readouterr().out


# ---------------------------------------------------------------- unidades
@pytest.mark.parametrize("rc, salida, solo, esperado", [
    (0, SALIDA_OK, False, ("publicado", URL)),
    (1, SALIDA_YA_REGISTRO, False, ("ya_publicado", "https://www.sevencars.es/wp-admin/post.php?post=321&action=edit")),
    (1, SALIDA_YA_WEB, False, ("ya_publicado", "https://www.sevencars.es/wp-admin/post.php?post=400&action=edit")),
    (1, SALIDA_FALTA_HOJA, False, ("falta_hoja", "")),
    (3, SALIDA_GOOGLE, False, ("google_autorizar", "")),
    (3, SALIDA_GOOGLE_2, False, ("google_autorizar", "")),
    (1, SALIDA_ERROR, False, ("error", "")),
    (1, "Producto 555 creado como draft: x", False, ("error", "")),    # código de salida manda
    (0, "fotos/: 3 fotos ya normalizadas", True, ("fotos_normalizadas", "")),
    (1, SALIDA_FALTA_HOJA, True, ("fotos_error", "")),
    (1, SALIDA_GOOGLE, True, ("fotos_error", "")),              # ya publicado: nunca pasa a google_autorizar
])
def test_clasificar(rc, salida, solo, esperado):
    assert vigilar.clasificar(rc, salida, solo) == esperado


def test_bloque_verificar_y_firma(tmp_path):
    assert vigilar.bloque_verificar(SALIDA_OK).splitlines() == ["== PARA VERIFICAR", "  ! caja: sin confirmar (revisar en el borrador)",
                                                                 "  ! categoría: modelo desconocido"]
    assert vigilar.bloque_verificar("sin bloque") == ""
    assert vigilar.linea_luna(SALIDA_OK) == LUNA and vigilar.linea_luna("sin luna") == ""
    fotos = tmp_path / "fotos"
    fotos.mkdir()
    write_jpeg(fotos / "1.jpg")
    (fotos / "2.jpg.tmp").write_bytes(b"x")
    (fotos / "1.jpg:Zone.Identifier").write_bytes(b"x")
    (fotos / "originales").mkdir()
    firma = vigilar.calcular_firma(fotos)
    assert [f[0] for f in firma] == ["1.jpg"] and firma[0][1] == (fotos / "1.jpg").stat().st_size
    assert vigilar.calcular_firma(tmp_path / "no-existe") == []


# ---------------------------------------------------------------- avisos por mail
SALIDA_SIN_VERIFICAR = SALIDA_OK.split("\n\n== PARA VERIFICAR")[0] + "\n"


def test_mail_borrador_creado(entorno, publicar_falso, mail):
    publicar_falso((0, SALIDA_OK))
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "publicado"
    assert mail.asuntos == [f"[Sevencars] {KIA}: borrador listo para revisar"]
    cuerpo = mail.enviados[0].get_content()
    assert cuerpo.startswith(f"Carpeta: {carpeta}\n") and resultado_txt(carpeta) in cuerpo
    assert f"Enlace: {URL}" in cuerpo and LUNA in cuerpo and "== PARA VERIFICAR" in cuerpo and "PRÓXIMO PASO" in cuerpo
    assert registro(vig, carpeta)["avisado"] == "publicado"
    ciclos(vig, 2)
    assert len(mail.enviados) == 1


def test_mail_borrador_segun_avisos_borrador(entorno, publicar_falso, mail, monkeypatch):
    monkeypatch.setenv("AVISOS_BORRADOR", "0")
    publicar_falso((0, SALIDA_SIN_VERIFICAR), (0, SALIDA_OK))
    coche(entorno, KIA)
    coche(entorno, CLIO)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "publicado" and mail.enviados == []        # sin PARA VERIFICAR: no avisa
    assert vig.ciclo().resultado == "publicado"                                 # con PARA VERIFICAR: sí
    assert mail.asuntos == [f"[Sevencars] {KIA}: borrador listo para revisar"]


@pytest.mark.parametrize("guion", [[(1, SALIDA_YA_REGISTRO)], [(1, SALIDA_YA_WEB)],
                                   [(0, SALIDA_SIN_VERIFICAR), (0, "fotos/: 4 fotos listas\n")]])
def test_sin_mail_cuando_no_hace_falta(entorno, publicar_falso, mail, monkeypatch, guion):
    monkeypatch.setenv("AVISOS_BORRADOR", "0")
    publicar_falso(*guion)
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    vig.ciclo()
    if len(guion) > 1:
        png(carpeta / "fotos" / "otra.png", edad=10)
        assert vig.ciclo().resultado == "fotos_normalizadas"
    assert mail.enviados == [] and (carpeta / vigilar.RESULTADO).exists()


def test_mail_ya_publicado_con_cosas_para_verificar(entorno, publicar_falso, mail):
    publicar_falso((1, SALIDA_YA_WEB + "\n== PARA VERIFICAR\n  ! caja: sin confirmar\n"))
    coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "ya_publicado"
    assert mail.asuntos == [f"[Sevencars] {KIA}: ya estaba en la web (hay cosas para verificar)"]
    assert "! caja: sin confirmar" in mail.enviados[0].get_content()


def test_mail_error_solo_el_primero_y_al_abandonar_tambien_tras_reiniciar(entorno, publicar_falso, mail):
    fake = publicar_falso(*[(1, SALIDA_ERROR)] * 6)
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "error"
    assert mail.asuntos == [f"[Sevencars] {KIA}: falló la publicación"]
    assert "Identidad no confirmada" in mail.enviados[0].get_content()             # el DETALLE de RESULTADO.txt
    vig = vigilante(entorno)                                                       # reinicio: estado desde el JSON
    assert [vig.ciclo().resultado for _ in range(3)] == ["error"] * 3 and len(mail.enviados) == 1
    assert vigilante(entorno).ciclo().resultado == "abandonado" and len(fake.calls) == 5
    assert mail.asuntos[1] == f"[Sevencars] {KIA}: publicación abandonada tras 5 fallos"
    png(carpeta / "fotos" / "otra.png", edad=10)                                   # fotos nuevas: vuelve a empezar
    assert vig.ciclo().resultado == "error" and len(mail.enviados) == 3


def test_mail_falta_hoja_y_google_no_se_repiten_en_los_reintentos(entorno, publicar_falso, mail):
    publicar_falso((1, SALIDA_FALTA_HOJA), (1, SALIDA_FALTA_HOJA), (3, SALIDA_GOOGLE), (3, SALIDA_GOOGLE_2),
                   (0, SALIDA_OK))
    coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert [vig.ciclo().resultado for _ in range(5)] == ["falta_hoja", "falta_hoja", "google_autorizar",
                                                         "google_autorizar", "publicado"]
    assert mail.asuntos == [f"[Sevencars] {KIA}: no está cargado en la hoja Base_Datos",
                            f"[Sevencars] {KIA}: hay que volver a autorizar Google",
                            f"[Sevencars] {KIA}: borrador listo para revisar"]
    assert "verificar.py --probar-sheet" in mail.enviados[1].get_content()


def test_registro_de_antes_de_los_mails_no_reavisa(entorno, publicar_falso, mail):
    publicar_falso((1, SALIDA_FALTA_HOJA))
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    estado = {"inicio": time.time() - 1000, "carpetas": {str(carpeta): {
        **vigilar.nuevo_registro(), "estado": "falta_hoja", "intentos": 3, "proximo_intento": time.time() - 1,
        "historial": [{"fecha": "-", "resultado": "falta_hoja", "resumen": "x"}]}}}
    vig.guardar_estado(estado)
    assert vig.ciclo().resultado == "falta_hoja" and mail.enviados == []


def test_solo_fotos_con_google_conserva_publicado_y_avisa(entorno, publicar_falso, mail):
    fake = publicar_falso((0, SALIDA_OK), (1, SALIDA_GOOGLE), (1, SALIDA_GOOGLE))
    carpeta = coche(entorno)
    vig = vigilante(entorno, reintento=1800)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "publicado"
    png(carpeta / "fotos" / "otra.png", edad=10)
    assert vig.ciclo().resultado == "fotos_error" and fake.argumentos()[-1] == "--solo-fotos"
    e = registro(vig, carpeta)
    assert e["estado"] == "publicado" and e["url"] == URL and e["errores"] == 1
    assert mail.asuntos[1] == f"[Sevencars] {KIA}: no se pudieron ordenar las fotos nuevas"
    assert "Hace falta autorizar Google" in mail.enviados[1].get_content()
    estado = vig.cargar_estado()
    estado["carpetas"][str(carpeta)]["proximo_intento"] = time.time() - 1
    vig.guardar_estado(estado)
    assert vig.ciclo().resultado == "fotos_error" and len(mail.enviados) == 2      # mismo resultado: no se repite
    assert registro(vig, carpeta)["estado"] == "publicado"


def test_fallo_smtp_no_corta_el_ciclo_y_se_reintenta(entorno, publicar_falso, mail, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    publicar_falso((1, SALIDA_ERROR), (1, SALIDA_ERROR), (1, SALIDA_ERROR))
    carpeta = coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    mail.falla = OSError("sin red")
    assert vig.ciclo().resultado == "error" and mail.enviados == [] and "No se pudo mandar el aviso" in caplog.text
    assert registro(vig, carpeta)["avisado"] is None and "falló (intento 1 de 5)" in resultado_txt(carpeta)
    mail.falla = None
    assert vig.ciclo().resultado == "error" and len(mail.enviados) == 1            # el aviso pendiente sale ahora
    assert vig.ciclo().resultado == "error" and len(mail.enviados) == 1


def test_sin_config_no_rompe_y_avisa_una_sola_vez(entorno, publicar_falso, buzon, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    publicar_falso((1, SALIDA_FALTA_HOJA), (1, SALIDA_ERROR), (0, SALIDA_OK))
    coche(entorno)
    vig = vigilante(entorno)
    punto_de_partida(vig)
    assert [vig.ciclo().resultado for _ in range(3)] == ["falta_hoja", "error", "publicado"]
    assert buzon.conexiones == [] and caplog.text.count("Avisos por mail sin configurar") == 1


def test_sin_mail_por_fotos_anteriores_al_punto_de_partida(entorno, publicar_falso, mail):
    publicar_falso()
    coche(entorno, edad=500)
    vig = vigilante(entorno)
    vig.ciclo()                                                   # primera ejecución
    ciclos(vig, 2)
    punto_de_partida(vig, hace=100)
    ciclos(vig, 2)
    assert mail.enviados == []


def test_resultado_txt_sin_escribir(entorno, publicar_falso, mail):
    publicar_falso((1, SALIDA_ERROR), (1, SALIDA_YA_WEB))
    kia = coche(entorno, KIA)
    clio = coche(entorno, CLIO)
    (kia / vigilar.RESULTADO).mkdir()                             # write_text falla
    (clio / vigilar.RESULTADO).mkdir()
    vig = vigilante(entorno, reintento=1800)
    punto_de_partida(vig)
    assert vig.ciclo().resultado == "error"                        # CLIO: el aviso va dentro del mail del error
    assert mail.asuntos == [f"[Sevencars] {CLIO}: falló la publicación"]
    assert "no se pudo escribir RESULTADO.txt" in mail.enviados[0].get_content()
    assert vig.ciclo().resultado == "ya_publicado"                 # KIA: no merece mail, pero sí el aviso
    assert mail.asuntos[1] == f"[Sevencars] {KIA}: no se pudo escribir RESULTADO.txt"
    assert "ya estaba en la web" in mail.enviados[1].get_content()
    enviados = vigilante(entorno).cargar_estado()["avisos"]["enviados"]
    assert set(enviados) == {f"resultado_txt:{clio}", f"resultado_txt:{kia}"}


def test_anomalia_onedrive_sin_montar_como_mucho_cada_6_horas(entorno, mail, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    reloj = Reloj()
    vig = vigilante(entorno / "no-existe", reloj=reloj)
    vig.vuelta()
    assert mail.asuntos == ["[Sevencars] Vigilante: no puedo entrar en la carpeta de ventas (¿OneDrive sin montar?)"]
    assert "No existe la carpeta de ventas" in mail.enviados[0].get_content()
    reloj.t += 3600
    vig.vuelta()
    otro = vigilante(entorno / "no-existe", reloj=Reloj(reloj.t + 3600))           # reinicio: el tope sigue
    otro.vuelta()
    assert len(mail.enviados) == 1 and caplog.text.count("Aviso por mail enviado") == 1
    reloj.t += 5 * 3600 + 1
    vig.vuelta()
    assert len(mail.enviados) == 2
    assert vigilar.ESTADO_PATH.exists() and "ventas_inaccesible" in vig.cargar_estado()["avisos"]["enviados"]


def test_anomalia_error_inesperado_y_fallo_smtp_no_rompen(entorno, mail, monkeypatch, caplog):
    caplog.set_level(logging.INFO, logger="vigilar")
    reloj = Reloj()
    vig = vigilante(entorno, reloj=reloj)

    def explota():
        raise RuntimeError("algo raro")

    monkeypatch.setattr(vig, "ciclo", explota)
    mail.falla = smtplib.SMTPServerDisconnected("se cortó")
    vig.vuelta()                                                   # no lanza
    assert mail.enviados == [] and "Error inesperado en el ciclo" in caplog.text
    reloj.t += 60
    mail.falla = None
    vig.vuelta()                                                   # tras un fallo de envío espera 30 min
    assert mail.enviados == []
    reloj.t += vigilar.REINTENTO_MAIL
    vig.vuelta()
    assert mail.asuntos == ["[Sevencars] Vigilante: error inesperado (sigo vigilando)"]
    assert "RuntimeError: algo raro" in mail.enviados[0].get_content()
    reloj.t += 3 * 3600
    vig.vuelta()
    assert len(mail.enviados) == 1


def test_anomalia_archivos_ilegibles_mas_de_30_minutos(entorno, publicar_falso, mail):
    fake = publicar_falso()
    carpeta = coche(entorno, fotos=())
    foto = carpeta / "fotos" / "1.jpg"
    jpeg = foto.read_bytes()
    foto.write_bytes(b"\0" * len(jpeg))                            # OneDrive sin descargar
    envejecer(foto, 10)
    reloj = Reloj()
    inicio = reloj.t
    vig = vigilante(entorno, reloj=reloj)
    punto_de_partida(vig)
    vig.ciclo()
    reloj.t = inicio + 29 * 60
    vig.ciclo()
    assert mail.enviados == [] and registro(vig, carpeta) == {}
    reloj.t = inicio + 31 * 60
    vig.ciclo()
    assert mail.asuntos == [f"[Sevencars] {KIA}: fotos que no se pueden leer desde hace más de 30 min"]
    assert "1.jpg" in mail.enviados[0].get_content() and f"Carpeta: {carpeta}" in mail.enviados[0].get_content()
    reloj.t = inicio + 3 * 3600
    vig.ciclo()
    vigilante(entorno, reloj=Reloj(inicio + 4 * 3600)).ciclo()    # reinicio: ni el tope ni el «desde» se pierden
    assert len(mail.enviados) == 1
    reloj.t = inicio + 6 * 3600 + 32 * 60
    vig.ciclo()
    assert len(mail.enviados) == 2 and fake.calls == []
    foto.write_bytes(jpeg)                                         # se descargó: se publica y se olvida la espera
    assert vig.ciclo().resultado == "publicado" and vig.cargar_estado()["avisos"]["ilegibles"] == {}


def test_probar_mail_sin_config(entorno, buzon, capsys):
    assert vigilar.main(["--probar-mail"]) == 1
    out = capsys.readouterr().out
    assert "Faltan variables" in out and "SMTP_PASS" in out and buzon.conexiones == []
    assert not vigilar.LOG_PATH.exists()


def test_probar_mail_con_config(entorno, mail, capsys):
    assert vigilar.main(["--probar-mail"]) == 0
    out = capsys.readouterr().out
    assert mail.asuntos == ["[Sevencars] Vigilante: mail de prueba"] and "enviado" in out
    assert CONFIG["SMTP_PASS"] not in out
