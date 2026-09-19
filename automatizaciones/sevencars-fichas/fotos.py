"""Fotos editadas del coche: carpeta, orden natural, nombres SEO, recompresión y normalización de la carpeta."""
from __future__ import annotations

import io
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from common import strip_accents

CARPETAS = ("fotos", "Fotos", "editadas", "edit")
EXTS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_BYTES = 1_000_000          # por encima se recomprime
MAX_SIDE = 1920
TARGET_BYTES = 500_000
# Normalización de la carpeta fotos/: 1.jpg…N.jpg, JPEG, ≤ 400 KB y ≤ 1600 px de lado mayor
NORMAL_KB = 400
NORMAL_SIDE = 1600
CALIDAD_INICIAL, CALIDAD_MINIMA = 85, 40
ORIGINALES = "originales"
MANTENER, RECOMPRIMIR, RENOMBRAR, OMITIR = "mantener", "recomprimir", "renombrar", "omitir"
AVISO_SIN_CARPETA = ("no hay subcarpeta fotos/ en la carpeta del coche: las fotos van en <carpeta del coche>/fotos/ "
                     "(en la raíz solo van los documentos; la raíz no se escanea)")
_LEAD_NUM_RE = re.compile(r"^(\d+)")
_NUM_RE = re.compile(r"^(\d+)([a-z]?)$")
_PAREN_RE = re.compile(r"\((\d+)\)\s*$")


def carpeta_fotos(folder: Path) -> Path | None:
    for name in CARPETAS:
        p = Path(folder) / name
        if p.is_dir():
            return p
    return None


def clave_natural(nombre: str) -> tuple:
    """'1.jpg' < '2.jpg' < '3b.jpg' < '10.jpg'; 'ChatGPT Image … (7).jpg' -> 7; otros al final por nombre."""
    stem = Path(nombre).stem.strip().lower()
    m = _NUM_RE.match(stem)
    if m:
        return (0, int(m.group(1)), m.group(2), stem)
    m = _PAREN_RE.search(stem)
    if m:
        return (0, int(m.group(1)), "", stem)
    return (1, 0, "", stem)


def listar_fotos(carpeta: Path) -> list[Path]:
    """Archivos de imagen (sin subcarpetas ni Zone.Identifier), deduplicados por samefile, en orden natural."""
    vistos: set[tuple[int, int]] = set()
    out: list[Path] = []
    for p in Path(carpeta).iterdir():
        if not p.is_file() or "zone.identifier" in p.name.lower() or p.suffix.lower() not in EXTS:
            continue
        st = p.stat()
        key = (st.st_dev, st.st_ino)
        if key in vistos:
            continue
        vistos.add(key)
        out.append(p)
    return sorted(out, key=lambda p: clave_natural(p.name))


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", strip_accents(text).lower()).strip("-")


def nombre_seo(marca: str, modelo: str, matricula: str, idx: int) -> str:
    """('Kia', 'XCeed', '9028LXG', 1) -> 'kia-xceed-9028lxg-01.jpg'."""
    return f"{_slug(marca)}-{_slug(modelo)}-{_slug(matricula)}-{idx:02d}.jpg"


def alt_seo(marca: str, modelo: str, matricula: str, idx: int) -> str:
    return f"{marca} {modelo} {matricula} · foto {idx:02d}"


def preparar_jpeg(path: Path) -> bytes:
    """Bytes intactos si pesa ≤ 1 MB (y ya es JPEG); si no, recomprime: ≤ 1920 px, calidad decreciente hasta ≤ 500 KB."""
    path = Path(path)
    data = path.read_bytes()
    if len(data) <= MAX_BYTES and path.suffix.lower() in (".jpg", ".jpeg"):
        return data
    from PIL import Image, ImageOps
    with Image.open(io.BytesIO(data)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        scale = max(w, h) / float(MAX_SIDE)
        if scale > 1:
            img = img.resize((max(1, round(w / scale)), max(1, round(h / scale))))
        for quality in (85, 78, 70, 62, 55):
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            if buf.tell() <= TARGET_BYTES:
                break
        return buf.getvalue()


# ------------------------------------------------------------ normalización
def comprimir_bytes(path: Path, max_kb: int = NORMAL_KB, max_side: int = NORMAL_SIDE) -> bytes:
    """JPEG ≤ max_kb KB y ≤ max_side px de lado mayor, sin recortar ni deformar (misma lógica que
    editor-fotos-seven/comprimir_imagenes.py). Si ya es un JPEG que cumple, devuelve los bytes intactos."""
    from PIL import Image, ImageOps
    path = Path(path)
    data = path.read_bytes()
    max_bytes = max_kb * 1024
    with Image.open(io.BytesIO(data)) as img:
        if img.format == "JPEG" and len(data) <= max_bytes and max(img.size) <= max_side:
            return data
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            fondo = Image.new("RGB", img.size, (255, 255, 255))      # transparencia sobre blanco
            rgba = img.convert("RGBA")
            fondo.paste(rgba, mask=rgba.split()[-1])
            img = fondo
        else:
            img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > max_side:
            escala = max_side / max(w, h)
            img = img.resize((max(1, int(w * escala)), max(1, int(h * escala))), Image.LANCZOS)
        reducciones = 0
        while True:
            calidad = CALIDAD_INICIAL
            buf = io.BytesIO()
            while calidad >= CALIDAD_MINIMA:
                buf.seek(0)
                buf.truncate()
                img.save(buf, format="JPEG", quality=calidad, optimize=True, progressive=True)
                if buf.tell() <= max_bytes:
                    break
                calidad -= 5
            if buf.tell() <= max_bytes or reducciones >= 4:
                return buf.getvalue()
            img = img.resize((max(1, int(img.size[0] * 0.85)), max(1, int(img.size[1] * 0.85))), Image.LANCZOS)
            reducciones += 1


def _cumple(path: Path, max_kb: int = NORMAL_KB, max_side: int = NORMAL_SIDE) -> bool | None:
    """True si ya es JPEG ≤ max_kb KB y ≤ max_side px; False si hay que recomprimir; None si no se puede leer."""
    from PIL import Image
    try:
        with Image.open(path) as img:
            return img.format == "JPEG" and path.stat().st_size <= max_kb * 1024 and max(img.size) <= max_side
    except (OSError, ValueError):
        return None


@dataclass
class Item:
    """Un archivo de fotos/ y lo que le toca: destino 'N.jpg' y acción (mantener, recomprimir, renombrar, omitir)."""
    origen: Path
    destino: str
    accion: str
    numero: int
    recomprime: bool = False
    original: Path | None = None        # adónde fue el original al ejecutar (solo si cambiaron los bytes)

    @property
    def cambia(self) -> bool:
        return self.accion in (RECOMPRIMIR, RENOMBRAR)

    def describir(self) -> str:
        if self.accion == RECOMPRIMIR:
            return f"'{self.origen.name}' recomprimida"
        if self.accion == RENOMBRAR:
            return f"'{self.origen.name}' -> {self.destino}" + (" (convertida)" if self.recomprime else "")
        if self.accion == OMITIR:
            return f"'{self.origen.name}' no se pudo leer (se deja como está)"
        return f"'{self.origen.name}' ok"


@dataclass
class Resultado:
    carpeta: Path
    plan: list[Item] = field(default_factory=list)
    ejecutado: bool = False

    @property
    def cambios(self) -> list[Item]:
        return [it for it in self.plan if it.cambia]

    @property
    def omitidos(self) -> list[Item]:
        return [it for it in self.plan if it.accion == OMITIR]

    @property
    def a_originales(self) -> list[Item]:
        """Los que cambian de bytes: su original va (o iría) a originales/. Un cambio de nombre no deja copia."""
        return [it for it in self.cambios if it.recomprime]

    @property
    def fotos(self) -> list[Item]:
        return [it for it in self.plan if it.accion != OMITIR]


def _orden_normalizacion(archivos: list[Path]) -> list[Path]:
    """portada.* primero; después los que empiezan por número, en orden natural; el resto por fecha de
    modificación (orden de descarga) y, a igual fecha, por nombre."""
    portada, numerados, resto = [], [], []
    for p in archivos:
        stem = p.stem.strip().lower()
        if stem == "portada":
            portada.append(p)
        elif _LEAD_NUM_RE.match(stem):
            numerados.append(p)
        else:
            resto.append(p)
    portada.sort(key=lambda p: p.name.lower())
    numerados.sort(key=lambda p: (int(_LEAD_NUM_RE.match(p.stem.strip().lower()).group(1)), clave_natural(p.name)))
    resto.sort(key=lambda p: (p.stat().st_mtime_ns, p.name.lower()))
    return portada + numerados + resto


def planificar_normalizacion(carpeta: Path) -> list[Item]:
    """Plan para dejar la carpeta como 1.jpg…N.jpg (JPEG ≤ 400 KB, ≤ 1600 px). Sin efectos secundarios."""
    carpeta = Path(carpeta)
    plan: list[Item] = []
    numero = 0
    for p in _orden_normalizacion(listar_fotos(carpeta)):
        cumple = _cumple(p)
        if cumple is None:
            plan.append(Item(p, p.name, OMITIR, 0))
            continue
        numero += 1
        destino = f"{numero}.jpg"
        if p.name != destino:
            accion = RENOMBRAR
        elif cumple:
            accion = MANTENER
        else:
            accion = RECOMPRIMIR
        plan.append(Item(p, destino, accion, numero, recomprime=not cumple))
    return plan


def _nombre_libre(carpeta: Path, nombre: str) -> Path:
    """Ruta que no existe en `carpeta`: 'x.png', 'x (2).png', 'x (3).png'…"""
    p = Path(carpeta) / nombre
    n = 2
    while p.exists():
        p = Path(carpeta) / f"{Path(nombre).stem} ({n}){Path(nombre).suffix}"
        n += 1
    return p


def normalizar_carpeta(carpeta: Path, ejecutar: bool) -> Resultado:
    """Aplica el plan en tres fases para que una foto pueda pasar de 2.jpg a 3.jpg mientras otra nueva ocupa 2.jpg:
    1) las que cambian de bytes se escriben en un temporal (si algo falla se limpian y la carpeta queda como
    estaba); 2) se liberan los nombres: el original de cada recomprimida va a originales/ (nunca se borra nada)
    y las que solo cambian de nombre pasan al temporal sin copiarse; 3) los temporales toman su nombre
    definitivo. Con ejecutar=False solo devuelve el plan."""
    carpeta = Path(carpeta)
    res = Resultado(carpeta, planificar_normalizacion(carpeta))
    cambios = res.cambios
    if not ejecutar or not cambios:
        return res

    def temporal(it: Item) -> Path:
        return carpeta / f"{it.destino}.tmp"

    escritos: list[Path] = []
    try:
        for it in res.a_originales:
            tmp = temporal(it)
            escritos.append(tmp)
            tmp.write_bytes(comprimir_bytes(it.origen))
            st = it.origen.stat()
            os.utime(tmp, ns=(st.st_atime_ns, st.st_mtime_ns))
    except BaseException:
        for tmp in escritos:
            tmp.unlink(missing_ok=True)
        raise
    originales = carpeta / ORIGINALES
    for it in cambios:
        if it.recomprime:
            originales.mkdir(exist_ok=True)
            it.original = _nombre_libre(originales, it.origen.name)
            it.origen.rename(it.original)
        else:
            it.origen.rename(temporal(it))
    for it in cambios:
        temporal(it).replace(carpeta / it.destino)
    res.ejecutado = True
    return res


def _n(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def resumen_normalizacion(res: Resultado, maximo: int = 5) -> str:
    """Una línea en castellano: 'fotos/: 18 fotos listas (3 cambios: … ; originales en fotos/originales/)'."""
    nombre = res.carpeta.name + "/"
    total = len(res.fotos)
    cambios = res.cambios
    extra = ""
    if res.omitidos:
        extra = "; " + ", ".join(it.describir() for it in res.omitidos)
    if not total and not res.omitidos:
        return f"{nombre}: sin fotos"
    if not cambios:
        return f"{nombre}: {_n(total, 'foto ya normalizada', 'fotos ya normalizadas')}{extra}"
    detalle = ", ".join(it.describir() for it in cambios[:maximo])
    if len(cambios) > maximo:
        detalle += f" y {len(cambios) - maximo} más"
    listas = _n(total, "foto lista", "fotos listas")
    cuantos = _n(len(cambios), "cambio", "cambios")
    if res.ejecutado:
        nota = f"; originales en {nombre}{ORIGINALES}/" if any(it.original for it in cambios) else ""
        return f"{nombre}: {listas} ({cuantos}: {detalle}{nota}){extra}"
    nota = f"; los originales irían a {nombre}{ORIGINALES}/" if res.a_originales else ""
    return f"{nombre}: se haría: {listas} ({cuantos}: {detalle}{nota}){extra}"
