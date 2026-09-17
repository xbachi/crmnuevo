#!/usr/bin/env python3
"""Automatización del panel profesional de coches.net con un navegador real.

Uso:
    cochesnet.py login          → abre el navegador para que inicies sesión a mano (una vez)
    cochesnet.py explorar       → recorre "Insertar coche" y guarda la estructura del formulario
    cochesnet.py grabar         → graba las llamadas internas de un alta hecha a mano
    cochesnet.py estado         → dice si la sesión guardada sigue viva
    cochesnet.py preparar <ref> → reúne datos, ficha técnica y fotos de un coche en una carpeta
                                  (antes normaliza fotos/ del coche: 1.jpg…N.jpg ≤ 400 KB; --sin-normalizar-fotos lo omite)

coches.net bloquea a los clientes que no son un navegador de verdad (curl y Chrome headless
devuelven 403), así que el alta la sigue haciendo una persona en el panel: `preparar` deja
todo a mano para que meter el coche sea un minuto.

La sesión queda en data/cochesnet-perfil/ (perfil persistente de Chrome).
No se guardan usuario ni contraseña en ningún archivo del proyecto.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import caja_fotos
import categorias as cat_mod
import descripcion_cochesnet as desc_mod
import docs as docs_mod
import extract
import fotos as fotos_mod
import identity as idm
import locate
import marcas
import report
import verificar
from combustible import gas_web
from common import fmt_value
from compare import CV_TOLERANCE, cv_in_modelo, kw_to_cv
from cuota import calcular_financiacion, formato_cuota, precio_financiado
from gauth import CredentialsMissing, credentials_help
from publicar import garantia_texto
from sheet import SheetError, open_sheet

PROJECT_DIR = Path(__file__).resolve().parent
PERFIL_DIR = PROJECT_DIR / "data" / "cochesnet-perfil"
SALIDA_DIR = PROJECT_DIR / "reports" / "cochesnet"
URL_BASE = "https://www.coches.net"
URL_PANEL = "https://pro.coches.net"


def _contexto(headless: bool):
    """Navegador con perfil persistente: la sesión sobrevive entre ejecuciones."""
    from playwright.sync_api import sync_playwright

    PERFIL_DIR.mkdir(parents=True, exist_ok=True)
    pw = sync_playwright().start()
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir=str(PERFIL_DIR),
        channel="chrome",
        headless=headless,
        viewport={"width": 1440, "height": 900},
        locale="es-ES",
        timezone_id="Europe/Madrid",
    )
    return pw, ctx


def cmd_login(args) -> int:
    pw, ctx = _contexto(headless=False)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(args.url, wait_until="domcontentloaded")
    print("Se abrió el navegador.")
    print("1) Iniciá sesión en coches.net con tu cuenta profesional.")
    print("2) Dejá la ventana en el panel de anuncios.")
    print("3) Volvé acá y pulsá Enter para guardar la sesión.")
    try:
        input()
    except (EOFError, KeyboardInterrupt):
        pass
    SALIDA_DIR.mkdir(parents=True, exist_ok=True)
    (SALIDA_DIR / "ultima-url.txt").write_text(page.url, encoding="utf-8")
    print(f"Sesión guardada en {PERFIL_DIR}")
    print(f"Última URL: {page.url}")
    ctx.close()
    pw.stop()
    return 0


def _volcar_formulario(page) -> dict:
    """Extrae los campos del formulario visible: nombre, tipo, etiqueta y opciones."""
    js = """
    () => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const etiqueta = (el) => {
        if (el.labels && el.labels.length) return el.labels[0].innerText.trim();
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
        if (el.placeholder) return el.placeholder;
        const p = el.closest('label');
        return p ? p.innerText.trim().slice(0, 80) : '';
      };
      const campos = [];
      document.querySelectorAll('input, select, textarea').forEach((el) => {
        if (el.type === 'hidden' || !vis(el)) return;
        const c = {
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          name: el.name || '',
          id: el.id || '',
          etiqueta: etiqueta(el),
          requerido: el.required || el.getAttribute('aria-required') === 'true',
        };
        if (el.tagName.toLowerCase() === 'select') {
          c.opciones = Array.from(el.options).slice(0, 40).map((o) => o.text.trim());
        }
        campos.push(c);
      });
      const botones = [];
      document.querySelectorAll('button, [role=button], input[type=submit]').forEach((el) => {
        if (!vis(el)) return;
        const t = (el.innerText || el.value || '').trim();
        if (t) botones.push(t.slice(0, 60));
      });
      return {
        url: location.href,
        titulo: document.title,
        campos,
        botones: [...new Set(botones)].slice(0, 40),
        texto: document.body.innerText.slice(0, 3000),
      };
    }
    """
    return page.evaluate(js)


def cmd_explorar(args) -> int:
    pw, ctx = _contexto(headless=args.headless)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    SALIDA_DIR.mkdir(parents=True, exist_ok=True)

    # Registrar las llamadas internas que hace el panel: sirven para saber
    # qué endpoints usa el formulario al guardar.
    llamadas: list[dict] = []

    def _req(req):
        if req.resource_type in ("xhr", "fetch"):
            llamadas.append({"metodo": req.method, "url": req.url[:300]})

    page.on("request", _req)

    page.goto(args.url, wait_until="domcontentloaded")
    page.wait_for_timeout(4000)

    if "login" in page.url.lower() or "signin" in page.url.lower():
        print("La sesión caducó: ejecutá primero `cochesnet.py login`.", file=sys.stderr)
        ctx.close()
        pw.stop()
        return 2

    datos = _volcar_formulario(page)
    datos["llamadas"] = llamadas[-60:]
    datos["momento"] = datetime.now().isoformat(timespec="seconds")

    destino = SALIDA_DIR / f"formulario-{datetime.now():%Y%m%d-%H%M%S}.json"
    destino.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    page.screenshot(path=str(SALIDA_DIR / "panel.png"), full_page=True)

    print(f"URL:    {datos['url']}")
    print(f"Título: {datos['titulo']}")
    print(f"Campos visibles: {len(datos['campos'])}")
    for c in datos["campos"][:40]:
        req = " (obligatorio)" if c["requerido"] else ""
        op = f" · opciones: {', '.join(c.get('opciones', [])[:6])}" if c.get("opciones") else ""
        print(f"  [{c['tag']}/{c['type']}] {c['etiqueta'][:45]:<45} name={c['name'][:28]}{req}{op}")
    print(f"Botones: {', '.join(datos['botones'][:12])}")
    print(f"\nGuardado: {destino}\nCaptura:  {SALIDA_DIR / 'panel.png'}")

    if not args.headless:
        print("\nDejo la ventana abierta. Navegá hasta el formulario de alta y pulsá Enter para volver a volcar.")
        try:
            input()
            datos2 = _volcar_formulario(page)
            datos2["llamadas"] = llamadas[-80:]
            d2 = SALIDA_DIR / f"formulario-{datetime.now():%Y%m%d-%H%M%S}.json"
            d2.write_text(json.dumps(datos2, ensure_ascii=False, indent=2), encoding="utf-8")
            page.screenshot(path=str(SALIDA_DIR / "panel-2.png"), full_page=True)
            print(f"Segundo volcado: {d2} ({len(datos2['campos'])} campos)")
        except (EOFError, KeyboardInterrupt):
            pass

    ctx.close()
    pw.stop()
    return 0


def cmd_grabar(args) -> int:
    """Graba todas las llamadas internas mientras das de alta un coche a mano.

    Con eso se reconstruye después el alta sin navegador.
    """
    from playwright.sync_api import sync_playwright

    SALIDA_DIR.mkdir(parents=True, exist_ok=True)
    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    har = SALIDA_DIR / f"alta-{sello}.har"
    resumen = SALIDA_DIR / f"alta-{sello}.jsonl"

    PERFIL_DIR.mkdir(parents=True, exist_ok=True)
    pw = sync_playwright().start()
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir=str(PERFIL_DIR),
        channel="chrome",
        headless=False,
        viewport={"width": 1440, "height": 900},
        locale="es-ES",
        timezone_id="Europe/Madrid",
        record_har_path=str(har),
        record_har_content="embed",
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()

    salida = resumen.open("w", encoding="utf-8")
    interesantes = ("xhr", "fetch")

    def _on_response(resp):
        req = resp.request
        if req.resource_type not in interesantes:
            return
        fila = {
            "metodo": req.method,
            "url": req.url,
            "estado": resp.status,
            "tipo": resp.headers.get("content-type", "")[:60],
        }
        try:
            cuerpo = req.post_data
            if cuerpo:
                fila["envio"] = cuerpo[:4000]
        except Exception:
            pass
        try:
            if "json" in fila["tipo"]:
                fila["respuesta"] = resp.text()[:1500]
        except Exception:
            pass
        salida.write(json.dumps(fila, ensure_ascii=False) + "\n")
        salida.flush()

    page.on("response", _on_response)
    page.goto(args.url, wait_until="domcontentloaded")

    print("GRABANDO. Hacé esto en la ventana que se abrió:")
    print("  1) Entrá a 'Insertar coche' y dá de alta UN coche completo, como siempre.")
    print("  2) Subí la ficha técnica y las fotos si las pedís normalmente.")
    print("  3) Guardá o publicá el anuncio.")
    print("  4) Volvé acá y pulsá Enter para cerrar la grabación.")
    try:
        input()
    except (EOFError, KeyboardInterrupt):
        pass
    salida.close()
    ctx.close()
    pw.stop()
    print(f"\nLlamadas registradas: {resumen}")
    print(f"Tráfico completo:     {har}")
    print("Con eso reconstruyo el alta sin navegador.")
    return 0


def cmd_estado(args) -> int:
    if not PERFIL_DIR.exists():
        print("No hay sesión guardada. Ejecutá `cochesnet.py login`.")
        return 1
    pw, ctx = _contexto(headless=True)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(args.url, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)
    dentro = "login" not in page.url.lower() and "signin" not in page.url.lower()
    print(f"URL actual: {page.url}")
    print("Sesión: activa" if dentro else "Sesión: caducada, hay que volver a entrar")
    ctx.close()
    pw.stop()
    return 0 if dentro else 1


# =========================================================== preparar
# coches.net rechaza a los clientes que no son un navegador de verdad (curl y Chrome
# headless devuelven 403 «algo en tu navegador nos hizo pensar que eres un bot»), así
# que el alta la hace una persona en el panel. Este comando deja todo listo para que
# meter el coche sea un minuto: datos en una lista, ficha técnica y fotos en su sitio.
CONCESIONARIO_PROVINCIA = "Valencia"
CONCESIONARIO_POBLACION = "Alaquàs"
CONCESIONARIO_DIRECCION = "Camí dels Mollons 36, Alaquàs, Valencia"
SIN_CONFIRMAR = "(SIN CONFIRMAR)"
FALTA = "(FALTA)"
# Orden en el que el panel de coches.net pide los datos.
CAMPOS_PANEL = ["Marca", "Modelo", "Versión", "Matrícula", "Bastidor", "Fecha de matriculación", "Matriculación",
                "Kilómetros", "Potencia (CV)", "Cilindrada (cc)", "Combustible", "Cambio", "Provincia", "Población",
                "Precio al contado", "Precio financiado", "Cuota", "Garantía", "Fotos"]
# Campos que el panel no deja vacíos -> (etiqueta del aviso, de dónde tiene que salir el dato).
OBLIGATORIOS = {"Marca": ("marca", "columna C, MODELO"),
                "Modelo": ("modelo", "columna C, MODELO"),
                "Versión": ("versión", "columna C, MODELO"),
                "Matriculación": ("matriculación", "columnas E / AB"),
                "Kilómetros": ("kilómetros", "columna X"),
                "Potencia (CV)": ("potencia CV", "columna Y"),
                "Combustible": ("combustible", "columna AF"),
                "Cambio": ("cambio", "columna AA"),
                "Precio al contado": ("precio al contado", "columna F")}
EXT_DOCUMENTO = {".jpeg": ".jpg"}
ORDEN_CARA = {"front": 0, None: 1, "back": 2}
EXIT_OK, EXIT_ERROR = 0, 1


def say(msg: str = "") -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print(report.paint("⚠ " + msg, "REVISAR"), flush=True)


@dataclass
class FotoPlan:
    path: Path
    nombre: str


@dataclass
class FichaCoche:
    """Todo lo que el panel pide de un coche, ya en el formato en el que se copia y pega."""
    referencia: str
    fila: int
    marca: str
    modelo: str
    version: str
    matricula: str
    bastidor: str
    fecha_matriculacion: str
    matriculacion: str
    kms: str
    cv: str
    cubicaje: str
    combustible: str
    caja: str
    precio_contado: str
    precio_financiado: str
    cuota: str
    garantia: str
    fotos: list[FotoPlan] = field(default_factory=list)
    documentos: list = field(default_factory=list)
    datos_desc: desc_mod.DatosCoche = field(default_factory=desc_mod.DatosCoche)
    descripcion: str = ""
    sin_confirmar: set = field(default_factory=set)
    faltantes: set = field(default_factory=set)
    permiso_dif: dict = field(default_factory=dict)      # campo -> valor del permiso cuando difiere
    avisos: list[str] = field(default_factory=list)
    para_verificar: list[str] = field(default_factory=list)

    def valores(self) -> dict[str, str]:
        return {
            "Marca": self.marca, "Modelo": self.modelo, "Versión": self.version, "Matrícula": self.matricula,
            "Bastidor": self.bastidor, "Fecha de matriculación": self.fecha_matriculacion,
            "Matriculación": self.matriculacion, "Kilómetros": self.kms, "Potencia (CV)": self.cv,
            "Cilindrada (cc)": self.cubicaje, "Combustible": self.combustible, "Cambio": self.caja,
            "Provincia": CONCESIONARIO_PROVINCIA, "Población": CONCESIONARIO_POBLACION,
            "Precio al contado": self.precio_contado, "Precio financiado": self.precio_financiado,
            "Cuota": self.cuota, "Garantía": self.garantia, "Fotos": str(len(self.fotos)),
        }

    def campos(self) -> list[tuple[str, str]]:
        valores = self.valores()
        return [(campo, self._marcado(campo, valores[campo])) for campo in CAMPOS_PANEL]

    def _marcado(self, campo: str, valor) -> str:
        """(FALTA) manda; si no, el valor con el del permiso al lado y la marca de sin confirmar."""
        if campo in self.faltantes:
            return FALTA
        valor = "" if valor is None else str(valor)
        otro = self.permiso_dif.get(campo)
        if otro:
            valor = f"{valor} (permiso: {otro})"
        return f"{valor} {SIN_CONFIRMAR}".strip() if campo in self.sin_confirmar else valor

    def texto_datos(self) -> str:
        return "".join(f"{campo}: {valor}".rstrip() + "\n" for campo, valor in self.campos())


def _marcar_faltantes(ficha: FichaCoche) -> None:
    """Campos que el panel exige y salieron vacíos: van como (FALTA). Solo se avisa si no hay ya una
    línea específica que explique por qué faltan (caja sin fuente, potencia de híbrido...)."""
    valores = ficha.valores()
    for campo, (etiqueta, fuente) in OBLIGATORIOS.items():
        if valores[campo]:
            continue
        ficha.faltantes.add(campo)
        if campo not in ficha.sin_confirmar:
            ficha.para_verificar.append(f"{etiqueta}: falta en la hoja ({fuente}), completala antes de publicar")


def _euros(valor) -> str:
    return f"{marcas.km_web(valor)} €" if valor else ""


def _combustible_permiso(ai_result: dict | None) -> str | None:
    """P.3 del permiso; si no, el de la ficha técnica."""
    for key in ("permiso_circulacion", "ficha_tecnica"):
        doc = (ai_result or {}).get(key) or {}
        if doc.get("presente", True) and doc.get("combustible"):
            return doc.get("combustible")
    return None


def construir_ficha(row, folder, permiso, ai_result: dict | None, force: bool = False,
                    sin_fotos_caja: bool = False) -> FichaCoche:
    """Los datos del panel a partir de la hoja, el permiso leído y la carpeta del coche."""
    avisos: list[str] = []
    verificar_items: list[str] = []
    dudosos: set = set()
    m = marcas.split_modelo(row.modelo)
    avisos += m.avisos

    # combustible: la hoja (ya verificada) manda; si no, el permiso; si no, el texto de MODELO
    combustible = marcas.normalizar_combustible(row.combustible)
    if combustible:
        combustible_conf = combustible
    else:
        combustible, aviso = marcas.combustible_web(_combustible_permiso(ai_result), row.modelo)
        combustible_conf = None if aviso else combustible
        if aviso:
            dudosos.add("Combustible")
            verificar_items.append(f"combustible: {combustible} sin confirmar ({aviso})")

    # caja: AA de la hoja; si está vacía se deduce del MODELO o de las fotos
    fotos_dir = fotos_mod.carpeta_fotos(folder.path)
    archivos = fotos_mod.listar_fotos(fotos_dir) if fotos_dir else []
    caja = marcas.normalize_caja(row.caja)
    if not caja:
        veredicto = caja_fotos.detectar_caja(row.modelo, combustible_conf, archivos, folder.name,
                                             force=force, sin_fotos=sin_fotos_caja)
        caja = veredicto.caja if veredicto.decidido else ""
        if not veredicto.escribible:
            dudosos.add("Cambio")
            verificar_items.append(veredicto.para_verificar() or "caja: sin confirmar (mirar el coche)")

    permiso_doc = (ai_result or {}).get("permiso_circulacion") or {}
    ficha_doc = (ai_result or {}).get("ficha_tecnica") or {}
    permiso_dif: dict[str, str] = {}

    def _dif(campo, etiqueta, hoja, doc, tolerancia=0):
        """La hoja manda, pero si el permiso dice otra cosa se enseña al lado y se avisa."""
        if hoja in (None, "") or doc in (None, "") or hoja == doc:
            return
        if isinstance(hoja, (int, float)) and isinstance(doc, (int, float)) and abs(hoja - doc) <= tolerancia:
            return
        permiso_dif[campo] = fmt_value(doc)
        verificar_items.append(f"{etiqueta}: la hoja dice {fmt_value(hoja)} y el permiso {fmt_value(doc)}; "
                               "se publica el de la hoja")

    # potencia: en híbridos el permiso solo da el motor térmico, nunca la potencia del sistema
    kw = permiso_doc.get("potencia_kw") or ficha_doc.get("potencia_kw")
    termico = kw_to_cv(kw) if kw else None
    if combustible == marcas.HIBRIDO:
        cv = int(round(row.motor_cv)) if row.motor_cv else cv_in_modelo(row.modelo)
        termico_txt = f"el permiso solo da el motor térmico, {termico} CV" if termico else "sin potencia térmica legible"
        dudosos.add("Potencia (CV)")
        fuente = "la hoja" if row.motor_cv else "el texto de MODELO"
        verificar_items.append(f"potencia: híbrido, {cv or '?'} CV según {fuente} ({termico_txt}); "
                               "confirmar la potencia total del sistema")
    elif row.motor_cv:
        cv = int(round(row.motor_cv))
        # el permiso da kW: se redondea a CV, así que diferencias de un par de CV no son discrepancia
        _dif("Potencia (CV)", "potencia CV", cv, termico, tolerancia=CV_TOLERANCE)
    else:
        cv = termico

    cc_doc = permiso_doc.get("cilindrada_cc") or ficha_doc.get("cilindrada_cc")
    if row.cubicaje:
        cubicaje = int(row.cubicaje)
        _dif("Cilindrada (cc)", "cilindrada", cubicaje, cc_doc)
    else:
        cubicaje = cc_doc
    if not cubicaje:
        dudosos.add("Cilindrada (cc)")
        verificar_items.append("cilindrada: desconocida (columna Z vacía y sin P.1 en el permiso)")

    fecha = row.fecha_matriculacion or (permiso.date if permiso else None)
    _dif("Fecha de matriculación", "fecha de matriculación", row.fecha_matriculacion,
         permiso.date if permiso else None)
    matriculacion, _ = marcas.matriculacion_web(fecha, row.matriculacion, row.matriculacion_num)
    matricula = row.matricula or (permiso.plate if permiso else "") or ""
    bastidor = row.bastidor or (permiso.vin if permiso else "") or ""
    _dif("Bastidor", "bastidor", row.bastidor, permiso.vin if permiso else None)
    if not bastidor:
        dudosos.add("Bastidor")
        verificar_items.append("bastidor: no está en la hoja (AE) ni se leyó en el permiso")

    precio_fin, nota_precio = precio_financiado(row)
    if nota_precio:
        avisos.append(nota_precio)
    fin = calcular_financiacion(row.precio_contado, fecha, row.tarifa_financiacion)
    cuota = formato_cuota(fin.cuota)
    if fin.nota and row.precio_contado:
        verificar_items.append(f"cuota: {fin.nota}")

    _, aviso_cat = cat_mod.categorias_para(m.modelo)
    if aviso_cat:
        verificar_items.append(f"categoría: {aviso_cat}")

    plan = [FotoPlan(p, fotos_mod.nombre_seo(m.marca, m.modelo, matricula, i)) for i, p in enumerate(archivos, start=1)]
    if not plan:
        avisos.append("sin fotos editadas en la carpeta (fotos/)")
    elif plan[0].path.stem.lower() != "1":
        verificar_items.append(f"foto de portada dudosa: la primera foto es '{plan[0].path.name}', no '1.jpg'")

    documentos = [d for d in docs_mod.find_documents(folder.path) if d.kind in (docs_mod.KIND_FICHA, docs_mod.KIND_PERMISO)]
    if not any(d.kind == docs_mod.KIND_FICHA for d in documentos):
        avisos.append("no hay ficha técnica en la carpeta: el panel pide el escaneo")

    # gas (bifuel GLP/GNC/GNL): solo para la descripción y la etiqueta; el campo Combustible no cambia
    p3 = _combustible_permiso(ai_result) or ""
    gas, aviso_gas = (None, None) if combustible in (marcas.DIESEL, marcas.HIBRIDO, marcas.ELECTRICO) \
        else gas_web(" ".join(x for x in (p3, row.combustible) if x), row.modelo)
    if aviso_gas:
        verificar_items.append(aviso_gas)
    doc_desc = desc_mod.datos_documentos(ai_result)
    doc_desc.update(p3=p3, bastidor=bastidor)
    datos_desc = desc_mod.DatosCoche(
        marca=m.marca, modelo=m.modelo, version=m.version, combustible=combustible or "",
        cilindrada=cubicaje or None, cv=cv, caja=caja or "", anio=fecha.year if fecha else None,
        fecha=fecha, gas=gas or "", importado=desc_mod.es_importado(folder.name, folder.group, row.modelo), **doc_desc)

    ficha = FichaCoche(
        referencia=row.referencia, fila=row.row_number, marca=m.marca, modelo=m.modelo, version=m.version,
        matricula=matricula, bastidor=bastidor, fecha_matriculacion=fmt_value(fecha), matriculacion=matriculacion,
        kms=marcas.km_web(row.kms), cv=fmt_value(cv), cubicaje=fmt_value(cubicaje), combustible=combustible or "",
        caja=caja or "", precio_contado=_euros(row.precio_contado),
        precio_financiado=_euros(precio_fin), cuota=f"{cuota} ({fin.descripcion()})" if cuota else "",
        garantia=garantia_texto(row), fotos=plan, documentos=documentos, datos_desc=datos_desc, sin_confirmar=dudosos,
        permiso_dif=permiso_dif, avisos=avisos, para_verificar=verificar_items)
    _marcar_faltantes(ficha)
    return ficha


def nombres_documentos(documentos: list) -> list[tuple[str, Path]]:
    """[(ficha-tecnica-cara-1.jpg, ruta), (permiso-circulacion-cara-1.jpg, ruta), ...] en orden cara 1 → cara 2."""
    orden = {docs_mod.KIND_FICHA: 0, docs_mod.KIND_PERMISO: 1}
    ordenados = sorted(documentos, key=lambda d: (orden.get(d.kind, 9),
                                                  ORDEN_CARA.get(docs_mod.document_side(d.name), 1), d.name.lower()))
    salida: list[tuple[str, Path]] = []
    contador: dict[str, int] = {}
    for d in ordenados:
        base = "ficha-tecnica" if d.kind == docs_mod.KIND_FICHA else "permiso-circulacion"
        contador[base] = contador.get(base, 0) + 1
        ext = d.path.suffix.lower()
        salida.append((f"{base}-cara-{contador[base]}{EXT_DOCUMENTO.get(ext, ext)}", d.path))
    return salida


def escribir_carpeta(ficha: FichaCoche, destino: Path) -> Path:
    """datos.txt + ficha-tecnica/ + fotos/ (+ descripcion.txt y PARA-VERIFICAR.txt). Rehace las subcarpetas."""
    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "datos.txt").write_text(ficha.texto_datos(), encoding="utf-8")

    docs_dir, fotos_dir = destino / "ficha-tecnica", destino / "fotos"
    for carpeta in (docs_dir, fotos_dir):
        shutil.rmtree(carpeta, ignore_errors=True)
        carpeta.mkdir(parents=True)
    for nombre, origen in nombres_documentos(ficha.documentos):
        shutil.copyfile(origen, docs_dir / nombre)
    for foto in ficha.fotos:
        (fotos_dir / foto.nombre).write_bytes(fotos_mod.preparar_jpeg(foto.path))

    texto_desc = destino / "descripcion.txt"
    if ficha.descripcion:
        texto_desc.write_text(ficha.descripcion, encoding="utf-8")
    elif texto_desc.exists():
        texto_desc.unlink()

    aviso = destino / "PARA-VERIFICAR.txt"
    if ficha.para_verificar:
        cuerpo = f"Comprobar antes de publicar {ficha.referencia} · {ficha.matricula}:\n\n"
        cuerpo += "".join(f"- {item}\n" for item in ficha.para_verificar)
        aviso.write_text(cuerpo, encoding="utf-8")
    elif aviso.exists():
        aviso.unlink()
    return destino


def abrir_en_explorador(destino: Path) -> None:
    """Abre la carpeta en el explorador de Windows; si falla, no pasa nada."""
    try:
        ruta = subprocess.run(["wslpath", "-w", str(destino)], capture_output=True, text=True,
                              timeout=10).stdout.strip()
        subprocess.run(["explorer.exe", ruta or str(destino)], timeout=10)
    except (OSError, subprocess.SubprocessError):
        pass


def imprimir_ficha(ficha: FichaCoche, destino: Path) -> None:
    say()
    say(report.paint("== Datos para el panel de coches.net", "bold"))
    for campo, valor in ficha.campos():
        say(f"  {campo}: {valor}".rstrip())
    say()
    say(f"Ficha técnica: {len(ficha.documentos)} archivo(s) → {destino / 'ficha-tecnica'}")
    say(f"Fotos:         {len(ficha.fotos)} → {destino / 'fotos'}")
    if ficha.descripcion:
        say(f"Descripción:   {len(ficha.descripcion.split())} palabras → {destino / 'descripcion.txt'}")
    for a in ficha.avisos:
        warn(a)
    report.print_para_verificar(ficha.para_verificar)
    say()
    say(report.paint(f"Carpeta lista: {destino}", "OK"))
    say(f"Dirección del concesionario: {CONCESIONARIO_DIRECCION}")


def _estado_lectura(args, sheet_src, data, folders):
    """RunState mínimo para verificar.read_documents: lectura liviana del permiso, sin escribir nada."""
    ns = argparse.Namespace(sin_ia=False, forzar=args.forzar, debug=False, escribir=False,
                            sin_fotos_caja=args.sin_fotos_caja)
    return verificar.RunState(args=ns, sheet_src=sheet_src, data=data, ventas=None, model=extract.default_model(),
                              motor=extract.default_motor(), scope=extract.SCOPE_LEAN, folders=folders)


def normalizar_fotos(args, folder: locate.CarFolder) -> None:
    """Como publicar.py: fotos/ queda 1.jpg…N.jpg ≤ 400 KB (originales en fotos/originales/) antes de copiarlas.
    --sin-normalizar-fotos lo omite; sin subcarpeta fotos/ solo avisa."""
    fotos_dir = fotos_mod.carpeta_fotos(folder.path)
    if fotos_dir is None:
        warn(f"En {folder.path.name} {fotos_mod.AVISO_SIN_CARPETA}.")
        return
    if getattr(args, "sin_normalizar_fotos", False):
        return
    say(fotos_mod.resumen_normalizacion(fotos_mod.normalizar_carpeta(fotos_dir, ejecutar=True)))


def preparar(args, sheet_src, data, folders) -> int:
    """Reúne datos y archivos del coche en una carpeta. Nunca escribe en la hoja."""
    ref = locate.canonical_ref(args.referencia)
    dup_refs, _ = data.duplicates()
    if ref in dup_refs and not args.fila:
        warn(f"La referencia {ref} está repetida en la hoja (filas {', '.join(map(str, dup_refs[ref]))}): usá --fila N.")
        return EXIT_ERROR
    row = data.row_by_number(args.fila[0]) if args.fila else data.find_by_ref(ref)
    if row is None:
        warn(f"'{args.referencia}' no está en la hoja Base_Datos ({data.source_label}).")
        return EXIT_ERROR
    say(f"Hoja: fila {row.row_number} · ref {row.referencia} · {row.modelo} · {row.matricula or '-'} · "
        f"{fmt_value(row.kms)} km · {fmt_value(row.precio_contado)} €")
    loc = locate.locate(folders, ref=row.referencia, plate=row.matricula)
    say(f"Carpeta: {loc.describe()}")
    documentos = docs_mod.find_documents(loc.folder.path) if loc.found else []
    state = _estado_lectura(args, sheet_src, data, folders)
    ai_result, ai_status, _ = verificar.read_documents(state, loc, row.matricula, documentos)
    idc = idm.check_identity(row.matricula, loc, ai_result,
                             has_docs=any(d.kind != docs_mod.KIND_EXPO for d in documentos))
    say("Identidad: " + report.paint(idc.estado, idc.estado) + f" — {idc.nota} (lectura: {ai_status})")
    if not idc.confirmed:
        warn("Identidad no confirmada: no se prepara nada.")
        return EXIT_ERROR
    normalizar_fotos(args, loc.folder)

    ficha = construir_ficha(row, loc.folder, idc.permiso, ai_result, force=args.forzar,
                            sin_fotos_caja=args.sin_fotos_caja)
    if not ficha.matricula:
        warn("Sin matrícula (ni en la hoja ni en el permiso): no se prepara nada.")
        return EXIT_ERROR
    if not args.sin_descripcion:
        d = desc_mod.generar(ficha.datos_desc, [f.path for f in ficha.fotos], loc.folder.name, force=args.forzar)
        if d.ok:
            ficha.descripcion = d.texto
            ficha.para_verificar.append(desc_mod.AVISO_VERIFICAR)
            ficha.para_verificar += d.piezas.para_verificar if d.piezas else []
            say(f"Descripción: {d.fuente}")
        else:
            warn(f"Descripción: no se pudo generar ({d.error}). El resto de la carpeta se prepara igual.")
    base = Path(args.salida) if args.salida else SALIDA_DIR
    destino = escribir_carpeta(ficha, base / f"{ficha.referencia}-{ficha.matricula}")
    imprimir_ficha(ficha, destino)
    if args.abrir:
        abrir_en_explorador(destino)
    return EXIT_OK


def cmd_preparar(args) -> int:
    extract.load_env()
    try:
        sheet_src = open_sheet(args.sheet)
        data = sheet_src.load()
        say(f"Hoja Base_Datos: {sheet_src.label} — {len(data.rows)} filas con referencia")
        folders = locate.scan_folders(args.ventas_dir)
    except CredentialsMissing as exc:
        say(credentials_help(exc))
        return 3
    except (SheetError, FileNotFoundError) as exc:
        say(f"Error: {exc}")
        return EXIT_ERROR
    return preparar(args, sheet_src, data, folders)



def main() -> int:
    p = argparse.ArgumentParser(description="Panel profesional de coches.net")
    sub = p.add_subparsers(dest="cmd", required=True)

    pl = sub.add_parser("login", help="abrir el navegador para iniciar sesión")
    pl.add_argument("--url", default=URL_BASE)
    pl.set_defaults(func=cmd_login)

    pe = sub.add_parser("explorar", help="volcar la estructura del formulario")
    pe.add_argument("--url", default=URL_PANEL)
    pe.add_argument("--headless", action="store_true")
    pe.set_defaults(func=cmd_explorar)

    pg = sub.add_parser("grabar", help="grabar las llamadas internas de un alta hecha a mano")
    pg.add_argument("--url", default=URL_PANEL)
    pg.set_defaults(func=cmd_grabar)

    ps = sub.add_parser("estado", help="comprobar si la sesión sigue viva")
    ps.add_argument("--url", default=URL_PANEL)
    ps.set_defaults(func=cmd_estado)

    pp = sub.add_parser("preparar", help="reunir datos, ficha técnica y fotos de un coche para el alta manual")
    pp.add_argument("referencia", help="referencia de la hoja (1082, 26, D29...)")
    pp.add_argument("--salida", help=f"carpeta donde crear <referencia>-<matrícula> (por defecto {SALIDA_DIR})")
    pp.add_argument("--abrir", action="store_true", help="abrir la carpeta en el explorador de Windows")
    pp.add_argument("--forzar", action="store_true",
                    help="ignorar la caché de lecturas (permiso, caja por fotos) y rehacer la descripción")
    pp.add_argument("--sin-fotos-caja", action="store_true", help="no detectar la caja por las fotos")
    pp.add_argument("--sin-descripcion", action="store_true", help="no generar la descripción del anuncio")
    pp.add_argument("--sin-normalizar-fotos", action="store_true",
                    help="no renombrar ni recomprimir la carpeta fotos/ del coche antes de copiarla")
    pp.add_argument("--fila", action="append", type=int, default=[], help=argparse.SUPPRESS)
    pp.add_argument("--sheet", metavar="XLSX", help=argparse.SUPPRESS)
    pp.add_argument("--ventas-dir", default=str(locate.DEFAULT_VENTAS_DIR), help=argparse.SUPPRESS)
    pp.set_defaults(func=cmd_preparar)

    args = p.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
