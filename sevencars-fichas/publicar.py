#!/usr/bin/env python
"""Crea el borrador de un coche en sevencars.es (WooCommerce) a partir de la hoja, la carpeta y el permiso.

Uso: publicar.py <ref> [--simular] [--categoria x,y] [--publicar-directo] [--forzar] [--sin-hoja] [--sin-fotos-caja] [--sin-luna]
     publicar.py <ref> --simular --forzar-descripcion   → rehace solo la descripción con la IA y la muestra entera
     publicar.py <ref> --actualizar [--simular] [--si]   → completa un anuncio ya publicado (nunca resube fotos)
     publicar.py <ref> --actualizar --solo-financiacion  → solo precio, precio financiado, cuota, tipo de vehículo y
                                                            fecha de matriculación, desde la hoja (sin leer documentos)
     publicar.py <ref> --solo-fotos                      → solo deja fotos/ como 1.jpg…N.jpg ≤ 400 KB (ni web ni hoja)
     publicar.py <ref> --solo-ficha [--simular]          → vuelve a descargar la ficha de exposición (PDF de la web)
                                                            a <coche>/ficha-expo.pdf (sin leer documentos ni IA)

Antes de listar las fotos, la carpeta fotos/ del coche se normaliza (descargas de ChatGPT en PNG/WEBP incluidas):
1.jpg…N.jpg, JPEG ≤ 400 KB; los originales quedan en fotos/originales/. `--sin-normalizar-fotos` lo omite.
Al crear el producto (y en --actualizar --solo-financiacion) genera las imágenes de la luna en <coche>/precios/
(luna.py: precio en miles y cientos, y cuota). `--sin-luna` lo evita.
Al crear el producto descarga también la ficha de exposición que genera la web (GET /?pdf=<id>) a
<coche>/ficha-expo.pdf; si falla, avisa en PARA VERIFICAR y la publicación sigue. `--sin-ficha` lo evita.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import caja_fotos
import categorias as cat_mod
import combustible as combustible_mod
import descripcion_cochesnet as desc_mod
import extract
import fotos as fotos_mod
import identity as idm
import locate
import luna as luna_mod
import marcas
import report
import verificar
from common import PROJECT_DIR, fmt_value, norm_text, normalize_plate
from compare import cv_in_modelo, kw_to_cv
from cuota import (Financiacion, calcular_financiacion, formato_cuota, precio_financiado, precio_financiado_web,
                   tipo_vehiculo_web)
from descripcion import render_plantilla
from docs import KIND_EXPO, find_documents
from gauth import CredentialsMissing, credentials_help
from sheet import CellWrite, SheetError, VehicleRow, open_sheet
from wc_client import (VALORES_FIJOS, WcClient, WcError, coincide_matricula, construir_meta, construir_payload,
                       meta_actual)

REGISTRO = PROJECT_DIR / "data" / "publicados.json"
EXTRACTO_LINEAS = 4
EXIT_OK, EXIT_ERROR = 0, 1
# Metas que el tema de la web usa para la financiación y la edad del coche: lo único que toca --solo-financiacion.
METAS_FINANCIACION = ("_precio", "_precio_financiado", "_cuota", "_tipo_vehiculo", "_fecha_matriculacion")
# Metas simples (no ACF) que lee la ficha de exposición en PDF del tema. Al crear van si tienen valor; en
# --actualizar solo se rellenan si en la web están vacíos (el usuario los retoca a mano en el borrador).
METAS_FICHA = ("_etiqueta_dgt", "_motor_comercial", "_gas", "_destacados_ficha")
FICHA_EXPO = "ficha-expo.pdf"
RECORDATORIO_PRECIO_FINANCIADO = ("Recordá: la web recalcula _precio_financiado ella sola en el próximo guardado desde "
                                  "wp-admin, a partir de _precio, _dto_renove y _tipo_vehiculo.")


def say(msg: str = "") -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print(report.paint("⚠ " + msg, "REVISAR"), flush=True)


# ---------------------------------------------------------------- registro
def cargar_registro(path: Path = REGISTRO) -> dict:
    if not Path(path).is_file():
        return {}
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except ValueError:
        return {}


def guardar_registro(plate: str, info: dict, path: Path = REGISTRO) -> None:
    data = cargar_registro(path)
    data[plate] = info
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- borrador
@dataclass
class FotoPlan:
    path: Path
    nombre: str
    alt: str


@dataclass
class Borrador:
    row: VehicleRow
    titulo: str
    sku: str
    marca: str
    modelo: str
    version: str
    combustible: str | None
    caja: str | None
    km: str
    cv: int | None
    cubicaje: int | None
    matriculacion: str
    matriculacion_num: int | None
    garantia: str
    precio: float | None
    precio_financiado: float | None
    cuota: int | None
    categorias: list[str]
    categoria_ids: list[int]
    fotos: list[FotoPlan]
    financiacion: Financiacion | None = None   # tarifa, dto, importe, plazo y cuota (cuota.calcular_financiacion)
    fecha_matriculacion: date | None = None    # E o, si falta, la del permiso (meta _fecha_matriculacion en ISO)
    carpeta: Path | None = None                # carpeta del coche (ahí van las imágenes de la luna)
    gas: str | None = None                     # GLP/GNC/GNL: solo descripción y etiqueta (en la web y la hoja, Gasolina)
    destacado: str = ""              # ACF _destacado: parte narrativa
    equipamiento: str = ""           # ACF _equipamiento: datos técnicos y equipamiento
    etiqueta_dgt: str = ""           # CERO | ECO | C | B | "" (descripcion_cochesnet.etiqueta_dgt)
    motor_comercial: str = ""        # denominación del motor según la IA («1.0 TCe 100 GLP»)
    destacados_ficha: str = ""       # 3-4 puntos fuertes del equipamiento, uno por línea
    avisos: list[str] = field(default_factory=list)
    para_verificar: list[str] = field(default_factory=list)

    @property
    def tarifa(self) -> str | None:
        return self.financiacion.tarifa if self.financiacion else None

    def campos_acf(self) -> dict:
        campos = {
            "_marca": self.marca,
            "_marca_completa": f"{self.marca} {self.modelo}".strip(),
            "_modelo": f"{self.modelo} {self.version}".strip(),
            "_modelo_listado": self.modelo,
            "_combustible": self.combustible or "",
            "_cubicaje": str(self.cubicaje) if self.cubicaje else "",
            "_cv": str(self.cv) if self.cv else "",
            "_caja": self.caja or "",
            "_km": self.km,
            "_matriculacion": self.matriculacion,
            "_matriculacion_num": str(self.matriculacion_num) if self.matriculacion_num else "",
            **campos_financiacion(self.precio, self.precio_financiado, self.cuota, self.tarifa, self.fecha_matriculacion),
            "_garantia": GARANTIA_ACF,
            "_destacado": self.destacado,
            "_equipamiento": self.equipamiento,
            "matricula": self.sku,
            "matricula_crm": self.sku,
        }
        campos.update(VALORES_FIJOS)
        if self.categoria_ids:
            campos["_yoast_wpseo_primary_product_cat"] = str(self.categoria_ids[0])
        return campos

    def metas_ficha(self) -> dict:
        """METAS_FICHA con valor (los vacíos no se mandan)."""
        valores = dict(zip(METAS_FICHA, (self.etiqueta_dgt, self.motor_comercial, self.gas or "",
                                         self.destacados_ficha)))
        return {clave: valor for clave, valor in valores.items() if valor}


def _precio_web(valor) -> str:
    return marcas.km_web(valor) if valor else ""


def _precio_acf(valor) -> str:
    """Precios para los ACF _precio y _precio_financiado: entero sin separador de miles ('12485'), pedido por el
    usuario (con puntos la web no los interpreta como número)."""
    return str(int(round(float(valor)))) if valor else ""


GARANTIA_COMERCIAL = "12 meses"
# En sevencars.es el ACF _garantia guarda el NOMBRE DEL PLAN, no una duración: los 10 coches publicados a mano
# ponen "PREMIUM". El tema no lee ese campo en ninguna plantilla (los "12 meses" que ve el cliente salen de
# 'garantia_meses' => 12, fijo en inc/seven-partes.php), así que la duración va donde el cliente la lee:
# el campo «Garantía» de cochesnet.py preparar y el pie de la descripción.
GARANTIA_ACF = "PREMIUM"


def garantia_texto(row: VehicleRow = None) -> str:
    """La garantía comercial de Sevencars es siempre 12 meses. La columna O (meses de garantía de fábrica
    restante) es otra cosa y no se publica."""
    return GARANTIA_COMERCIAL


@dataclass
class Financiado:
    """Precio, precio financiado, financiación (tarifa, plazo, cuota) y fecha de matriculación de una fila: los
    metas que la web usa para financiar y calcular la edad del coche (METAS_FINANCIACION). construir_borrador
    lo calcula igual; `--actualizar --solo-financiacion` lo manda solo, desde la hoja y sin leer documentos."""
    row: VehicleRow
    fecha: date | None                  # E o, si falta, la del permiso
    precio: float | None
    precio_financiado: float | None
    financiacion: Financiacion
    avisos: list[str] = field(default_factory=list)
    para_verificar: list[str] = field(default_factory=list)

    @property
    def sku(self) -> str:
        return self.row.matricula or ""

    def campos_acf(self) -> dict:
        return campos_financiacion(self.precio, self.precio_financiado, self.financiacion.cuota,
                                   self.financiacion.tarifa, self.fecha)


def campos_financiacion(precio, precio_fin, cuota: int | None, tarifa: str | None, fecha: date | None) -> dict:
    """Los metas de METAS_FINANCIACION formateados para la web: precios enteros sin puntos, cuota «244 €/mes»,
    tipo de vehículo según la tarifa y la fecha de matriculación en ISO (YYYY-MM-DD; vacía si no se conoce)."""
    return {"_precio": _precio_acf(precio), "_precio_financiado": _precio_acf(precio_fin),
            "_cuota": formato_cuota(cuota), "_tipo_vehiculo": tipo_vehiculo_web(tarifa),
            "_fecha_matriculacion": fecha.isoformat() if fecha else ""}


def calcular_financiado(row: VehicleRow, fecha: date | None) -> Financiado:
    """Precio contado (F), precio financiado (N o F), financiación y avisos de una fila. `fecha`: E o, si falta,
    la del permiso (quien llama decide si la tiene)."""
    avisos: list[str] = []
    verificar_items: list[str] = []
    precio = row.precio_contado
    precio_fin, nota_precio = precio_financiado(row)
    if nota_precio:
        avisos.append(nota_precio)
    if not precio:
        avisos.append("PRECIO CONTADO (F) vacío")
    fin = calcular_financiacion(precio, fecha, row.tarifa_financiacion)
    if fin.nota and precio:
        verificar_items.append(f"cuota: {fin.nota}")
    # La web recalcula _precio_financiado en cada guardado desde _precio, _dto_renove y _tipo_vehiculo: si la
    # columna N dice otra cosa, el propietario tiene que saberlo antes de publicar.
    web = precio_financiado_web(precio, fin.tarifa)
    if precio_fin is not None and web is not None and int(round(precio_fin)) != web:
        verificar_items.append(
            f"precio financiado: la hoja (N) dice {fmt_value(precio_fin)} € pero la web lo recalculará al guardar como "
            f"{web} € (precio {fmt_value(precio)} − dto financiación tarifa {fin.tarifa} − 850 renove): revisá N o la tarifa (J)")
    return Financiado(row=row, fecha=fecha, precio=precio, precio_financiado=precio_fin, financiacion=fin,
                      avisos=avisos, para_verificar=verificar_items)


def construir_borrador(row: VehicleRow, folder: locate.CarFolder, permiso: idm.PermisoData | None,
                       ai_result: dict | None, categoria_override: str | None = None,
                       sin_fotos_caja: bool = False, force: bool = False,
                       sin_descripcion: bool = False, forzar_descripcion: bool = False) -> Borrador:
    avisos: list[str] = []
    verificar_items: list[str] = []
    m = marcas.split_modelo(row.modelo)
    avisos += m.avisos
    p3 = None
    if ai_result:
        for key in ("permiso_circulacion", "ficha_tecnica"):
            doc = ai_result.get(key) or {}
            if doc.get("presente", True) and doc.get("combustible"):
                p3 = doc.get("combustible")
                break
    combustible, aviso = marcas.combustible_web(p3, row.modelo)
    if aviso:
        combustible_conf = None
        verificar_items.append(f"combustible: {combustible} sin confirmar ({aviso})")
    else:
        combustible_conf = combustible

    fotos_dir = fotos_mod.carpeta_fotos(folder.path)
    fotos = fotos_mod.listar_fotos(fotos_dir) if fotos_dir else []
    caja_sheet = marcas.normalize_caja(row.caja)
    if caja_sheet:
        caja, caja_v = caja_sheet, None
    else:
        caja_v = caja_fotos.detectar_caja(row.modelo, combustible_conf, fotos, folder.name,
                                          force=force, sin_fotos=sin_fotos_caja)
        caja = caja_v.caja if caja_v.escribible else None
        if not caja_v.escribible:
            verificar_items.append(caja_v.para_verificar() or "caja: sin confirmar (revisar en el borrador)")

    permiso_doc = (ai_result or {}).get("permiso_circulacion") or {}
    ficha_doc = (ai_result or {}).get("ficha_tecnica") or {}
    kw = permiso_doc.get("potencia_kw") or ficha_doc.get("potencia_kw")
    termico = kw_to_cv(kw) if kw else None
    modelo_cv = cv_in_modelo(row.modelo)
    if combustible == marcas.HIBRIDO:
        # total system power: sheet Y, else the CV in the MODELO text; never P.2 alone
        cv = int(round(row.motor_cv)) if row.motor_cv else modelo_cv
        termico_txt = f"el permiso solo da el motor térmico, {termico} CV" if termico else "sin potencia térmica legible"
        if cv is None:
            verificar_items.append(f"cv: híbrido, falta la potencia total del sistema ({termico_txt}); el campo queda vacío")
        else:
            verificar_items.append(f"cv: híbrido, {cv} CV según {'la hoja' if row.motor_cv else 'el texto de MODELO'} "
                                   f"({termico_txt}); confirmar la potencia total")
    elif row.motor_cv:
        cv = int(round(row.motor_cv))
    elif termico:
        cv = termico
    else:
        cv = None
        avisos.append("potencia (CV) desconocida: Y vacía y sin P.2 en el permiso")
    cubicaje = int(row.cubicaje) if row.cubicaje else (permiso_doc.get("cilindrada_cc") or ficha_doc.get("cilindrada_cc"))
    if not cubicaje:
        avisos.append("cubicaje desconocido: Z vacía y sin P.1 en el permiso")
    fecha = row.fecha_matriculacion or (permiso.date if permiso else None)
    matriculacion, mat_num = marcas.matriculacion_web(fecha, row.matriculacion, row.matriculacion_num)
    fz = calcular_financiado(row, fecha)
    avisos += fz.avisos
    verificar_items += fz.para_verificar
    precio, precio_fin, fin, cuota = fz.precio, fz.precio_financiado, fz.financiacion, fz.financiacion.cuota

    if categoria_override:
        slugs, aviso_cat = cat_mod.validar_slugs(categoria_override), None
    else:
        slugs, aviso_cat = cat_mod.categorias_para(m.modelo)
    if aviso_cat:
        verificar_items.append(f"categoría: {aviso_cat}")
    sku = row.matricula or (permiso.plate if permiso else "") or ""
    fotos_plan = [FotoPlan(p, fotos_mod.nombre_seo(m.marca, m.modelo, sku, i), fotos_mod.alt_seo(m.marca, m.modelo, sku, i))
                  for i, p in enumerate(fotos, start=1)]
    if not fotos_plan:
        avisos.append("sin fotos editadas en la carpeta (fotos/)")
    elif fotos_plan[0].path.stem.lower() != "1":
        verificar_items.append(f"foto de portada dudosa: la primera foto es '{fotos_plan[0].path.name}', no '1.jpg'")
    # gas (bifuel GLP/GNC/GNL): indicador aparte; _combustible y la hoja siguen diciendo Gasolina
    gas, aviso_gas = (None, None) if combustible in (marcas.DIESEL, marcas.HIBRIDO, marcas.ELECTRICO) \
        else combustible_mod.gas_web(p3, row.modelo)
    if aviso_gas:
        verificar_items.append(aviso_gas)
    doc_desc = desc_mod.datos_documentos(ai_result)
    doc_desc.update(p3=p3 or "", bastidor=row.bastidor or (permiso.vin if permiso else "") or doc_desc.get("bastidor", ""))
    datos_desc = desc_mod.DatosCoche(marca=m.marca, modelo=m.modelo, version=m.version, combustible=combustible or "",
                                     cilindrada=cubicaje or None, cv=cv, caja=caja or "",
                                     anio=mat_num // 100 if mat_num else None, fecha=fecha, gas=gas or "",
                                     importado=desc_mod.es_importado(folder.name, folder.group, row.modelo), **doc_desc)
    destacado = equipamiento = motor_comercial = destacados_ficha = ""
    if not sin_descripcion:
        d = desc_mod.generar(datos_desc, fotos, folder.name, force=force or forzar_descripcion)
        if d.piezas is not None:
            destacado, equipamiento = desc_mod.destacado(d.piezas), desc_mod.equipamiento(d.piezas)
            motor_comercial, destacados_ficha = d.piezas.motor, desc_mod.destacados_ficha(d.piezas)
            verificar_items.append(desc_mod.AVISO_VERIFICAR)
            verificar_items += d.piezas.para_verificar
        else:
            avisos.append(f"descripción: no se pudo generar ({d.error}); _destacado y _equipamiento van vacíos")
            verificar_items.append("descripción y equipamiento vacíos: la IA no pudo generarlos, completarlos a mano")

    return Borrador(row=row, titulo=m.titulo, sku=sku, marca=m.marca, modelo=m.modelo, version=m.version,
                    combustible=combustible_conf, caja=caja, km=marcas.km_web(row.kms), cv=cv, cubicaje=cubicaje,
                    matriculacion=matriculacion, matriculacion_num=mat_num, garantia=garantia_texto(row), precio=precio,
                    precio_financiado=precio_fin, cuota=cuota, categorias=slugs, categoria_ids=cat_mod.ids_de(slugs),
                    fotos=fotos_plan, financiacion=fin, fecha_matriculacion=fecha, carpeta=folder.path, gas=gas,
                    destacado=destacado, equipamiento=equipamiento, etiqueta_dgt=datos_desc.etiqueta or "",
                    motor_comercial=motor_comercial, destacados_ficha=destacados_ficha,
                    avisos=avisos, para_verificar=verificar_items)


def imprimir_resumen(b: Borrador, completo: bool = False) -> None:
    """Tabla del borrador y un extracto de _destacado / _equipamiento; con `completo` (--simular) los dos campos
    enteros, tal cual irían a la web."""
    say()
    say(report.paint("== Resumen del borrador", "bold"))
    filas = [
        ["Título", b.titulo], ["SKU (matrícula)", b.sku], ["Marca / modelo", f"{b.marca} / {b.modelo}"],
        ["Versión", b.version],
        ["Combustible", (b.combustible or "(vacío: sin confirmar)")
         + (f" · {b.gas} (bifuel: solo descripción y etiqueta)" if b.gas else "")],
        ["Caja", b.caja or "(vacío: sin confirmar)"], ["Km", b.km], ["CV", fmt_value(b.cv)], ["Cubicaje", fmt_value(b.cubicaje)],
        ["Matriculación", f"{b.matriculacion} ({b.matriculacion_num or '-'})"], ["Garantía", b.garantia],
        ["Precio", _precio_web(b.precio) + " €"], ["Precio financiado", _precio_web(b.precio_financiado) + " €"],
        ["Financiación", (b.financiacion.descripcion() if b.financiacion else "") or "-"],
        ["Cuota", formato_cuota(b.cuota) or "-"], ["Tipo vehículo (web)", tipo_vehiculo_web(b.tarifa) or "(vacío: NORMAL)"],
        ["Categorías", ", ".join(b.categorias) or "(ninguna)"],
        ["Fotos", f"{len(b.fotos)}" + (": " + ", ".join(f.nombre for f in b.fotos[:3]) + (" …" if len(b.fotos) > 3 else "") if b.fotos else "")],
    ]
    report.print_table(["Campo", "Valor"], filas, [18, 90])
    for nombre, texto in (("_destacado", b.destacado), ("_equipamiento", b.equipamiento)):
        say()
        if not texto:
            warn(f"{nombre}: vacío")
            continue
        lineas = texto.splitlines()
        if completo:
            say(report.paint(f"== {nombre} ({len(lineas)} líneas, {len(texto)} caracteres) — completo", "bold"))
            for linea in lineas:
                say("  " + linea if linea else "")
            continue
        say(report.paint(f"== {nombre} ({len(lineas)} líneas, {len(texto)} caracteres) — extracto", "bold"))
        for linea in [x for x in lineas if x.strip()][:EXTRACTO_LINEAS]:
            say("  " + linea[:100])
        say("  …")
    for a in b.avisos:
        warn(a)


def imprimir_resumen_financiacion(f: Financiado) -> None:
    say()
    say(report.paint("== Financiación según la hoja (--solo-financiacion)", "bold"))
    filas = [
        ["SKU (matrícula)", f.sku], ["Precio", _precio_web(f.precio) + " €"],
        ["Precio financiado", _precio_web(f.precio_financiado) + " €"],
        ["Financiación", f.financiacion.descripcion() or "-"], ["Cuota", formato_cuota(f.financiacion.cuota) or "-"],
        ["Tipo vehículo (web)", tipo_vehiculo_web(f.financiacion.tarifa) or "(vacío: NORMAL)"],
        ["Fecha matriculación", f.fecha.isoformat() if f.fecha else "(vacía)"],
    ]
    report.print_table(["Campo", "Valor"], filas, [18, 90])
    for a in f.avisos:
        warn(a)


# ------------------------------------------------------------------- flujo
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="publicar.py", description="Crea el borrador del coche en sevencars.es")
    p.add_argument("referencia", nargs="?", help="referencia de la hoja (1082, 26, D29...); opcional con --matricula")
    p.add_argument("--matricula", action="append", default=[], help="buscar la fila por matrícula en vez de por referencia")
    p.add_argument("--fila", action="append", type=int, default=[], help=argparse.SUPPRESS)
    p.add_argument("--simular", action="store_true",
                   help="no subir nada: resumen con _destacado y _equipamiento completos + comprobación de duplicado")
    p.add_argument("--categoria", help="categorías (slugs separados por coma) para modelos desconocidos")
    p.add_argument("--publicar-directo", action="store_true", help="crear como publicado en vez de borrador")
    p.add_argument("--forzar", action="store_true", help="ignorar la caché de lecturas (permiso, caja por fotos)")
    p.add_argument("--forzar-descripcion", action="store_true",
                   help="rehacer solo _destacado/_equipamiento con la IA (sin releer el permiso ni la caja)")
    p.add_argument("--sin-hoja", action="store_true", help="no escribir cuota ni URL de portada en la hoja")
    p.add_argument("--sin-fotos-caja", action="store_true", help="no detectar la caja por las fotos")
    p.add_argument("--sin-luna", action="store_true",
                   help="no generar las imágenes de la luna (precio1/precio2/cuota.jpg en <coche>/precios/)")
    p.add_argument("--sin-ficha", action="store_true",
                   help="no descargar la ficha de exposición (PDF de la web) a <coche>/ficha-expo.pdf")
    p.add_argument("--solo-ficha", action="store_true",
                   help="solo volver a descargar la ficha de exposición del producto ya publicado (busca por "
                        "matrícula; sin leer documentos ni IA)")
    p.add_argument("--sin-descripcion", action="store_true",
                   help="no generar _destacado ni _equipamiento (se envían vacíos)")
    p.add_argument("--sin-normalizar-fotos", action="store_true",
                   help="no renombrar ni recomprimir la carpeta fotos/ antes de subir")
    p.add_argument("--solo-fotos", action="store_true",
                   help="solo normalizar fotos/ (1.jpg…N.jpg ≤ 400 KB) y salir, sin tocar la web ni la hoja")
    p.add_argument("--actualizar", action="store_true",
                   help="completar un anuncio ya publicado (campos ACF, título y categorías; nunca las fotos)")
    p.add_argument("--si", action="store_true", help="con --actualizar: no preguntar antes de pisar valores")
    p.add_argument("--solo-financiacion", action="store_true",
                   help="con --actualizar: mandar solo _precio, _precio_financiado, _cuota, _tipo_vehiculo y "
                        "_fecha_matriculacion, desde la hoja y sin leer documentos")
    p.add_argument("--sheet", metavar="XLSX", help=argparse.SUPPRESS)
    p.add_argument("--ventas-dir", default=str(locate.DEFAULT_VENTAS_DIR), help=argparse.SUPPRESS)
    p.add_argument("--motor", choices=list(extract.MOTORES), help=argparse.SUPPRESS)
    return p


def _state_for(args, sheet_src, data, folders) -> verificar.RunState:
    ns = argparse.Namespace(sin_ia=False, forzar=args.forzar, debug=False, escribir=False, sin_fotos_caja=args.sin_fotos_caja)
    return verificar.RunState(args=ns, sheet_src=sheet_src, data=data, ventas=None, model=extract.default_model(),
                              motor=args.motor or extract.default_motor(), scope=extract.SCOPE_LEAN, folders=folders)


def normalizar_fotos(args, folder: locate.CarFolder) -> "fotos_mod.Resultado | None":
    """Deja fotos/ como 1.jpg…N.jpg ≤ 400 KB y muestra el resumen (en --simular solo el plan, «se haría»).
    Sin subcarpeta fotos/ avisa dónde van las fotos. Con --sin-normalizar-fotos no toca nada."""
    fotos_dir = fotos_mod.carpeta_fotos(folder.path)
    if fotos_dir is None:
        warn(f"En {folder.path.name} {fotos_mod.AVISO_SIN_CARPETA}.")
        return None
    if getattr(args, "sin_normalizar_fotos", False):
        return None
    res = fotos_mod.normalizar_carpeta(fotos_dir, ejecutar=not args.simular)
    say(fotos_mod.resumen_normalizacion(res))
    return res


def _fila(args, data) -> "VehicleRow | None":
    """Fila de la hoja (por referencia, --fila o --matricula); None con el aviso ya impreso si no se puede seguir."""
    ref = locate.canonical_ref(args.referencia) if args.referencia else ""
    pedido = args.referencia or (args.matricula[0] if args.matricula else "")
    dup_refs, _ = data.duplicates()
    if ref and ref in dup_refs and not args.fila:
        warn(f"La referencia {ref} está repetida en la hoja (filas {', '.join(map(str, dup_refs[ref]))}): usá --fila N.")
        return None
    if args.fila:
        row = data.row_by_number(args.fila[0])
    elif ref:
        row = data.find_by_ref(ref)
    else:                                   # solo --matricula: la fila se busca por matrícula
        row = data.find_by_plate(pedido)
    if row is None:
        warn(f"'{pedido}' no está en la hoja Base_Datos ({data.source_label}).")
        return None
    say(f"Hoja: fila {row.row_number} · ref {row.referencia} · {row.modelo} · {row.matricula or '-'} · "
        f"{fmt_value(row.kms)} km · {fmt_value(row.precio_contado)} € (campaña {fmt_value(row.precio_campana)} €)")
    return row


def _fila_y_carpeta(args, data, folders) -> tuple["VehicleRow | None", "locate.LocateResult | None"]:
    """Fila de la hoja y carpeta del coche; (None, None) con el aviso ya impreso si no se puede seguir."""
    row = _fila(args, data)
    if row is None:
        return None, None
    loc = locate.locate(folders, ref=row.referencia, plate=row.matricula)
    say(f"Carpeta: {loc.describe()}")
    return row, loc


def solo_fotos(args, data, folders) -> int:
    """`--solo-fotos`: normaliza fotos/ del coche y termina. No lee documentos ni toca la web ni la hoja."""
    row, loc = _fila_y_carpeta(args, data, folders)
    if row is None or not loc.found:
        if row is not None:
            warn("Sin carpeta del coche: no hay fotos que normalizar.")
        return EXIT_ERROR
    if normalizar_fotos(args, loc.folder) is None:
        return EXIT_ERROR
    return EXIT_OK


def preparar_borrador(args, sheet_src, data, folders) -> tuple[int, "Borrador | None"]:
    """Hoja → carpeta → puerta de identidad → fotos normalizadas → borrador. (código de salida, borrador o None)."""
    row, loc = _fila_y_carpeta(args, data, folders)
    if row is None:
        return EXIT_ERROR, None
    docs = find_documents(loc.folder.path) if loc.found else []
    state = _state_for(args, sheet_src, data, folders)
    ai_result, ai_status, _ = verificar.read_documents(state, loc, row.matricula, docs)
    idc = idm.check_identity(row.matricula, loc, ai_result, has_docs=any(d.kind != KIND_EXPO for d in docs))
    say("Identidad: " + report.paint(idc.estado, idc.estado) + f" — {idc.nota} (lectura: {ai_status})")
    if not idc.confirmed:
        warn("Identidad no confirmada: no se toca la web.")
        return EXIT_ERROR, None
    if not getattr(args, "actualizar", False):         # --actualizar nunca toca las fotos
        normalizar_fotos(args, loc.folder)

    try:
        b = construir_borrador(row, loc.folder, idc.permiso, ai_result, args.categoria, args.sin_fotos_caja,
                               args.forzar, getattr(args, "sin_descripcion", False),
                               getattr(args, "forzar_descripcion", False))
    except ValueError as exc:
        warn(str(exc))
        return EXIT_ERROR, None
    if not b.sku:
        warn("Sin matrícula (ni en la hoja ni en el permiso): no se publica.")
        return EXIT_ERROR, None
    return EXIT_OK, b


def preparar_financiacion(args, data) -> tuple[int, "Financiado | None"]:
    """`--actualizar --solo-financiacion`: solo la fila de la hoja, sin carpeta ni documentos. La identidad se
    comprueba después contra el producto (la matrícula de la hoja tiene que ser el sku de la web)."""
    row = _fila(args, data)
    if row is None:
        return EXIT_ERROR, None
    if not row.matricula:
        warn("Sin matrícula en la hoja (D): con --solo-financiacion no se lee el permiso, así que no hay con qué "
             "buscar el producto.")
        return EXIT_ERROR, None
    if not row.precio_contado:
        warn("PRECIO CONTADO (F) vacío: no hay financiación que mandar.")
        return EXIT_ERROR, None
    if row.fecha_matriculacion is None:
        warn("FECHA MATRICULACION (E) vacía: sin ella no salen la tarifa ni la cuota. Rellená E (o usá --actualizar "
             "sin --solo-financiacion, que la lee del permiso).")
        return EXIT_ERROR, None
    return EXIT_OK, calcular_financiado(row, row.fecha_matriculacion)


def generar_luna(carpeta: Path | None, precio, fecha: date | None, tarifa) -> None:
    """Imágenes para la hoja de precios de la luna en <coche>/precios/ (luna.py): precio contado − dto de
    financiación en miles y cientos, y la cuota. Nunca detiene la publicación: si falla, avisa y sigue."""
    if carpeta is None:
        warn("Luna: sin carpeta del coche, no se generan las imágenes (luna.py <ref> --salida DIR).")
        return
    try:
        res = luna_mod.generar_luna(carpeta, precio, fecha, tarifa)
    except (luna_mod.LunaError, OSError) as exc:
        warn(f"Luna: no se generaron las imágenes ({exc}).")
        return
    for aviso in res.avisos:
        warn(f"Luna: {aviso}")
    say(f"Luna: {res.resumen()}")


def _luna_financiado(args, b: Financiado, folders) -> None:
    """--actualizar --solo-financiacion: vuelve a generar las imágenes de la luna (el precio pudo cambiar)."""
    if getattr(args, "sin_luna", False):
        return
    loc = locate.locate(folders, ref=b.row.referencia, plate=b.row.matricula)
    generar_luna(loc.folder.path if loc.found else None, b.precio, b.fecha, b.row.tarifa_financiacion)


def escribir_atomico(destino: Path, datos: bytes) -> Path:
    """Escribe en un temporal de la misma carpeta y lo renombra encima: nunca queda un archivo a medias."""
    destino = Path(destino)
    fd, tmp = tempfile.mkstemp(prefix=f".{destino.stem}.", suffix=".tmp", dir=destino.parent)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(datos)
        os.replace(tmp, destino)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return destino


def descargar_ficha(client, product_id, carpeta: Path | None) -> str:
    """La ficha de exposición que genera la web, a <carpeta>/ficha-expo.pdf (pisando la anterior) e imprime
    «Ficha: <ruta>». Nunca detiene la publicación: si falla avisa y devuelve la línea para PARA VERIFICAR ('' si
    salió bien)."""
    if carpeta is None:
        motivo = "sin carpeta del coche"
    else:
        try:
            destino = escribir_atomico(Path(carpeta) / FICHA_EXPO, client.descargar_ficha_pdf(product_id))
        except Exception as exc:            # el producto ya está creado: pase lo que pase, se sigue
            motivo = str(exc) or type(exc).__name__
        else:
            say(f"Ficha: {destino}")
            return ""
    warn(f"Ficha de exposición: no se pudo descargar ({motivo}).")
    return f"ficha de exposición: no se pudo descargar ({motivo}); generala con el botón en WordPress"


def solo_ficha(args, data, folders, client_factory=WcClient.desde_env) -> int:
    """`--solo-ficha`: vuelve a descargar la ficha de exposición del producto a la carpeta del coche. La identidad
    sale de la hoja (su matrícula es la del producto, igual que --solo-financiacion): sin documentos ni IA."""
    row, loc = _fila_y_carpeta(args, data, folders)
    if row is None:
        return EXIT_ERROR
    if not row.matricula:
        warn("Sin matrícula en la hoja (D): con --solo-ficha no se lee el permiso, así que no hay con qué buscar "
             "el producto.")
        return EXIT_ERROR
    if not loc.found:
        warn("Sin carpeta del coche: no hay dónde guardar la ficha de exposición.")
        return EXIT_ERROR
    try:
        client = client_factory()
        producto = client.buscar_por_matricula(row.matricula)
    except WcError as exc:
        warn(str(exc))
        return EXIT_ERROR
    if not producto:
        warn(f"{row.matricula} no está publicado en la web: no hay ficha que descargar. "
             f"Publicalo primero con `publicar.py {args.referencia or row.referencia}`.")
        return EXIT_ERROR
    product_id = producto["id"]
    say(f"Producto {product_id} (por búsqueda por matrícula en la web): {client.admin_url(product_id)}")
    say("Identidad: " + report.paint("OK", "OK") + f" — la matrícula de la hoja ({row.matricula}) es la del producto")
    if not guarda_modelo(args, producto, row, product_id):
        return EXIT_ERROR
    destino = loc.folder.path / FICHA_EXPO
    if args.simular:
        say(f"Simulación: se descargaría {client.url_ficha(product_id)} a {destino}"
            + (" (pisando la que hay)" if destino.exists() else "") + ". No se descarga nada.")
        return EXIT_OK
    aviso = descargar_ficha(client, product_id, loc.folder.path)
    if aviso:
        report.print_para_verificar([aviso])
        return EXIT_ERROR
    return EXIT_OK


def publicar(args, sheet_src, data, folders, client_factory=WcClient.desde_env, registro_path: Path = REGISTRO) -> int:
    """Alta completa. `client_factory` se inyecta en los tests."""
    rc, b = preparar_borrador(args, sheet_src, data, folders)
    if b is None:
        return rc
    row = b.row
    imprimir_resumen(b, completo=args.simular)

    # duplicado: registro local + web
    registro = cargar_registro(registro_path)
    previo = registro.get(b.sku)
    if previo:
        warn(f"Ya publicado según data/publicados.json (producto {previo.get('product_id')}): {previo.get('admin_url')}")
        report.print_para_verificar(b.para_verificar)
        return EXIT_ERROR
    try:
        client = client_factory()
    except WcError as exc:
        warn(str(exc))
        return EXIT_ERROR
    try:
        existente = client.buscar_por_matricula(b.sku)
    except WcError as exc:
        warn(f"No se pudo comprobar si el coche ya existe en la web: {exc}")
        return EXIT_ERROR
    if existente:
        warn(f"El coche ya existe en la web ({existente.get('status')}, producto {existente['id']} «{existente.get('name')}»): "
             f"{existente['admin_url']}. No se crea otro.")
        report.print_para_verificar(b.para_verificar)
        return EXIT_ERROR
    say(report.paint("Duplicado: no existe en la web (sku, búsqueda y barrido de matrículas).", "OK"))

    escrituras = planificar_hoja(b, data)
    if args.simular:
        say()
        say("Simulación: no se sube nada. En la hoja " + ("; ".join(escrituras) if escrituras else "no habría cambios") + ".")
        report.print_para_verificar(b.para_verificar)
        return EXIT_OK

    # subida de fotos con rollback
    ids: list[int] = []
    try:
        for i, f in enumerate(b.fotos, start=1):
            data_bytes = fotos_mod.preparar_jpeg(f.path)
            media_id = client.subir_imagen(data_bytes, f.nombre, f.alt, f"{b.titulo} {b.sku} {i:02d}")
            ids.append(media_id)
            say(f"  foto {i:02d}/{len(b.fotos)}: {f.nombre} → media {media_id}")
    except (WcError, OSError) as exc:
        warn(f"Fallo subiendo fotos: {exc}. Se borran las {len(ids)} ya subidas.")
        for media_id in ids:
            client.borrar_media(media_id)
        return EXIT_ERROR

    status = "publish" if args.publicar_directo else "draft"
    descripcion = render_plantilla("descripcion", datos_plantilla(b))
    payload = construir_payload(b.titulo, b.sku, campos_web(b), ids, b.categoria_ids, status=status,
                                descripcion=descripcion)
    try:
        product_id, admin_url, producto = client.crear_producto(payload)
    except WcError as exc:
        warn(f"No se pudo crear el producto: {exc}. Se borran las {len(ids)} fotos subidas.")
        for media_id in ids:
            client.borrar_media(media_id)
        return EXIT_ERROR
    portada = ""
    try:
        portada = (producto.get("images") or [{}])[0].get("src") or ""
    except (AttributeError, IndexError):
        portada = ""
    guardar_registro(b.sku, {"referencia": row.referencia, "fila": row.row_number, "product_id": product_id,
                             "admin_url": admin_url, "status": status, "titulo": b.titulo, "fotos": len(ids),
                             "portada": portada, "fecha": datetime.now().isoformat(timespec="seconds")}, registro_path)
    say(report.paint(f"Producto {product_id} creado como {status}: {admin_url}", "OK"))
    if not getattr(args, "sin_luna", False):
        generar_luna(b.carpeta, b.precio, b.fecha_matriculacion, row.tarifa_financiacion)
    if not getattr(args, "sin_ficha", False):
        aviso = descargar_ficha(client, product_id, b.carpeta)
        if aviso:
            b.para_verificar.append(aviso)

    if not args.sin_hoja:
        escribir_hoja(b, data, sheet_src, portada)
    report.print_para_verificar(b.para_verificar)
    return EXIT_OK


def datos_plantilla(b: Borrador) -> dict:
    return {"marca": b.marca, "modelo": b.modelo, "version": b.version, "kms": b.km, "cv": b.cv, "cubicaje": b.cubicaje,
            "caja": b.caja, "combustible": b.combustible, "matriculacion": b.matriculacion, "garantia": b.garantia,
            "precio": _precio_web(b.precio), "precio_financiado": _precio_web(b.precio_financiado),
            "cuota": formato_cuota(b.cuota), "matricula": b.sku}


def planificar_hoja(b: Borrador, data) -> list[str]:
    """Descripción de lo que se escribiría en la hoja (AD cuota, G portada): solo celdas vacías."""
    out = []
    row = b.row
    if b.cuota is not None:
        if data.column_letter("cuota") is None:
            out.append("no existe la columna 'cuota'")
        elif row.is_empty("cuota"):
            out.append(f"se escribiría AD (cuota) = {b.cuota}")
        else:
            out.append(f"AD ya tiene valor ({fmt_value(row.cuota)}): se conserva")
    if data.column_letter("url_imagen") is not None:
        out.append("se escribiría G (URL IMAGEN) = URL de la portada" if row.is_empty("url_imagen")
                   else "G (URL IMAGEN) ya tiene valor: se conserva")
    return out


def escribir_hoja(b: Borrador, data, sheet_src, portada: str) -> None:
    row = b.row
    writes = []
    if b.cuota is not None and data.column_letter("cuota") and row.is_empty("cuota") and not data.is_formula_column("cuota"):
        writes.append(CellWrite(row.row_number, "cuota", data.column_letter("cuota"), b.cuota))
    if portada and data.column_letter("url_imagen") and row.is_empty("url_imagen"):
        writes.append(CellWrite(row.row_number, "url_imagen", data.column_letter("url_imagen"), portada))
    if not writes:
        say("Hoja: nada que escribir (celdas ya con valor).")
        return
    if not getattr(sheet_src, "can_write", False):
        warn("Hoja: no se escribe (export xlsx).")
        return
    try:
        refused = sheet_src.write(writes) or []
    except SheetError as exc:
        warn(f"Hoja: {exc}")
        return
    for w in writes:
        if w in refused:
            warn(f"Hoja: NO escrito (la celda ya tiene contenido): {w.describe()}")
        else:
            say(report.paint(f"Hoja: escrito {w.describe()}", "OK"))


# ------------------------------------------------------------ actualización
@dataclass
class Diferencia:
    campo: str
    actual: str
    nuevo: str

    @property
    def pisa_valor(self) -> bool:
        """En la web ya hay algo escrito y cambiaría: es lo único que pide confirmación."""
        return bool(self.actual.strip())


def campos_web(b: Borrador | Financiado) -> dict:
    """Todo lo que va a meta_data: los campos ACF y, en un Borrador, los METAS_FICHA con valor."""
    return {**b.campos_acf(), **(b.metas_ficha() if isinstance(b, Borrador) else {})}


def metas_ficha_conservados(b: Borrador | Financiado, producto: dict) -> list[str]:
    """METAS_FICHA que en la web ya tienen un valor distinto: se conservan (nunca se pisan)."""
    if not isinstance(b, Borrador):
        return []
    actual = meta_actual(producto)
    return [clave for clave, valor in b.metas_ficha().items()
            if actual.get(clave, "").strip() and actual.get(clave) != valor]


def diferencias(b: Borrador | Financiado, producto: dict, solo_meta: bool = False) -> list[Diferencia]:
    """Lo que cambiaría: meta ACF, los METAS_FICHA que en la web están vacíos y, si difieren, título y
    categorías. Nunca fotos, estado, sku ni precio. Con `solo_meta` (--solo-financiacion: `b` es un Financiado) solo
    las metas de campos_acf(), sin título ni categorías."""
    actual = meta_actual(producto)
    difs = [Diferencia(m["key"], actual.get(m["key"], ""), str(m["value"]))
            for m in construir_meta(b.campos_acf()) if actual.get(m["key"], "") != str(m["value"])]
    if solo_meta:
        return difs
    if isinstance(b, Borrador):
        difs += [Diferencia(clave, "", valor) for clave, valor in b.metas_ficha().items()
                 if not actual.get(clave, "").strip()]
    if (producto.get("name") or "") != b.titulo:
        difs.append(Diferencia("name", producto.get("name") or "", b.titulo))
    cats_web = sorted(c.get("id") for c in (producto.get("categories") or []))
    if b.categoria_ids and sorted(b.categoria_ids) != cats_web:
        difs.append(Diferencia("categories", ", ".join(map(str, cats_web)), ", ".join(map(str, sorted(b.categoria_ids)))))
    return difs


def payload_actualizacion(b: Borrador | Financiado, difs: list[Diferencia]) -> dict:
    """Solo los campos que cambian. Si no hay diferencias de meta, no se manda meta_data."""
    cambian = {d.campo for d in difs}
    payload: dict = {}
    meta = [m for m in construir_meta(campos_web(b)) if m["key"] in cambian]
    if meta:
        payload["meta_data"] = meta
    if "name" in cambian:
        payload["name"] = b.titulo
    if "categories" in cambian:
        payload["categories"] = [{"id": i} for i in b.categoria_ids]
    return payload


def imprimir_diferencias(difs: list[Diferencia]) -> None:
    say()
    say(report.paint(f"== Diferencias con la web ({len(difs)} campo/s)", "bold"))
    filas = [[d.campo, d.actual or "(vacío)", d.nuevo or "(vacío)"] for d in difs]
    report.print_table(["Campo", "En la web", "Nuevo"], filas, [26, 42, 42])


def _clave(texto) -> str:
    """Minúsculas, sin acentos ni nada que no sea letra o número: «Citroën C3» → 'citroenc3'."""
    return re.sub(r"[^a-z0-9]", "", norm_text(texto))


def comprobar_modelo(producto: dict, row: VehicleRow, product_id) -> tuple[str, str]:
    """Guarda contra matrículas mal cargadas en la web (un «Hyundai I10» que lleva la matrícula de un Fiat 500):
    la marca del MODELO de la hoja tiene que aparecer en el nombre del producto o en sus metas _marca /
    _marca_completa (sin acentos, mayúsculas ni signos). Devuelve (error, aviso): `error` si la marca no aparece
    (no se toca la web salvo --forzar); `aviso` si no hay marca reconocida o si el primer token del modelo no
    aparece (se sigue igual)."""
    m = marcas.split_modelo(row.modelo)
    metas = {x.get("key"): x.get("value") for x in producto.get("meta_data") or [] if isinstance(x, dict)}
    nombre = producto.get("name") or ""
    textos = [_clave(t) for t in (nombre, metas.get("_marca") or "", metas.get("_marca_completa") or "")]
    marca = _clave(m.marca)
    if not marca:
        return "", f"MODELO «{row.modelo}» sin marca reconocida: no se puede comparar con el producto «{nombre}»"
    if not any(marca in t for t in textos):
        return (f"el producto {product_id} se llama «{nombre}» pero la hoja dice «{row.modelo}» para la matrícula "
                f"{row.matricula or '-'}: revisá la matrícula cargada en la web"), ""
    primero = m.modelo.split()[0] if m.modelo.split() else ""
    if primero and not any(_clave(primero) in t for t in textos):
        return "", f"la marca coincide pero el modelo «{primero}» de la hoja no aparece en el producto «{nombre}»"
    return "", ""


def guarda_modelo(args, producto: dict, row: VehicleRow, product_id) -> bool:
    """comprobar_modelo con sus mensajes: False si no se sigue (la marca no aparece y no hay --forzar)."""
    error, aviso = comprobar_modelo(producto, row, product_id)
    if error and not getattr(args, "forzar", False):
        warn(f"Modelo: {error}. No se toca la web (con --forzar se sigue igual).")
        return False
    if error:
        warn(f"Modelo: {error} (--forzar: se sigue igual).")
    elif aviso:
        warn(f"Modelo: {aviso}.")
    else:
        say("Modelo: " + report.paint("OK", "OK") + " — la marca de la hoja aparece en el producto")
    return True


def localizar_producto(client, sku: str, registro: dict) -> tuple[int | None, str]:
    """Primero el registro local, después la búsqueda por matrícula en la web."""
    previo = registro.get(sku) or {}
    if previo.get("product_id"):
        return int(previo["product_id"]), "data/publicados.json"
    encontrado = client.buscar_por_matricula(sku)
    if encontrado:
        return int(encontrado["id"]), "búsqueda por matrícula en la web"
    return None, ""


def actualizar(args, sheet_src, data, folders, client_factory=WcClient.desde_env,
               registro_path: Path = REGISTRO) -> int:
    """Completa un anuncio ya publicado: campos ACF y, si cambiaron, título y categorías. Las fotos ya están
    subidas y no se vuelven a tocar. Con --solo-financiacion solo METAS_FINANCIACION, desde la hoja y sin leer
    documentos: la identidad es la matrícula de la hoja contra el sku del producto."""
    solo_fin = getattr(args, "solo_financiacion", False)
    if solo_fin:
        rc, b = preparar_financiacion(args, data)
    else:
        rc, b = preparar_borrador(args, sheet_src, data, folders)
    if b is None:
        return rc
    if solo_fin:
        imprimir_resumen_financiacion(b)
    else:
        imprimir_resumen(b, completo=args.simular)
    try:
        client = client_factory()
    except WcError as exc:
        warn(str(exc))
        return EXIT_ERROR
    registro = cargar_registro(registro_path)
    try:
        product_id, origen = localizar_producto(client, b.sku, registro)
        if product_id is None:
            warn(f"{b.sku} no está publicado en la web: no hay nada que actualizar. "
                 f"Publicalo primero con `publicar.py {args.referencia or b.row.referencia}`.")
            return EXIT_ERROR
        say(f"Producto {product_id} (por {origen}): {client.admin_url(product_id)}")
        producto = client.obtener_producto(product_id)
    except WcError as exc:
        warn(str(exc))
        return EXIT_ERROR
    if solo_fin:
        if not coincide_matricula(producto, b.sku):
            warn(f"Identidad: el producto {product_id} no lleva la matrícula {b.sku} (sku «{producto.get('sku') or '-'}»): "
                 "no se toca la web.")
            return EXIT_ERROR
        say("Identidad: " + report.paint("OK", "OK") + f" — la matrícula de la hoja ({b.sku}) es el sku del producto")
    if not guarda_modelo(args, producto, b.row, product_id):
        return EXIT_ERROR

    conservados = metas_ficha_conservados(b, producto)
    if conservados:
        say(f"Ficha de exposición: {', '.join(conservados)} ya tienen valor en la web: se conservan (no se pisan).")
    difs = diferencias(b, producto, solo_meta=solo_fin)
    if not difs:
        say(report.paint("El anuncio ya está al día: no hay nada que cambiar.", "OK"))
        if solo_fin and not args.simular:
            _luna_financiado(args, b, folders)
        report.print_para_verificar(b.para_verificar)
        return EXIT_OK
    imprimir_diferencias(difs)
    if solo_fin:
        say(f"Solo se tocan {', '.join(METAS_FINANCIACION)}: ni título, ni categorías, ni descripción, ni fotos.")
    else:
        say("No se tocan las fotos, ni el estado, ni el sku, ni el precio de reserva.")
    if args.simular:
        say("Simulación: no se envía nada.")
        report.print_para_verificar(b.para_verificar)
        return EXIT_OK

    pisan = [d for d in difs if d.pisa_valor]
    if pisan and not args.si:
        say(f"{len(pisan)} campo/s con valor en la web cambiarían: {', '.join(d.campo for d in pisan)}.")
        try:
            if input("¿Actualizo? [s/N] ").strip().lower() not in ("s", "si", "sí"):
                say("Cancelado: no se envía nada.")
                return EXIT_OK
        except (EOFError, KeyboardInterrupt):
            say("\nCancelado: no se envía nada.")
            return EXIT_OK
    try:
        client.actualizar_producto(product_id, payload_actualizacion(b, difs))
    except WcError as exc:
        warn(f"No se pudo actualizar: {exc}")
        return EXIT_ERROR
    campos = [d.campo for d in difs]
    say(report.paint(f"Producto {product_id} actualizado ({len(campos)} campo/s).", "OK"))
    if solo_fin or set(campos) & {"_precio", "_precio_financiado", "_tipo_vehiculo"}:
        say(RECORDATORIO_PRECIO_FINANCIADO)
    if solo_fin:
        _luna_financiado(args, b, folders)
    info = dict(registro.get(b.sku) or {})
    info.update({"referencia": b.row.referencia, "fila": b.row.row_number, "product_id": product_id,
                 "admin_url": client.admin_url(product_id),
                 "titulo": (producto.get("name") or "") if solo_fin else b.titulo,
                 "actualizado": datetime.now().isoformat(timespec="seconds"), "campos_actualizados": campos})
    guardar_registro(b.sku, info, registro_path)
    report.print_para_verificar(b.para_verificar)
    return EXIT_OK


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.referencia and not args.matricula and not args.fila:
        parser.error("indicá la referencia de la hoja o --matricula <matrícula>")
    if args.solo_financiacion and not args.actualizar:
        parser.error("--solo-financiacion va con --actualizar")
    if args.solo_ficha and (args.actualizar or args.solo_fotos):
        parser.error("--solo-ficha no va con --actualizar ni con --solo-fotos")
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, ValueError):
        pass
    extract.load_env()
    try:
        sheet_src = open_sheet(args.sheet)
        data = sheet_src.load()
        say(f"Hoja Base_Datos: {sheet_src.label} — {len(data.rows)} filas con referencia")
        if args.sheet:
            warn(f"Estás usando un export local ({args.sheet}), no la hoja viva: los datos pueden estar viejos.")
        folders = locate.scan_folders(args.ventas_dir)
    except CredentialsMissing as exc:
        say(credentials_help(exc))
        return 3
    except (SheetError, FileNotFoundError) as exc:
        say(f"Error: {exc}")
        return EXIT_ERROR
    if args.solo_fotos:
        return solo_fotos(args, data, folders)
    if args.solo_ficha:
        return solo_ficha(args, data, folders)
    if args.actualizar:
        return actualizar(args, sheet_src, data, folders)
    return publicar(args, sheet_src, data, folders)


if __name__ == "__main__":
    sys.exit(main())
