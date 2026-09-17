"""Descripción de coches.net y campos de la web (_destacado / _equipamiento): cabecera y pie fijos
(plantillas/cochesnet-descripcion.txt) + un bloque por coche.

Lo duro lo arma Python con lo ya verificado (combustible, cilindrada, potencia, plazas) y la etiqueta DGT sale de
reglas deterministas (`etiqueta_dgt`): el modelo NO la decide. Claude Code headless (suscripción, sin coste por
llamada) recibe los datos de identificación del coche (hoja + permiso) y LAS FOTOS, identifica la versión comercial
exacta (con búsqueda web) y devuelve el equipamiento de serie o visible, más motor, cambio, color, puertas y
tracción. La versión identificada, la confianza y las fuentes no se publican: van a PARA VERIFICAR.
Caché por carpeta en data/descripciones/<carpeta>.json (versionada con ESQUEMA_CACHE).
"""
from __future__ import annotations

import json
import re
import tempfile
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path

import caja_fotos
import extract_claude
from combustible import DIESEL, ELECTRICO, GASES, GASOLINA, HIBRIDO, VALORES, gas_texto
from common import PROJECT_DIR, norm_text, parse_date
from extract import ExtractionError, cache_key
from marcas import km_web

PLANTILLA = PROJECT_DIR / "plantillas" / "cochesnet-descripcion.txt"
CACHE_DIR = PROJECT_DIR / "data" / "descripciones"
MARCADOR = "{BLOQUE_VEHICULO}"
SEPARADOR = "⸻"                      # U+2E3B, el que usa el usuario en su formato
MAX_FOTOS = 10
LADO = 1024
MAX_TURNS = 30                       # 10 fotos + búsquedas y lecturas web
TIMEOUT_S = 600
HERRAMIENTAS = ("Read", "WebSearch", "WebFetch")    # solo esta generación busca en la web
MIN_VINETAS, MAX_VINETAS = 4, 10
MAX_FUENTES = 8
# Subilo cuando cambie lo que se le pide al modelo: una caché con otro esquema no se reutiliza.
ESQUEMA_CACHE = 3
AVISO_VERIFICAR = "descripción: generada automáticamente, repasá el equipamiento antes de publicar"
AVISO_ETIQUETA = "confirmar etiqueta en dgt.es con la matrícula"

VENTAJAS_FIJAS = ("Financiación sin entrada disponible", "Kilómetros certificados",
                  "Aceptamos tu coche como parte de pago")
APARTADOS = (("tecnologia", "Tecnología / Multimedia"), ("confort", "Confort / Interior"),
             ("exterior", "Exterior"), ("seguridad", "Seguridad / Asistencia"))
PREFIJO_COCHESNET = "🎯"          # cabeceras de sección en el anuncio de coches.net
PREFIJO_WEB = "////"             # las mismas secciones en el campo _equipamiento de sevencars.es
TITULO_TECNICOS = "///// Datos técnicos:"
CONFIANZAS = ("alta", "media", "baja")
TRACCIONES_IA = ("delantera", "trasera", "total")

# Tracción total por el distintivo escrito en la versión: manda sobre lo que diga el modelo.
TRACCIONES = (("4x4", "4x4"), ("4xe", "4xe"), ("quattro", "quattro"), ("4motion", "4Motion"),
              ("xdrive", "xDrive"), ("awd", "AWD"), ("4matic", "4MATIC"))
_ENCHUFABLE = re.compile(r"enchufable|\bphev\b|\bplug[\s-]?in\b|\b4xe\b|\brecharge\b|\be-hybrid\b")

# --------------------------------------------------------------- etiqueta DGT
CERO, ECO, C, B = "CERO", "ECO", "C", "B"
GASOLINA_C, GASOLINA_B = date(2006, 1, 1), date(2001, 1, 1)      # Euro 4 / Euro 3 por fecha de matriculación
DIESEL_C, DIESEL_B = date(2015, 9, 1), date(2006, 1, 1)          # Euro 6 / Euro 4 por fecha de matriculación
AUTONOMIA_CERO_KM = 40
VENTANA_GASOLINA, VENTANA_DIESEL = (2000, 2005), (2014, 2015)    # años en los que la fecha no basta

# Conceptos canónicos del equipamiento: dos viñetas que caen en el mismo concepto son la misma cosa escrita
# de otra manera ("Climatizador bizona automático" y "Climatización automática de dos zonas"). El orden importa:
# lo específico va antes que lo general.
CONCEPTOS = tuple((nombre, re.compile(patron)) for nombre, patron in (
    ("diurnas", r"luces diurnas|\bdrl\b"),
    ("pilotos", r"pilotos|luces traseras"),
    ("faros", r"faros|luces (led|xenon|halogen)|luces delanteras"),
    ("startstop", r"start ?-? ?& ?-? ?stop|start ?-? ?stop"),
    ("estabilidad", r"control de traccion|estabilidad|\besp\b"),
    ("frenos", r"\babs\b|\bebd\b|frenos"),
    ("airbags", r"airbag"),
    ("isofix", r"isofix|anclajes"),
    ("camara", r"camara"),
    ("sensores", r"sensores de (aparcamiento|parking)|\bparking\b"),
    ("crucero", r"control de crucero"),
    ("keyless", r"arranque sin llave|keyless|boton de arranque"),
    ("navegacion", r"navegacion|navegador|\bgps\b"),
    # «Bluetooth» y «Conexión USB» son dos viñetas distintas (así las quiere el dueño en la web)
    ("bluetooth", r"bluetooth"),
    ("conectividad", r"\busb\b|conectividad|carplay|android auto"),
    ("pantalla", r"pantalla tactil|multimedia|uconnect"),
    ("cuadro", r"cuadro de instrumentos|instrumentos digital"),
    ("volante_regulable", r"volante (regulable|ajustable)|reglaje del volante"),
    ("volante", r"volante"),
    ("clima", r"climatizador|climatizacion|aire acondicionado"),
    ("elevalunas", r"elevalunas"),
    ("retrovisores", r"retrovisores"),
    ("llantas", r"llantas"),
    ("barras", r"barras de techo"),
    ("lunas", r"(cristales|lunas)[^.]*(tintad|oscurecid)"),
    ("carga", r"toma de carga|carga externa|punto de carga"),
    # lo que ya va en "Datos técnicos": si aparece en una sección, sobra (mandan los datos verificados).
    # Cuidado con el orden: "control de estabilidad y tracción" ya cayó antes en `estabilidad`.
    ("traccion", r"\btraccion\b|\b4x4\b|\bawd\b|quattro|4motion|xdrive|4matic"),
    ("cambio", r"\bcambio\b|caja de cambios"),
    ("combustible", r"\bcombustible\b|motor (hibrido|diesel|de gasolina|electrico)"),
    ("plazas", r"\bplazas\b"),
    ("cilindrada", r"\bcilindrada\b"),
    ("potencia", r"\bpotencia\b"),
    ("etiqueta", r"\betiqueta\b"),
))

# Viñetas que no dicen nada: adjetivos sin pieza que nombrar. El prompt ya las prohíbe; esto es la red.
RELLENO = tuple(re.compile(patron) for patron in (
    r"^estructura reforzada$", r"^acabados premium", r"^sistema .* avanzado$", r"^equipamiento completo$",
    r"^tecnologia de ultima generacion$", r"^diseno moderno$",
))

# Obviedades que lleva cualquier coche (lista negra; se compara sin acentos ni mayúsculas). Las variantes que sí
# son equipamiento se salvan: freno de mano eléctrico, retrovisor interior electrocrómico, bandeja de carga
# inalámbrica, guantera refrigerada, luz de frenado de emergencia, cortinillas parasol.
TRIVIAL = tuple(re.compile(patron) for patron in (
    r"\bfreno de mano\b(?!.*electri)",
    r"^(?!.*frenad).*(\bluz|\bluces|intermitentes) de (emergencia|peligro)|\bwarning\b",
    r"cinturon",
    r"\b12 ?v\b|mechero|encendedor",
    r"portaobjetos|porta objetos|^(?!.*(carga|inalambric|induccion)).*\b(bandeja|hueco)s?\b",
    r"\bguantera\b(?!.*refrigerad)",
    r"^(?!.*cortinill).*parasol",
    r"retrovisor interior(?!.*(electrocrom|fotocrom|antideslumbr|automatic))",
    r"alfombrilla",
))

# Piso de seguridad por normativa UE según la fecha de PRIMERA matriculación: (desde, viñeta, equivalentes). Si el
# modelo ya trajo algo equivalente (en cualquier apartado) no se añade; se compara por concepto, no por texto.
PISO_SEGURIDAD = tuple((desde, texto, re.compile(patron)) for desde, texto, patron in (
    (date(2004, 7, 1), "ABS", r"\babs\b|antibloqueo"),
    (date(2014, 11, 1), "Control electrónico de estabilidad", r"estabilidad|\besp\b|\besc\b|\bvdc\b|\bdsc\b"),
    (date(2014, 11, 1), "Control de presión de neumáticos",
     r"presion de (los )?neumaticos|\btpms\b|perdida de presion|deteccion de pinchazo"),
    (date(2014, 11, 1), "Anclajes ISOFIX", r"isofix|i-size"),
    (date(2024, 7, 7), "Frenada de emergencia autónoma",
     r"frenad[ao] (automatic[ao] )?(de emergencia )?(autonom|automatic|activ|inteligente)|\baeb\b|city (stop|safety)"),
    (date(2024, 7, 7), "Asistente inteligente de velocidad",
     r"asistente inteligente de velocidad|\bisa\b|limitador inteligente|reconocimiento de (las )?senales|lector de senales"),
    (date(2024, 7, 7), "Detector de fatiga", r"fatiga|somnolencia|cansancio|atencion del conductor"),
    (date(2024, 7, 7), "Luz de frenado de emergencia",
     r"(luz|luces|senal|senalizacion) de frenado de emergencia|\bess\b"),
    (date(2024, 7, 7), "Sensor o cámara de marcha atrás",
     r"camara|sensores? de (aparcamiento|parking|marcha atras)|\bparking\b|park assist|ayuda al aparcamiento"),
))
AVISO_IMPORTADO = "importado: confirmar equipamiento de seguridad por fecha de primera matriculación"
_IMPORTADO = re.compile(r"\b(importad[oa]s?|importacion|alemania|francia|italia|belgica|holanda|paises bajos|"
                        r"portugal|austria|suiza|reino unido|inglaterra|irlanda|dinamarca|suecia|noruega|finlandia|"
                        r"luxemburgo|polonia|chequia|republica checa|andorra)\b")
_BLUETOOTH = re.compile(r"bluetooth")
_TELEFONO_VOLANTE = re.compile(r"(telefono|manos libres).*volante|volante.*(telefono|manos libres)|\bmanos libres\b")

_TEXTO = {"type": "string"}
SCHEMA = {
    "type": "object",
    "properties": dict({"version_identificada": _TEXTO,
                        "confianza": {"type": "string", "enum": list(CONFIANZAS)},
                        "fuentes": {"type": "array", "items": _TEXTO},
                        "motor": _TEXTO, "cambio": _TEXTO, "color": _TEXTO,
                        "puertas": {"type": "integer"},
                        "traccion": {"type": "string", "enum": list(TRACCIONES_IA)},
                        "reclamo": _TEXTO, "parrafo": _TEXTO, "cierre": _TEXTO},
                       **{clave: {"type": "array", "items": _TEXTO} for clave, _ in APARTADOS}),
    "required": ["version_identificada", "confianza", "fuentes", "motor", "cambio", "color", "puertas", "traccion",
                 "reclamo", "parrafo", "cierre"] + [clave for clave, _ in APARTADOS],
    "additionalProperties": False,
}

PROMPT = """Sos quien redacta los anuncios de un concesionario español. Escribí el texto comercial de este coche
usado para publicarlo en coches.net y en la web del concesionario.

Datos de identificación (de la hoja del concesionario y del permiso de circulación; son ciertos):
{identificacion}

Datos verificados (son los únicos ciertos; van aparte en el anuncio, no los repitas como lista):
{datos}

Fotos reales del coche ({n}): {archivos}
Leé TODAS las imágenes con la herramienta Read, una por una, antes de responder. Para identificar la versión
podés usar WebSearch y WebFetch. No uses otras herramientas ni delegues en agentes.

PASO 1: IDENTIFICÁ LA VERSIÓN EXACTA. Con la marca, el modelo, la versión, la fecha de matriculación, la cilindrada,
la potencia (kW y CV), el combustible, el bastidor y los códigos del permiso, averiguá qué versión comercial exacta
se vendía en España (o en Europa, si no hay datos de España) en ese año: generación del modelo, denominación
comercial del motor y acabado. Buscá en fuentes fiables (web, catálogos y listas de precios del fabricante, km77,
fichas técnicas especializadas) y contrastá cilindrada, kW/CV y fechas de comercialización. Devolvé:
- "version_identificada": una línea con marca, modelo, generación, motor y acabado (p. ej. "Renault Clio V
  (2019-2023) 1.0 TCe 100 GLP Intens").
- "confianza": "alta" solo si motor, generación y acabado cuadran con los datos y con alguna fuente; "media" si
  motor y generación cuadran pero el acabado no se pudo confirmar; "baja" en cualquier otro caso.
- "fuentes": las URLs que consultaste y respaldan la identificación (lista vacía si no consultaste ninguna).
  Nunca inventes URLs.

PASO 2: EQUIPAMIENTO. REGLA INNEGOCIABLE: solo podés listar equipamiento DE SERIE en esa versión y ese año según
las fuentes, o que SE VEA en las fotos. Nunca opcionales ni paquetes que no se vean en las fotos.
Está prohibido inventar extras: si dudás de un extra, no lo pongas. Nada de precios, financiación, garantía,
kilómetros ni datos de contacto: eso ya va en el resto del anuncio.
SI EL ACABADO NO ESTÁ CONFIRMADO: identificá los acabados candidatos de esa versión en ese año, consultá la ficha de
equipamiento de serie de CADA candidato y listá lo que es de serie en TODOS ellos (la intersección de las fichas
consultadas), más lo que se vea en las fotos. Lo común a todos los acabados candidatos es de serie seguro: listalo,
no lo omitas por prudencia. La prudencia es para los extras, no para el equipamiento de serie común.
"seguridad" cubre PRIMERO los sistemas principales que la fuente confirme para esa versión: ABS, control
electrónico de estabilidad, airbags (con detalle si la fuente lo da: frontales, laterales, de cortina, de
rodilla), anclajes ISOFIX, control de presión de neumáticos, asistente de arranque en pendiente, frenada de
emergencia, aviso o mantenimiento de carril, etc. Después, lo demás.
"tecnologia": si hay mandos de teléfono en el volante, o la fuente lista Bluetooth de serie en todos los
candidatos, poné "Bluetooth".
NADA DE OBVIEDADES que lleva cualquier coche: freno de mano, luces de emergencia (warning), cinturones de seguridad
o aviso de cinturón, toma de 12 V o mechero, bandejas o huecos portaobjetos, guantera, parasoles, retrovisor
interior, alfombrillas.

Qué tenés que devolver además:
- "reclamo": un reclamo de 3 a 6 palabras para el titular, SIN la marca ni el modelo (ya van delante) y sin
  precios ni teléfonos. Tono del estilo: "SUV híbrido enchufable con tracción total".
- "parrafo": un párrafo de 3 a 5 líneas sobre ESTE coche: qué tipo de coche es, a quién le encaja y qué se ve en
  las fotos. Español de España, comercial y natural, sin exagerar.
- "cierre": UNA frase de cierre sobre este coche, que resuma sus puntos fuertes, distinta del párrafo anterior
  y sin repetir sus palabras.
- "tecnologia", "confort", "exterior" y "seguridad": hasta {max} viñetas cada uno (lo normal, entre {min} y {max};
  menos si no hay tantas seguras), de 1 a 8 palabras, en español de España, sin punto final. Estilo: "Bluetooth",
  "Volante multifunción", "Control de presión de neumáticos", "Carrocería de 5 puertas".
- "motor": la denominación comercial del motor, sin la palabra "motor" (p. ej. "1.0 TCe 100 GLP", "2.0 TDI 150",
  "1.6 GDi PHEV"); cadena vacía si no lo identificaste.
- "cambio": tipo y número de marchas, empezando por "manual" o "automático" (p. ej. "manual de 6 velocidades",
  "automático de doble embrague de 7 velocidades", "automático de variador continuo (CVT)"), SOLO si está
  confirmado para esta versión y coincide con el cambio de los datos; si no, cadena vacía.
- "color": el color de la carrocería que se ve en las fotos, con un nombre común en español ("Blanco", "Gris
  oscuro", "Granate"), sin nombres comerciales del fabricante.
- "puertas": número de puertas de la carrocería contando el portón (3, 4 o 5), según las fotos y la versión; 0 si
  no se puede saber.
- "traccion": "delantera", "trasera" o "total", según la versión identificada (siempre uno de los tres).

CADA VIÑETA NOMBRA UNA PIEZA: tiene que decir un elemento identificable y concreto del coche ("cámara de visión
trasera", "barras de techo", "asientos calefactables"). Prohibidos los adjetivos vacíos solos, sin la pieza que
califican: avanzado, premium, reforzado, de calidad, moderno, completo. Nada de "estructura reforzada",
"acabados premium" ni "sistema de infoentretenimiento avanzado". Tampoco repitas lo que ya va en los datos
técnicos (combustible, cilindrada, potencia, cambio, tracción, plazas, etiqueta).

PROHIBIDO INVENTAR CIFRAS: en las viñetas de equipamiento no escribas medidas ni números concretos (pulgadas de
la pantalla, litros del maletero, vatios o número de altavoces, pulgadas de las llantas, velocidades de la caja)
salvo que se lean con claridad en una foto. Describilo en cualitativo: "pantalla táctil de gran formato",
"llantas de aleación", "equipo de sonido premium". No repitas una misma viñeta en dos apartados.

Respondé únicamente con el objeto JSON, sin texto alrededor ni bloques de código."""


# ------------------------------------------------- lo que el tema de la web hace con _equipamiento
# Réplica mínima de wp-content/themes/generatepress_child/inc/seven-equipamiento.php (solo lectura): sirve para no
# mandarle ítems que el tema tiraría o confundiría con un encabezado.
_TEMA_ACENTOS = str.maketrans({"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n", "à": "a",
                               "è": "e", "ç": "c"})
_TEMA_BORDES = re.compile(r"^[\s:.\u2013\u2014\u2022·\-]+|[\s:.\u2013\u2014\u2022·\-]+$")
_TEMA_REPETIDO = re.compile(r"^(?:combustible|cilindrada|potencia(?: combinada)?|cambio|caja de cambios|kilometraje|"
                            r"kilometros|kms?|ano(?: de matriculacion)?|matriculacion|matricula|garantia)\b"
                            r"[\s:\u2013\u2014\-]*(.*)$")
TEMA_VOCABULARIO = frozenset((
    "datos tecnicos", "caracteristicas tecnicas", "ficha tecnica", "especificaciones", "motor", "motorizacion",
    "mecanica", "prestaciones", "tecnologia", "multimedia", "conectividad", "confort", "interior", "habitaculo",
    "exterior", "diseno", "carroceria", "seguridad", "asistencia", "asistencias", "asistencia a la conduccion",
    "asistencias a la conduccion", "ayudas a la conduccion", "equipamiento", "extras"))


def tema_clave(texto: str) -> str:
    """seven_equipamiento_clave(): minúsculas, sin acentos, espacios simples y sin puntuación en los bordes."""
    t = re.sub(r"\s+", " ", str(texto or "").lower().translate(_TEMA_ACENTOS))
    return _TEMA_BORDES.sub("", t)


def tema_repetido(item: str) -> bool:
    """seven_equipamiento_repetido(): «Cambio: Manual» se cae (valor ≤ 20 caracteres tras la etiqueta)."""
    m = _TEMA_REPETIDO.match(tema_clave(item))
    return bool(m) and len(m.group(1).strip()) <= 20


def tema_es_titulo(texto: str) -> bool:
    """seven_equipamiento_es_titulo(): renglón corto acabado en «:» o hecho solo de piezas del vocabulario."""
    clave = tema_clave(texto)
    if not clave:
        return False
    if str(texto).strip().endswith(":") and len(clave.split()) <= 6:
        return True
    piezas = [p.strip() for p in re.split(r"\s*[/·|+,]\s*|\s+y\s+", clave) if p.strip()]
    return bool(piezas) and all(p in TEMA_VOCABULARIO for p in piezas)


# --------------------------------------------------------------- etiqueta DGT
_EURO_NUM = re.compile(r"\beuro\s*-?\s*([1-6])(?!\d)")
_EURO_ROMANO = re.compile(r"\beuro\s*-?\s*(iii|ii|iv|vi|v|i)\b")
_ROMANOS = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6}


def nivel_euro(texto) -> int | None:
    """V.9 'EURO 6D-TEMP' -> 6; 'Euro IV' -> 4; '715/2007*2018/1832AP' (sin número Euro legible) -> None."""
    t = norm_text(texto)
    m = _EURO_NUM.search(t)
    if m:
        return int(m.group(1))
    m = _EURO_ROMANO.search(t)
    return _ROMANOS[m.group(1)] if m else None


def _desde(fecha: date | None, anio: int | None, corte: date) -> bool | None:
    """¿Matriculado desde `corte`? Con solo el año: None si el corte cae a mitad de ese año (no se sabe)."""
    if fecha is not None:
        return fecha >= corte
    if anio is None:
        return None
    if anio != corte.year:
        return anio > corte.year
    return True if (corte.month, corte.day) == (1, 1) else None


def _etiqueta_termico(combustible: str, fecha: date | None, anio: int | None, euro) -> tuple[str | None, str]:
    """Gasolina o diésel: norma Euro (V.9) si se lee; si no, por fecha de matriculación con aviso en la ventana."""
    n = nivel_euro(euro)
    anio = fecha.year if fecha else anio
    if combustible == GASOLINA:
        if n is not None:
            return (C if n >= 4 else B if n == 3 else None), ""
        if anio is None:
            return None, ""
        etiqueta = C if _desde(fecha, anio, GASOLINA_C) else B if _desde(fecha, anio, GASOLINA_B) else None
        duda = VENTANA_GASOLINA[0] <= anio <= VENTANA_GASOLINA[1]
        return etiqueta, (f"gasolina de {anio} sin norma Euro legible: puede ser Euro 3 (B) o Euro 4 (C)" if duda else "")
    if n is not None:
        return (C if n >= 6 else B if n in (4, 5) else None), ""
    if anio is None:
        return None, ""
    corte_c = _desde(fecha, anio, DIESEL_C)
    etiqueta = C if corte_c else B if (corte_c is None or _desde(fecha, anio, DIESEL_B)) else None
    duda = VENTANA_DIESEL[0] <= anio <= VENTANA_DIESEL[1]
    return etiqueta, (f"diésel de {anio} sin norma Euro legible: puede ser Euro 5 (B) o Euro 6 (C)" if duda else "")


def etiqueta_dgt(combustible: str, fecha: date | None = None, anio: int | None = None, euro=None, gas: str = "",
                 enchufable: bool = False, autonomia_km: int | None = None) -> tuple[str | None, str]:
    """(etiqueta, duda). CERO = eléctrico o enchufable con ≥ 40 km; ECO = híbrido no enchufable, enchufable < 40 km o
    gas (GLP/GNC/GNL) que cumple la C; C = gasolina Euro 4+ (desde 2006) o diésel Euro 6 (desde 01/09/2015);
    B = gasolina Euro 3 (2001-2005) o diésel Euro 4/5 (2006 a 31/08/2015); None = sin etiqueta o sin datos.
    `duda` no vacía cuando la fecha no basta: se pone la etiqueta por fecha y hay que confirmarla en la DGT."""
    if combustible == ELECTRICO:
        return CERO, ""
    if combustible == HIBRIDO:
        if not enchufable:
            return ECO, ""
        if autonomia_km is not None:
            return (CERO if autonomia_km >= AUTONOMIA_CERO_KM else ECO), ""
        return CERO, f"híbrido enchufable sin autonomía eléctrica conocida (CERO con {AUTONOMIA_CERO_KM} km o más, si no ECO)"
    if combustible not in (GASOLINA, DIESEL):
        return None, ""
    etiqueta, duda = _etiqueta_termico(combustible, fecha, anio, euro)
    if gas in GASES:
        if etiqueta == C:
            return ECO, duda
        if etiqueta is not None or duda:
            return etiqueta, (f"{gas}: la ECO exige cumplir la C y por fecha sale {etiqueta or 'sin etiqueta'}"
                              + (f"; {duda}" if duda else ""))
    return etiqueta, duda


# --------------------------------------------------------------- datos duros
@dataclass
class DatosCoche:
    """Lo verificado del coche. De acá salen los 'Datos técnicos' y la etiqueta, sin que el modelo toque nada."""
    marca: str = ""
    modelo: str = ""
    version: str = ""
    combustible: str = ""
    cilindrada: int | None = None
    cv: int | None = None
    caja: str = ""
    plazas: int | None = None
    anio: int | None = None
    p3: str = ""                      # combustible tal cual lo escribe el permiso (enchufable, gas)
    fecha: date | None = None         # fecha de matriculación (hoja E o permiso)
    kw: float | None = None           # P.2 del permiso (en híbridos, solo el motor térmico)
    bastidor: str = ""                # E, VIN
    tipo_variante: str = ""           # D.2
    denominacion: str = ""            # D.3
    codigo_variante: str = ""         # CV
    homologacion: str = ""            # K
    norma_euro: str = ""              # V.9 (tarjeta ITV)
    gas: str = ""                     # GLP | GNC | GNL (bifuel: en la hoja y en la web sigue siendo Gasolina)
    autonomia_km: int | None = None   # autonomía eléctrica de un enchufable, si se conoce
    fecha_primera: date | None = None  # B del permiso: primera matriculación (en un importado, la del extranjero)
    importado: bool = False           # la carpeta o el MODELO dicen importado / Alemania / Francia...

    def __post_init__(self):
        if self.anio is None and self.fecha is not None:
            self.anio = self.fecha.year

    @property
    def titulo(self) -> str:
        return " ".join(p for p in (self.marca, self.modelo, self.version) if p).upper()

    @property
    def enchufable(self) -> bool:
        return bool(_ENCHUFABLE.search(norm_text(f"{self.version} {self.modelo} {self.p3}")))

    @property
    def gas_detectado(self) -> str:
        """El gas indicado, o el que dicen el P.3 o el valor de combustible ('GLP' en la hoja)."""
        if self.gas in GASES:
            return self.gas
        if self.combustible in (DIESEL, HIBRIDO, ELECTRICO):
            return ""
        return gas_texto(self.p3) or gas_texto(self.combustible) or ""

    @property
    def combustible_base(self) -> str:
        """Vocabulario de la web; un 'GLP' suelto (bifuel) cuenta como Gasolina."""
        if self.combustible in VALORES:
            return self.combustible
        return GASOLINA if self.gas_detectado else ""

    @property
    def combustible_texto(self) -> str:
        base, gas = self.combustible_base, self.gas_detectado
        return f"{base} / {gas} (bifuel)" if base and gas else (base or self.combustible)

    @property
    def traccion(self) -> str | None:
        """Solo si el distintivo aparece en la versión (4x4, 4xe, quattro, 4Motion, xDrive, AWD, 4MATIC)."""
        texto = norm_text(self.version)
        for token, etiqueta in TRACCIONES:
            if re.search(rf"(?<![a-z0-9]){token}(?![a-z])", texto):
                return etiqueta
        return None

    def _etiqueta(self) -> tuple[str | None, str]:
        return etiqueta_dgt(self.combustible_base, self.fecha, self.anio, self.norma_euro, self.gas_detectado,
                            self.enchufable, self.autonomia_km)

    @property
    def etiqueta(self) -> str | None:
        """Etiqueta DGT determinista (etiqueta_dgt); None = sin etiqueta o sin datos: no se pone viñeta."""
        return self._etiqueta()[0]

    @property
    def aviso_etiqueta(self) -> str:
        """Línea de PARA VERIFICAR cuando la etiqueta sale por fecha en una ventana dudosa; '' si es segura."""
        etiqueta, duda = self._etiqueta()
        if not duda:
            return ""
        return f"etiqueta DGT: {etiqueta or 'sin etiqueta'} por fecha de matriculación ({duda}): {AVISO_ETIQUETA}"

    @property
    def etiqueta_potencia(self) -> str:
        """En híbridos y eléctricos la CV de la hoja es la potencia TOTAL del sistema: se dice así."""
        return "Potencia combinada" if self.combustible in (HIBRIDO, ELECTRICO) else "Potencia"

    def identificacion(self) -> list[str]:
        """Lo que recibe el modelo para identificar la versión exacta (sin dato, sin línea)."""
        fecha = (("Fecha de matriculación", self.fecha.strftime("%d/%m/%Y")) if self.fecha
                 else ("Año de matriculación", str(self.anio) if self.anio else ""))
        combustible = self.combustible_texto + (f" (P.3 del permiso: «{self.p3}»)" if self.p3 else "")
        filas = [("Marca", self.marca), ("Modelo", self.modelo), ("Versión (texto de la hoja)", self.version), fecha,
                 ("Combustible", combustible.strip()),
                 ("Cilindrada", f"{self.cilindrada} cc" if self.cilindrada else ""),
                 ("Potencia neta P.2 del permiso", f"{self.kw:g} kW" if self.kw else ""),
                 ("Potencia total del sistema" if self.combustible in (HIBRIDO, ELECTRICO) else "Potencia",
                  f"{self.cv} CV" if self.cv else ""),
                 ("Cambio", self.caja), ("Plazas (S.1)", str(self.plazas) if self.plazas else ""),
                 ("Bastidor (VIN)", self.bastidor), ("D.2 tipo / variante / versión", self.tipo_variante),
                 ("D.3 denominación comercial", self.denominacion), ("CV código de variante", self.codigo_variante),
                 ("K número de homologación", self.homologacion), ("V.9 norma Euro", self.norma_euro),
                 ("B fecha de primera matriculación",
                  self.fecha_primera.strftime("%d/%m/%Y") if self.fecha_primera else "")]
        return [f"{campo}: {valor}" for campo, valor in filas if str(valor or "").strip()]

    def tecnicos(self, ia: "TecnicoIA | None" = None) -> list[str]:
        """Viñetas de 'Datos técnicos' de coches.net: sin dato, sin viñeta. Nunca se rellena a ojo; lo de la IA
        (motor, cambio con marchas, color, puertas, tracción) solo entra si vino y pasó la validación."""
        ia = ia or TecnicoIA()
        filas = [("Versión", self.version),
                 ("Motor", ia.motor),
                 ("Combustible", self.combustible_texto),
                 ("Cilindrada", f"{km_web(self.cilindrada)} cc" if self.cilindrada else ""),
                 (self.etiqueta_potencia, f"{self.cv} CV" if self.cv else ""),
                 ("Cambio", ia.cambio[:1].upper() + ia.cambio[1:] if ia.cambio else self.caja),
                 ("Tracción", f"total ({self.traccion})" if self.traccion else ia.traccion),
                 ("Color", ia.color),
                 ("Puertas", str(ia.puertas) if ia.puertas else ""),
                 ("Plazas", str(self.plazas) if self.plazas else ""),
                 ("Etiqueta medioambiental", self.etiqueta or "")]
        return [f"{campo}: {valor}" for campo, valor in filas if valor]

    def tecnicos_web(self, ia: "TecnicoIA | None" = None) -> list[str]:
        """«Lo técnico» de la web: ítems que el tema NO tira (lo que ya dice su tabla —combustible, cilindrada,
        potencia, cambio sin detalle— no se repite). «Motor 1.0 TCe 100 GLP», «Cambio manual de 6 velocidades»,
        «Color: Granate», «5 puertas / 5 plazas», «Tracción delantera», «Etiqueta medioambiental ECO»."""
        ia = ia or TecnicoIA()
        items = [f"Motor {ia.motor}" if ia.motor else (f"Versión: {self.version}" if self.version else "")]
        if ia.cambio:
            cambio = f"Cambio {ia.cambio}"
            items.append(f"Transmisión {ia.cambio}" if tema_repetido(cambio) else cambio)
        if self.gas_detectado:
            items.append(f"Doble combustible: gasolina y {self.gas_detectado}")
        if ia.color:
            items.append(f"Color: {ia.color}")
        items.append(" / ".join(x for x in (f"{ia.puertas} puertas" if ia.puertas else "",
                                            f"{self.plazas} plazas" if self.plazas else "") if x))
        traccion = f"total ({self.traccion})" if self.traccion else ia.traccion
        items.append(f"Tracción {traccion}" if traccion else "")
        items.append(f"Etiqueta medioambiental {self.etiqueta}" if self.etiqueta else "")
        return [i for i in items if i and not tema_repetido(i) and not tema_es_titulo(i)]


CAMPOS_DOCUMENTO = {"kw": "potencia_kw", "plazas": "plazas", "bastidor": "bastidor", "tipo_variante": "tipo_variante",
                    "fecha_primera": "fecha_primera_matriculacion",
                    "denominacion": "denominacion_comercial", "codigo_variante": "codigo_variante",
                    "homologacion": "homologacion", "norma_euro": "norma_euro", "p3": "combustible"}


def datos_documentos(ai_result: dict | None) -> dict:
    """Campos de DatosCoche que salen de la lectura de documentos: el permiso primero y, si falta, la ficha técnica."""
    docs = [d for d in ((ai_result or {}).get(k) or {} for k in ("permiso_circulacion", "ficha_tecnica"))
            if isinstance(d, dict) and d.get("presente", True)]
    salida: dict = {}
    for campo, clave in CAMPOS_DOCUMENTO.items():
        valor = next((d.get(clave) for d in docs if d.get(clave) not in (None, "")), None)
        if valor is None:
            continue
        if campo == "plazas":
            try:
                valor = int(valor)
            except (TypeError, ValueError):
                continue
        elif campo == "fecha_primera":
            valor = parse_date(valor)
            if valor is None:
                continue
        elif campo == "kw":
            try:
                valor = float(valor)
            except (TypeError, ValueError):
                continue
        else:
            valor = str(valor).strip()
        salida[campo] = valor
    return salida


# ------------------------------------------------------ lo técnico que dice la IA
@dataclass
class TecnicoIA:
    """Motor, cambio, color, puertas y tracción según el modelo, ya validados (lo dudoso queda vacío)."""
    motor: str = ""
    cambio: str = ""                  # "manual de 6 velocidades": solo con el nº de marchas confirmado
    color: str = ""
    puertas: int | None = None
    traccion: str = ""                # delantera | trasera | total
    avisos: list[str] = field(default_factory=list)


_MARCHAS = re.compile(r"\b\d{1,2}\s*(?:velocidades|marchas|relaciones)\b")
_SIN_MARCHAS = re.compile(r"variador continuo|\be-?cvt\b|\b(?:una|1) velocidad\b")


def _una_linea(texto) -> str:
    return re.sub(r"\s+", " ", str(texto or "")).strip()


def _motor_ia(texto) -> str:
    t = re.sub(r"^motor\b\s*:?\s*", "", _una_linea(texto).rstrip("."), flags=re.IGNORECASE).strip()
    return t if len(t) <= 60 else ""


def _cambio_ia(texto, caja: str) -> tuple[str, str]:
    """('manual de 6 velocidades', aviso). Vacío si no empieza por manual/automático, si no trae el nº de marchas
    (o variador continuo) o si contradice la caja verificada."""
    t = re.sub(r"^(?:cambio|caja de cambios|transmisi[oó]n)\b\s*:?\s*", "", _una_linea(texto).rstrip("."),
               flags=re.IGNORECASE).strip()
    normal = norm_text(t)
    if not normal:
        return "", ""
    tipo = "manual" if normal.startswith("manual") else "automatico" if normal.startswith("automat") else ""
    if not tipo or not (_MARCHAS.search(normal) or _SIN_MARCHAS.search(normal)):
        return "", ""
    if caja and not norm_text(caja).startswith(tipo[:6]):
        return "", (f"descripción: la IA dice cambio «{t}» pero la caja verificada es {caja}: no se publica el "
                    "detalle del cambio")
    t = re.sub(r"\b(\d{1,2})\s*(?:marchas|relaciones)\b", r"\1 velocidades", t, flags=re.IGNORECASE)
    return t[:1].lower() + t[1:], ""


def _color_ia(texto) -> str:
    t = re.sub(r"^colou?r\b\s*:?\s*", "", _una_linea(texto).rstrip("."), flags=re.IGNORECASE).strip()
    if not t or len(t) > 30 or re.search(r"\d", t):
        return ""
    return t[:1].upper() + t[1:].lower()


def _puertas_ia(valor) -> int | None:
    m = re.search(r"\d+", str(valor if valor is not None and not isinstance(valor, bool) else ""))
    n = int(m.group()) if m else None
    return n if n in (2, 3, 4, 5) else None


def _traccion_ia(texto) -> str:
    t = norm_text(texto)
    if re.search(r"total|integral|4x4|\bawd\b|\b4wd\b", t):
        return "total"
    if "delanter" in t:
        return "delantera"
    if "traser" in t:
        return "trasera"
    return ""


def leer_tecnico(datos: DatosCoche, partes: dict) -> TecnicoIA:
    """Lo técnico del JSON del modelo, limpio y contrastado con lo verificado."""
    avisos: list[str] = []
    cambio, aviso = _cambio_ia(partes.get("cambio"), datos.caja)
    if aviso:
        avisos.append(aviso)
    traccion = _traccion_ia(partes.get("traccion"))
    if datos.traccion:                              # el distintivo de la versión manda
        if traccion and traccion != "total":
            avisos.append(f"descripción: la IA dice tracción {traccion} pero la versión lleva «{datos.traccion}»: "
                          "se publica tracción total")
        traccion = "total"
    return TecnicoIA(motor=_motor_ia(partes.get("motor")), cambio=cambio, color=_color_ia(partes.get("color")),
                     puertas=_puertas_ia(partes.get("puertas")), traccion=traccion, avisos=avisos)


def _fuentes(valor) -> list[str]:
    salida: list[str] = []
    for url in valor if isinstance(valor, list) else []:
        url = _una_linea(url)
        if re.match(r"^https?://\S+$", url) and url not in salida:
            salida.append(url)
    return salida[:MAX_FUENTES]


def verificar_ia(datos: DatosCoche, partes: dict, ia: TecnicoIA) -> list[str]:
    """Líneas de PARA VERIFICAR: versión identificada, confianza y fuentes (no se publican), la etiqueta dudosa y
    las contradicciones entre la IA y lo verificado."""
    version = _una_linea(partes.get("version_identificada"))
    confianza = norm_text(partes.get("confianza"))
    confianza = confianza if confianza in CONFIANZAS else ""
    fuentes = _fuentes(partes.get("fuentes"))
    lineas = [f"descripción: versión identificada por la IA: {version or '(no la identificó)'} "
              f"(confianza {confianza or 'sin indicar'})",
              "descripción: fuentes: " + (" · ".join(fuentes) if fuentes else "ninguna")]
    if confianza != "alta":
        lineas.append(f"descripción: confianza {confianza or 'sin indicar'} en la versión: revisar equipamiento")
    lineas += ia.avisos
    if fecha_normativa(datos)[2]:
        lineas.append(AVISO_IMPORTADO)
    if datos.aviso_etiqueta:
        lineas.append(datos.aviso_etiqueta)
    return lineas


@dataclass
class Piezas:
    """El texto generado en piezas, para que cada destino (coches.net, la web) lo componga a su manera."""
    titulo: str = ""
    reclamo: str = ""
    parrafo: str = ""
    cierre: str = ""
    tecnicos: list[str] = field(default_factory=list)          # «Campo: valor» (coches.net)
    secciones: list[tuple[str, list[str]]] = field(default_factory=list)
    tecnicos_web: list[str] = field(default_factory=list)      # «Lo técnico» de la web (sobrevive al tema)
    version_identificada: str = ""
    confianza: str = ""
    fuentes: list[str] = field(default_factory=list)
    para_verificar: list[str] = field(default_factory=list)    # nada de esto se publica

    @property
    def titular(self) -> str:
        return f"{self.titulo} – {self.reclamo}".strip().strip("–").strip()


@dataclass
class Descripcion:
    texto: str = ""                   # anuncio completo de coches.net (plantilla + bloque)
    bloque: str = ""
    fuente: str = ""                  # "ia" | "caché" | "fallo"
    error: str = ""
    piezas: Piezas | None = None      # las mismas piezas, para componer los campos de la web

    @property
    def ok(self) -> bool:
        return bool(self.texto)


# ------------------------------------------------------------------- montaje
def es_importado(*textos) -> bool:
    """True si algún texto (nombre de la carpeta, MODELO) dice que el coche es de importación."""
    return any(_IMPORTADO.search(norm_text(t)) for t in textos if t)


def es_trivial(texto: str) -> bool:
    """True si la viñeta es una obviedad de la lista negra (freno de mano, guantera, toma de 12 V...)."""
    normal = norm_text(texto)
    return any(patron.search(normal) for patron in TRIVIAL)


def fecha_normativa(datos: DatosCoche) -> tuple[date | None, int | None, bool]:
    """(fecha, año, importado_sin_B) para el piso de seguridad: la B del permiso si está; si no, la fecha de
    matriculación (hoja o permiso), salvo en un importado, donde esa fecha puede no ser la primera."""
    if datos.fecha_primera is not None:
        return datos.fecha_primera, None, False
    if datos.importado:
        return None, None, True
    return datos.fecha, datos.anio, False


def piso_seguridad(datos: DatosCoche, secciones: list[tuple[str, list[str]]]) -> list[str]:
    """Lo obligatorio por normativa UE en la fecha de primera matriculación que el modelo no trajo."""
    fecha, anio, _ = fecha_normativa(datos)
    textos = [norm_text(v) for _, vs in secciones for v in vs]
    return [texto for desde, texto, patron in PISO_SEGURIDAD
            if _desde(fecha, anio, desde) is True and not any(patron.search(t) for t in textos)]


def completar_equipamiento(datos: DatosCoche, secciones: list[tuple[str, list[str]]]) -> list[tuple[str, list[str]]]:
    """Reglas deterministas sobre lo que devolvió el modelo: Bluetooth si hay mandos de teléfono en el volante y el
    piso normativo de seguridad (al principio de su apartado, nunca recortado)."""
    por_nombre = {nombre: list(vs) for nombre, vs in secciones}
    textos = [norm_text(v) for vs in por_nombre.values() for v in vs]
    tecnologia, seguridad = APARTADOS[0][1], APARTADOS[3][1]
    if not any(_BLUETOOTH.search(t) for t in textos) and any(_TELEFONO_VOLANTE.search(t) for t in textos):
        por_nombre[tecnologia] = por_nombre.get(tecnologia, [])[:MAX_VINETAS - 1] + ["Bluetooth"]
    faltan = piso_seguridad(datos, secciones)
    if faltan:
        por_nombre[seguridad] = (faltan + por_nombre.get(seguridad, []))[:max(MAX_VINETAS, len(faltan))]
    return [(nombre, por_nombre.get(nombre, [])) for _, nombre in APARTADOS]


def es_relleno(texto: str) -> bool:
    """True si la viñeta es puro adjetivo y no nombra ninguna pieza identificable."""
    normal = norm_text(texto)
    return any(patron.search(normal) for patron in RELLENO)


def concepto(texto: str) -> str:
    """Concepto canónico de una viñeta; si no encaja en ninguno, su propio texto normalizado (compara literal)."""
    normal = norm_text(texto)
    for nombre, patron in CONCEPTOS:
        if patron.search(normal):
            return nombre
    return normal


def _vinetas(items, vistas: set[str] | None = None) -> list[str]:
    """Limpia lo que devuelve el modelo: sin viñeta delante, sin punto final y sin repetir. La comparación es por
    concepto, no por texto, así que las reescrituras también caen. `vistas` se comparte entre los cuatro apartados:
    la viñeta se queda en el primero donde aparece (mejor corto que repetido). Una viñeta que el tema de la web
    leería como encabezado («Interior», «Extras:») se descarta."""
    vistas = vistas if vistas is not None else set()
    salida: list[str] = []
    for item in items if isinstance(items, list) else []:
        valor = _una_linea(item).lstrip("*-• ").rstrip(".").rstrip(":").strip()
        if not valor or es_relleno(valor) or es_trivial(valor) or tema_es_titulo(valor):
            continue
        clave = concepto(valor)
        if clave not in vistas:
            vistas.add(clave)
            salida.append(valor)
    return salida[:MAX_VINETAS]


def despiezar(datos: DatosCoche, partes: dict) -> Piezas:
    """Lo que devolvió el modelo, ya limpio y deduplicado, junto a los datos técnicos que arma Python."""
    ia = leer_tecnico(datos, partes)
    tecnicos = datos.tecnicos(ia)
    vistas = {concepto(t) for t in tecnicos}          # lo técnico manda: el equipamiento no lo repite
    secciones = completar_equipamiento(datos, [(nombre, _vinetas(partes.get(clave), vistas))
                                               for clave, nombre in APARTADOS])
    confianza = norm_text(partes.get("confianza"))
    return Piezas(titulo=datos.titulo, reclamo=_una_linea(partes.get("reclamo")).upper(),
                  parrafo=_una_linea(partes.get("parrafo")), cierre=_una_linea(partes.get("cierre")),
                  tecnicos=tecnicos, secciones=[(n, vs) for n, vs in secciones if vs],
                  tecnicos_web=datos.tecnicos_web(ia),
                  version_identificada=_una_linea(partes.get("version_identificada")),
                  confianza=confianza if confianza in CONFIANZAS else "", fuentes=_fuentes(partes.get("fuentes")),
                  para_verificar=verificar_ia(datos, partes, ia))


def montar_bloque(datos: DatosCoche, partes: dict) -> str:
    """Bloque de coches.net: titular, ventajas, párrafo, datos técnicos y los cuatro apartados 🎯, con asteriscos."""
    pz = despiezar(datos, partes)
    lineas = [pz.titular, ""] + [f"* {v}" for v in VENTAJAS_FIJAS]
    if pz.parrafo:
        lineas += ["", pz.parrafo]
    lineas += ["", TITULO_TECNICOS, ""] + [f"* {v}" for v in pz.tecnicos]
    if pz.secciones:
        lineas += ["", SEPARADOR]
        for nombre, vs in pz.secciones:
            lineas += ["", f"{PREFIJO_COCHESNET} {nombre}", ""] + [f"* {v}" for v in vs]
    return "\n".join(lineas)


def montar(datos: DatosCoche, partes: dict, plantilla: Path = PLANTILLA) -> tuple[str, str]:
    """(texto completo, bloque): la plantilla fija con el bloque del coche en el marcador."""
    bloque = montar_bloque(datos, partes)
    return Path(plantilla).read_text(encoding="utf-8").replace(MARCADOR, bloque), bloque


# ------------------------------------------------- campos ACF de sevencars.es
def _cabecera_y_pie(plantilla: Path | None = None) -> tuple[list[str], list[str]]:
    """Las dos mitades fijas de la plantilla, en líneas y sin los asteriscos (en la web las viñetas van sin `*`)."""
    texto = Path(plantilla or PLANTILLA).read_text(encoding="utf-8")
    cabecera, pie = texto.split(MARCADOR)
    return cabecera.strip().splitlines(), [linea.lstrip("* ") for linea in pie.strip().splitlines()]


def destacado(pz: Piezas, plantilla: Path | None = None) -> str:
    """Campo ACF _destacado: la parte narrativa. Viñetas con guion, apartado '¿Por qué comprar?' sin asteriscos
    y párrafo de cierre antes de la firma (en coches.net ese cierre no va)."""
    cabecera, pie = _cabecera_y_pie(plantilla)
    if pz.cierre and pie:
        pie = pie[:-1] + [pz.cierre, "", pie[-1]]
    lineas = cabecera + ["", pz.titular, ""] + [f"- {v}" for v in VENTAJAS_FIJAS]
    if pz.parrafo:
        lineas += ["", pz.parrafo]
    return "\n".join(lineas + [""] + pie)


def equipamiento(pz: Piezas) -> str:
    """Campo ACF _equipamiento: «///// Datos técnicos:» (el tema lo pinta como «Lo técnico») con los ítems que su
    filtro deja pasar, y las secciones de «Lo que lleva» con //// (no el emoji) y viñetas sin asterisco."""
    lineas = [TITULO_TECNICOS, ""] + list(pz.tecnicos_web)
    for nombre, vs in pz.secciones:
        lineas += ["", f"{PREFIJO_WEB} {nombre}", ""] + list(vs)
    return "\n".join(lineas)


# --------------------------------------------------------------- generación
def elegir_fotos(fotos: list[Path], tope: int = MAX_FOTOS) -> list[Path]:
    """Hasta `tope` fotos repartidas por toda la galería, para que entren exteriores e interiores."""
    fotos = list(fotos)
    if len(fotos) <= tope:
        return fotos
    paso = len(fotos) / float(tope)
    return [fotos[min(len(fotos) - 1, int(i * paso))] for i in range(tope)]


def _fingerprint(fotos: list[Path]) -> list[dict]:
    return [{"nombre": p.name, "mtime": round(p.stat().st_mtime, 3)} for p in fotos]


def cache_path_descripcion(folder_name: str, cache_dir: Path = CACHE_DIR) -> Path:
    return Path(cache_dir) / f"{cache_key(folder_name)}.json"


def entrada_cache(datos: DatosCoche, fotos: list[Path]) -> dict:
    """Lo que identifica una generación: esquema, datos (fechas como texto, igual que en el JSON) y fotos."""
    return {"esquema": ESQUEMA_CACHE,
            "datos": json.loads(json.dumps(asdict(datos), ensure_ascii=False, default=str)),
            "fotos": _fingerprint(fotos)}


def prompt_para(datos: DatosCoche, nombres: list[str]) -> str:
    ficha = "\n".join(f"- {t}" for t in ([f"Coche: {datos.titulo}"] + datos.tecnicos()))
    identificacion = "\n".join(f"- {t}" for t in datos.identificacion()) or "- (sin datos)"
    return PROMPT.format(identificacion=identificacion, datos=ficha, n=len(nombres), archivos=", ".join(nombres),
                         min=MIN_VINETAS, max=MAX_VINETAS)


def _pedir(datos: DatosCoche, fotos: list[Path]) -> dict:
    """Una única llamada a Claude Code headless con las fotos como miniaturas ≤ LADO px y búsqueda web."""
    with tempfile.TemporaryDirectory(prefix="fichas-desc-") as tmp:
        workdir = Path(tmp)
        nombres = []
        for p in fotos:
            (workdir / p.name).write_bytes(caja_fotos.miniatura(p, LADO))
            nombres.append(p.name)
        envelope = extract_claude._invoke(extract_claude.claude_bin(), prompt_para(datos, nombres), workdir,
                                          extract_claude.claude_model(), TIMEOUT_S, MAX_TURNS, schema=SCHEMA,
                                          tools=HERRAMIENTAS)
    return extract_claude.result_from_envelope(envelope)


def generar(datos: DatosCoche, fotos: list[Path], folder_name: str, force: bool = False,
            cache_dir: Path | None = None, plantilla: Path | None = None) -> Descripcion:
    """Descripción completa del coche. Nunca levanta: si el generador falla, devuelve el error en `error`."""
    cache_dir, plantilla = Path(cache_dir or CACHE_DIR), Path(plantilla or PLANTILLA)
    elegidas = elegir_fotos(fotos)
    entrada = entrada_cache(datos, elegidas)
    path = cache_path_descripcion(folder_name, cache_dir)
    if not force and path.is_file():
        try:
            guardado = json.loads(path.read_text(encoding="utf-8"))
            if guardado.get("entrada") == entrada and guardado.get("partes"):
                texto, bloque = montar(datos, guardado["partes"], plantilla)
                return Descripcion(texto, bloque, f"caché {guardado.get('timestamp', '')}",
                                   piezas=despiezar(datos, guardado["partes"]))
        except (ValueError, OSError, AttributeError):
            pass
    if not elegidas:
        return Descripcion(fuente="fallo", error="el coche no tiene fotos: no se genera la descripción")
    t0 = time.monotonic()
    try:
        partes = _pedir(datos, elegidas)
    except ExtractionError as exc:
        return Descripcion(fuente="fallo", error=exc.user_message())
    except (ValueError, OSError) as exc:
        return Descripcion(fuente="fallo", error=f"respuesta inesperada del generador: {exc}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"carpeta": folder_name, "timestamp": datetime.now().isoformat(timespec="seconds"),
                                "duracion_s": round(time.monotonic() - t0, 1), "entrada": entrada,
                                "partes": partes}, ensure_ascii=False, indent=2), encoding="utf-8")
    texto, bloque = montar(datos, partes, plantilla)
    return Descripcion(texto, bloque, "ia", piezas=despiezar(datos, partes))
