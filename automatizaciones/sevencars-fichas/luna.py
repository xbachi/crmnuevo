#!/usr/bin/env python
"""Imágenes para la hoja de precios de la luna (el cartel del parabrisas): el precio en miles («12.»), en cientos
(«120») y la cuota mensual («214»), generadas a partir de las plantillas de plantillas/luna/ cambiando solo los
dígitos (mismo tamaño A4 apaisado a 300 ppp, mismo marco, misma fuente y altura de dígito).

Uso: luna.py <ref> [--salida DIR] [--simular]
     luna.py --matricula 1234ABC [--salida DIR] [--simular]

Valores: precio luna = PRECIO CONTADO (F) − descuento de financiación de la tarifa ESTANDAR (el `dto` de
cuota.calcular_financiacion; sin renove ni los 390 € de gestión). Ejemplo: 12485 − 365 = 12120 → «12.» y «120».
La cuota es la misma que se publica en la web; si no hay plazo posible no se genera cuota.jpg.
Salida: <carpeta del coche>/precios/precio1.jpg, precio2.jpg y cuota.jpg (se pisan). publicar.py las genera solo
al crear el producto y en --actualizar --solo-financiacion (`--sin-luna` lo evita).
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

import locate
from common import PROJECT_DIR, parse_number
from cuota import Financiacion, calcular_financiacion
from gauth import CredentialsMissing, credentials_help
from sheet import SheetError, open_sheet

EXIT_OK, EXIT_ERROR = 0, 1
PLANTILLAS_DIR = PROJECT_DIR / "plantillas" / "luna"
CARPETA_SALIDA = "precios"                  # subcarpeta del coche donde quedan las imágenes
NOMBRES = ("precio1", "precio2", "cuota")
ARCHIVOS_SALIDA = {n: f"{n}.jpg" for n in NOMBRES}
# Archivo de cada plantilla: precio1.jpg («31.» con marco rectangular, los miles), precio2.jpg («585» grande entre
# dos líneas a todo el ancho, los cientos) y cuota.jpg («483» con marco rectangular, la cuota).
ARCHIVOS_PLANTILLA = {n: f"{n}.jpg" for n in NOMBRES}

# Fuente de los dígitos. Comparando la tinta de cada plantilla con su propio texto dibujado a la misma altura de
# dígito (puntuar_fuente, IoU de máscaras): Arial Bold 0,80 / 0,81 / 0,76 (precio1 / precio2 / cuota), Arial
# Black 0,30 / 0,38 / 0,34, Impact 0,39 / 0,44 / 0,40; ninguna otra negrita de Windows pasa de 0,72. Los dígitos
# de la plantilla miden lo mismo que los de Arial Bold; solo van algo más juntos (ver _tracking).
FUENTES_CANDIDATAS = ("/mnt/c/Windows/Fonts/arialbd.ttf", "/mnt/c/Windows/Fonts/ariblk.ttf",
                      "/mnt/c/Windows/Fonts/impact.ttf")
FUENTE_POR_DEFECTO = FUENTES_CANDIDATAS[0]
ENV_FUENTE = "LUNA_FONT"

DIGITOS = "0123456789"          # la altura de dígito se mide sobre los diez (incluye el sobrante de los redondos)
UMBRAL_TINTA = 128              # gris < 128 = tinta
GROSOR_MAX_LINEA = 4            # px: una fila/columna con más de la mitad de tinta y este grosor es línea del marco
TOLERANCIA_ANCHO = 0.03         # el texto se encoge solo si sobrepasa el ancho disponible en más de un 3 %: dos
                                # textos del mismo largo difieren hasta un 2,5 % por los laterales del primer y
                                # el último dígito («4» es más ancho que «5») y no vale la pena cambiar la altura
JPEG_CALIDAD = 92
PPP = (300, 300)


class LunaError(Exception):
    """Algo impide generar las imágenes (sin precio, sin fuente, plantilla cambiada…)."""


# ------------------------------------------------------------------ geometría de las plantillas
@dataclass(frozen=True)
class Geometria:
    """Medidas de una plantilla en píxeles. Las cajas son inclusivas: (x0, y0, x1, y1) con x1 e y1 dentro."""
    tamano: tuple[int, int]                  # (ancho, alto)
    marco: str                               # "rectangulo" (líneas de 1 px por los cuatro lados) o "lineas"
                                             # (dos horizontales de 2 px a todo el ancho)
    interior: tuple[int, int, int, int]      # estrictamente dentro del marco: es lo que se pinta de blanco
    glifos: tuple[int, int, int, int]        # caja de la tinta de los dígitos de la plantilla
    texto: str                               # lo que dice la plantilla

    @property
    def alto_digitos(self) -> int:
        return self.glifos[3] - self.glifos[1] + 1

    @property
    def ancho_texto(self) -> int:
        return self.glifos[2] - self.glifos[0] + 1

    @property
    def centro_interior_x(self) -> float:
        return (self.interior[0] + self.interior[2]) / 2

    @property
    def desplazamiento_x(self) -> float:
        """Cuánto está corrido el centro del texto respecto del centro del marco (negativo = a la izquierda)."""
        return (self.glifos[0] + self.glifos[2]) / 2 - self.centro_interior_x

    @property
    def linea_media_y(self) -> float:
        return (self.glifos[1] + self.glifos[3]) / 2

    @property
    def margen_izquierdo(self) -> int:
        return self.glifos[0] - self.interior[0]

    @property
    def margen_derecho(self) -> int:
        return self.interior[2] - self.glifos[2]

    @property
    def ancho_disponible(self) -> int:
        """Interior menos los márgenes laterales de la plantilla: lo que ocupa su propio texto."""
        return self.interior[2] - self.interior[0] + 1 - self.margen_izquierdo - self.margen_derecho


# Medidas obtenidas con medir_plantilla() (Pillow: escala de grises, tinta = gris < 128, medias por fila y por
# columna; una fila o columna con más de la mitad de tinta y ≤ 4 px de grosor es una línea del marco; el interior
# es lo que queda estrictamente dentro y la caja de los glifos, getbbox() de la tinta del interior).
# test_luna::test_plantillas_medidas vuelve a medir los archivos y exige estos valores: si alguien cambia una
# plantilla, se nota.
GEOMETRIAS = {
    "precio1": Geometria((3508, 2480), "rectangulo", (338, 414, 3171, 2066), (454, 510, 3028, 2000), "31."),
    "precio2": Geometria((3508, 2480), "lineas", (0, 361, 3507, 2013), (169, 458, 3328, 1948), "585"),
    "cuota": Geometria((3508, 2480), "rectangulo", (338, 474, 3171, 2007), (403, 608, 3099, 1872), "483"),
}


def ruta_plantilla(plantilla: str) -> Path:
    return PLANTILLAS_DIR / ARCHIVOS_PLANTILLA[plantilla]


def _mascara(im: Image.Image) -> Image.Image:
    """Máscara L de la tinta: 255 donde el gris es < UMBRAL_TINTA, 0 en el resto."""
    return ImageOps.grayscale(im).point(lambda p: 255 if p < UMBRAL_TINTA else 0)


def _lineas(medias: bytes) -> list[tuple[int, int]]:
    """Tramos [inicio, fin] de filas/columnas con más de la mitad de tinta (media > 127) y de ≤ GROSOR_MAX_LINEA
    de grosor: las líneas del marco. Los trazos de los dígitos también superan la mitad, pero son mucho más gruesos."""
    tramos: list[list[int]] = []
    for i, v in enumerate(medias):
        if v <= 127:
            continue
        if tramos and i == tramos[-1][1] + 1:
            tramos[-1][1] = i
        else:
            tramos.append([i, i])
    return [(a, b) for a, b in tramos if b - a + 1 <= GROSOR_MAX_LINEA]


def medir_plantilla(ruta: Path, texto: str) -> Geometria:
    """Mide una plantilla solo con Pillow: la media de tinta por fila y por columna (resize BOX a 1 px) da las
    líneas del marco (ver _lineas); con líneas verticales el marco es un rectángulo, si no son dos líneas
    horizontales a todo el ancho. El interior es lo estrictamente interior al marco y la caja de los glifos,
    getbbox() de la tinta que hay dentro."""
    im = Image.open(ruta)
    m = _mascara(im)
    ancho, alto = m.size
    horizontales = _lineas(m.resize((1, alto), Image.Resampling.BOX).tobytes())
    verticales = _lineas(m.resize((ancho, 1), Image.Resampling.BOX).tobytes())
    if len(horizontales) < 2:
        raise LunaError(f"{ruta.name}: no encuentro las dos líneas horizontales del marco")
    arriba, abajo = horizontales[0], horizontales[-1]
    if len(verticales) >= 2:
        marco = "rectangulo"
        interior = (verticales[0][1] + 1, arriba[1] + 1, verticales[-1][0] - 1, abajo[0] - 1)
    else:
        marco = "lineas"
        interior = (0, arriba[1] + 1, ancho - 1, abajo[0] - 1)
    caja = m.crop((interior[0], interior[1], interior[2] + 1, interior[3] + 1)).getbbox()
    if caja is None:
        raise LunaError(f"{ruta.name}: no hay dígitos dentro del marco")
    glifos = (caja[0] + interior[0], caja[1] + interior[1], caja[2] - 1 + interior[0], caja[3] - 1 + interior[1])
    return Geometria((ancho, alto), marco, interior, glifos, texto)


# ------------------------------------------------------------------ fuente y texto
def ruta_fuente(ruta: str | os.PathLike | None = None) -> Path:
    """La fuente de los dígitos: `ruta` si se da, si no la variable de entorno LUNA_FONT, si no Arial Bold de
    Windows (FUENTE_POR_DEFECTO). Error claro si el archivo no existe."""
    elegida = str(ruta) if ruta else (os.environ.get(ENV_FUENTE) or FUENTE_POR_DEFECTO)
    if not Path(elegida).is_file():
        raise LunaError(f"No encuentro la fuente de los dígitos de la luna: {elegida}. Indicá otra con la variable "
                        f"{ENV_FUENTE} (por ejemplo {ENV_FUENTE}={FUENTE_POR_DEFECTO}).")
    return Path(elegida)


@lru_cache(maxsize=16)
def _fuente(ruta: str | Path, tamano: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(ruta), tamano)


@lru_cache(maxsize=512)
def _tinta_caracter(ruta: str, tamano: int, c: str) -> tuple[int, int, int, int]:
    """Caja de tinta exclusiva (x0, y0, x1, y1) de un carácter respecto de su ancla «ls» (x = origen, y = línea
    base), medida sobre el carácter dibujado: getbbox() de Pillow da en horizontal el ancho de avance, no la tinta."""
    fnt = _fuente(ruta, tamano)
    izq, arriba, der, abajo = fnt.getbbox(c, anchor="ls")
    margen = tamano // 4 + 2
    lienzo = Image.new("L", (int(der - izq) + 2 * margen, int(abajo - arriba) + 2 * margen), 0)
    ImageDraw.Draw(lienzo).text((margen - izq, margen - arriba), c, font=fnt, fill=255, anchor="ls")
    caja = lienzo.point(lambda p: 255 if p >= UMBRAL_TINTA else 0).getbbox()
    if caja is None:
        return (0, 0, 0, 0)
    return (caja[0] - margen + izq, caja[1] - margen + arriba, caja[2] - margen + izq, caja[3] - margen + arriba)


def _caja_texto(fuente: ImageFont.FreeTypeFont, texto: str, tracking: float = 0.0):
    """Posición x de cada carácter (dibujado con ancla «ls», línea base en y = 0) y caja de tinta exclusiva
    (x0, y0, x1, y1) del conjunto, con `tracking` píxeles extra entre caracteres (negativo = más juntos)."""
    xs: list[float] = []
    caja = None
    x = 0.0
    for c in texto:
        izq, arriba, der, abajo = _tinta_caracter(fuente.path, fuente.size, c)
        xs.append(x)
        actual = (x + izq, arriba, x + der, abajo)
        caja = actual if caja is None else (min(caja[0], actual[0]), min(caja[1], actual[1]),
                                            max(caja[2], actual[2]), max(caja[3], actual[3]))
        x += fuente.getlength(c) + tracking
    return xs, caja


def _alto_digitos(fuente: ImageFont.FreeTypeFont) -> int:
    _, caja = _caja_texto(fuente, DIGITOS)
    return int(round(caja[3] - caja[1]))


@lru_cache(maxsize=32)
def _tamano_para_alto(ruta: str, alto: int) -> int:
    """Tamaño de fuente con el que los dígitos miden `alto` px (la altura es lineal con el tamaño: se estima a
    1000 y se afina ±1)."""
    base = max(1, int(round(alto * 1000 / _alto_digitos(_fuente(Path(ruta), 1000)))))
    return min((base - 1, base, base + 1), key=lambda t: (abs(_alto_digitos(_fuente(Path(ruta), t)) - alto), t))


def _tracking(fuente: ImageFont.FreeTypeFont, geom: Geometria) -> float:
    """Separación extra entre caracteres para que el texto de la plantilla, dibujado con esta fuente, mida lo
    mismo que en la plantilla (los dígitos de las plantillas van un 2-3 % más juntos que en Arial Bold)."""
    if len(geom.texto) < 2:
        return 0.0
    _, caja = _caja_texto(fuente, geom.texto)
    return (geom.ancho_texto - (caja[2] - caja[0])) / (len(geom.texto) - 1)


def _dibujar(im: Image.Image, fuente: ImageFont.FreeTypeFont, texto: str, xs: list[float], x_tinta: int,
             linea_base: int) -> None:
    """Dibuja `texto` en negro con la tinta empezando en x_tinta y la línea base en linea_base."""
    d = ImageDraw.Draw(im)
    for c, x in zip(texto, xs):
        d.text((int(round(x_tinta + x)), linea_base), c, font=fuente, fill=(0, 0, 0), anchor="ls")


def renderizar(plantilla: str, texto: str, fuente: str | os.PathLike | None = None) -> Image.Image:
    """La plantilla con `texto` en lugar de sus dígitos: se pinta de blanco el interior del marco (las líneas
    quedan intactas) y se dibuja el texto con la misma altura de dígito, la misma línea base y el mismo centro
    horizontal que el de la plantilla. Si es más ancho que el hueco de la plantilla (interior menos sus márgenes)
    se reduce la fuente hasta que quepa, centrado en la misma línea media."""
    if plantilla not in GEOMETRIAS:
        raise LunaError(f"plantilla desconocida «{plantilla}» (hay {', '.join(NOMBRES)})")
    if not texto:
        raise LunaError(f"{plantilla}: no hay texto que dibujar")
    geom = GEOMETRIAS[plantilla]
    ruta = ruta_fuente(fuente)
    im = Image.open(ruta_plantilla(plantilla)).convert("RGB")
    if im.size != geom.tamano:
        raise LunaError(f"{ruta_plantilla(plantilla).name} mide {im.size[0]}×{im.size[1]} y se esperaba "
                        f"{geom.tamano[0]}×{geom.tamano[1]}: plantilla cambiada, hay que volver a medirla")
    ImageDraw.Draw(im).rectangle(geom.interior, fill=(255, 255, 255))

    tamano = _tamano_para_alto(str(ruta), geom.alto_digitos)
    fnt = _fuente(ruta, tamano)
    tracking = _tracking(fnt, geom)
    xs, caja = _caja_texto(fnt, texto, tracking)
    ancho = caja[2] - caja[0]
    encoge = ancho > geom.ancho_disponible * (1 + TOLERANCIA_ANCHO)
    if encoge:
        tamano_red = max(8, int(tamano * geom.ancho_disponible / ancho))
        while True:
            fnt = _fuente(ruta, tamano_red)
            xs, caja = _caja_texto(fnt, texto, tracking * tamano_red / tamano)
            ancho = caja[2] - caja[0]
            if ancho <= geom.ancho_disponible or tamano_red <= 8:
                break
            tamano_red -= max(1, tamano_red // 200)

    _, ref = _caja_texto(fnt, DIGITOS)               # caja de los diez dígitos respecto de la línea base
    if encoge:                                        # centrado en la línea media de la plantilla
        linea_base = int(round(geom.linea_media_y - (ref[1] + ref[3] - 1) / 2))
    else:                                             # misma línea base: el borde inferior de los dígitos coincide
        linea_base = int(round(geom.glifos[3] - ref[3] + 1))
    centro_x = geom.centro_interior_x + geom.desplazamiento_x
    x_tinta = int(round(centro_x - (ancho - 1) / 2 - caja[0]))
    _dibujar(im, fnt, texto, xs, x_tinta, linea_base)
    return im


def guardar(im: Image.Image, ruta: Path) -> Path:
    """JPEG del mismo tamaño que la plantilla, 300 ppp, calidad 92."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    im.save(ruta, "JPEG", quality=JPEG_CALIDAD, optimize=True, dpi=PPP)
    return ruta


def puntuar_fuente(plantilla: str, ruta: str | os.PathLike) -> float:
    """Parecido entre la tinta de la plantilla y su propio texto dibujado con la fuente `ruta` a la misma altura
    de dígito: IoU de las dos máscaras alineadas por la esquina superior izquierda de su caja (1 = idénticas)."""
    geom = GEOMETRIAS[plantilla]
    g = geom.glifos
    tinta = _mascara(Image.open(ruta_plantilla(plantilla))).crop((g[0], g[1], g[2] + 1, g[3] + 1))
    fnt = _fuente(Path(ruta), _tamano_para_alto(str(ruta), geom.alto_digitos))
    xs, caja = _caja_texto(fnt, geom.texto)
    lienzo = Image.new("RGB", (int(caja[2] - caja[0]) + 4, int(caja[3] - caja[1]) + 4), (255, 255, 255))
    _dibujar(lienzo, fnt, geom.texto, xs, int(round(2 - caja[0])), int(round(2 - caja[1])))
    dibujo = _mascara(lienzo)
    dibujo = dibujo.crop(dibujo.getbbox())
    tam = (max(tinta.width, dibujo.width), max(tinta.height, dibujo.height))
    a, b = Image.new("L", tam, 0), Image.new("L", tam, 0)
    a.paste(tinta, (0, 0))
    b.paste(dibujo, (0, 0))
    union = ImageChops.lighter(a, b).histogram()[255]
    return ImageChops.multiply(a, b).histogram()[255] / union if union else 0.0


# ------------------------------------------------------------------ valores
@dataclass
class TextosLuna:
    precio_contado: int
    precio_luna: int                    # contado − dto de financiación
    financiacion: Financiacion
    textos: dict[str, str]              # precio1 y precio2 siempre; cuota solo si la hay
    avisos: list[str] = field(default_factory=list)


def formatear_precio(precio_luna: int) -> tuple[str, str]:
    """(miles con punto, cientos a tres cifras): 12120 → ('12.', '120'); 12000 → ('12.', '000'); 9985 → ('9.', '985')."""
    return f"{precio_luna // 1000}.", f"{precio_luna % 1000:03d}"


def textos_luna(precio_contado, fecha_matriculacion: date | None, tarifa=None, hoy: date | None = None) -> TextosLuna:
    """Los tres textos de la luna a partir del precio contado (F), la fecha de matriculación (E) y la tarifa (J):
    precio luna = contado − dto de financiación ESTANDAR (sin renove ni gestión); cuota la de la web."""
    precio = parse_number(precio_contado)
    if not precio or precio <= 0:
        raise LunaError("sin PRECIO CONTADO (F): no hay precio que poner en la luna")
    fin = calcular_financiacion(precio, fecha_matriculacion, tarifa, hoy)
    avisos: list[str] = []
    dto = fin.dto
    if dto is None:
        avisos.append("sin tarifa de financiación (faltan la fecha de matriculación E y la tarifa J): el precio de "
                      "la luna va sin descuento")
        dto = 0
    contado = int(round(precio))
    precio_luna = contado - dto
    miles, cientos = formatear_precio(precio_luna)
    textos = {"precio1": miles, "precio2": cientos}
    if fin.cuota is not None:
        textos["cuota"] = str(fin.cuota)
    else:
        avisos.append(f"sin cuota ({fin.nota or 'no hay plazo posible'}): no se genera cuota.jpg")
    return TextosLuna(precio_contado=contado, precio_luna=precio_luna, financiacion=fin, textos=textos, avisos=avisos)


@dataclass
class ResultadoLuna:
    carpeta: Path                       # carpeta de salida (…/precios)
    precio_luna: int
    textos: dict[str, str]
    rutas: dict[str, Path]              # archivos generados
    avisos: list[str]
    financiacion: Financiacion

    def resumen(self) -> str:
        """«precio1.jpg (12.) · precio2.jpg (120) · cuota.jpg (214) → /…/precios» (o «sin cuota.jpg»)."""
        partes = [f"{ARCHIVOS_SALIDA[n]} ({self.textos[n]})" for n in NOMBRES if n in self.textos]
        if "cuota" not in self.textos:
            partes.append("sin cuota.jpg")
        return " · ".join(partes) + f" → {self.carpeta}"


def generar_luna(carpeta_coche: str | os.PathLike, precio_contado, fecha_matriculacion: date | None, tarifa=None,
                 hoy: date | None = None, salida: str | os.PathLike | None = None,
                 fuente: str | os.PathLike | None = None) -> ResultadoLuna:
    """Genera precio1.jpg, precio2.jpg y (si hay cuota) cuota.jpg en <carpeta_coche>/precios/ (o en `salida`),
    pisando lo que hubiera. Sin cuota, borra un cuota.jpg viejo para que no se imprima una cuota que ya no vale."""
    destino = Path(salida) if salida else Path(carpeta_coche) / CARPETA_SALIDA
    t = textos_luna(precio_contado, fecha_matriculacion, tarifa, hoy)
    rutas: dict[str, Path] = {}
    for nombre in NOMBRES:
        ruta = destino / ARCHIVOS_SALIDA[nombre]
        if nombre in t.textos:
            rutas[nombre] = guardar(renderizar(nombre, t.textos[nombre], fuente), ruta)
        elif ruta.exists():
            ruta.unlink()
            t.avisos.append(f"borrado {ruta.name} anterior (ya no hay cuota)")
    return ResultadoLuna(carpeta=destino, precio_luna=t.precio_luna, textos=t.textos, rutas=rutas, avisos=t.avisos,
                         financiacion=t.financiacion)


# ------------------------------------------------------------------ CLI
def say(msg: str = "") -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print("⚠ " + msg, flush=True)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="luna.py",
                                description="Genera las imágenes de la luna (precio en miles y cientos, y cuota) de un coche")
    p.add_argument("referencia", nargs="?", help="referencia de la hoja (1082, 26, D29...); opcional con --matricula")
    p.add_argument("--matricula", action="append", default=[], help="buscar la fila por matrícula en vez de por referencia")
    p.add_argument("--fila", action="append", type=int, default=[], help=argparse.SUPPRESS)
    p.add_argument("--salida", metavar="DIR", help="carpeta de salida (por defecto <carpeta del coche>/precios)")
    p.add_argument("--simular", action="store_true", help="mostrar los textos y las rutas sin escribir nada")
    p.add_argument("--sheet", metavar="XLSX", help=argparse.SUPPRESS)
    p.add_argument("--ventas-dir", default=str(locate.DEFAULT_VENTAS_DIR), help=argparse.SUPPRESS)
    return p


def ejecutar(args, data, folders) -> int:
    """Fila y carpeta como publicar.py, textos, y las imágenes salvo con --simular."""
    from publicar import _fila_y_carpeta          # publicar importa luna: se importa aquí para no dar vueltas

    row, loc = _fila_y_carpeta(args, data, folders)
    if row is None:
        return EXIT_ERROR
    if args.salida:
        destino = Path(args.salida)
    elif loc.found:
        destino = loc.folder.path / CARPETA_SALIDA
    else:
        warn("Sin carpeta del coche: indicá dónde dejar las imágenes con --salida DIR.")
        return EXIT_ERROR
    try:
        t = textos_luna(row.precio_contado, row.fecha_matriculacion, row.tarifa_financiacion)
    except LunaError as exc:
        warn(str(exc))
        return EXIT_ERROR
    fin = t.financiacion
    say(f"Precio luna: {t.precio_luna} € = {t.precio_contado} contado − {fin.dto or 0} dto financiación"
        + (f" (tarifa {fin.tarifa})" if fin.tarifa else ""))
    for nombre in NOMBRES:
        if nombre in t.textos:
            say(f"  {ARCHIVOS_SALIDA[nombre]}: «{t.textos[nombre]}» → {destino / ARCHIVOS_SALIDA[nombre]}")
    for aviso in t.avisos:
        warn(aviso)
    if args.simular:
        say("Simulación: no se escribe nada.")
        return EXIT_OK
    try:
        res = generar_luna(destino.parent, row.precio_contado, row.fecha_matriculacion, row.tarifa_financiacion,
                           salida=destino)
    except (LunaError, OSError) as exc:
        warn(f"No se generaron las imágenes: {exc}")
        return EXIT_ERROR
    say(f"Luna: {res.resumen()}")
    return EXIT_OK


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.referencia and not args.matricula and not args.fila:
        parser.error("indicá la referencia de la hoja o --matricula <matrícula>")
    try:
        sheet_src = open_sheet(args.sheet)
        data = sheet_src.load()
        say(f"Hoja Base_Datos: {sheet_src.label} — {len(data.rows)} filas con referencia")
        folders = locate.scan_folders(args.ventas_dir)
    except CredentialsMissing as exc:
        say(credentials_help(exc))
        return 3
    except (SheetError, FileNotFoundError) as exc:
        say(f"Error: {exc}")
        return EXIT_ERROR
    return ejecutar(args, data, folders)


if __name__ == "__main__":
    sys.exit(main())
