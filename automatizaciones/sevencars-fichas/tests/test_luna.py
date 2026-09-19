"""luna.py: imágenes para la hoja de precios de la luna, con las plantillas reales y la salida en tmp_path."""
import argparse
from datetime import date
from pathlib import Path

import pytest
from PIL import Image, ImageChops, ImageOps

import locate
import luna
from sheet import SheetData

HAY_FUENTE = Path(luna.FUENTE_POR_DEFECTO).is_file()
con_fuente = pytest.mark.skipif(not HAY_FUENTE, reason=f"hace falta la fuente {luna.FUENTE_POR_DEFECTO}")
# Opel Astra: 12485 € ESPECIAL → dto 365 → 12120 («12.» y «120»); cuota 214 €/mes (hoy = 08/09/2026, conftest)
ASTRA = (12485, date(2019, 11, 29), "ESPECIAL")
TAMANO = (3508, 2480)


def mascara(im):
    return ImageOps.grayscale(im).point(lambda p: 255 if p < 128 else 0)


def tinta_interior(im, geom):
    """Caja exclusiva de la tinta dentro del marco, en coordenadas del interior."""
    x0, y0, x1, y1 = geom.interior
    return mascara(im).crop((x0, y0, x1 + 1, y1 + 1)).getbbox()


def media_abs(diff):
    h = diff.histogram()
    return sum(i * v for i, v in enumerate(h)) / (diff.width * diff.height)


# ---------------------------------------------------------------- valores
@pytest.mark.parametrize("precio_luna, esperado", [
    (12120, ("12.", "120")), (12000, ("12.", "000")), (9985, ("9.", "985")), (31483, ("31.", "483")), (10005, ("10.", "005")),
])
def test_formatear_precio(precio_luna, esperado):
    assert luna.formatear_precio(precio_luna) == esperado


def test_textos_astra():
    t = luna.textos_luna(*ASTRA)
    assert (t.precio_contado, t.precio_luna, t.financiacion.dto, t.financiacion.cuota) == (12485, 12120, 365, 214)
    assert t.textos == {"precio1": "12.", "precio2": "120", "cuota": "214"} and t.avisos == []
    assert luna.textos_luna("12485", date(2019, 11, 29), "ESPECIAL").textos == t.textos      # el precio como texto
    assert luna.textos_luna(12000, date(2019, 11, 29), "SIN DTO").textos["precio2"] == "000"


def test_textos_sin_cuota_ni_descuento():
    """Coche de 2010 (más de 156 meses): tarifa Consultanos sin descuento y sin plazo posible → sin cuota.jpg."""
    t = luna.textos_luna(12485, date(2010, 1, 1))
    assert t.precio_luna == 12485 and t.textos == {"precio1": "12.", "precio2": "485"}
    assert len(t.avisos) == 1 and "sin cuota" in t.avisos[0] and "sin plazo" in t.avisos[0]


def test_textos_sin_fecha_ni_tarifa():
    t = luna.textos_luna(12485, None)
    assert t.precio_luna == 12485 and "cuota" not in t.textos
    assert any("sin tarifa" in a for a in t.avisos) and any("sin cuota" in a for a in t.avisos)
    con_tarifa = luna.textos_luna(12485, None, "ESPECIAL")           # J rellena pero sin E: dto sí, cuota no
    assert con_tarifa.precio_luna == 12120 and "cuota" not in con_tarifa.textos


def test_textos_sin_precio():
    for precio in (None, "", 0, "sin precio"):
        with pytest.raises(luna.LunaError, match="PRECIO CONTADO"):
            luna.textos_luna(precio, date(2019, 11, 29))


# ---------------------------------------------------------------- plantillas y fuente
def test_plantillas_medidas():
    """Vuelve a medir los archivos de plantillas/luna/: si alguien cambia (o renombra) una plantilla, las
    constantes ya no valen y hay que revisarlas."""
    for nombre in luna.NOMBRES:
        assert luna.medir_plantilla(luna.ruta_plantilla(nombre), luna.GEOMETRIAS[nombre].texto) == luna.GEOMETRIAS[nombre], nombre
    g1, g2, gc = (luna.GEOMETRIAS[n] for n in luna.NOMBRES)
    assert g1.marco == gc.marco == "rectangulo" and g2.marco == "lineas"
    assert g1.alto_digitos == g2.alto_digitos == 1491 and gc.alto_digitos == 1265
    assert g1.ancho_disponible == g1.ancho_texto == 2575 and abs(g1.desplazamiento_x) < 20


def test_ruta_fuente(monkeypatch, tmp_path):
    monkeypatch.delenv(luna.ENV_FUENTE, raising=False)
    if HAY_FUENTE:
        assert luna.ruta_fuente() == Path(luna.FUENTE_POR_DEFECTO)
    monkeypatch.setenv(luna.ENV_FUENTE, str(tmp_path / "no-existe.ttf"))
    with pytest.raises(luna.LunaError, match="No encuentro la fuente"):
        luna.ruta_fuente()
    falsa = tmp_path / "otra.ttf"
    falsa.write_bytes(b"x")
    assert luna.ruta_fuente(falsa) == falsa                       # la explícita manda sobre LUNA_FONT
    monkeypatch.setenv(luna.ENV_FUENTE, str(falsa))
    assert luna.ruta_fuente() == falsa


@con_fuente
def test_arial_bold_es_la_fuente_que_mas_se_parece():
    disponibles = [f for f in luna.FUENTES_CANDIDATAS if Path(f).is_file()]
    for nombre in luna.NOMBRES:
        puntos = {f: luna.puntuar_fuente(nombre, f) for f in disponibles}
        assert puntos[luna.FUENTE_POR_DEFECTO] > 0.7, (nombre, puntos)
        assert max(puntos, key=puntos.get) == luna.FUENTE_POR_DEFECTO, (nombre, puntos)


# ---------------------------------------------------------------- render
@con_fuente
@pytest.mark.parametrize("nombre, texto", [("precio1", "12."), ("precio2", "120"), ("cuota", "214"),
                                           ("cuota", "000"), ("precio1", "9."), ("precio2", "585"), ("cuota", "483")])
def test_renderizar_conserva_marco_altura_y_centro(nombre, texto, tmp_path):
    geom = luna.GEOMETRIAS[nombre]
    plantilla = Image.open(luna.ruta_plantilla(nombre)).convert("RGB")
    ruta = luna.guardar(luna.renderizar(nombre, texto), tmp_path / f"{nombre}.jpg")
    salida = Image.open(ruta)
    assert salida.size == TAMANO and salida.mode == "RGB" and salida.format == "JPEG"
    assert tuple(round(v) for v in salida.info["dpi"]) == (300, 300)
    # marco intacto: las filas/columnas de las líneas (y sus vecinas) casi iguales, salvo ruido JPEG
    diff = ImageChops.difference(ImageOps.grayscale(plantilla), ImageOps.grayscale(salida))
    x0, y0, x1, y1 = geom.interior
    franjas = [(0, y0 - 3, TAMANO[0], y0), (0, y1 + 1, TAMANO[0], y1 + 4)]
    if geom.marco == "rectangulo":
        franjas += [(x0 - 2, 0, x0, TAMANO[1]), (x1 + 1, 0, x1 + 3, TAMANO[1])]
    for franja in franjas:
        assert media_abs(diff.crop(franja)) < 8, franja
    # dígitos: hay tinta, con la altura de la plantilla (±3 %), su centro horizontal y sin pasarse del hueco
    caja = tinta_interior(salida, geom)
    assert caja is not None
    alto, ancho = caja[3] - caja[1], caja[2] - caja[0]
    assert abs(alto - geom.alto_digitos) <= 0.03 * geom.alto_digitos, (alto, geom.alto_digitos)
    centro = (caja[0] + caja[2] - 1) / 2 + x0
    assert abs(centro - (geom.glifos[0] + geom.glifos[2]) / 2) <= 3
    assert ancho <= geom.ancho_disponible * (1 + luna.TOLERANCIA_ANCHO) + 2
    if texto == geom.texto:                                        # el propio texto de la plantilla: mismo sitio
        assert abs(caja[0] + x0 - geom.glifos[0]) <= 3 and abs(caja[3] - 1 + y0 - geom.glifos[3]) <= 3


@con_fuente
def test_texto_largo_se_encoge_centrado_en_la_linea_media():
    geom = luna.GEOMETRIAS["cuota"]
    caja = tinta_interior(luna.renderizar("cuota", "9999"), geom)
    ancho, alto = caja[2] - caja[0], caja[3] - caja[1]
    assert ancho <= geom.ancho_disponible and 0.6 * geom.alto_digitos < alto < 0.85 * geom.alto_digitos
    assert abs((caja[1] + caja[3] - 1) / 2 + geom.interior[1] - geom.linea_media_y) <= 3


def test_renderizar_errores():
    with pytest.raises(luna.LunaError, match="plantilla desconocida"):
        luna.renderizar("otra", "1")
    with pytest.raises(luna.LunaError, match="no hay texto"):
        luna.renderizar("cuota", "")


@con_fuente
def test_generar_luna_astra(tmp_path):
    coche = tmp_path / "34-Opel Astra-1234ABC"
    coche.mkdir()
    res = luna.generar_luna(coche, *ASTRA)
    assert res.carpeta == coche / luna.CARPETA_SALIDA and res.precio_luna == 12120 and res.avisos == []
    assert res.textos == {"precio1": "12.", "precio2": "120", "cuota": "214"}
    assert sorted(p.name for p in res.carpeta.iterdir()) == ["cuota.jpg", "precio1.jpg", "precio2.jpg"]
    assert res.resumen() == f"precio1.jpg (12.) · precio2.jpg (120) · cuota.jpg (214) → {coche / luna.CARPETA_SALIDA}"
    for ruta in res.rutas.values():
        with Image.open(ruta) as im:
            assert im.size == TAMANO and im.format == "JPEG"
    res2 = luna.generar_luna(coche, 12000, date(2019, 11, 29), "SIN DTO")        # se pisan
    assert res2.textos["precio1"] == "12." and res2.textos["precio2"] == "000"


@con_fuente
def test_generar_luna_sin_cuota_no_escribe_cuota_y_borra_la_vieja(tmp_path):
    coche = tmp_path / "coche"
    (coche / luna.CARPETA_SALIDA).mkdir(parents=True)
    (coche / luna.CARPETA_SALIDA / "cuota.jpg").write_bytes(b"vieja")
    res = luna.generar_luna(coche, 12485, date(2010, 1, 1))
    assert set(res.rutas) == {"precio1", "precio2"} and not (coche / luna.CARPETA_SALIDA / "cuota.jpg").exists()
    assert any("sin cuota" in a for a in res.avisos) and any("borrado cuota.jpg" in a for a in res.avisos)
    assert res.resumen() == f"precio1.jpg (12.) · precio2.jpg (485) · sin cuota.jpg → {coche / luna.CARPETA_SALIDA}"


# ---------------------------------------------------------------- CLI (hoja en memoria, sin Google)
_HEADER = {0: "300", 2: "MODELO", 3: "MATRICULA", 4: "FECHA MATRICULACION", 5: "PRECIO CONTADO", 9: "TARIFA FINANCIACION"}


def hoja(precio="12485", fecha="29/11/2019", tarifa="ESPECIAL"):
    fila = [""] * 31
    # la hoja dice 1034 y la carpeta empieza por 34- (locate.canonical_ref: en la CLI vale «34»)
    fila[0], fila[2], fila[3], fila[4], fila[5], fila[9] = "1034", "OPEL Astra 1.5D", "1234ABC", fecha, precio, tarifa
    return SheetData([[_HEADER.get(i, "") for i in range(31)], fila], "test")


@pytest.fixture
def carpeta(tmp_path):
    root = tmp_path / "34-Opel Astra-1234ABC"
    root.mkdir()
    return locate.make_car_folder(root, "1_Ventas")


def args(**over):
    base = dict(referencia="34", matricula=[], fila=[], salida=None, simular=False)
    base.update(over)
    return argparse.Namespace(**base)


def test_cli_simular_no_escribe(carpeta, capsys):
    rc = luna.ejecutar(args(simular=True), hoja(), [carpeta])
    out = capsys.readouterr().out
    assert rc == 0 and not (carpeta.path / luna.CARPETA_SALIDA).exists()
    assert "Precio luna: 12120 € = 12485 contado − 365 dto financiación (tarifa ESPECIAL)" in out
    assert f"precio1.jpg: «12.» → {carpeta.path / luna.CARPETA_SALIDA / 'precio1.jpg'}" in out
    assert "precio2.jpg: «120»" in out and "cuota.jpg: «214»" in out and "Simulación: no se escribe nada" in out


@con_fuente
def test_cli_genera_por_matricula_y_con_salida(carpeta, tmp_path, capsys):
    rc = luna.ejecutar(args(referencia=None, matricula=["1234ABC"]), hoja(), [carpeta])
    out = capsys.readouterr().out
    assert rc == 0 and f"Luna: precio1.jpg (12.) · precio2.jpg (120) · cuota.jpg (214) → {carpeta.path / luna.CARPETA_SALIDA}" in out
    assert (carpeta.path / luna.CARPETA_SALIDA / "cuota.jpg").exists()
    otra = tmp_path / "otra"
    assert luna.ejecutar(args(salida=str(otra)), hoja(), [carpeta]) == 0 and (otra / "precio1.jpg").exists()


def test_cli_errores(carpeta, capsys):
    assert luna.ejecutar(args(referencia="99"), hoja(), [carpeta]) == 1
    assert "no está en la hoja" in capsys.readouterr().out
    assert luna.ejecutar(args(simular=True), hoja(precio=""), [carpeta]) == 1
    assert "PRECIO CONTADO" in capsys.readouterr().out
    assert luna.ejecutar(args(simular=True), hoja(), []) == 1            # sin carpeta y sin --salida
    assert "--salida" in capsys.readouterr().out


def test_main_carga_la_hoja_y_las_carpetas(monkeypatch, carpeta, capsys):
    class Src:
        label = "test"

        def load(self):
            return hoja()
    monkeypatch.setattr(luna, "open_sheet", lambda sheet: Src())
    monkeypatch.setattr(locate, "scan_folders", lambda ventas_dir: [carpeta])
    assert luna.main(["34", "--simular"]) == 0
    out = capsys.readouterr().out
    assert "Hoja Base_Datos: test — 1 filas" in out and "Simulación" in out
    with pytest.raises(SystemExit):
        luna.main(["--simular"])                                        # sin referencia ni matrícula
