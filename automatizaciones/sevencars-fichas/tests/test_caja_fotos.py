"""Caja de cambios: orden de evidencias, dos pasadas de fotos con Claude Code simulado, caché y veredicto."""
import json
import os
import time
from types import SimpleNamespace

import pytest

import caja_fotos
import extract_claude
from caja_fotos import (ALTA, AUTOMATICO, BAJA, DUDA, MANUAL, MAX_FOTOS_PASO1, MAX_FOTOS_PASO2, MEDIA, SCHEMA_PASO1,
                        SCHEMA_PASO2, CajaVerdict, caja_por_texto, detectar_caja)
from extract import cache_key
from fotos import listar_fotos
from tests.conftest import write_jpeg

FOLDER = "82-Kia Xceed-9028LXG"


class FakeRun:
    """Sustituye subprocess.run. `outputs`: lista de (returncode, stdout, stderr) o excepciones.
    Registra el comando, el cwd y los archivos presentes en el cwd en el momento de la llamada."""

    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def __call__(self, cmd, **kwargs):
        cwd = kwargs.get("cwd")
        self.calls.append({"cmd": cmd, "cwd": cwd, "files": sorted(os.listdir(cwd)) if cwd else None, **kwargs})
        item = self.outputs.pop(0)
        if isinstance(item, BaseException):
            raise item
        rc, out, err = item
        return SimpleNamespace(returncode=rc, stdout=out, stderr=err)


def envelope(structured: dict) -> str:
    return json.dumps({"type": "result", "subtype": "success", "is_error": False, "num_turns": 2,
                       "structured_output": structured})


def paso1(*marcadas, archivos=None, orden=None):
    """Envelope de la pasada 1: una entrada por archivo; `marcadas` llevan muestra_palanca_o_pedales=True.
    `orden` permite devolver las entradas en otro orden que el de la galería."""
    nombres = list(orden or archivos or marcadas)
    fotos = [{"archivo": n, "clase": "interior" if n in marcadas else "exterior",
              "muestra_palanca_o_pedales": n in marcadas} for n in nombres]
    return (0, envelope({"fotos": fotos}), "")


def paso2(caja=MANUAL, confianza=ALTA, foto="7.jpg", motivo="tres pedales"):
    return (0, envelope({"caja": caja, "confianza": confianza, "foto": foto, "motivo": motivo}), "")


def prompt_de(call) -> str:
    return call["cmd"][call["cmd"].index("-p") + 1]


def schema_de(call) -> dict:
    return json.loads(call["cmd"][call["cmd"].index("--json-schema") + 1])


def opcion(call, flag) -> str:
    return call["cmd"][call["cmd"].index(flag) + 1]


@pytest.fixture
def fake(monkeypatch):
    def install(outputs):
        runner = FakeRun(outputs)
        monkeypatch.setattr(extract_claude.subprocess, "run", runner)
        return runner
    return install


@pytest.fixture
def fotos(tmp_path):
    d = tmp_path / "fotos"
    d.mkdir()
    for i in range(1, 9):
        write_jpeg(d / f"{i}.jpg", size=(64, 48))
    return listar_fotos(d)


@pytest.fixture
def cache_dir(tmp_path):
    return tmp_path / "cache"


# --------------------------------------------------------- evidencias 1-2
def test_caja_por_texto():
    v = caja_por_texto("Golf 2.0 TDI DSG")
    assert (v.caja, v.fuente, v.confianza) == (AUTOMATICO, "MODELO", ALTA) and v.escribible
    v = caja_por_texto("Clio MT6")
    assert (v.caja, v.fuente) == (MANUAL, "MODELO")
    v = caja_por_texto("Model 3", "Eléctrico")
    assert (v.caja, v.fuente) == (AUTOMATICO, "eléctrico") and v.escribible and "eléctricos" in v.motivo
    assert caja_por_texto("Nissan Qashqai", "Gasolina") is None
    assert caja_por_texto(None) is None
    assert caja_por_texto("", "Híbrido") is None


def test_detectar_caja_sin_fotos_desactivado(fake, fotos, cache_dir):
    runner = fake([])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, sin_fotos=True, cache_dir=cache_dir)
    assert (v.caja, v.fuente, v.confianza) == (DUDA, "ninguna", BAJA) and not v.escribible and not v.decidido
    assert "desactivada" in v.motivo
    texto = v.para_verificar()
    assert texto.startswith("caja: sin confirmar") and "sin fuente" in texto and "desactivada" in texto
    assert runner.calls == []


def test_detectar_caja_lista_vacia(fake, cache_dir):
    runner = fake([])
    v = detectar_caja("Nissan Qashqai", "Gasolina", [], FOLDER, cache_dir=cache_dir)
    assert v.caja == DUDA and v.fuente == "ninguna" and v.motivo == "sin fotos"
    assert runner.calls == []
    assert detectar_caja("Nissan Qashqai", None, None, FOLDER, cache_dir=cache_dir).caja == DUDA


def test_modelo_decide_sin_llamar_a_la_ia(fake, fotos, cache_dir):
    runner = fake([])
    v = detectar_caja("Golf 2.0 TDI DSG", "Diésel", fotos, FOLDER, cache_dir=cache_dir)
    assert (v.caja, v.fuente) == (AUTOMATICO, "MODELO") and v.escribible
    v = detectar_caja("Tesla Model 3", "Eléctrico", fotos, FOLDER, cache_dir=cache_dir)
    assert (v.caja, v.fuente) == (AUTOMATICO, "eléctrico")
    assert runner.calls == []


# ------------------------------------------------------------- con fotos
def test_dos_pasadas_manual_alta(fake, fotos, cache_dir):
    runner = fake([paso1("3.jpg", "7.jpg", archivos=[f"{i}.jpg" for i in range(1, 11)]), paso2()])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert (v.caja, v.fuente, v.confianza, v.foto, v.motivo) == (MANUAL, "fotos", ALTA, "7.jpg", "tres pedales")
    assert v.escribible and v.para_verificar() is None
    assert len(runner.calls) == 2
    c1, c2 = runner.calls
    nombres = [p.name for p in fotos]
    assert all(n in prompt_de(c1) for n in nombres) and ", ".join(nombres) in prompt_de(c1)
    assert schema_de(c1) == SCHEMA_PASO1 and opcion(c1, "--max-turns") == "4"
    assert c1["files"] == sorted(nombres)
    assert "3.jpg, 7.jpg" in prompt_de(c2) and "1.jpg" not in prompt_de(c2)
    assert schema_de(c2) == SCHEMA_PASO2 and opcion(c2, "--max-turns") == "4"
    assert c2["files"] == ["3.jpg", "7.jpg"]
    assert c1["cwd"] != c2["cwd"] and not os.path.exists(c1["cwd"]) and not os.path.exists(c2["cwd"])
    for c in (c1, c2):
        assert c["capture_output"] is True and c["text"] is True and c["timeout"] == caja_fotos.TIMEOUT_S
        assert opcion(c, "--output-format") == "json" and opcion(c, "--allowedTools") == "Read"


def test_paso1_envia_todas_las_fotos_y_paso2_hasta_cinco(fake, tmp_path, cache_dir):
    d = tmp_path / "muchas"
    d.mkdir()
    for i in range(1, 21):
        write_jpeg(d / f"{i}.jpg")
    fotos = listar_fotos(d)
    marcadas = ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg", "20.jpg"]
    runner = fake([paso1(*marcadas, archivos=[p.name for p in fotos]), paso2(foto="2.jpg")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert v.caja == MANUAL
    c1, c2 = runner.calls
    assert c1["files"] == sorted(p.name for p in fotos) and len(c1["files"]) == 20   # TODAS, sin muestreo
    assert "20.jpg" in prompt_de(c1) and "Archivos (20)" in prompt_de(c1)
    assert c2["files"] == sorted(["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"])      # primeras 5 candidatas
    assert "6.jpg" not in prompt_de(c2) and "20.jpg" not in prompt_de(c2)


def test_paso1_tope_de_galeria_absurda(fake, tmp_path, cache_dir):
    d = tmp_path / "galeria"
    d.mkdir()
    for i in range(1, MAX_FOTOS_PASO1 + 6):
        write_jpeg(d / f"{i}.jpg")
    fotos = listar_fotos(d)
    runner = fake([paso1("3.jpg", archivos=[p.name for p in fotos[:MAX_FOTOS_PASO1]]), paso2(foto="3.jpg")])
    detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    c1 = runner.calls[0]
    assert len(c1["files"]) == MAX_FOTOS_PASO1 and f"{MAX_FOTOS_PASO1 + 5}.jpg" not in c1["files"]


def test_seleccion_en_orden_de_galeria_no_del_modelo(fake, fotos, cache_dir):
    # el modelo devuelve las entradas desordenadas: la selección respeta el orden natural de las fotos
    nombres = [p.name for p in fotos]
    runner = fake([paso1("7.jpg", "3.jpg", orden=list(reversed(nombres))), paso2(foto="3.jpg")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert v.caja == MANUAL
    assert "3.jpg, 7.jpg" in prompt_de(runner.calls[1])
    data = json.loads(caja_fotos.cache_path_caja(FOLDER, cache_dir).read_text(encoding="utf-8"))
    assert data["paso1"] == ["3.jpg", "7.jpg"] and data["tandas"] == [["3.jpg", "7.jpg"]]


def test_duda_reintenta_con_la_siguiente_tanda(fake, tmp_path, cache_dir):
    d = tmp_path / "muchas"
    d.mkdir()
    for i in range(1, 13):
        write_jpeg(d / f"{i}.jpg")
    fotos = listar_fotos(d)
    marcadas = [f"{i}.jpg" for i in (1, 2, 3, 4, 5, 6, 7)]
    runner = fake([paso1(*marcadas, archivos=[p.name for p in fotos]),
                   paso2(DUDA, BAJA, "", "no se ve la palanca"),
                   paso2(MANUAL, ALTA, "7.jpg", "pomo con esquema en H y números")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert (v.caja, v.confianza, v.foto) == (MANUAL, ALTA, "7.jpg") and v.escribible
    assert len(runner.calls) == 3
    assert runner.calls[1]["files"] == sorted(marcadas[:5]) and runner.calls[2]["files"] == sorted(marcadas[5:])
    data = json.loads(caja_fotos.cache_path_caja(FOLDER, cache_dir).read_text(encoding="utf-8"))
    assert data["tandas"] == [marcadas[:5], marcadas[5:]]


def test_duda_sin_mas_candidatas_no_reintenta(fake, fotos, cache_dir):
    runner = fake([paso1("3.jpg"), paso2(DUDA, BAJA, "", "no se ve")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert v.caja == DUDA and not v.escribible and len(runner.calls) == 2


def test_prompt_paso1_describe_la_zona_objetivo(fake, fotos, cache_dir):
    runner = fake([paso1("3.jpg"), paso2(foto="3.jpg")])
    detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    p1 = prompt_de(runner.calls[0])
    for frase in ("entre los asientos delanteros", "pomo de la palanca", "consola central", "pedales",
                  "muestra_palanca_o_pedales", "exterior", "interior", "detalle"):
        assert frase in p1
    assert "volante" in p1 and "ruedas" in p1                      # exclusiones explícitas
    p2 = prompt_de(runner.calls[1])
    assert "esquema en H" in p2 and "MANUAL" in p2 and "confianza alta" in p2


def test_confianza_media_no_escribe(fake, fotos, cache_dir):
    fake([paso1("3.jpg"), paso2(AUTOMATICO, MEDIA, "3.jpg", "selector P R N D poco visible")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert (v.caja, v.confianza) == (AUTOMATICO, MEDIA) and v.decidido and not v.escribible
    texto = v.para_verificar()
    assert "sin confirmar" in texto and "Automático según fotos" in texto and "media" in texto and "P R N D" in texto


def test_paso1_sin_fotos_utiles(fake, fotos, cache_dir):
    runner = fake([paso1()])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert (v.caja, v.fuente, v.confianza) == (DUDA, "fotos", BAJA) and "ninguna foto" in v.motivo
    assert len(runner.calls) == 1
    assert "sin fuente" in v.para_verificar()


def test_paso1_nombres_desconocidos_se_ignoran(fake, fotos, cache_dir):
    runner = fake([paso1("99.jpg", "/etc/passwd", "3.JPG")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert v.caja == DUDA and "ninguna foto" in v.motivo and len(runner.calls) == 1


def test_paso2_valores_fuera_de_enum(fake, fotos, cache_dir):
    fake([paso1("3.jpg"), (0, envelope({"caja": "Secuencial", "confianza": "altísima", "foto": None, "motivo": None}), "")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert (v.caja, v.confianza, v.foto, v.motivo) == (DUDA, BAJA, "", "") and not v.escribible


def test_error_del_cli(fake, fotos, cache_dir):
    fake([(1, "", "Error: usage limit reached")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert (v.caja, v.fuente, v.confianza) == (DUDA, "fotos", BAJA) and "error de la IA" in v.motivo
    assert not caja_fotos.cache_path_caja(FOLDER, cache_dir).exists()       # un fallo no se cachea


def test_error_en_paso2(fake, fotos, cache_dir):
    fake([paso1("3.jpg"), (0, "esto no es json", "")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert v.caja == DUDA and "error de la IA" in v.motivo


def test_cli_ausente(fake, fotos, cache_dir):
    fake([FileNotFoundError("claude")])
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert v.caja == DUDA and "error de la IA" in v.motivo


# ------------------------------------------------------------------ caché
def test_cache_por_carpeta(fake, fotos, cache_dir):
    runner = fake([paso1("3.jpg", "7.jpg"), paso2(), paso1("3.jpg"), paso2(AUTOMATICO, ALTA, "3.jpg", "dos pedales"),
                   paso1("7.jpg"), paso2(MANUAL, MEDIA, "7.jpg", "pomo en H")])
    v1 = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert v1.caja == MANUAL and len(runner.calls) == 2
    path = caja_fotos.cache_path_caja(FOLDER, cache_dir)
    assert path.is_file() and path.name == f"{cache_key(FOLDER)}-caja.json" and path.name.endswith("-caja.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["paso1"] == ["3.jpg", "7.jpg"] and data["veredicto"]["caja"] == MANUAL and data["carpeta"] == FOLDER
    assert [f["nombre"] for f in data["fotos"]] == [p.name for p in fotos]

    v2 = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert len(runner.calls) == 2                                        # sin llamada nueva
    assert (v2.caja, v2.fuente, v2.confianza, v2.foto) == (MANUAL, "fotos", ALTA, "7.jpg")
    assert v2.avisos and "caché" in v2.avisos[0] and v2.escribible

    v3 = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, force=True, cache_dir=cache_dir)
    assert len(runner.calls) == 4 and v3.caja == AUTOMATICO and v3.avisos == []

    t = time.time() + 100
    os.utime(fotos[2], (t, t))
    v4 = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert len(runner.calls) == 6 and (v4.caja, v4.confianza) == (MANUAL, MEDIA)
    assert json.loads(path.read_text(encoding="utf-8"))["veredicto"]["confianza"] == MEDIA


def test_cache_corrupta_se_ignora(fake, fotos, cache_dir):
    runner = fake([paso1("3.jpg"), paso2()])
    path = caja_fotos.cache_path_caja(FOLDER, cache_dir)
    path.parent.mkdir(parents=True)
    path.write_text("{no json", encoding="utf-8")
    v = detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir)
    assert v.caja == MANUAL and len(runner.calls) == 2
    assert json.loads(path.read_text(encoding="utf-8"))["veredicto"]["caja"] == MANUAL


def test_cache_de_otra_carpeta_no_se_reutiliza(fake, fotos, cache_dir):
    runner = fake([paso1("3.jpg"), paso2(), paso1("3.jpg"), paso2(AUTOMATICO)])
    assert detectar_caja("Nissan Qashqai", "Gasolina", fotos, FOLDER, cache_dir=cache_dir).caja == MANUAL
    assert detectar_caja("Nissan Qashqai", "Gasolina", fotos, "83-Otro-1111BBB", cache_dir=cache_dir).caja == AUTOMATICO
    assert len(runner.calls) == 4


# ---------------------------------------------------------------- veredicto
@pytest.mark.parametrize("caja,fuente,confianza,esperado", [
    (MANUAL, "fotos", ALTA, True), (AUTOMATICO, "fotos", ALTA, True), (MANUAL, "fotos", MEDIA, False),
    (MANUAL, "fotos", BAJA, False), (DUDA, "fotos", ALTA, False), (DUDA, "ninguna", BAJA, False),
    (MANUAL, "MODELO", ALTA, True), (MANUAL, "MODELO", MEDIA, True), (AUTOMATICO, "MODELO", BAJA, True),
    (AUTOMATICO, "eléctrico", MEDIA, True), (DUDA, "MODELO", ALTA, False),
])
def test_escribible(caja, fuente, confianza, esperado):
    v = CajaVerdict(caja, fuente, confianza)
    assert v.escribible is esperado
    assert v.decidido is (caja != DUDA)
    assert (v.para_verificar() is None) is esperado


def test_para_verificar_textos():
    assert CajaVerdict(DUDA, "ninguna", BAJA).para_verificar() == "caja: sin confirmar (revisar en el borrador) — sin fuente"
    v = CajaVerdict(MANUAL, "fotos", MEDIA, "7.jpg", "pomo en H")
    assert v.para_verificar() == "caja: sin confirmar (revisar en el borrador) — Manual según fotos, confianza media; pomo en H"
