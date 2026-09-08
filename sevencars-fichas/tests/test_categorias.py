"""Categorías product_cat y tabla modelo -> categorías (data/categorias.json)."""
import pytest

from categorias import categorias, categorias_para, ids_de, validar_slugs


def test_categorias_ids():
    assert categorias() == {"urbano": 24, "compacto": 25, "berlina": 26, "suv-4x4": 27, "familiar": 28,
                            "coupe": 29, "furgoneta": 99}


def test_categorias_devuelve_copia():
    cats = categorias()
    cats["urbano"] = 0
    assert categorias()["urbano"] == 24


@pytest.mark.parametrize("modelo,slugs", [
    ("XCeed", ["suv-4x4", "familiar"]), ("xceed", ["suv-4x4", "familiar"]), ("Clase A", ["compacto"]),
    ("Polo", ["urbano"]), ("Model 3", ["berlina"]), ("TTs", ["coupe"]), ("Golf", ["compacto"]),
    ("Discovery Sport", ["suv-4x4"]), ("Sportage", ["suv-4x4"]),
])
def test_categorias_para_conocidos(modelo, slugs):
    assert categorias_para(modelo) == (slugs, None)


def test_categorias_para_primer_token():
    assert categorias_para("Polo Life") == (["urbano"], None)


def test_categorias_para_desconocido():
    slugs, aviso = categorias_para("Raptor")
    assert slugs == [] and aviso and "--categoria" in aviso and "Raptor" in aviso


def test_categorias_para_vacio():
    slugs, aviso = categorias_para("")
    assert slugs == [] and aviso and "vac" in aviso


def test_validar_slugs():
    assert validar_slugs("suv-4x4, familiar") == ["suv-4x4", "familiar"]
    assert validar_slugs("SUV-4x4") == ["suv-4x4"]
    assert validar_slugs("") == []


def test_validar_slugs_desconocido():
    with pytest.raises(ValueError) as exc:
        validar_slugs("suv-4x4,camion")
    assert "camion" in str(exc.value) and "urbano" in str(exc.value)


def test_ids_de():
    assert ids_de(["suv-4x4", "familiar"]) == [27, 28]
    assert ids_de(["familiar", "suv-4x4"]) == [28, 27]
    assert ids_de(["nada"]) == [] and ids_de([]) == []
