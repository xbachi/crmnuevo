"""Descripción con la versión exacta identificada por la IA (simulada): datos de identificación que llegan al
prompt, búsqueda web solo en esta generación, JSON nuevo (versión, confianza, fuentes, motor, cambio, color,
puertas, tracción), «Lo técnico» que sobrevive al tema de la web, etiqueta DGT determinista, gas y caché."""
import json
import re
from datetime import date
from types import SimpleNamespace

import pytest

import combustible
import descripcion_cochesnet as desc
import extract_claude
from descripcion_cochesnet import DatosCoche, despiezar, generar
from fotos import listar_fotos
from tests.conftest import write_jpeg

FOLDER = "95-Renault Clio-1234LKM"

CLIO = dict(marca="Renault", modelo="Clio", version="1.0 TCe 100 GLP Intens", combustible="Gasolina", cilindrada=999,
            cv=100, caja="Manual", plazas=5, fecha=date(2021, 3, 2), kw=74, bastidor="VF1RJA00X65123456",
            tipo_variante="RJA/AB1BH", codigo_variante="C4", homologacion="e2*2007/46*0632*12",
            denominacion="CLIO", p3="GASOLINA/GLP", gas="GLP")

PARTES = {"version_identificada": "Renault Clio V (2019-2023) 1.0 TCe 100 GLP Intens", "confianza": "alta",
          "fuentes": ["https://www.km77.com/coches/renault/clio/2019/estandar/intens/clio-tce-100-glp-intens",
                      "https://www.renault.es/catalogo-clio.pdf"],
          "motor": "1.0 TCe 100 GLP", "cambio": "manual de 6 velocidades", "color": "Granate", "puertas": 5,
          "traccion": "delantera",
          "reclamo": "Utilitario bifuel con etiqueta ECO", "parrafo": "Un utilitario práctico.",
          "cierre": "Económico y versátil.",
          "tecnologia": ["Sistema multimedia", "Bluetooth", "Conexión USB", "Volante multifunción",
                         "Ordenador de a bordo"],
          "confort": ["Aire acondicionado", "Dirección asistida", "Cierre centralizado", "Elevalunas eléctricos",
                      "Volante regulable"],
          "exterior": ["Carrocería de 5 puertas", "Color granate", "Luces diurnas",
                       "Diseño Renault Clio de quinta generación"],
          "seguridad": ["ABS", "Control electrónico de estabilidad", "Asistente de arranque en pendiente",
                        "Control de presión de neumáticos", "ISOFIX", "Airbags frontales y laterales"]}

LO_TECNICO_CLIO = ["Motor 1.0 TCe 100 GLP", "Cambio manual de 6 velocidades", "Doble combustible: gasolina y GLP",
                   "Color: Granate", "5 puertas / 5 plazas", "Tracción delantera", "Etiqueta medioambiental ECO"]


def envelope(structured: dict) -> str:
    return json.dumps({"type": "result", "subtype": "success", "is_error": False, "num_turns": 9,
                       "structured_output": structured})


class FakeRun:
    """Sustituye subprocess.run: guarda el comando y el timeout; nunca lanza el CLI de verdad."""

    def __init__(self, outputs):
        self.outputs, self.calls = list(outputs), []

    def __call__(self, cmd, **kwargs):
        self.calls.append({"cmd": cmd, "timeout": kwargs.get("timeout")})
        rc, out, err = self.outputs.pop(0)
        return SimpleNamespace(returncode=rc, stdout=out, stderr=err)


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
    for i in range(1, 4):
        write_jpeg(d / f"{i}.jpg", size=(64, 48))
    return listar_fotos(d)


def opcion(cmd, nombre) -> str:
    return cmd[cmd.index(nombre) + 1]


# ------------------------------------------------------------ lo que llega al modelo
def test_el_prompt_lleva_los_datos_de_identificacion(fake, fotos, tmp_path):
    runner = fake([(0, envelope(PARTES), "")])
    d = generar(DatosCoche(**CLIO), fotos, FOLDER, cache_dir=tmp_path / "desc")
    assert d.ok and d.fuente == "ia" and len(runner.calls) == 1
    prompt = opcion(runner.calls[0]["cmd"], "-p")
    for linea in ("- Marca: Renault", "- Modelo: Clio", "- Versión (texto de la hoja): 1.0 TCe 100 GLP Intens",
                  "- Fecha de matriculación: 02/03/2021", "- Cilindrada: 999 cc",
                  "- Potencia neta P.2 del permiso: 74 kW", "- Potencia: 100 CV",
                  "- Combustible: Gasolina / GLP (bifuel) (P.3 del permiso: «GASOLINA/GLP»)", "- Cambio: Manual",
                  "- Plazas (S.1): 5", "- Bastidor (VIN): VF1RJA00X65123456",
                  "- D.2 tipo / variante / versión: RJA/AB1BH", "- CV código de variante: C4",
                  "- K número de homologación: e2*2007/46*0632*12", "- D.3 denominación comercial: CLIO"):
        assert linea in prompt, linea
    # los dos pasos: versión exacta en España/Europa y solo equipamiento de serie o visible
    assert "IDENTIFICÁ LA VERSIÓN EXACTA" in prompt and "España" in prompt and "Europa" in prompt
    assert "DE SERIE" in prompt and "SE VEA en las fotos" in prompt and "Nunca opcionales" in prompt
    for campo in ('"version_identificada"', '"confianza"', '"fuentes"', '"motor"', '"cambio"', '"color"',
                  '"puertas"', '"traccion"'):
        assert campo in prompt
    # la etiqueta la pone Python, no el modelo
    assert "- Etiqueta medioambiental: ECO" in prompt


def test_sin_dato_no_hay_linea_de_identificacion():
    lineas = DatosCoche(marca="Kia", modelo="XCeed", anio=2022).identificacion()
    assert lineas == ["Marca: Kia", "Modelo: XCeed", "Año de matriculación: 2022"]
    assert DatosCoche().identificacion() == []


def test_solo_esta_generacion_busca_en_la_web(fake, fotos, tmp_path):
    runner = fake([(0, envelope(PARTES), "")])
    generar(DatosCoche(**CLIO), fotos, FOLDER, cache_dir=tmp_path / "desc")
    cmd = runner.calls[0]["cmd"]
    assert opcion(cmd, "--tools") == "Read,WebSearch,WebFetch" == opcion(cmd, "--allowedTools")
    prohibidas = opcion(cmd, "--disallowedTools").split(",")
    assert "WebSearch" not in prohibidas and "WebFetch" not in prohibidas and "Bash" in prohibidas
    assert opcion(cmd, "--max-turns") == str(desc.MAX_TURNS) and runner.calls[0]["timeout"] == desc.TIMEOUT_S
    assert desc.TIMEOUT_S >= 600 and desc.MAX_TURNS >= 20
    esquema = json.loads(opcion(cmd, "--json-schema"))
    assert {"version_identificada", "confianza", "fuentes", "motor", "cambio", "color", "puertas",
            "traccion"} <= set(esquema["required"])
    # la lectura de documentos y la caja por fotos siguen sin web
    lectura = extract_claude.build_command("claude", "p", None)
    assert opcion(lectura, "--tools") == "Read" == opcion(lectura, "--allowedTools")
    assert {"WebSearch", "WebFetch"} <= set(opcion(lectura, "--disallowedTools").split(","))


# ------------------------------------------------------------------ JSON nuevo
def test_parseo_del_json_nuevo():
    pz = despiezar(DatosCoche(**CLIO), PARTES)
    assert pz.version_identificada == "Renault Clio V (2019-2023) 1.0 TCe 100 GLP Intens"
    assert pz.confianza == "alta" and len(pz.fuentes) == 2
    assert pz.tecnicos_web == LO_TECNICO_CLIO
    assert pz.tecnicos == ["Versión: 1.0 TCe 100 GLP Intens", "Motor: 1.0 TCe 100 GLP",
                           "Combustible: Gasolina / GLP (bifuel)", "Cilindrada: 999 cc", "Potencia: 100 CV",
                           "Cambio: Manual de 6 velocidades", "Tracción: delantera", "Color: Granate", "Puertas: 5",
                           "Plazas: 5", "Etiqueta medioambiental: ECO"]
    # versión, confianza y fuentes van a PARA VERIFICAR, nunca a la web
    assert pz.para_verificar[0] == ("descripción: versión identificada por la IA: Renault Clio V (2019-2023) "
                                    "1.0 TCe 100 GLP Intens (confianza alta)")
    assert pz.para_verificar[1].startswith("descripción: fuentes: https://www.km77.com/") and " · " in pz.para_verificar[1]
    assert not any("revisar equipamiento" in x for x in pz.para_verificar)
    web = desc.equipamiento(pz) + desc.destacado(pz)
    assert "km77" not in web and "confianza" not in web and "quinta generación" in web


@pytest.mark.parametrize("confianza", ["media", "baja", "", "altísima"])
def test_confianza_no_alta_pide_revisar_equipamiento(confianza):
    pz = despiezar(DatosCoche(**CLIO), dict(PARTES, confianza=confianza, fuentes=[]))
    aviso = [x for x in pz.para_verificar if "revisar equipamiento" in x]
    assert len(aviso) == 1 and (confianza if confianza in ("media", "baja") else "sin indicar") in aviso[0]
    assert "descripción: fuentes: ninguna" in pz.para_verificar


def test_fuentes_solo_urls_y_sin_repetir():
    fuentes = ["https://a.es/x", "no es una url", "https://a.es/x", " https://b.es/y ", 42]
    assert despiezar(DatosCoche(**CLIO), dict(PARTES, fuentes=fuentes)).fuentes == ["https://a.es/x", "https://b.es/y"]


def test_respuesta_vieja_sin_campos_nuevos_no_rompe():
    viejo = {k: v for k, v in PARTES.items() if k in ("reclamo", "parrafo", "tecnologia", "confort")}
    pz = despiezar(DatosCoche(**CLIO), viejo)
    assert pz.tecnicos_web == ["Versión: 1.0 TCe 100 GLP Intens", "Doble combustible: gasolina y GLP",
                               "5 plazas", "Etiqueta medioambiental ECO"]
    assert any("no la identificó" in x for x in pz.para_verificar)
    assert any("revisar equipamiento" in x for x in pz.para_verificar)


@pytest.mark.parametrize("cambio,caja,esperado", [
    ("manual de 6 velocidades", "Manual", "manual de 6 velocidades"),
    ("Cambio: Manual de 5 marchas", "Manual", "manual de 5 velocidades"),
    ("automático de doble embrague de 7 velocidades", "Automático", "automático de doble embrague de 7 velocidades"),
    ("automático de variador continuo (CVT)", "", "automático de variador continuo (CVT)"),
    ("manual", "Manual", ""),                          # sin nº de marchas confirmado: no se publica
    ("DSG de 7 velocidades", "Automático", ""),        # no dice manual/automático
    ("", "Manual", ""),
])
def test_cambio_solo_con_marchas_confirmadas(cambio, caja, esperado):
    datos = DatosCoche(**dict(CLIO, caja=caja))
    pz = despiezar(datos, dict(PARTES, cambio=cambio))
    assert desc.leer_tecnico(datos, dict(PARTES, cambio=cambio)).cambio == esperado
    web = [i for i in pz.tecnicos_web if i.startswith(("Cambio", "Transmisión"))]
    assert web == ([f"Cambio {esperado}"] if esperado else [])


def test_cambio_que_contradice_la_caja_no_se_publica():
    pz = despiezar(DatosCoche(**dict(CLIO, caja="Automático")), PARTES)
    assert not any(i.startswith("Cambio") for i in pz.tecnicos_web)
    assert "Cambio: Automático" in pz.tecnicos
    assert any("la IA dice cambio" in x and "Automático" in x for x in pz.para_verificar)


def test_traccion_la_manda_el_distintivo_de_la_version():
    datos = DatosCoche(marca="Audi", modelo="A4", version="2.0 TDI quattro S line", combustible="Diésel",
                       fecha=date(2019, 5, 1))
    pz = despiezar(datos, dict(PARTES, traccion="delantera"))
    assert "Tracción total (quattro)" in pz.tecnicos_web and "Tracción: total (quattro)" in pz.tecnicos
    assert any("tracción delantera" in x and "quattro" in x for x in pz.para_verificar)


@pytest.mark.parametrize("campo,valor,esperado", [
    ("color", "GRIS OSCURO", "Color: Gris oscuro"), ("color", "Color: blanco.", "Color: Blanco"),
    ("color", "", None), ("puertas", "5", "5 puertas / 5 plazas"), ("puertas", 0, "5 plazas"),
    ("puertas", 9, "5 plazas"), ("motor", "Motor: 1.0 TCe 90", "Motor 1.0 TCe 90"),
    ("traccion", "Total", "Tracción total"), ("traccion", "trasera", "Tracción trasera"), ("traccion", "", None),
])
def test_campos_tecnicos_de_la_ia_se_limpian(campo, valor, esperado):
    web = despiezar(DatosCoche(**CLIO), dict(PARTES, **{campo: valor})).tecnicos_web
    prefijo = {"color": "Color", "puertas": "5 p", "motor": "Motor", "traccion": "Tracción"}[campo]
    if esperado is None:
        assert not any(i.startswith(prefijo) for i in web)
    else:
        assert esperado in web


# ------------------------------------------- réplica del tema (inc/seven-equipamiento.php)
_PHP_VOCAB = {"datos tecnicos": "tecnico", "caracteristicas tecnicas": "tecnico", "ficha tecnica": "tecnico",
              "especificaciones": "tecnico", "motor": "tecnico", "motorizacion": "tecnico", "mecanica": "tecnico",
              "prestaciones": "tecnico", "tecnologia": "equipo", "multimedia": "equipo", "conectividad": "equipo",
              "confort": "equipo", "interior": "equipo", "habitaculo": "equipo", "exterior": "equipo",
              "diseno": "equipo", "carroceria": "equipo", "seguridad": "equipo", "asistencia": "equipo",
              "asistencias": "equipo", "asistencia a la conduccion": "equipo",
              "asistencias a la conduccion": "equipo", "ayudas a la conduccion": "equipo",
              "equipamiento": "equipo", "extras": "equipo"}


def php_clave(texto):
    t = texto.lower()
    for a, b in {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n", "à": "a", "è": "e",
                 "ç": "c"}.items():
        t = t.replace(a, b)
    t = re.sub(r"\s+", " ", t)
    return re.sub(r"^[\s:.\u2013\u2014\u2022·\-]+|[\s:.\u2013\u2014\u2022·\-]+$", "", t)


def php_piezas(titulo):
    return [p.strip() for p in re.split(r"\s*[/·|+,]\s*|\s+y\s+", php_clave(titulo)) if p.strip()]


def php_es_titulo(texto):
    clave = php_clave(texto)
    if not clave:
        return False
    if texto.strip().endswith(":") and len(re.split(r"\s+", clave)) <= 6:
        return True
    piezas = php_piezas(texto)
    return bool(piezas) and all(p in _PHP_VOCAB for p in piezas)


def php_parte(titulo):
    if re.search(r"tecnic|mecanic|^motor|^prestaciones", php_clave(titulo)):
        return "tecnico"
    return next((_PHP_VOCAB[p] for p in php_piezas(titulo) if p in _PHP_VOCAB), "equipo")


def php_repetido(item):
    """seven_equipamiento_repetido(): la regla del filtro, copiada de la línea 322 del tema."""
    etiquetas = ("combustible|cilindrada|potencia(?: combinada)?|cambio|caja de cambios|kilometraje|kilometros|kms?|"
                 "ano(?: de matriculacion)?|matriculacion|matricula|garantia")
    m = re.match(r"^(?:" + etiquetas + r")\b[\s:\u2013\u2014\-]*(.*)$", php_clave(item))
    return bool(m) and len(m.group(1).strip()) <= 20


def php_sin_redundantes(items):
    claves = [php_clave(i) for i in items]
    fuera = {i for i, corta in enumerate(claves) if len(corta) >= 8
             and any(j != i and len(larga) > len(corta) and corta in larga for j, larga in enumerate(claves))}
    return [x for i, x in enumerate(items) if i not in fuera]


def php_reparto(texto):
    """seven_equipamiento_secciones() + seven_equipamiento_reparto() para texto plano (sin etiquetas HTML)."""
    secciones, intro = [], []
    for linea in texto.splitlines():
        limpio = re.sub(r"^[\s\u2022·\-\u2013\u2014]+", "", re.sub(r"\s+", " ", linea)).strip()
        if not limpio:
            continue
        if php_es_titulo(limpio):
            secciones.append([limpio.rstrip(": \t"), []])
        elif not secciones:
            intro.append(limpio)
        elif limpio not in secciones[-1][1]:
            secciones[-1][1].append(limpio)
    tecnico, equipo = [], []
    for titulo, items in (s for s in secciones if s[1]):
        if php_parte(titulo) == "tecnico":
            tecnico += items
        else:
            equipo.append((titulo, php_sin_redundantes(items)))
    return intro, php_sin_redundantes([i for i in tecnico if not php_repetido(i)]), equipo


@pytest.mark.parametrize("item,se_cae", [
    ("Cambio: Manual", True), ("Combustible: Gasolina", True), ("Potencia combinada: 240 CV", True),
    ("Cilindrada: 999 cc", True), ("Cambio manual de 5 velocidades", False), ("Motor 1.0 TCe 100 GLP", False),
    ("Color: Granate", False), ("5 puertas / 5 plazas", False), ("Tracción delantera", False),
    ("Etiqueta medioambiental ECO", False), ("Doble combustible: gasolina y GLP", False),
])
def test_regla_del_filtro_del_tema(item, se_cae):
    assert php_repetido(item) is se_cae
    assert desc.tema_repetido(item) is se_cae          # la guarda del módulo dice lo mismo que el tema


def test_lo_tecnico_sobrevive_al_tema_y_cae_en_su_seccion():
    pz = despiezar(DatosCoche(**CLIO), PARTES)
    intro, tecnico, equipo = php_reparto(desc.equipamiento(pz))
    assert intro == []
    assert tecnico == LO_TECNICO_CLIO                  # «Lo técnico»: todos los ítems, en orden
    assert [t for t, _ in equipo] == ["//// Tecnología / Multimedia", "//// Confort / Interior", "//// Exterior",
                                      "//// Seguridad / Asistencia"]
    assert all(php_parte(t) == "equipo" for t, _ in equipo)
    lleva = dict(equipo)                               # «Lo que lleva», como el ejemplo del dueño
    assert lleva["//// Tecnología / Multimedia"] == PARTES["tecnologia"]
    assert lleva["//// Confort / Interior"] == PARTES["confort"]
    assert lleva["//// Exterior"] == PARTES["exterior"]
    assert lleva["//// Seguridad / Asistencia"] == PARTES["seguridad"]
    for item in LO_TECNICO_CLIO:
        assert not php_es_titulo(item) and not php_repetido(item)


@pytest.mark.parametrize("cambio", ["manual de 5 velocidades", "automático de 1 velocidad",
                                    "automático de variador continuo (CVT)"])
def test_el_cambio_nunca_lo_tira_el_tema(cambio):
    datos = DatosCoche(**dict(CLIO, caja=""))
    _, tecnico, _ = php_reparto(desc.equipamiento(despiezar(datos, dict(PARTES, cambio=cambio))))
    assert any(cambio in i for i in tecnico)


def test_una_vineta_que_el_tema_leeria_como_encabezado_se_descarta():
    partes = dict(PARTES, confort=["Interior", "Extras:", "Asientos calefactables", "Seguridad y asistencia"])
    pz = despiezar(DatosCoche(**CLIO), partes)
    assert dict(pz.secciones)["Confort / Interior"] == ["Asientos calefactables"]
    _, _, equipo = php_reparto(desc.equipamiento(pz))
    assert dict(equipo)["//// Confort / Interior"] == ["Asientos calefactables"]


# -------------------------------------------------------------- etiqueta DGT
@pytest.mark.parametrize("datos,etiqueta,con_aviso", [
    (dict(combustible="Diésel", fecha=date(2012, 6, 1)), "B", False),
    (dict(combustible="Diésel", fecha=date(2016, 2, 1)), "C", False),
    (dict(combustible="Gasolina", p3="GLP", fecha=date(2021, 3, 2)), "ECO", False),
    (dict(combustible="Gasolina", fecha=date(2003, 5, 1)), "B", True),
    (dict(combustible="Eléctrico", fecha=date(2022, 1, 1)), "CERO", False),
    (dict(combustible="Eléctrico"), "CERO", False),
    # ventanas: diésel 2014-2015 y gasolina 2000-2005 van por fecha y con aviso
    (dict(combustible="Diésel", fecha=date(2015, 8, 31)), "B", True),
    (dict(combustible="Diésel", fecha=date(2015, 9, 1)), "C", True),
    (dict(combustible="Diésel", fecha=date(2014, 3, 1)), "B", True),
    (dict(combustible="Diésel", anio=2015), "B", True),
    (dict(combustible="Diésel", fecha=date(2005, 12, 31)), None, False),
    (dict(combustible="Gasolina", fecha=date(2006, 1, 1)), "C", False),
    (dict(combustible="Gasolina", fecha=date(2000, 7, 1)), None, True),
    (dict(combustible="Gasolina", fecha=date(1999, 7, 1)), None, False),
    # la norma Euro (V.9) manda sobre la fecha y quita la duda
    (dict(combustible="Diésel", fecha=date(2014, 3, 1), norma_euro="EURO 6B"), "C", False),
    (dict(combustible="Diésel", fecha=date(2016, 3, 1), norma_euro="EURO 5"), "B", False),
    (dict(combustible="Gasolina", fecha=date(2003, 5, 1), norma_euro="Euro IV"), "C", False),
    (dict(combustible="Gasolina", fecha=date(2003, 5, 1), norma_euro="EURO 3"), "B", False),
    (dict(combustible="Diésel", fecha=date(2004, 1, 1), norma_euro="EURO 3"), None, False),
    # híbridos
    (dict(combustible="Híbrido", version="1.8 HEV", fecha=date(2019, 1, 1)), "ECO", False),
    (dict(combustible="Híbrido", version="1.6 PHEV", autonomia_km=55), "CERO", False),
    (dict(combustible="Híbrido", version="1.6 PHEV", autonomia_km=30), "ECO", False),
    (dict(combustible="Híbrido", version="1.6 PHEV", fecha=date(2022, 1, 1)), "CERO", True),
    # gas: ECO si cumple la C; un GLP de 2004 no la cumple por fecha
    (dict(combustible="Gasolina", gas="GNC", fecha=date(2019, 1, 1)), "ECO", False),
    (dict(combustible="Gasolina", gas="GLP", fecha=date(2004, 1, 1)), "B", True),
    (dict(combustible="", fecha=date(2020, 1, 1)), None, False),
    (dict(combustible="Gasolina"), None, False),
])
def test_etiqueta_dgt(datos, etiqueta, con_aviso):
    coche = DatosCoche(**datos)
    assert coche.etiqueta == etiqueta
    aviso = coche.aviso_etiqueta
    assert bool(aviso) is con_aviso
    if con_aviso:
        assert aviso.endswith("confirmar etiqueta en dgt.es con la matrícula")


def test_la_etiqueta_dudosa_llega_a_para_verificar():
    pz = despiezar(DatosCoche(marca="Seat", modelo="Ibiza", combustible="Gasolina", fecha=date(2003, 5, 1)), PARTES)
    assert "Etiqueta medioambiental B" in pz.tecnicos_web
    assert any(x.startswith("etiqueta DGT: B por fecha") and "dgt.es" in x for x in pz.para_verificar)
    seguro = despiezar(DatosCoche(marca="Seat", modelo="Ibiza", combustible="Diésel", fecha=date(2012, 6, 1)), PARTES)
    assert "Etiqueta medioambiental B" in seguro.tecnicos_web
    assert not any(x.startswith("etiqueta DGT") for x in seguro.para_verificar)


@pytest.mark.parametrize("texto,nivel", [("EURO 6D-TEMP", 6), ("Euro VI", 6), ("euro 5b", 5), ("EURO IV", 4),
                                         ("EURO3", 3), ("715/2007*2018/1832AP", None), ("", None), (None, None)])
def test_nivel_euro(texto, nivel):
    assert desc.nivel_euro(texto) == nivel


# ------------------------------------------------------------------------ gas
@pytest.mark.parametrize("p3,gas", [
    ("GAS LICUADO DE PETROLEO", "GLP"), ("GASOLINA/GLP", "GLP"), ("GLP", "GLP"), ("GASOLINA - LPG", "GLP"),
    ("GNC", "GNC"), ("GAS NATURAL COMPRIMIDO", "GNC"), ("GASOLINA/GNC", "GNC"), ("GNL", "GNL"),
    ("GAS NATURAL LICUADO", "GNL"), ("GASOLINA", None), ("DIESEL", None), ("", None), (None, None),
])
def test_gas_detectado_en_el_p3(p3, gas):
    assert combustible.gas_texto(p3) == gas


def test_el_glp_no_cambia_el_combustible_de_la_hoja_ni_de_la_web():
    """AF y _combustible siguen con el vocabulario de cuatro valores: el gas va aparte."""
    assert combustible.combustible_permiso("GAS LICUADO DE PETROLEO") == combustible.GASOLINA
    assert combustible.combustible_permiso("GASOLINA/GLP") == combustible.GASOLINA
    datos = DatosCoche(combustible="Gasolina", p3="GAS LICUADO DE PETROLEO", fecha=date(2021, 1, 1))
    assert datos.gas_detectado == "GLP" and datos.etiqueta == "ECO"
    assert datos.combustible == "Gasolina" and "Combustible: Gasolina / GLP (bifuel)" in datos.tecnicos()


@pytest.mark.parametrize("modelo,gas", [("Dacia Sandero 1.0 TCe ECO-G 100", "GLP"), ("Renault Clio Bi-Fuel", "GLP"),
                                        ("Seat Leon 1.5 TGI", "GNC"), ("Fiat Panda Natural Power", "GNC"),
                                        ("Skoda Octavia G-TEC", "GNC"), ("Kia Picanto 1.0 GLP", "GLP"),
                                        ("Vw Polo 1.0 TSI", None), ("Hyundai i30 1.0 T-GDi", None)])
def test_gas_por_el_modelo(modelo, gas):
    assert combustible.gas_modelo(modelo) == gas


def test_gas_web_confirmado_o_sin_confirmar():
    assert combustible.gas_web("GAS LICUADO DE PETROLEO", "Clio 1.0 TCe") == ("GLP", None)
    gas, aviso = combustible.gas_web("GASOLINA", "Dacia Sandero ECO-G 100")
    assert gas == "GLP" and "sin confirmar" in aviso and "ECO" in aviso
    assert combustible.gas_web("GASOLINA", "Vw Polo 1.0 TSI") == (None, None)


def test_un_glp_de_la_hoja_cuenta_como_gasolina_bifuel():
    datos = DatosCoche(combustible="GLP", fecha=date(2020, 1, 1))     # cochesnet: AF puede decir «GLP»
    assert datos.combustible_base == "Gasolina" and datos.etiqueta == "ECO"


# ------------------------------------------------------------------------ caché
def test_la_cache_del_esquema_viejo_no_se_reutiliza(fake, fotos, tmp_path):
    cache_dir = tmp_path / "desc"
    datos = DatosCoche(**CLIO)
    path = desc.cache_path_descripcion(FOLDER, cache_dir)
    path.parent.mkdir(parents=True)
    viejo = {k: v for k, v in PARTES.items() if k in ("reclamo", "parrafo", "cierre", "tecnologia", "confort",
                                                      "exterior", "seguridad")}
    # formato anterior: sin «esquema» en la entrada
    entrada = desc.entrada_cache(datos, fotos)
    entrada.pop("esquema")
    path.write_text(json.dumps({"entrada": entrada, "partes": viejo, "timestamp": "2026-09-01"}), encoding="utf-8")
    runner = fake([(0, envelope(PARTES), ""), (0, envelope(PARTES), "")])
    d = generar(datos, fotos, FOLDER, cache_dir=cache_dir)
    assert d.fuente == "ia" and len(runner.calls) == 1
    assert json.loads(path.read_text(encoding="utf-8"))["entrada"]["esquema"] == desc.ESQUEMA_CACHE
    # un esquema anterior tampoco
    entrada = desc.entrada_cache(datos, fotos)
    entrada["esquema"] = desc.ESQUEMA_CACHE - 1
    path.write_text(json.dumps({"entrada": entrada, "partes": PARTES}), encoding="utf-8")
    generar(datos, fotos, FOLDER, cache_dir=cache_dir)
    assert len(runner.calls) == 2
    # y con el esquema actual, sí (las fechas del coche se comparan como texto, igual que en el JSON)
    otra = generar(datos, fotos, FOLDER, cache_dir=cache_dir)
    assert len(runner.calls) == 2 and otra.fuente.startswith("caché")
    assert otra.piezas.tecnicos_web == LO_TECNICO_CLIO


# ------------------------------------------ equipamiento: acabados, obviedades y piso normativo
SEGURIDAD_1091 = ["Luces diurnas LED", "Aviso de cinturón desabrochado", "Luces de emergencia", "Freno de mano"]


def test_el_prompt_pide_la_interseccion_de_acabados_y_la_seguridad_principal(fake, fotos, tmp_path):
    runner = fake([(0, envelope(PARTES), "")])
    generar(DatosCoche(**CLIO), fotos, FOLDER, cache_dir=tmp_path / "desc")
    prompt = opcion(runner.calls[0]["cmd"], "-p")
    plano = re.sub(r"\s+", " ", prompt)
    assert "SI EL ACABADO NO ESTÁ CONFIRMADO" in plano
    assert "acabados candidatos" in plano and "de serie en TODOS ellos (la intersección" in plano
    assert "no lo omitas por prudencia" in plano
    assert '"seguridad" cubre PRIMERO los sistemas principales' in plano
    for sistema in ("ABS", "control electrónico de estabilidad", "airbags", "ISOFIX", "control de presión de neumáticos",
                    "asistente de arranque en pendiente", "frenada de emergencia", "mantenimiento de carril"):
        assert sistema in plano, sistema
    assert "mandos de teléfono en el volante" in plano and '"Bluetooth"' in plano
    for obviedad in ("freno de mano", "luces de emergencia", "aviso de cinturón", "toma de 12 V", "portaobjetos",
                     "guantera", "parasoles", "retrovisor interior", "alfombrillas"):
        assert obviedad in plano, obviedad
    assert desc.ESQUEMA_CACHE >= 3


@pytest.mark.parametrize("vineta", [
    "Freno de mano", "FRENO DE MANO", "Luces de emergencia", "Botón de warning", "Cinturones de seguridad",
    "Aviso de cinturón desabrochado", "Toma de corriente de 12 V", "Toma de 12V", "Mechero", "Encendedor",
    "Bandeja portaobjetos en la consola central", "Hueco portaobjetos", "Guantera", "Parasoles con espejo",
    "Retrovisor interior", "Alfombrillas de goma", "ALFOMBRILLAS",
])
def test_lista_negra_de_obviedades(vineta):
    assert desc.es_trivial(vineta)
    partes = dict(PARTES, confort=[vineta, "Asientos calefactables"])
    assert dict(despiezar(DatosCoche(**CLIO), partes).secciones)["Confort / Interior"] == ["Asientos calefactables"]


@pytest.mark.parametrize("vineta", ["Freno de mano eléctrico", "Retrovisor interior electrocromático",
                                    "Bandeja de carga inalámbrica", "Guantera refrigerada",
                                    "Luz de frenado de emergencia", "Cortinillas parasol traseras",
                                    "Asientos calefactables", "Control de presión de neumáticos"])
def test_lo_que_parece_obviedad_pero_es_equipamiento(vineta):
    assert not desc.es_trivial(vineta)


def test_una_seccion_corta_tras_filtrar_se_publica_igual():
    partes = dict(PARTES, confort=["Freno de mano", "Guantera", "Asientos calefactables"],
                  exterior=["Alfombrillas", "Parasoles"])
    pz = despiezar(DatosCoche(**CLIO), partes)
    secciones = dict(pz.secciones)
    assert secciones["Confort / Interior"] == ["Asientos calefactables"] and len(secciones["Confort / Interior"]) < desc.MIN_VINETAS
    assert "Exterior" not in secciones                 # vacía: no se pinta el encabezado
    web = desc.equipamiento(pz)
    assert "//// Confort / Interior\n\nAsientos calefactables" in web and "//// Exterior" not in web


def test_el_caso_real_del_1091():
    """Clio V 2021: la seguridad que vino de la IA eran obviedades; queda el piso normativo y lo que sí vale."""
    partes = dict(PARTES, seguridad=SEGURIDAD_1091, exterior=["Carrocería de 5 puertas"],
                  confort=["Toma de corriente de 12 V", "Bandeja portaobjetos en la consola central", "Freno de mano",
                           "Aire acondicionado"],
                  tecnologia=["Mandos de audio y teléfono en el volante", "Pantalla táctil"])
    pz = despiezar(DatosCoche(**dict(CLIO, fecha=date(2021, 3, 2))), partes)
    secciones = dict(pz.secciones)
    assert secciones["Seguridad / Asistencia"] == ["ABS", "Control electrónico de estabilidad",
                                                   "Control de presión de neumáticos", "Anclajes ISOFIX",
                                                   "Luces diurnas LED"]
    assert secciones["Confort / Interior"] == ["Aire acondicionado"]
    assert secciones["Tecnología / Multimedia"] == ["Mandos de audio y teléfono en el volante", "Pantalla táctil",
                                                    "Bluetooth"]


def seguridad_con(fecha=None, seguridad=(), **extra):
    datos = DatosCoche(**dict(CLIO, fecha=fecha, anio=None, **extra))
    return dict(despiezar(datos, dict(PARTES, seguridad=list(seguridad), tecnologia=["Pantalla táctil"]))
                .secciones).get("Seguridad / Asistencia", [])


REGLAMENTO_661 = ["Control electrónico de estabilidad", "Control de presión de neumáticos", "Anclajes ISOFIX"]
GSR2 = ["Frenada de emergencia autónoma", "Asistente inteligente de velocidad", "Detector de fatiga",
        "Luz de frenado de emergencia", "Sensor o cámara de marcha atrás"]


@pytest.mark.parametrize("fecha,esperado", [
    (date(2003, 5, 1), []),
    (date(2004, 7, 1), ["ABS"]),
    (date(2013, 6, 1), ["ABS"]),                                   # 2013: ni ESP, ni TPMS, ni ISOFIX obligatorios
    (date(2014, 10, 31), ["ABS"]),
    (date(2014, 11, 1), ["ABS"] + REGLAMENTO_661),
    (date(2015, 3, 1), ["ABS"] + REGLAMENTO_661),
    (date(2024, 7, 6), ["ABS"] + REGLAMENTO_661),
    (date(2024, 8, 1), ["ABS"] + REGLAMENTO_661 + GSR2),         # GSR2 desde el 07/07/2024
])
def test_piso_normativo_por_fecha(fecha, esperado):
    assert seguridad_con(fecha) == esperado


def test_piso_con_solo_el_anio():
    sin_nada = DatosCoche(**dict(CLIO, fecha=None, anio=None))
    assert desc.piso_seguridad(sin_nada, []) == []
    assert desc.piso_seguridad(DatosCoche(**dict(CLIO, fecha=None, anio=2014)), []) == ["ABS"]   # corte a mitad de año
    assert desc.piso_seguridad(DatosCoche(**dict(CLIO, fecha=None, anio=2015)), []) == ["ABS"] + REGLAMENTO_661


def test_la_fecha_de_primera_matriculacion_manda():
    # matriculado en España en 2016 pero con B de 2013 (primera matriculación en el extranjero): sin 661/2009
    assert seguridad_con(date(2016, 5, 1), fecha_primera=date(2013, 6, 1), importado=True) == ["ABS"]
    assert seguridad_con(date(2013, 5, 1), fecha_primera=date(2015, 6, 1)) == ["ABS"] + REGLAMENTO_661


def test_importado_sin_b_no_aplica_el_piso_y_avisa():
    datos = DatosCoche(**dict(CLIO, fecha=date(2020, 5, 1), importado=True))
    pz = despiezar(datos, dict(PARTES, seguridad=["Airbags frontales"]))
    assert dict(pz.secciones)["Seguridad / Asistencia"] == ["Airbags frontales"]
    assert desc.AVISO_IMPORTADO in pz.para_verificar
    assert desc.AVISO_IMPORTADO == "importado: confirmar equipamiento de seguridad por fecha de primera matriculación"
    # con B sí se aplica y no hace falta avisar
    pz = despiezar(DatosCoche(**dict(CLIO, importado=True, fecha_primera=date(2019, 1, 1))),
                   dict(PARTES, seguridad=["Airbags frontales"]))
    assert "ABS" in dict(pz.secciones)["Seguridad / Asistencia"] and desc.AVISO_IMPORTADO not in pz.para_verificar
    # un coche nacional no lleva el aviso
    assert desc.AVISO_IMPORTADO not in despiezar(DatosCoche(**CLIO), PARTES).para_verificar


@pytest.mark.parametrize("textos,importado", [
    (("91-Renault-Clio-0110LMK", "RENAULT Clio 1.0 TCe 100 GLP"), False),
    (("104-BMW Serie 3-1234ABC importado Alemania", "BMW 320d"), True),
    (("88-Audi A4-5678DEF", "AUDI A4 2.0 TDI (Francia)"), True),
    (("", None), False),
])
def test_deteccion_de_importado(textos, importado):
    assert desc.es_importado(*textos) is importado


@pytest.mark.parametrize("de_la_ia,no_se_agrega", [
    ("ESP", "Control electrónico de estabilidad"),
    ("Control de estabilidad ESC", "Control electrónico de estabilidad"),
    ("Sistema de control de presión de los neumáticos", "Control de presión de neumáticos"),
    ("Sillas infantiles i-Size", "Anclajes ISOFIX"),
    ("Sistema antibloqueo de frenos", "ABS"),
    ("Frenada automática de emergencia", "Frenada de emergencia autónoma"),
    ("Reconocimiento de señales de tráfico", "Asistente inteligente de velocidad"),
    ("Alerta de somnolencia del conductor", "Detector de fatiga"),
    ("Sensores de aparcamiento traseros", "Sensor o cámara de marcha atrás"),
])
def test_el_piso_deduplica_por_concepto(de_la_ia, no_se_agrega):
    seguridad = seguridad_con(date(2024, 9, 1), [de_la_ia])
    assert de_la_ia in seguridad and no_se_agrega not in seguridad


def test_el_piso_mira_todos_los_apartados():
    datos = DatosCoche(**dict(CLIO, fecha=date(2024, 9, 1)))
    pz = despiezar(datos, dict(PARTES, tecnologia=["Cámara de visión trasera"], seguridad=[]))
    secciones = dict(pz.secciones)
    assert "Cámara de visión trasera" in secciones["Tecnología / Multimedia"]
    assert "Sensor o cámara de marcha atrás" not in secciones["Seguridad / Asistencia"]
    assert secciones["Seguridad / Asistencia"][:4] == ["ABS"] + REGLAMENTO_661


def test_el_piso_va_primero_y_no_se_recorta():
    seguridad = seguridad_con(date(2024, 9, 1), ["Airbags frontales", "Airbags laterales", "Asistente de arranque en "
                                                 "pendiente", "Aviso de salida de carril", "Faros LED",
                                                 "Control de crucero", "Cámara 360", "Pilotos LED", "ISOFIX",
                                                 "Alerta de tráfico cruzado"])
    assert seguridad[:3] == ["ABS", "Control electrónico de estabilidad", "Control de presión de neumáticos"]
    assert all(x in seguridad for x in ["Frenada de emergencia autónoma", "Asistente inteligente de velocidad",
                                        "Detector de fatiga", "Luz de frenado de emergencia"])
    assert len(seguridad) == desc.MAX_VINETAS


@pytest.mark.parametrize("tecnologia,con_bluetooth", [
    (["Mandos de audio y teléfono en el volante"], True),
    (["Sistema manos libres"], True),
    (["Volante multifunción con control del teléfono"], True),
    (["Mandos de audio y teléfono en el volante", "Conectividad Bluetooth"], False),   # ya estaba: no se repite
    (["Volante multifunción", "Pantalla táctil"], False),
])
def test_bluetooth_por_los_mandos_de_telefono(tecnologia, con_bluetooth):
    secciones = dict(despiezar(DatosCoche(**CLIO), dict(PARTES, tecnologia=tecnologia)).secciones)
    todas = [v for vs in secciones.values() for v in vs]
    assert (secciones["Tecnología / Multimedia"][-1] == "Bluetooth") is con_bluetooth
    assert sum("luetooth" in v for v in todas) == (1 if con_bluetooth or "Conectividad Bluetooth" in tecnologia else 0)
