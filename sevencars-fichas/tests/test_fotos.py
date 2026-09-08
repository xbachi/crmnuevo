"""Fotos editadas: carpeta, orden natural, nombres SEO y recompresión."""
import io
import os

import pytest
from PIL import Image

from fotos import (MAX_BYTES, MAX_SIDE, TARGET_BYTES, alt_seo, carpeta_fotos, clave_natural, listar_fotos, nombre_seo,
                   preparar_jpeg)
from tests.conftest import write_jpeg


# ------------------------------------------------------------ orden natural
def test_clave_natural_orden():
    nombres = ["10.jpg", "3b.jpg", "ChatGPT Image 1 sept 2026 (1).jpg", "2.jpg", "portada.jpg", "1.jpg", "3.jpg",
               "ChatGPT Image 1 sept 2026 (7).jpg", "zzz.png"]
    assert sorted(nombres, key=clave_natural) == [
        "1.jpg", "ChatGPT Image 1 sept 2026 (1).jpg", "2.jpg", "3.jpg", "3b.jpg",
        "ChatGPT Image 1 sept 2026 (7).jpg", "10.jpg", "portada.jpg", "zzz.png"]


def test_clave_natural_numero_y_parentesis():
    assert clave_natural("7.JPG")[:2] == (0, 7)
    assert clave_natural("3b.jpg")[:3] == (0, 3, "b")
    assert clave_natural("ChatGPT Image (12).jpg")[:2] == (0, 12)
    assert clave_natural("portada.jpg")[0] == 1                 # no numéricos al final


# ---------------------------------------------------------------- carpeta
def test_carpeta_fotos_prioridad(tmp_path):
    assert carpeta_fotos(tmp_path) is None
    (tmp_path / "edit").mkdir()
    assert carpeta_fotos(tmp_path) == tmp_path / "edit"
    (tmp_path / "editadas").mkdir()
    assert carpeta_fotos(tmp_path) == tmp_path / "editadas"
    (tmp_path / "Fotos").mkdir()
    assert carpeta_fotos(tmp_path) == tmp_path / "Fotos"
    (tmp_path / "fotos").mkdir()
    assert carpeta_fotos(tmp_path) == tmp_path / "fotos"


def test_carpeta_fotos_ignora_archivos_con_ese_nombre(tmp_path):
    (tmp_path / "fotos").write_text("no soy carpeta")
    assert carpeta_fotos(tmp_path) is None


def test_listar_fotos_filtra_y_ordena(tmp_path):
    for name in ("10.jpg", "2.jpg", "1.jpg", "3.png"):
        write_jpeg(tmp_path / name)
    (tmp_path / "1.jpg:Zone.Identifier").write_text("[ZoneTransfer]")
    (tmp_path / "notas.txt").write_text("x")
    (tmp_path / "sub").mkdir()
    write_jpeg(tmp_path / "sub" / "0.jpg")
    assert [p.name for p in listar_fotos(tmp_path)] == ["1.jpg", "2.jpg", "3.png", "10.jpg"]


def test_listar_fotos_deduplica_enlaces_duros(tmp_path):
    write_jpeg(tmp_path / "1.jpg")
    write_jpeg(tmp_path / "2.jpg")
    os.link(tmp_path / "1.jpg", tmp_path / "copia.jpg")
    fotos = listar_fotos(tmp_path)
    assert len(fotos) == 2
    nombres = {p.name for p in fotos}
    assert "2.jpg" in nombres and len(nombres & {"1.jpg", "copia.jpg"}) == 1


# --------------------------------------------------------------- nombres
def test_nombre_seo_y_alt():
    assert nombre_seo("Kia", "XCeed", "9028LXG", 1) == "kia-xceed-9028lxg-01.jpg"
    assert nombre_seo("Citroën", "C3", "1111BBB", 12) == "citroen-c3-1111bbb-12.jpg"
    assert nombre_seo("Mercedes-Benz", "Clase A", "2222CCC", 3) == "mercedes-benz-clase-a-2222ccc-03.jpg"
    assert alt_seo("Kia", "XCeed", "9028LXG", 1) == "Kia XCeed 9028LXG · foto 01"


# --------------------------------------------------------- preparar_jpeg
def _decode(data: bytes):
    with Image.open(io.BytesIO(data)) as img:
        img.load()
        return img.format, img.size


def test_preparar_jpeg_pequeno_intacto(tmp_path):
    p = write_jpeg(tmp_path / "1.jpg", size=(640, 480))
    data = p.read_bytes()
    assert len(data) < MAX_BYTES
    assert preparar_jpeg(p) == data


def test_preparar_jpeg_png_se_convierte(tmp_path):
    p = tmp_path / "3.png"
    Image.new("RGBA", (300, 200), (10, 20, 30, 255)).save(p, format="PNG")
    out = preparar_jpeg(p)
    assert out != p.read_bytes()
    assert _decode(out) == ("JPEG", (300, 200))


def test_preparar_jpeg_grande_se_recomprime(tmp_path):
    canales = [Image.effect_noise((3000, 2000), 40) for _ in range(3)]
    p = tmp_path / "1.jpg"
    Image.merge("RGB", canales).save(p, format="JPEG", quality=95)
    assert p.stat().st_size > MAX_BYTES
    out = preparar_jpeg(p)
    fmt, (w, h) = _decode(out)
    assert fmt == "JPEG" and max(w, h) <= MAX_SIDE and (w, h) == (1920, 1280)
    assert len(out) <= TARGET_BYTES


def test_preparar_jpeg_respeta_orientacion_exif(tmp_path):
    p = tmp_path / "1.png"
    Image.new("RGB", (400, 200), (1, 2, 3)).save(p, format="PNG")
    assert _decode(preparar_jpeg(p))[1] == (400, 200)
    q = write_jpeg(tmp_path / "2.jpg", size=(400, 200), orientation=6)
    assert preparar_jpeg(q) == q.read_bytes()          # pequeño: no se toca (la web aplica el EXIF)
