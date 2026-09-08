"""vigilar.py: vigilante de fotos nuevas, con un 1_Ventas falso en tmp_path y publicar.py doblado (subprocess.run)."""
import fcntl
import json
import logging
import os
import subprocess
import time
from pathlib import Path

import pytest
from PIL import Image

import vigilar
from tests.conftest import write_jpeg

KIA = "82-Kia Xceed-9028LXG"
CLIO = "58-Renault Clio-0110MLK"
URL = "https://www.sevencars.es/wp-admin/post.php?post=555&action=edit"
LUNA = "Luna: precio1.jpg (15.) · precio2.jpg (795) · cuota.jpg (244) → /1_Ventas/82-Kia Xceed-9028LXG/luna"
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
    coche(entorno, CLIO, fotos=())                              # en orden: no aparece en la tabla
    rc = vigilar.main(["--estado", "--ventas-dir", str(entorno)])
    assert rc == 0 and "no se ejecutó nunca" in capsys.readouterr().out
    vig = vigilante(entorno, reintento=1800)
    punto_de_partida(vig)
    vig.ciclo()
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
    (1, SALIDA_GOOGLE, True, ("google_autorizar", "")),
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
