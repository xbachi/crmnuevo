"""docs.py: classification of files, ficha-expo parsing and image preparation."""
import pytest
from PIL import Image

from conftest import write_jpeg, write_pdf
from docs import (KIND_EXPO, KIND_FICHA, KIND_PERMISO, Document, classify_filename, find_documents,
                  load_document_images, looks_like_expo_text, prepare_image)

EXPO_TEXT = """Kia Xceed
Precio con campañas
15.455 €
Precio base
17.385 €
Matriculación: Abril 2022
Kilómetros: 88.000
Combustible: Híbrido
Potencia: 141 CV
Cubicaje: 1600
Cambio: Automático
"""


# --------------------------------------------------------------- find_documents
def test_find_documents_classifies_and_orders(tmp_path):
    write_jpeg(tmp_path / "Ficha técnica cara 1.jpeg")
    write_jpeg(tmp_path / "Permiso de circulación cara 1.jpeg")
    write_pdf(tmp_path / "ficha-qashaqi.pdf", "Nissan Qashqai\nPotencia: 141 CV\nCubicaje: 1600")
    write_pdf(tmp_path / "duplicado-tarjetaItv-0.pdf", "TARJETA ITV\nE. WAUZZZGA2KA020714")
    write_pdf(tmp_path / "INFORME.pdf", "Potencia: 141 CV\nCubicaje: 1600")
    (tmp_path / "Ficha técnica cara 1.jpeg:Zone.Identifier").write_text("[ZoneTransfer]")
    (tmp_path / "seguro.jpeg").write_bytes(b"")
    (tmp_path / "fotos").mkdir()

    docs = find_documents(tmp_path)

    assert [(d.name, d.kind) for d in docs] == [
        ("duplicado-tarjetaItv-0.pdf", KIND_FICHA),
        ("Ficha técnica cara 1.jpeg", KIND_FICHA),
        ("Permiso de circulación cara 1.jpeg", KIND_PERMISO),
        ("ficha-qashaqi.pdf", KIND_EXPO),
    ]
    assert all(d.size > 0 and d.mtime > 0 for d in docs)
    assert docs[0].is_pdf and not docs[1].is_pdf
    assert docs[0].fingerprint()["nombre"] == "duplicado-tarjetaItv-0.pdf"


def test_find_documents_empty_folder(tmp_path):
    assert find_documents(tmp_path) == []


# ---------------------------------------------------------------------- images
def test_prepare_image_downscales_long_side_to_2000():
    out = prepare_image(Image.new("RGB", (2544, 3504), "white"), "grande")
    assert (out.width, out.height) == (1452, 2000)
    assert out.jpeg[:2] == b"\xff\xd8"          # JPEG SOI marker
    assert out.label == "grande" and out.page is None


def test_prepare_image_keeps_small_images():
    out = prepare_image(Image.new("RGB", (640, 480), "white"), "chica", page=3)
    assert (out.width, out.height, out.page) == (640, 480, 3)


def test_load_document_images_applies_exif_orientation(tmp_path):
    path = write_jpeg(tmp_path / "Ficha técnica cara 1.jpeg", size=(400, 300), orientation=6)
    images = load_document_images(Document(path=path, kind=KIND_FICHA))
    assert len(images) == 1
    assert (images[0].width, images[0].height) == (300, 400)
    assert images[0].label == "Ficha técnica cara 1.jpeg"


def test_load_document_images_from_pdf(tmp_path):
    path = write_pdf(tmp_path / "permiso-circulacion.pdf", "PERMISO")
    images = load_document_images(Document(path=path, kind=KIND_PERMISO))
    assert len(images) == 1
    assert images[0].page == 1 and images[0].label == "permiso-circulacion.pdf (pág. 1)"
    assert images[0].width > 0 and images[0].jpeg[:2] == b"\xff\xd8"


# ------------------------------------------------------ ficha-expo: diseño viejo y nuevo
EXPO_NUEVA = """Kia XCeed GDi PHEV 140cv Edrive
OCASIÓN SELECCIONADA
POTENCIA
140 CV
KILÓMETROS
88.858
PRECIO BASE
16.900 €
"""


def test_looks_like_expo_text_reconoce_los_dos_disenos():
    assert looks_like_expo_text(EXPO_TEXT)                                    # viejo: «Potencia:» y «Cubicaje:»
    assert looks_like_expo_text(EXPO_NUEVA)                                   # nuevo: rótulos sin dos puntos
    assert looks_like_expo_text(EXPO_NUEVA.replace("OCASIÓN SELECCIONADA\n", ""))    # basta con tres
    assert looks_like_expo_text("POTENCIA 140 CV\nKILÓMETROS 88.858\nPRECIO BASE 16.900 €")
    # una ficha técnica o un permiso no lo son
    assert not looks_like_expo_text("TARJETA ITV\nP.2 POTENCIA 77 KW\nKILOMETROS\nF.1 MASA")
    assert not looks_like_expo_text("Potencia: 77 kW\nKilómetros: 1000\nPrecio base: 3")
    assert not looks_like_expo_text("")


def test_find_documents_ficha_expo_nueva_no_es_fuente(tmp_path):
    write_pdf(tmp_path / "ficha-expo.pdf", EXPO_NUEVA)
    write_pdf(tmp_path / "ficha-kia.pdf", EXPO_NUEVA)
    write_pdf(tmp_path / "ficha-tecnica.pdf", "TARJETA ITV\nP.2 POTENCIA 77 KW")
    assert [(d.name, d.kind) for d in find_documents(tmp_path)] == [
        ("ficha-tecnica.pdf", KIND_FICHA), ("ficha-expo.pdf", KIND_EXPO), ("ficha-kia.pdf", KIND_EXPO)]
