"""Plantilla opcional de descripción (plantillas/<nombre>.html)."""
from descripcion import PLACEHOLDERS, render_plantilla

DATOS = {"marca": "Kia", "modelo": "XCeed", "cuota": "204 €/mes", "cv": None, "kms": 88858}


def test_sin_plantilla_devuelve_none(tmp_path):
    assert render_plantilla("descripcion", DATOS, plantillas_dir=tmp_path) is None


def test_plantilla_sustituye_placeholders(tmp_path):
    (tmp_path / "descripcion.html").write_text("Hola {marca} {modelo} {cuota} {nada}", encoding="utf-8")
    assert render_plantilla("descripcion", DATOS, plantillas_dir=tmp_path) == "Hola Kia XCeed 204 €/mes "


def test_none_y_numeros_como_texto(tmp_path):
    (tmp_path / "x.html").write_text("[{cv}] {kms}", encoding="utf-8")
    assert render_plantilla("x", DATOS, plantillas_dir=tmp_path) == "[] 88858"


def test_placeholders_documentados():
    assert {"marca", "modelo", "cuota", "matricula", "precio_financiado"} <= set(PLACEHOLDERS)
