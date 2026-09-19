"""Descripción de coches.net: plantilla fija literal, bloque por coche con datos que no se inventan,
etiqueta medioambiental derivada en Python y equipamiento leído de las fotos (Claude Code simulado)."""
import json
import os
from types import SimpleNamespace

import pytest

import cochesnet
import descripcion_cochesnet as desc
import extract_claude
from descripcion_cochesnet import (DatosCoche, despiezar, elegir_fotos, generar, montar_bloque)
from fotos import listar_fotos
from tests.conftest import write_jpeg

FOLDER = "86-Jeep Compass-1650MJR"

# La plantilla fija, tal cual la dio el usuario. Si alguien la toca, el test lo canta.
PLANTILLA_ESPERADA = (
    "En SEVENCARS llevamos más de 15 años ofreciendo vehículos seleccionados, atención personalizada y total "
    "transparencia. ¡Más de 500 reseñas positivas en Google avalan nuestra trayectoria!\n"
    "\n"
    "Hoy te presentamos:\n"
    "\n"
    "{BLOQUE_VEHICULO}\n"
    "\n"
    "///// ¿Por qué comprar en SEVENCARS?\n"
    "\n"
    "* Vehículo revisado y kilómetros certificados\n"
    "* 12 meses de garantía (ampliable)\n"
    "* Financiación a tu medida, con o sin entrada\n"
    "* Aceptamos tu vehículo como parte de pago\n"
    "* Más de 500 valoraciones reales\n"
    "* Más de 15 años de experiencia\n"
    "\n"
    "SEVENCARS – Calidad en cada detalle\n"
)

COMPASS = dict(marca="Jeep", modelo="Compass", version="1.3 T4 4xe Plug-in Hybrid Trailhawk", combustible="Híbrido",
               cilindrada=1332, cv=240, caja="Automático", plazas=5, anio=2023,
               p3="GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)")

PARTES = {"reclamo": "SUV híbrido enchufable con tracción total",
          "cierre": "Una compra segura, con etiqueta CERO y capacidad real fuera del asfalto.",
          "parrafo": "Un SUV compacto  con acabado Trailhawk.\nIdeal para el día a día.",
          "tecnologia": ["Pantalla táctil Uconnect", "* Navegador integrado.", "Navegador integrado",
                         "Apple CarPlay y Android Auto"],
          "confort": ["Climatizador bizona", "Asientos calefactables"],
          "exterior": ["Llantas de aleación", "Barras de techo"],
          "seguridad": ["Cámara de marcha atrás", "Sensores de aparcamiento"]}


def envelope(structured: dict) -> str:
    return json.dumps({"type": "result", "subtype": "success", "is_error": False, "num_turns": 2,
                       "structured_output": structured})


class FakeRun:
    """Sustituye subprocess.run: registra el comando, el cwd y los archivos que había en él."""

    def __init__(self, outputs):
        self.outputs, self.calls = list(outputs), []

    def __call__(self, cmd, **kwargs):
        cwd = kwargs.get("cwd")
        self.calls.append({"cmd": cmd, "files": sorted(os.listdir(cwd)) if cwd else []})
        item = self.outputs.pop(0)
        if isinstance(item, BaseException):
            raise item
        rc, out, err = item
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
    for i in range(1, 15):
        write_jpeg(d / f"{i}.jpg", size=(64, 48))
    return listar_fotos(d)


@pytest.fixture
def cache_dir(tmp_path):
    return tmp_path / "descripciones"


def prompt_de(call) -> str:
    return call["cmd"][call["cmd"].index("-p") + 1]


# ------------------------------------------------------------------ plantilla
def test_la_plantilla_del_usuario_esta_intacta():
    assert desc.PLANTILLA.read_text(encoding="utf-8") == PLANTILLA_ESPERADA


def test_el_bloque_se_inserta_en_el_marcador():
    texto, bloque = desc.montar(DatosCoche(**COMPASS), PARTES)
    cabecera, pie = PLANTILLA_ESPERADA.split(desc.MARCADOR)
    assert texto.startswith(cabecera) and texto.endswith(pie)
    assert desc.MARCADOR not in texto
    assert texto == cabecera + bloque + pie


def test_estructura_del_bloque():
    bloque = montar_bloque(DatosCoche(**COMPASS), PARTES)
    lineas = bloque.splitlines()
    assert lineas[0] == "JEEP COMPASS 1.3 T4 4XE PLUG-IN HYBRID TRAILHAWK – SUV HÍBRIDO ENCHUFABLE CON TRACCIÓN TOTAL"
    assert lineas[2:5] == ["* Financiación sin entrada disponible", "* Kilómetros certificados",
                           "* Aceptamos tu coche como parte de pago"]
    # el párrafo se aplana a una sola línea
    assert "Un SUV compacto con acabado Trailhawk. Ideal para el día a día." in bloque
    assert "///// Datos técnicos:" in bloque
    assert bloque.count(desc.SEPARADOR) == 1
    for titulo in ("🎯 Tecnología / Multimedia", "🎯 Confort / Interior", "🎯 Exterior", "🎯 Seguridad / Asistencia"):
        assert f"\n{titulo}\n\n* " in bloque
    # viñetas limpias: sin asterisco duplicado, sin punto final y sin repetir
    assert "* Navegador integrado\n" in bloque and "* * Navegador" not in bloque
    assert bloque.count("Navegador integrado") == 1
    assert desc.SEPARADOR in bloque and bloque.index("///// Datos técnicos:") < bloque.index(desc.SEPARADOR)


# -------------------------------------------------------------- datos duros
def test_datos_tecnicos_no_se_inventan():
    todos = DatosCoche(**COMPASS).tecnicos()
    assert todos == ["Versión: 1.3 T4 4xe Plug-in Hybrid Trailhawk", "Combustible: Híbrido", "Cilindrada: 1.332 cc",
                     "Potencia combinada: 240 CV", "Cambio: Automático", "Tracción: total (4xe)", "Plazas: 5",
                     "Etiqueta medioambiental: CERO"]


def test_sin_dato_no_hay_vineta():
    """Lo que falta se omite: nunca se rellena a ojo."""
    datos = DatosCoche(marca="Jeep", modelo="Compass", version="1.3 T4 4xe", combustible="Híbrido", anio=2023,
                       p3="GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)")
    campos = [t.split(":")[0] for t in datos.tecnicos()]
    assert campos == ["Versión", "Combustible", "Tracción", "Etiqueta medioambiental"]
    assert not any(c in campos for c in ("Cilindrada", "Potencia", "Cambio", "Plazas"))
    # y un coche sin ningún dato no genera ninguna viñeta técnica
    assert DatosCoche().tecnicos() == []


def test_la_potencia_del_hibrido_se_publica_como_combinada():
    """En híbridos la CV de la hoja es la potencia TOTAL del sistema: se publica, aunque vaya sin confirmar."""
    hibrido = DatosCoche(marca="Jeep", modelo="Compass", version="1.3 T4 4xe", combustible="Híbrido", cv=240,
                         anio=2023, p3="GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)")
    assert "Potencia combinada: 240 CV" in hibrido.tecnicos()
    assert "Potencia combinada: 240 CV" in montar_bloque(hibrido, PARTES)
    electrico = DatosCoche(combustible="Eléctrico", cv=204, anio=2022)
    assert "Potencia combinada: 204 CV" in electrico.tecnicos()
    termico = DatosCoche(combustible="Diésel", cv=116, anio=2020)
    assert "Potencia: 116 CV" in termico.tecnicos()
    # sin CV en la hoja sigue sin haber viñeta: no se inventa
    assert not any("otencia" in t for t in DatosCoche(combustible="Híbrido", anio=2023).tecnicos())


def test_una_vineta_repetida_solo_sale_en_el_primer_apartado():
    partes = dict(PARTES, tecnologia=["Climatizador automático bizona", "Pantalla táctil"],
                  confort=["climatizador AUTOMATICO bizona", "Asientos calefactables"])
    bloque = montar_bloque(DatosCoche(**COMPASS), partes)
    assert bloque.count("limatizador") == 1
    tecnologia, confort = bloque.split("🎯 Confort / Interior")
    assert "Climatizador automático bizona" in tecnologia and "limatizador" not in confort
    assert "* Asientos calefactables" in confort


def test_el_mismo_equipamiento_reescrito_tambien_colapsa():
    """La comparación es por concepto: 'Climatización automática de dos zonas' es el mismo clima."""
    partes = dict(PARTES, tecnologia=["Climatizador bizona automático", "Faros LED de tecnología avanzada"],
                  confort=["Climatización automática de dos zonas", "Asientos calefactables"],
                  exterior=["Faros delanteros LED", "Llantas de aleación"],
                  seguridad=["Pilotos traseros LED", "Luces diurnas LED"])
    bloque = montar_bloque(DatosCoche(**COMPASS), partes)
    assert bloque.count("limatiz") == 1 and "Climatizador bizona automático" in bloque
    assert bloque.count("Faros") == 1 and "Faros LED de tecnología avanzada" in bloque
    # conceptos distintos conviven: faros, pilotos y diurnas no se pisan entre sí
    assert "* Pilotos traseros LED" in bloque and "* Luces diurnas LED" in bloque
    assert "* Llantas de aleación" in bloque and "* Asientos calefactables" in bloque


def test_el_emblema_4xe_no_es_la_toma_de_carga():
    """Son dos cosas distintas: el distintivo de la carrocería y el punto por donde se enchufa."""
    partes = dict(PARTES, tecnologia=["Sistema de carga para híbrido enchufable"],
                  exterior=["Emblemas 4xe híbrido enchufable", "Toma de carga externa"])
    bloque = montar_bloque(DatosCoche(**COMPASS), partes)
    assert "* Emblemas 4xe híbrido enchufable" in bloque and "* Toma de carga externa" in bloque
    assert "* Sistema de carga para híbrido enchufable" in bloque


@pytest.mark.parametrize("vineta,esperado", [
    ("Climatización automática de dos zonas", "clima"),
    ("Aire acondicionado bizona", "clima"),
    ("Elevalunas eléctricos en todas las puertas", "elevalunas"),
    ("Retrovisores eléctricos plegables", "retrovisores"),
    ("Llantas de aleación negras exclusivas", "llantas"),
    ("Faros delanteros LED", "faros"),
    ("Pilotos traseros LED", "pilotos"),
    ("Luces diurnas LED", "diurnas"),
    ("Sistema de navegación GPS integrado", "navegacion"),
    ("Conectividad con puertos USB", "conectividad"),
    ("Pantalla táctil de gran formato", "pantalla"),
    ("Cuadro de instrumentos digital", "cuadro"),
    ("Volante multifunción", "volante"),
    ("Cámara de visión trasera", "camara"),
    ("Sensores de aparcamiento", "sensores"),
    ("Anclajes ISOFIX en plazas traseras", "isofix"),
    ("Airbags frontales y laterales", "airbags"),
    ("Sistema de frenos con ABS", "frenos"),
    ("Control de tracción total 4xe", "estabilidad"),
    ("Botón de arranque sin llave", "keyless"),
    ("Barras de techo longitudinales", "barras"),
    ("Cristales traseros tintados", "lunas"),
    ("Toma de carga externa", "carga"),
    ("Punto de carga rápida", "carga"),
    # el emblema 4xe es un distintivo exterior, no la toma de carga
    ("Emblemas 4xe híbrido enchufable", "emblemas 4xe hibrido enchufable"),
    ("Control de crucero adaptativo", "crucero"),
    ("Sistema Start & Stop", "startstop"),
    # lo que no encaja en ningún concepto se compara literal, como antes
    ("Tres modos de conducción híbrida", "tres modos de conduccion hibrida"),
    ("Asientos Trailhawk con bordado específico", "asientos trailhawk con bordado especifico"),
])
def test_conceptos_canonicos(vineta, esperado):
    assert desc.concepto(vineta) == esperado


def test_el_equipamiento_no_repite_los_datos_tecnicos():
    """Lo técnico manda: si la tracción ya va en Datos técnicos, no se repite como viñeta de Seguridad."""
    partes = dict(PARTES, seguridad=["Tracción total 4xe", "Airbags frontales", "Control de estabilidad y tracción"])
    piezas = despiezar(DatosCoche(**COMPASS), partes)
    seguridad = dict(piezas.secciones)["Seguridad / Asistencia"]
    assert "Tracción total 4xe" not in seguridad
    assert "Airbags frontales" in seguridad
    # "control de estabilidad" es otro concepto y sí se queda
    assert "Control de estabilidad y tracción" in seguridad
    assert "Tracción: total (4xe)" in piezas.tecnicos
    # lo mismo con el resto de datos técnicos
    otras = dict(PARTES, tecnologia=["Cambio automático de doble embrague", "Combustible híbrido enchufable",
                                     "Etiqueta CERO de la DGT", "Cinco plazas", "Pantalla táctil"])
    tecnologia = dict(despiezar(DatosCoche(**COMPASS), otras).secciones)["Tecnología / Multimedia"]
    assert tecnologia == ["Pantalla táctil"]


@pytest.mark.parametrize("vineta", ["Estructura reforzada", "Acabados premium en habitáculo",
                                    "Sistema de infoentretenimiento avanzado", "Equipamiento completo",
                                    "Tecnología de última generación", "Diseño moderno"])
def test_las_vinetas_de_relleno_se_descartan(vineta):
    assert desc.es_relleno(vineta)
    partes = dict(PARTES, confort=[vineta, "Asientos calefactables"])
    confort = dict(despiezar(DatosCoche(**COMPASS), partes).secciones)["Confort / Interior"]
    assert confort == ["Asientos calefactables"]


def test_lo_concreto_no_es_relleno():
    for vineta in ("Cámara de visión trasera", "Barras de techo", "Asientos calefactables",
                   "Faros LED", "Sistema de navegación integrado"):
        assert not desc.es_relleno(vineta)


def test_el_prompt_pide_vinetas_concretas():
    prompt = desc.PROMPT.lower()
    assert "cada viñeta nombra una pieza" in prompt
    for adjetivo in ("avanzado", "premium", "reforzado", "de calidad", "moderno", "completo"):
        assert adjetivo in prompt
    assert "tampoco repitas lo que ya va en los datos" in prompt


def test_el_prompt_prohibe_las_cifras_inventadas():
    prompt = desc.PROMPT.lower()
    assert "prohibido inventar cifras" in prompt
    for pista in ("pulgadas", "litros", "vatios", "altavoces", "salvo que se lean con claridad en una foto"):
        assert pista in prompt
    assert "no repitas una misma viñeta en dos apartados" in prompt


@pytest.mark.parametrize("version,esperada", [
    ("1.3 T4 4xe Plug-in Hybrid Trailhawk", "4xe"),
    ("2.0 TDI 4x4 Advance", "4x4"),
    ("2.0 TDI quattro S line", "quattro"),
    ("2.0 TSI 4Motion", "4Motion"),
    ("xDrive20d Business", "xDrive"),
    ("2.5 AWD Executive", "AWD"),
    ("C 220 d 4MATIC", "4MATIC"),
    ("1.5 dCi Acenta", None),
    ("1.6 CRDi 4x2 Drive", None),          # 4x2 no es tracción total
    ("", None),
])
def test_traccion_solo_por_el_distintivo_de_la_version(version, esperada):
    assert DatosCoche(version=version).traccion == esperada


@pytest.mark.parametrize("datos,esperada", [
    (dict(combustible="Eléctrico", anio=2021), "CERO"),
    (dict(combustible="Híbrido", version="1.3 4xe Plug-in Hybrid", anio=2023), "CERO"),
    (dict(combustible="Híbrido", version="1.8 HEV", anio=2019), "ECO"),
    (dict(combustible="Gasolina", anio=2006), "C"),
    (dict(combustible="Diésel", anio=2016), "C"),
    (dict(combustible="Diésel", anio=2015), "B"),          # solo el año: el corte es el 01/09/2015 → B con aviso
    (dict(combustible="Gasolina", anio=2005), "B"),
    (dict(combustible="Diésel", anio=2014), "B"),
    (dict(combustible="Diésel", anio=2005), None),
    (dict(combustible="Gasolina", anio=None), None),
    (dict(combustible="", anio=2020), None),
])
def test_etiqueta_medioambiental_derivada_en_python(datos, esperada):
    assert DatosCoche(**datos).etiqueta == esperada


def test_enchufable_por_el_permiso_aunque_la_version_no_lo_diga():
    datos = DatosCoche(combustible="Híbrido", version="1.6 GDi", anio=2022, p3="GASOLINA - HÍBRIDO ENCHUFABLE (PHEV)")
    assert datos.enchufable and datos.etiqueta == "CERO"


# --------------------------------------------------------------- generación
def test_elegir_fotos_reparte_por_toda_la_galeria(fotos):
    assert elegir_fotos(fotos[:6]) == fotos[:6]
    elegidas = elegir_fotos(fotos)
    assert len(elegidas) == desc.MAX_FOTOS and elegidas[0] == fotos[0]
    assert elegidas == sorted(set(elegidas), key=fotos.index)      # sin repetidas y en orden de galería


def test_generar_manda_las_fotos_y_los_datos_verificados(fake, fotos, cache_dir):
    runner = fake([(0, envelope(PARTES), "")])
    d = generar(DatosCoche(**COMPASS), fotos, FOLDER, cache_dir=cache_dir)
    assert d.ok and d.fuente == "ia"
    assert len(runner.calls) == 1
    llamada = runner.calls[0]
    assert len([f for f in llamada["files"] if f.endswith(".jpg")]) == desc.MAX_FOTOS
    prompt = prompt_de(llamada)
    assert "Etiqueta medioambiental: CERO" in prompt and "Tracción: total (4xe)" in prompt
    assert "prohibido inventar extras" in prompt.lower() and "SE VEA en las fotos" in prompt
    assert "coches.net" in prompt
    assert d.texto.endswith("SEVENCARS – Calidad en cada detalle\n")


def test_la_segunda_vez_sale_de_la_cache(fake, fotos, cache_dir):
    runner = fake([(0, envelope(PARTES), "")])
    primera = generar(DatosCoche(**COMPASS), fotos, FOLDER, cache_dir=cache_dir)
    segunda = generar(DatosCoche(**COMPASS), fotos, FOLDER, cache_dir=cache_dir)
    assert len(runner.calls) == 1
    assert segunda.texto == primera.texto and segunda.fuente.startswith("caché")


def test_forzar_rehace_la_descripcion(fake, fotos, cache_dir):
    otras = dict(PARTES, reclamo="Otro reclamo")
    runner = fake([(0, envelope(PARTES), ""), (0, envelope(otras), "")])
    generar(DatosCoche(**COMPASS), fotos, FOLDER, cache_dir=cache_dir)
    d = generar(DatosCoche(**COMPASS), fotos, FOLDER, force=True, cache_dir=cache_dir)
    assert len(runner.calls) == 2 and "OTRO RECLAMO" in d.texto


def test_si_cambian_los_datos_no_se_reutiliza_la_cache(fake, fotos, cache_dir):
    runner = fake([(0, envelope(PARTES), ""), (0, envelope(PARTES), "")])
    generar(DatosCoche(**COMPASS), fotos, FOLDER, cache_dir=cache_dir)
    generar(DatosCoche(**dict(COMPASS, cv=190)), fotos, FOLDER, cache_dir=cache_dir)
    assert len(runner.calls) == 2


def test_un_fallo_del_generador_no_levanta(fake, fotos, cache_dir):
    fake([(1, "", "usage limit reached")])
    d = generar(DatosCoche(**COMPASS), fotos, FOLDER, cache_dir=cache_dir)
    assert not d.ok and d.fuente == "fallo" and d.error and not d.texto
    assert not cache_path_existe(cache_dir)


def test_sin_fotos_no_se_inventa_nada(fake, cache_dir):
    runner = fake([])
    d = generar(DatosCoche(**COMPASS), [], FOLDER, cache_dir=cache_dir)
    assert not d.ok and "no tiene fotos" in d.error and runner.calls == []


def cache_path_existe(cache_dir) -> bool:
    return desc.cache_path_descripcion(FOLDER, cache_dir).is_file()


# ------------------------------------------- campos ACF de sevencars.es
def piezas_compass():
    return despiezar(DatosCoche(**COMPASS), PARTES)


def test_destacado_lleva_la_parte_narrativa_con_el_formato_de_la_web():
    texto = desc.destacado(piezas_compass())
    lineas = texto.splitlines()
    assert lineas[0].startswith("En SEVENCARS llevamos más de 15 años")
    assert "Hoy te presentamos:" in lineas
    titular = "JEEP COMPASS 1.3 T4 4XE PLUG-IN HYBRID TRAILHAWK – SUV HÍBRIDO ENCHUFABLE CON TRACCIÓN TOTAL"
    assert titular in lineas
    # las tres ventajas van con guion, no con asterisco
    assert "- Financiación sin entrada disponible" in lineas and "* Financiación sin entrada disponible" not in lineas
    assert "Un SUV compacto con acabado Trailhawk. Ideal para el día a día." in lineas
    # el apartado "¿Por qué comprar?" va sin asteriscos
    assert "///// ¿Por qué comprar en SEVENCARS?" in lineas
    assert "12 meses de garantía (ampliable)" in lineas and "* 12 meses de garantía (ampliable)" not in lineas
    # cierre antes de la firma, y la firma al final
    assert lineas[-1] == "SEVENCARS – Calidad en cada detalle"
    assert lineas[-3] == "Una compra segura, con etiqueta CERO y capacidad real fuera del asfalto."
    # nada de datos técnicos ni secciones de equipamiento en este campo
    assert "///// Datos técnicos:" not in texto and "////" not in texto.replace("/////", "")


def test_equipamiento_lleva_la_parte_tecnica_con_cuatro_barras():
    texto = desc.equipamiento(piezas_compass())
    lineas = texto.splitlines()
    assert lineas[0] == "///// Datos técnicos:"
    assert "Tracción total (4xe)" in lineas and "* Tracción total (4xe)" not in lineas
    # lo que ya pinta la tabla de la web (y el tema tiraría) no va en «Lo técnico»
    assert "Potencia combinada: 240 CV" not in lineas and "Combustible: Híbrido" not in lineas
    for nombre in ("Tecnología / Multimedia", "Confort / Interior", "Exterior", "Seguridad / Asistencia"):
        assert f"//// {nombre}" in lineas
    assert "🎯" not in texto and "⸻" not in texto
    assert not any(linea.startswith("*") for linea in lineas)
    assert "Pantalla táctil Uconnect" in lineas
    # nada de la parte narrativa
    assert "SEVENCARS" not in texto and "Financiación sin entrada" not in texto


def test_el_cierre_es_solo_de_la_web():
    """En coches.net el usuario quitó el párrafo de cierre; en la web sí va."""
    cierre = PARTES["cierre"]
    assert cierre in desc.destacado(piezas_compass())
    assert cierre not in montar_bloque(DatosCoche(**COMPASS), PARTES)


def test_sin_cierre_el_destacado_no_deja_hueco():
    piezas = despiezar(DatosCoche(**COMPASS), dict(PARTES, cierre=""))
    lineas = desc.destacado(piezas).splitlines()
    assert lineas[-1] == "SEVENCARS – Calidad en cada detalle"
    assert lineas[-2] == "" and lineas[-3] == "Más de 15 años de experiencia"


def test_los_dos_destinos_comparten_contenido_y_cambian_el_formato():
    piezas = piezas_compass()
    bloque, equipo = montar_bloque(DatosCoche(**COMPASS), PARTES), desc.equipamiento(piezas)
    for vineta in ("Pantalla táctil Uconnect", "Climatizador bizona"):
        assert f"* {vineta}" in bloque and f"\n{vineta}" in "\n" + equipo
    # lo técnico cambia de forma: «Campo: valor» en coches.net, ítems que sobreviven al tema en la web
    assert "* Potencia combinada: 240 CV" in bloque and "Potencia combinada" not in equipo
    assert "* Plazas: 5" in bloque and "\n5 plazas" in equipo
    assert "🎯 Exterior" in bloque and "//// Exterior" in equipo


# --------------------------------------------- destacados de la ficha de exposición
def test_el_esquema_y_el_prompt_piden_destacados():
    assert "destacados" in desc.SCHEMA["required"] and desc.SCHEMA["properties"]["destacados"]["type"] == "array"
    assert desc.ESQUEMA_CACHE >= 4                      # la caché anterior no traía destacados
    prompt = desc.prompt_para(DatosCoche(**COMPASS), ["1.jpg"])
    assert '"destacados": de 3 a 4 puntos fuertes' in prompt and "Nada que no esté en esas listas" in prompt


def test_destacados_validados_contra_el_equipamiento_listado():
    """Solo los que están en las listas; lo inventado o lo que ya dice la ficha se cae (y queda en PARA VERIFICAR),
    y si quedan menos de 3 se completa con los primeros de tecnología / confort / seguridad."""
    partes = dict(PARTES, motor="1.3 T4 PHEV 240",
                  destacados=["Android Auto y Apple CarPlay", "Techo solar panorámico", "Faros LED",
                              "Potencia de 240 CV", "* Asientos calefactables."])
    pz = despiezar(DatosCoche(**COMPASS), partes)
    assert pz.motor == "1.3 T4 PHEV 240"
    assert pz.destacados == ["Android Auto y Apple CarPlay", "Asientos calefactables", "Pantalla táctil Uconnect"]
    assert desc.destacados_ficha(pz) == "Android Auto y Apple CarPlay\nAsientos calefactables\nPantalla táctil Uconnect"
    aviso = next(x for x in pz.para_verificar if x.startswith("descripción: destacados de la IA descartados"))
    assert "Techo solar panorámico" in aviso and "Faros LED" in aviso and "Potencia de 240 CV" in aviso
    assert "Android Auto" not in aviso


def test_un_destacado_que_solo_coincide_por_concepto_publica_la_vineta_listada():
    """«Sensores delanteros y traseros» con la lista diciendo solo «Sensores de aparcamiento»: se publica lo listado,
    así no se cuela un detalle que el equipamiento no confirma."""
    partes = dict(PARTES, destacados=["Climatización automática de dos zonas",
                                      "Sensores de aparcamiento delanteros y traseros", "Navegador GPS"])
    pz = despiezar(DatosCoche(**COMPASS), partes)
    assert pz.destacados == ["Climatizador bizona", "Sensores de aparcamiento", "Navegador integrado"]
    assert not any("destacados" in x for x in pz.para_verificar)


def test_destacados_sin_propuesta_como_mucho_cuatro_y_sin_repetir():
    # sin destacados (o todos inválidos): los primeros de cada lista, alternando y sin el piso normativo (ABS…)
    pz = despiezar(DatosCoche(**COMPASS), PARTES)
    assert pz.destacados == ["Pantalla táctil Uconnect", "Climatizador bizona", "Cámara de marcha atrás"]
    # obviedades y datos que ya muestra la ficha se caen aunque se parezcan a una viñeta listada
    assert desc.elegir_destacados(["Freno de mano", "Etiqueta CERO"],
                                  [("Confort / Interior", ["Freno de mano eléctrico"])]) == \
        (["Freno de mano eléctrico"], ["Freno de mano", "Etiqueta CERO"])
    muchos = ["Pantalla táctil Uconnect", "Apple CarPlay y Android Auto", "Android Auto y Apple CarPlay",
              "Climatizador bizona", "Barras de techo", "Asientos calefactables"]
    pz = despiezar(DatosCoche(**COMPASS), dict(PARTES, destacados=muchos))
    assert pz.destacados == ["Pantalla táctil Uconnect", "Apple CarPlay y Android Auto", "Climatizador bizona",
                             "Barras de techo"]
