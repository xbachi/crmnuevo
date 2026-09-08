"""Descripción de coches.net: cabecera y pie fijos (plantillas/cochesnet-descripcion.txt) + un bloque por coche.

Los "Datos técnicos" se arman en Python con lo ya verificado (el modelo NO los inventa: sin dato, sin viñeta);
el equipamiento lo dicta Claude Code headless mirando LAS FOTOS del coche, con el mismo motor que caja_fotos.py
(suscripción, sin coste por llamada). Caché por carpeta en data/descripciones/<carpeta>.json.
"""
from __future__ import annotations

import json
import re
import tempfile
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

import caja_fotos
import extract_claude
from combustible import DIESEL, ELECTRICO, GASOLINA, HIBRIDO
from common import PROJECT_DIR, norm_text
from extract import ExtractionError, cache_key
from marcas import km_web

PLANTILLA = PROJECT_DIR / "plantillas" / "cochesnet-descripcion.txt"
CACHE_DIR = PROJECT_DIR / "data" / "descripciones"
MARCADOR = "{BLOQUE_VEHICULO}"
SEPARADOR = "⸻"                      # U+2E3B, el que usa el usuario en su formato
MAX_FOTOS = 10
LADO = 1024
MAX_TURNS = 6
TIMEOUT_S = 300
MIN_VINETAS, MAX_VINETAS = 6, 10
AVISO_VERIFICAR = "descripción: generada automáticamente, repasá el equipamiento antes de publicar"

VENTAJAS_FIJAS = ("Financiación sin entrada disponible", "Kilómetros certificados",
                  "Aceptamos tu coche como parte de pago")
APARTADOS = (("tecnologia", "Tecnología / Multimedia"), ("confort", "Confort / Interior"),
             ("exterior", "Exterior"), ("seguridad", "Seguridad / Asistencia"))
PREFIJO_COCHESNET = "🎯"          # cabeceras de sección en el anuncio de coches.net
PREFIJO_WEB = "////"             # las mismas secciones en el campo _equipamiento de sevencars.es
TITULO_TECNICOS = "///// Datos técnicos:"

# Tracción: solo si el distintivo está escrito en la versión; nunca se deduce.
TRACCIONES = (("4x4", "4x4"), ("4xe", "4xe"), ("quattro", "quattro"), ("4motion", "4Motion"),
              ("xdrive", "xDrive"), ("awd", "AWD"), ("4matic", "4MATIC"))
CERO, ECO, C = "CERO", "ECO", "C"
ANIO_GASOLINA_C, ANIO_DIESEL_C = 2006, 2015
_ENCHUFABLE = re.compile(r"enchufable|\bphev\b|\bplug[\s-]?in\b|\b4xe\b|\brecharge\b|\be-hybrid\b")

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
    ("conectividad", r"bluetooth|\busb\b|conectividad|carplay|android auto"),
    ("pantalla", r"pantalla tactil|multimedia|uconnect"),
    ("cuadro", r"cuadro de instrumentos|instrumentos digital"),
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

SCHEMA = {
    "type": "object",
    "properties": dict({"reclamo": {"type": "string"}, "parrafo": {"type": "string"}, "cierre": {"type": "string"}},
                       **{clave: {"type": "array", "items": {"type": "string"}} for clave, _ in APARTADOS}),
    "required": ["reclamo", "parrafo", "cierre"] + [clave for clave, _ in APARTADOS],
    "additionalProperties": False,
}

PROMPT = """Sos quien redacta los anuncios de un concesionario español. Escribí el texto comercial de este coche
usado para publicarlo en coches.net.

Datos verificados (son los únicos ciertos; van aparte en el anuncio, no los repitas como lista):
{datos}

Fotos reales del coche ({n}): {archivos}
Leé TODAS las imágenes con la herramienta Read, una por una, antes de responder. No uses otras herramientas ni
delegues en agentes.

Qué tenés que devolver:
- "reclamo": un reclamo de 3 a 6 palabras para el titular, SIN la marca ni el modelo (ya van delante) y sin
  precios ni teléfonos. Tono del estilo: "SUV híbrido enchufable con tracción total".
- "parrafo": un párrafo de 3 a 5 líneas sobre ESTE coche: qué tipo de coche es, a quién le encaja y qué se ve en
  las fotos. Español de España, comercial y natural, sin exagerar.
- "cierre": UNA frase de cierre sobre este coche, que resuma sus puntos fuertes, distinta del párrafo anterior
  y sin repetir sus palabras.
- "tecnologia", "confort", "exterior" y "seguridad": entre {min} y {max} viñetas cada uno, de 3 a 8 palabras, en
  español de España, sin punto final.

REGLA INNEGOCIABLE sobre el equipamiento: solo podés listar equipamiento que SE VEA en las fotos o que sea de
serie inequívoco en esta versión concreta. Está prohibido inventar extras: si dudás, no lo pongas, es preferible
un apartado corto. Nada de precios, financiación, garantía, kilómetros ni datos de contacto: eso ya va en el
resto del anuncio.

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


# --------------------------------------------------------------- datos duros
@dataclass
class DatosCoche:
    """Lo verificado del coche. De acá salen los 'Datos técnicos', sin que el modelo toque nada."""
    marca: str = ""
    modelo: str = ""
    version: str = ""
    combustible: str = ""
    cilindrada: int | None = None
    cv: int | None = None
    caja: str = ""
    plazas: int | None = None
    anio: int | None = None
    p3: str = ""                      # combustible tal cual lo escribe el permiso (para saber si es enchufable)

    @property
    def titulo(self) -> str:
        return " ".join(p for p in (self.marca, self.modelo, self.version) if p).upper()

    @property
    def enchufable(self) -> bool:
        return bool(_ENCHUFABLE.search(norm_text(f"{self.version} {self.modelo} {self.p3}")))

    @property
    def traccion(self) -> str | None:
        """Solo si el distintivo aparece en la versión (4x4, 4xe, quattro, 4Motion, xDrive, AWD, 4MATIC)."""
        texto = norm_text(self.version)
        for token, etiqueta in TRACCIONES:
            if re.search(rf"(?<![a-z0-9]){token}(?![a-z])", texto):
                return etiqueta
        return None

    @property
    def etiqueta(self) -> str | None:
        """Etiqueta DGT solo cuando se deduce con certeza; si no, no se pone viñeta."""
        if self.combustible == ELECTRICO or (self.combustible == HIBRIDO and self.enchufable):
            return CERO
        if self.combustible == HIBRIDO:
            return ECO
        if self.anio and self.combustible == GASOLINA and self.anio >= ANIO_GASOLINA_C:
            return C
        if self.anio and self.combustible == DIESEL and self.anio >= ANIO_DIESEL_C:
            return C
        return None

    @property
    def etiqueta_potencia(self) -> str:
        """En híbridos y eléctricos la CV de la hoja es la potencia TOTAL del sistema: se dice así."""
        return "Potencia combinada" if self.combustible in (HIBRIDO, ELECTRICO) else "Potencia"

    def tecnicos(self) -> list[str]:
        """Viñetas de 'Datos técnicos': sin dato, sin viñeta. Nunca se rellena a ojo."""
        filas = [("Versión", self.version),
                 ("Combustible", self.combustible),
                 ("Cilindrada", f"{km_web(self.cilindrada)} cc" if self.cilindrada else ""),
                 (self.etiqueta_potencia, f"{self.cv} CV" if self.cv else ""),
                 ("Cambio", self.caja),
                 ("Tracción", f"total ({self.traccion})" if self.traccion else ""),
                 ("Plazas", str(self.plazas) if self.plazas else ""),
                 ("Etiqueta medioambiental", self.etiqueta or "")]
        return [f"{campo}: {valor}" for campo, valor in filas if valor]


@dataclass
class Piezas:
    """El texto generado en piezas, para que cada destino (coches.net, la web) lo componga a su manera."""
    titulo: str = ""
    reclamo: str = ""
    parrafo: str = ""
    cierre: str = ""
    tecnicos: list[str] = field(default_factory=list)
    secciones: list[tuple[str, list[str]]] = field(default_factory=list)

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
def _una_linea(texto) -> str:
    return re.sub(r"\s+", " ", str(texto or "")).strip()


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
    la viñeta se queda en el primero donde aparece (mejor corto que repetido)."""
    vistas = vistas if vistas is not None else set()
    salida: list[str] = []
    for item in items or []:
        valor = _una_linea(item).lstrip("*-• ").rstrip(".")
        if es_relleno(valor):
            continue
        clave = concepto(valor)
        if valor and clave not in vistas:
            vistas.add(clave)
            salida.append(valor)
    return salida[:MAX_VINETAS]


def despiezar(datos: DatosCoche, partes: dict) -> Piezas:
    """Lo que devolvió el modelo, ya limpio y deduplicado, junto a los datos técnicos que arma Python."""
    tecnicos = datos.tecnicos()
    vistas = {concepto(t) for t in tecnicos}          # lo técnico manda: el equipamiento no lo repite
    secciones = [(nombre, _vinetas(partes.get(clave), vistas)) for clave, nombre in APARTADOS]
    return Piezas(titulo=datos.titulo, reclamo=_una_linea(partes.get("reclamo")).upper(),
                  parrafo=_una_linea(partes.get("parrafo")), cierre=_una_linea(partes.get("cierre")),
                  tecnicos=tecnicos, secciones=[(n, vs) for n, vs in secciones if vs])


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
    """Campo ACF _equipamiento: la parte técnica. Secciones con //// (no el emoji) y viñetas sin asterisco."""
    lineas = [TITULO_TECNICOS, ""] + list(pz.tecnicos)
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


def _pedir(datos: DatosCoche, fotos: list[Path]) -> dict:
    """Una única llamada a Claude Code headless con las fotos como miniaturas ≤ LADO px."""
    with tempfile.TemporaryDirectory(prefix="fichas-desc-") as tmp:
        workdir = Path(tmp)
        nombres = []
        for p in fotos:
            (workdir / p.name).write_bytes(caja_fotos.miniatura(p, LADO))
            nombres.append(p.name)
        ficha = "\n".join(f"- {t}" for t in ([f"Coche: {datos.titulo}"] + datos.tecnicos()))
        prompt = PROMPT.format(datos=ficha, n=len(nombres), archivos=", ".join(nombres),
                               min=MIN_VINETAS, max=MAX_VINETAS)
        envelope = extract_claude._invoke(extract_claude.claude_bin(), prompt, workdir,
                                          extract_claude.claude_model(), TIMEOUT_S, MAX_TURNS, schema=SCHEMA)
    return extract_claude.result_from_envelope(envelope)


def generar(datos: DatosCoche, fotos: list[Path], folder_name: str, force: bool = False,
            cache_dir: Path | None = None, plantilla: Path | None = None) -> Descripcion:
    """Descripción completa del coche. Nunca levanta: si el generador falla, devuelve el error en `error`."""
    cache_dir, plantilla = Path(cache_dir or CACHE_DIR), Path(plantilla or PLANTILLA)
    elegidas = elegir_fotos(fotos)
    entrada = {"datos": asdict(datos), "fotos": _fingerprint(elegidas)}
    path = cache_path_descripcion(folder_name, cache_dir)
    if not force and path.is_file():
        try:
            guardado = json.loads(path.read_text(encoding="utf-8"))
            if guardado.get("entrada") == entrada and guardado.get("partes"):
                texto, bloque = montar(datos, guardado["partes"], plantilla)
                return Descripcion(texto, bloque, f"caché {guardado.get('timestamp', '')}",
                                   piezas=despiezar(datos, guardado["partes"]))
        except (ValueError, OSError):
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
