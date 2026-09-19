"""cochesnet.py preparar: carpeta lista para dar de alta el coche a mano en el panel de coches.net."""
import argparse
import json
from types import SimpleNamespace

import pytest

import caja_fotos
import cochesnet
import descripcion_cochesnet as desc_mod
import extract_claude
import locate
import verificar
from caja_fotos import CajaVerdict
from sheet import SheetData
from tests.conftest import write_jpeg

_HEADER_CELLS = {0: "300", 2: "MODELO", 3: "MATRICULA", 4: "FECHA MATRICULACION", 5: "PRECIO CONTADO",
                 9: "TARIFA FINANCIACION", 10: "GARANTIA", 13: "PRECIO CAMPAÑA", 14: "MESES GARANTIA FABRICA", 23: "kms", 24: "motor cv",
                 25: "cubicaje", 26: "caja", 27: "matriculacion", 28: "matriculacion num", 29: "cuota",
                 30: "bastidor", 31: "combustible"}
HEADER = [_HEADER_CELLS.get(i, "") for i in range(32)]
IDX = {"modelo": 2, "matricula": 3, "fecha_matriculacion": 4, "precio_contado": 5, "tarifa_financiacion": 9, "garantia": 10,
       "precio_campana": 13, "meses_garantia": 14, "kms": 23, "motor_cv": 24, "cubicaje": 25, "caja": 26,
       "matriculacion": 27, "matriculacion_num": 28, "cuota": 29, "bastidor": 30, "combustible": 31}

VIN = "SJNFAAJ11U2815852"
PLATE = "5475LKK"
FOLDER_NAME = "85-Nissan Qashqai-5475 LKK"
# Fila base "limpia": con versión en MODELO y con cilindrada/potencia que coinciden con el permiso
# (85 kW -> 116 CV), para que el camino feliz no genere avisos.
QASHQAI = dict(modelo="Nissan Qashqai 1.5 dCi Acenta", matricula=PLATE, fecha_matriculacion="15/10/2020",
               precio_contado="16485", precio_campana="14610", garantia="SI", meses_garantia="24", kms="101603",
               motor_cv="116", cubicaje="1461", caja="manual", matriculacion="Oct 2020", matriculacion_num="202010")


def fila(ref="1085", **fields):
    row = [""] * len(HEADER)
    row[0] = ref
    for k, v in fields.items():
        row[IDX[k]] = "" if v is None else str(v)
    return row


def datos(*extra, **over):
    campos = dict(QASHQAI)
    campos.update(over)
    return SheetData([HEADER, fila(**campos)] + list(extra), "test")


def ai_permiso(plate=PLATE, combustible="GASOIL", potencia_kw=85, cilindrada=1461):
    return {"permiso_circulacion": {"presente": True, "matricula": plate, "bastidor": VIN,
                                    "fecha_matriculacion": "2020-10-15", "fecha_primera_matriculacion": None,
                                    "combustible": combustible, "cilindrada_cc": cilindrada,
                                    "potencia_kw": potencia_kw, "marca": "NISSAN", "plazas": 5,
                                    "denominacion_comercial": "NISSAN QASHQAI"},
            "ficha_tecnica": {"presente": False}, "notas": ""}


class FakeSheetSrc:
    """La hoja de este comando es de solo lectura: cualquier escritura es un error."""
    can_write = True
    label = "test"
    writes: list = []

    def write(self, writes):
        raise AssertionError("preparar nunca debe escribir en la hoja")


def make_args(tmp_path, **over):
    base = dict(referencia="85", salida=str(tmp_path / "salida"), abrir=False, forzar=False, sin_fotos_caja=True,
                sin_descripcion=True, sin_normalizar_fotos=False, fila=[], sheet=None, ventas_dir="")
    base.update(over)
    return argparse.Namespace(**base)


# ------------------------------------------------------------------ dobles
@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("no se debe invocar el CLI de Claude en los tests")
    monkeypatch.setattr(extract_claude.subprocess, "run", boom)


@pytest.fixture
def lectura(monkeypatch):
    holder = {"ai": ai_permiso()}
    monkeypatch.setattr(verificar, "read_documents",
                        lambda state, loc, plate, docs, allow_ai=True: (holder["ai"], "caché", "caché"))
    return holder


@pytest.fixture
def caja(monkeypatch):
    holder = {"verdict": CajaVerdict("Duda", "ninguna", "baja", motivo="test")}

    def fake(modelo_texto, combustible=None, fotos=None, folder_name="", force=False, sin_fotos=False, cache_dir=None):
        return holder["verdict"]
    monkeypatch.setattr(caja_fotos, "detectar_caja", fake)
    return holder


@pytest.fixture
def carpeta(tmp_path):
    root = tmp_path / FOLDER_NAME
    (root / "fotos").mkdir(parents=True)
    for n in ("1.jpg", "2.jpg", "3.jpg"):
        write_jpeg(root / "fotos" / n)
    write_jpeg(root / "ficha técnica cara 1.jpeg")
    write_jpeg(root / "ficha técnica cara 2.jpeg")
    write_jpeg(root / "Permiso de circulación cara 1.jpeg")
    return locate.make_car_folder(root, "1_Ventas")


def run(args, data, carpeta):
    src = FakeSheetSrc()
    return cochesnet.preparar(args, src, data, [carpeta])


def leer_datos(destino) -> list[tuple[str, str]]:
    lineas = (destino / "datos.txt").read_text(encoding="utf-8").splitlines()
    return [tuple(linea.split(": ", 1)) if ": " in linea else (linea.rstrip(":"), "") for linea in lineas]


# ------------------------------------------------------------------ carpeta
def test_estructura_de_la_carpeta(lectura, caja, carpeta, tmp_path):
    args = make_args(tmp_path)
    assert run(args, datos(), carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    assert destino.is_dir()
    assert (destino / "datos.txt").is_file()
    # ficha técnica y permiso, cara 1 antes que cara 2, listos para subir de un clic
    assert sorted(p.name for p in (destino / "ficha-tecnica").iterdir()) == [
        "ficha-tecnica-cara-1.jpg", "ficha-tecnica-cara-2.jpg", "permiso-circulacion-cara-1.jpg"]
    # fotos en orden de galería con nombre SEO
    assert [p.name for p in sorted((destino / "fotos").iterdir())] == [
        f"nissan-qashqai-{PLATE.lower()}-{i:02d}.jpg" for i in (1, 2, 3)]
    assert all(p.stat().st_size <= 1_000_000 for p in (destino / "fotos").iterdir())
    # todo confirmado (caja en la hoja, combustible del permiso, no híbrido): sin avisos
    assert not (destino / "PARA-VERIFICAR.txt").exists()


def test_orden_y_valores_de_datos_txt(lectura, caja, carpeta, tmp_path, capsys):
    args = make_args(tmp_path)
    assert run(args, datos(), carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    campos = leer_datos(destino)
    assert [c for c, _ in campos] == cochesnet.CAMPOS_PANEL
    valores = dict(campos)
    assert valores["Marca"] == "Nissan" and valores["Modelo"] == "Qashqai"
    assert valores["Versión"] == "1.5 dCi Acenta"
    assert valores["Matrícula"] == PLATE and valores["Bastidor"] == VIN
    assert valores["Fecha de matriculación"] == "15/10/2020" and valores["Matriculación"] == "Oct 2020"
    assert valores["Kilómetros"] == "101.603" and valores["Potencia (CV)"] == "116"
    assert valores["Cilindrada (cc)"] == "1461" and valores["Combustible"] == "Diésel"
    assert valores["Cambio"] == "Manual"
    assert valores["Provincia"] == "Valencia" and valores["Población"] == "Alaquàs"
    assert valores["Precio al contado"] == "16.485 €" and valores["Precio financiado"] == "14.610 €"
    # Qashqai 16 485 € del 15/10/2020, hoy 08/09/2026: DAYS360 2123 → 70,8 meses → NORMAL; dto MROUND(1078,5) = 1080;
    # importe 16485 − 1080 + 390 = 15795; edad 70 → meses_max 110 → plazo 108 (0,016) → 252,7 → 253 €/mes.
    # 14 610 € de N es justo lo que la web recalcula (16485 − 1025 − 850).
    assert valores["Cuota"] == "253 €/mes (tarifa NORMAL (por antigüedad) · 108 meses · 15.795 € financiados)"
    assert valores["Garantía"] == "12 meses" and valores["Fotos"] == "3"
    assert all(cochesnet.SIN_CONFIRMAR not in v and cochesnet.FALTA not in v for _, v in campos)
    assert all("(permiso:" not in v for _, v in campos)
    salida = capsys.readouterr().out
    assert "Marca: Nissan" in salida and str(destino) in salida


def test_cilindrada_del_permiso_cuando_falta_en_la_hoja(lectura, caja, carpeta, tmp_path):
    assert run(make_args(tmp_path), datos(cubicaje=""), carpeta) == 0
    valores = dict(leer_datos(tmp_path / "salida" / f"1085-{PLATE}"))
    assert valores["Cilindrada (cc)"] == "1461"


# ------------------------------------------------------------ sin confirmar
def test_marcas_sin_confirmar_y_para_verificar(lectura, caja, carpeta, tmp_path, capsys):
    """Caja sin fuente, combustible deducido del MODELO y potencia de híbrido: los tres van marcados."""
    lectura["ai"] = ai_permiso(combustible=None)
    data = datos(caja="", modelo="Nissan Qashqai 1.6 PHEV 158cv", motor_cv="")
    assert run(make_args(tmp_path), data, carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    valores = dict(leer_datos(destino))
    assert valores["Cambio"] == cochesnet.FALTA
    assert valores["Combustible"] == f"Híbrido {cochesnet.SIN_CONFIRMAR}"
    assert valores["Potencia (CV)"] == f"158 {cochesnet.SIN_CONFIRMAR}"
    aviso = (destino / "PARA-VERIFICAR.txt").read_text(encoding="utf-8")
    assert "caja" in aviso and "combustible" in aviso and "potencia" in aviso
    # la línea específica de la caja explica el motivo: no se duplica con la genérica de "falta"
    assert aviso.count("cambio: falta en la hoja") == 0
    assert "PARA VERIFICAR" in capsys.readouterr().out


def test_bastidor_sin_confirmar_si_no_esta_en_ningun_lado(lectura, caja, carpeta, tmp_path):
    lectura["ai"] = ai_permiso()
    lectura["ai"]["permiso_circulacion"]["bastidor"] = None
    assert run(make_args(tmp_path), datos(), carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    assert dict(leer_datos(destino))["Bastidor"] == cochesnet.SIN_CONFIRMAR
    assert "bastidor" in (destino / "PARA-VERIFICAR.txt").read_text(encoding="utf-8")


def test_combustible_de_la_hoja_manda_y_queda_confirmado(lectura, caja, carpeta, tmp_path):
    lectura["ai"] = ai_permiso(combustible=None)
    assert run(make_args(tmp_path), datos(combustible="diesel"), carpeta) == 0
    valores = dict(leer_datos(tmp_path / "salida" / f"1085-{PLATE}"))
    assert valores["Combustible"] == "Diésel"


# ------------------------------------------------- obligatorios y discrepancias
def test_campos_obligatorios_vacios_se_marcan_falta(lectura, caja, carpeta, tmp_path):
    """Lo que el panel no deja vacío sale como (FALTA) y con una línea que dice dónde rellenarlo."""
    data = datos(modelo="Nissan Qashqai", kms="", precio_contado="", precio_campana="")
    assert run(make_args(tmp_path), data, carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    valores = dict(leer_datos(destino))
    assert valores["Versión"] == cochesnet.FALTA
    assert valores["Kilómetros"] == cochesnet.FALTA
    assert valores["Precio al contado"] == cochesnet.FALTA
    aviso = (destino / "PARA-VERIFICAR.txt").read_text(encoding="utf-8")
    assert "versión: falta en la hoja (columna C, MODELO), completala antes de publicar" in aviso
    assert "kilómetros: falta en la hoja (columna X)" in aviso
    assert "precio al contado: falta en la hoja (columna F)" in aviso


def test_discrepancias_con_el_permiso(lectura, caja, carpeta, tmp_path):
    """Manda la hoja, pero el valor del permiso se ve al lado y queda avisado."""
    data = datos(cubicaje="1500", motor_cv="110", bastidor="VF1RFB00X12345678", fecha_matriculacion="01/09/2020")
    assert run(make_args(tmp_path), data, carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    valores = dict(leer_datos(destino))
    assert valores["Cilindrada (cc)"] == "1500 (permiso: 1461)"
    assert valores["Potencia (CV)"] == "110 (permiso: 116)"
    assert valores["Fecha de matriculación"] == "01/09/2020 (permiso: 15/10/2020)"
    assert valores["Bastidor"] == f"VF1RFB00X12345678 (permiso: {VIN})"
    aviso = (destino / "PARA-VERIFICAR.txt").read_text(encoding="utf-8")
    for etiqueta in ("cilindrada", "potencia CV", "fecha de matriculación", "bastidor"):
        assert f"{etiqueta}: la hoja dice" in aviso
    assert aviso.count("se publica el de la hoja") == 4


def test_tolerancia_de_cv_no_avisa_por_el_redondeo(lectura, caja, carpeta, tmp_path):
    """85 kW son 116 CV redondeando: 114 en la hoja no es una discrepancia."""
    assert run(make_args(tmp_path), datos(motor_cv="114"), carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    assert dict(leer_datos(destino))["Potencia (CV)"] == "114"
    assert not (destino / "PARA-VERIFICAR.txt").exists()


def test_hibrido_no_compara_la_potencia_con_el_permiso(lectura, caja, carpeta, tmp_path):
    """En híbridos el permiso solo trae el motor térmico: la diferencia es esperable, no se enseña."""
    lectura["ai"] = ai_permiso(combustible="GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)")
    data = datos(modelo="Nissan Qashqai 1.6 PHEV", motor_cv="160")
    assert run(make_args(tmp_path), data, carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    assert dict(leer_datos(destino))["Potencia (CV)"] == f"160 {cochesnet.SIN_CONFIRMAR}"
    aviso = (destino / "PARA-VERIFICAR.txt").read_text(encoding="utf-8")
    assert "potencia: híbrido" in aviso and "potencia CV: la hoja dice" not in aviso


# ---------------------------------------------------------------- guardas
def test_identidad_no_confirmada_no_escribe_nada(lectura, caja, carpeta, tmp_path, capsys):
    lectura["ai"] = ai_permiso(plate="1111BBB")
    assert run(make_args(tmp_path), datos(), carpeta) == 1
    assert not (tmp_path / "salida").exists()
    assert "Identidad no confirmada" in capsys.readouterr().out


def test_referencia_inexistente_o_repetida(lectura, caja, carpeta, tmp_path, capsys):
    assert run(make_args(tmp_path, referencia="99"), datos(), carpeta) == 1
    assert "no está en la hoja" in capsys.readouterr().out
    data = datos(fila("1085", **QASHQAI))
    assert run(make_args(tmp_path), data, carpeta) == 1
    assert "--fila" in capsys.readouterr().out
    assert not (tmp_path / "salida").exists()
    assert run(make_args(tmp_path, fila=[3]), data, carpeta) == 0


# ------------------------------------------------------------------- extras
def test_foto_pesada_se_recomprime(lectura, caja, carpeta, tmp_path):
    from PIL import Image
    ruido = Image.effect_noise((2400, 1800), 60).convert("RGB")
    gorda = carpeta.path / "fotos" / "4.jpg"
    ruido.save(gorda, format="JPEG", quality=98)
    assert gorda.stat().st_size > 1_000_000
    assert run(make_args(tmp_path), datos(), carpeta) == 0
    salida = tmp_path / "salida" / f"1085-{PLATE}" / "fotos" / f"nissan-qashqai-{PLATE.lower()}-04.jpg"
    assert salida.is_file() and salida.stat().st_size <= 1_000_000


def test_segunda_pasada_limpia_los_archivos_viejos(lectura, caja, carpeta, tmp_path):
    args = make_args(tmp_path)
    assert run(args, datos(caja=""), carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    assert (destino / "PARA-VERIFICAR.txt").exists()
    (destino / "fotos" / "sobrante.jpg").write_bytes(b"basura")
    caja["verdict"] = CajaVerdict("Manual", "MODELO")
    assert run(args, datos(caja=""), carpeta) == 0
    assert not (destino / "fotos" / "sobrante.jpg").exists()
    assert not (destino / "PARA-VERIFICAR.txt").exists()
    assert dict(leer_datos(destino))["Cambio"] == "Manual"


def test_abrir_usa_el_explorador_de_windows(lectura, caja, carpeta, tmp_path, monkeypatch):
    llamadas = []

    class Res:
        stdout = "C:\\salida\\1085-5475LKK"

    def fake_run(cmd, **kw):
        llamadas.append(cmd)
        return Res()
    monkeypatch.setattr(cochesnet.subprocess, "run", fake_run)
    assert run(make_args(tmp_path, abrir=True), datos(), carpeta) == 0
    assert llamadas[0][:2] == ["wslpath", "-w"]
    assert llamadas[1] == ["explorer.exe", "C:\\salida\\1085-5475LKK"]


# ------------------------------------------------------------- descripción
def _fake_claude(monkeypatch, salida):
    """subprocess.run simulado para el generador de la descripción."""
    llamadas = []

    def fake_run(cmd, **kw):
        llamadas.append(cmd)
        if isinstance(salida, BaseException):
            raise salida
        return SimpleNamespace(returncode=salida[0], stdout=salida[1], stderr=salida[2])
    monkeypatch.setattr(extract_claude.subprocess, "run", fake_run)
    return llamadas


def test_descripcion_se_escribe_y_se_avisa(lectura, caja, carpeta, tmp_path, monkeypatch, capsys):
    partes = {"reclamo": "SUV diésel muy equipado", "parrafo": "Un SUV cómodo.",
              "tecnologia": ["Pantalla táctil"], "confort": ["Climatizador"],
              "exterior": ["Llantas de aleación"], "seguridad": ["Cámara trasera"]}
    envoltorio = json.dumps({"type": "result", "is_error": False, "structured_output": partes})
    monkeypatch.setattr(desc_mod, "CACHE_DIR", tmp_path / "desc")
    llamadas = _fake_claude(monkeypatch, (0, envoltorio, ""))
    assert run(make_args(tmp_path, sin_descripcion=False), datos(), carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    texto = (destino / "descripcion.txt").read_text(encoding="utf-8")
    assert len(llamadas) == 1
    assert texto.startswith("En SEVENCARS llevamos más de 15 años")
    assert "NISSAN QASHQAI 1.5 DCI ACENTA – SUV DIÉSEL MUY EQUIPADO" in texto
    assert "Etiqueta medioambiental: C" in texto and "Plazas: 5" in texto
    assert texto.endswith("SEVENCARS – Calidad en cada detalle\n")
    assert desc_mod.AVISO_VERIFICAR in (destino / "PARA-VERIFICAR.txt").read_text(encoding="utf-8")
    assert "descripcion.txt" in capsys.readouterr().out


def test_un_fallo_de_la_descripcion_no_rompe_preparar(lectura, caja, carpeta, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(desc_mod, "CACHE_DIR", tmp_path / "desc")
    _fake_claude(monkeypatch, (1, "", "usage limit reached"))
    assert run(make_args(tmp_path, sin_descripcion=False), datos(), carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    assert not (destino / "descripcion.txt").exists()
    assert (destino / "datos.txt").is_file() and (destino / "fotos").is_dir()
    salida = capsys.readouterr().out
    assert "no se pudo generar" in salida
    assert not (destino / "PARA-VERIFICAR.txt").exists()


def test_sin_descripcion_no_llama_al_generador(lectura, caja, carpeta, tmp_path, monkeypatch):
    llamadas = _fake_claude(monkeypatch, (0, "", ""))
    assert run(make_args(tmp_path), datos(), carpeta) == 0
    destino = tmp_path / "salida" / f"1085-{PLATE}"
    assert llamadas == [] and not (destino / "descripcion.txt").exists()


def test_abrir_ignora_los_fallos(lectura, caja, carpeta, tmp_path, monkeypatch):
    def fake_run(cmd, **kw):
        raise OSError("no hay explorer.exe")
    monkeypatch.setattr(cochesnet.subprocess, "run", fake_run)
    assert run(make_args(tmp_path, abrir=True), datos(), carpeta) == 0


# ------------------------------------------------------ normalizar fotos/
def _png_nueva(carpeta, nombre="ChatGPT Image 5 sept 2026, 10_23_45.png"):
    from PIL import Image
    p = carpeta.path / "fotos" / nombre
    Image.new("RGB", (300, 200), (1, 2, 3)).save(p, format="PNG")
    return p


def test_preparar_normaliza_la_carpeta_de_fotos_antes_de_copiar(lectura, caja, carpeta, tmp_path, capsys):
    nueva = _png_nueva(carpeta)
    assert run(make_args(tmp_path), datos(), carpeta) == 0
    fotos = carpeta.path / "fotos"
    assert sorted(p.name for p in fotos.iterdir() if p.is_file()) == ["1.jpg", "2.jpg", "3.jpg", "4.jpg"]
    assert (fotos / "originales" / nueva.name).is_file()
    destino = tmp_path / "salida" / f"1085-{PLATE}" / "fotos"
    assert sorted(p.name for p in destino.iterdir()) == [f"nissan-qashqai-{PLATE.lower()}-0{i}.jpg" for i in range(1, 5)]
    out = capsys.readouterr().out
    assert f"fotos/: 4 fotos listas (1 cambio: '{nueva.name}' -> 4.jpg (convertida); originales en fotos/originales/)" in out
    assert "portada dudosa" not in out


def test_preparar_sin_normalizar_fotos_deja_la_carpeta(lectura, caja, carpeta, tmp_path, capsys):
    nueva = _png_nueva(carpeta)
    assert run(make_args(tmp_path, sin_normalizar_fotos=True), datos(), carpeta) == 0
    assert nueva.is_file() and not (carpeta.path / "fotos" / "originales").exists()
    destino = tmp_path / "salida" / f"1085-{PLATE}" / "fotos"
    assert len(list(destino.iterdir())) == 4                  # se copia igual, convertida al vuelo
    assert "fotos/:" not in capsys.readouterr().out


def test_preparar_sin_subcarpeta_fotos_avisa(lectura, caja, carpeta, tmp_path, capsys):
    import shutil
    shutil.rmtree(carpeta.path / "fotos")
    assert run(make_args(tmp_path), datos(), carpeta) == 0
    assert "las fotos van en <carpeta del coche>/fotos/" in capsys.readouterr().out


def test_flag_sin_normalizar_fotos_en_el_parser(monkeypatch):
    visto = {}
    monkeypatch.setattr(cochesnet, "cmd_preparar", lambda args: visto.update(vars(args)) or 0)
    monkeypatch.setattr(cochesnet.sys, "argv", ["cochesnet.py", "preparar", "85", "--sin-normalizar-fotos"])
    assert cochesnet.main() == 0 and visto["sin_normalizar_fotos"] is True
