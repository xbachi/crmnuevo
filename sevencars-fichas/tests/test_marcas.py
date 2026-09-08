"""Marca / modelo / versión desde MODELO, y vocabulario web (combustible, caja, km, matriculación)."""
from datetime import date

import pytest

from marcas import (DIESEL, ELECTRICO, GASOLINA, HIBRIDO, caja_web, combustible_modelo, combustible_permiso,
                    combustible_web, km_web, limpiar_texto, matriculacion_web, normalizar_combustible, split_modelo)


# ------------------------------------------------------------- split_modelo
def test_split_modelo_kia():
    m = split_modelo("KIA XCeed  GDi PHEV 140cv Edrive")
    assert (m.marca, m.modelo, m.version) == ("Kia", "XCeed", "GDi PHEV 140cv Edrive")
    assert m.titulo == "Kia XCeed" and m.marca_completa == "Kia XCeed" and m.avisos == []


@pytest.mark.parametrize("texto,marca,modelo,version", [
    ("Vw Golf VII 1.6 TDI", "Volkswagen", "Golf", "VII 1.6 TDI"),
    ("Land Rover Discovery Sport", "Land Rover", "Discovery Sport", ""),
    ("Mercedes Benz Clase A 180", "Mercedes-Benz", "Clase A", "180"),
    ("Volkswagen Polo Life 1.0 TSI\n", "Volkswagen", "Polo", "Life 1.0 TSI"),
    ("Volkswagen  Polo   Life 1.0 TSI", "Volkswagen", "Polo", "Life 1.0 TSI"),
    ("Mercedes- C220", "Mercedes-Benz", "C220", ""),
    ("Tesla Model 3", "Tesla", "Model 3", ""),
    ("KIA SPORTAGE 1.6", "Kia", "Sportage", "1.6"),
    ("Hyundai i20", "Hyundai", "i20", ""),
    ("Audi Q2", "Audi", "Q2", ""),
    ("Citroën C3 PureTech", "Citroën", "C3", "PureTech"),
    ("BMW Serie 1 116d", "BMW", "Serie 1", "116d"),
])
def test_split_modelo_variantes(texto, marca, modelo, version):
    m = split_modelo(texto)
    assert (m.marca, m.modelo, m.version) == (marca, modelo, version)
    assert m.titulo == f"{marca} {modelo}".strip() and m.avisos == []


def test_split_modelo_marca_desconocida():
    m = split_modelo("HyundaiI20 1.2 Mpi")
    assert m.avisos and "marca desconocida" in m.avisos[0] and "HyundaiI20" in m.avisos[0]
    assert m.marca == "Hyundaii20" and m.modelo == "1.2"


def test_split_modelo_vacio():
    for texto in ("", None, "   "):
        m = split_modelo(texto)
        assert m.avisos and m.marca == "" and m.modelo == "" and m.titulo == ""


def test_split_modelo_solo_marca():
    m = split_modelo("Kia")
    assert m.marca == "Kia" and m.modelo == "" and any("sin nombre de modelo" in a for a in m.avisos)


def test_limpiar_texto():
    assert limpiar_texto("  Kia\n XCeed\t GT  ") == "Kia XCeed GT"
    assert limpiar_texto(None) == ""


# -------------------------------------------------------------- combustible
@pytest.mark.parametrize("p3,esperado", [
    ("GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)", HIBRIDO), ("DIESEL - HÍBRIDOS (HEV)", HIBRIDO),
    ("GASOLINA", GASOLINA), ("DIESEL", DIESEL), ("GASOLEO", DIESEL), ("ELECTRICO", ELECTRICO),
    ("ELECTRICO/GASOLINA", HIBRIDO), (None, None), ("", None), ("GLP", None), ("Gasóleo", DIESEL),
])
def test_combustible_permiso(p3, esperado):
    assert combustible_permiso(p3) == esperado


@pytest.mark.parametrize("texto,esperado", [
    ("Vw Golf VII 1.6 TDI", DIESEL), ("Kia XCeed PHEV", HIBRIDO), ("Tesla Model 3", ELECTRICO),
    ("Peugeot 308 1.5 BlueHDi", DIESEL), ("Toyota Corolla Hybrid", HIBRIDO), ("Renault Zoe", ELECTRICO),
])
def test_combustible_modelo_con_pista(texto, esperado):
    assert combustible_modelo(texto) == (esperado, None)


def test_combustible_modelo_sin_pista_asume_gasolina():
    valor, aviso = combustible_modelo("Polo Life 1.0 TSI")
    assert valor == GASOLINA and aviso and "Gasolina" in aviso


def test_combustible_web_permiso_manda():
    assert combustible_web("GASOLINA", "Golf 1.6 TDI") == (GASOLINA, None)


def test_combustible_web_respaldo_modelo_con_aviso():
    valor, aviso = combustible_web(None, "Vw Golf VII 1.6 TDI")
    assert valor == DIESEL and aviso and "sin confirmar" in aviso
    valor, aviso = combustible_web("GLP", "Polo Life 1.0 TSI")
    assert valor == GASOLINA and aviso and "Gasolina" in aviso


@pytest.mark.parametrize("valor,esperado", [
    ("diesel", DIESEL), ("Diésel", DIESEL), ("gasolina", GASOLINA), ("hibrido enchufable", HIBRIDO), ("PHEV", HIBRIDO),
    ("hev", HIBRIDO), ("eléctrico", ELECTRICO), ("", None), (None, None), ("GLP", "GLP"), ("  glp ", "glp"),
])
def test_normalizar_combustible(valor, esperado):
    assert normalizar_combustible(valor) == esperado


# -------------------------------------------------------------- caja / km
def test_caja_web():
    assert caja_web("manual", "Kia XCeed") == ("Manual", None)
    assert caja_web("AUTOMATICA", "Kia XCeed") == ("Automático", None)
    assert caja_web("", "Audi Q2 S tronic") == ("Automático", None)
    assert caja_web(None, "Golf 2.0 TDI DSG") == ("Automático", None)
    assert caja_web("", "Clio MT6") == ("Manual", None)
    assert caja_web("", "Nissan Qashqai", expo_cambio="Automático") == ("Automático", None)
    valor, aviso = caja_web("", "Nissan Qashqai")
    assert valor is None and aviso and "sin fuente" in aviso


@pytest.mark.parametrize("kms,esperado", [
    (88858, "88.858"), (None, ""), ("", ""), (999, "999"), (1000, "1.000"), (1234567, "1.234.567"),
    (88858.0, "88.858"), ("88858", "88.858"), ("abc", "abc"),
])
def test_km_web(kms, esperado):
    assert km_web(kms) == esperado


def test_matriculacion_web():
    """Mes abreviado, como la columna AB y como el campo _matriculacion de la web."""
    assert matriculacion_web(date(2022, 4, 11)) == ("Abr 2022", 202204)
    assert matriculacion_web(None, "Abr 2024") == ("Abr 2024", 202404)
    assert matriculacion_web(None, None, 202307) == ("Jul 2023", 202307)
    assert matriculacion_web(None, None, "202307") == ("Jul 2023", 202307)
    assert matriculacion_web(None) == ("", None)
    assert matriculacion_web(None, "", None) == ("", None)
    assert matriculacion_web(date(2023, 12, 1), "Abr 2024", 202404) == ("Dic 2023", 202312)   # la fecha manda
