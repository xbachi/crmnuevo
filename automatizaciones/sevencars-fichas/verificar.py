#!/usr/bin/env python
"""Sevencars – verificación de fichas: documentos de la carpeta OneDrive vs Base_Datos (Google Sheet) vs Ventas.

Regla de identidad: un coche es su referencia + su permiso de circulación (matrícula A y bastidor E). No se
escribe nada en la hoja sin esa confirmación; Ventas-Sevencars es una pista, nunca una prueba."""
from __future__ import annotations

import argparse
import csv
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import caja_fotos
import compare as cmp_mod
import cuota as cuota_mod
import extract
import extract_claude
import fotos as fotos_mod
import identity as idm
import locate
import report
import ventas as ventas_mod
from common import fmt_value, normalize_plate, parse_number
from docs import KIND_EXPO, KIND_LABELS, Document, find_documents
from gauth import CredentialsMissing, credentials_help
from sheet import (CREATABLE_COLUMNS, NEVER_WRITE_FIELDS, WRITABLE_FIELDS, CellWrite, SheetData, SheetError,
                   VehicleRow, XlsxSheet, header_write_for, header_write_for_bastidor, open_sheet)

EXIT_OK, EXIT_ERROR, EXIT_AI, EXIT_CREDENTIALS = 0, 1, 2, 3


def say(msg: str = "") -> None:
    print(msg)


def warn(msg: str) -> None:
    print(report.paint("⚠ " + msg, cmp_mod.REVISAR))


# ------------------------------------------------------------------- args
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="verificar.py",
        description="Compara la ficha técnica y el permiso de circulación de un coche con la hoja Base_Datos "
                    "(y con Ventas-Sevencars) y propone qué celdas rellenar. Solo escribe con identidad confirmada.")
    p.add_argument("referencias", nargs="*", help="referencias de la hoja: 1082, 26 (=1026), D5...")
    p.add_argument("--matricula", action="append", default=[], help="buscar la fila por matrícula (repetible)")
    p.add_argument("--fila", action="append", type=int, default=[], help="fila concreta de la hoja (repetible)")
    p.add_argument("--todos", action="store_true", help="todas las filas de la hoja con carpeta (en cualquier ubicación)")
    p.add_argument("--en-venta", action="store_true",
                   help="con --todos: solo coches en venta (1_Ventas, Consignacion, IMPORTACION; no VENDIDOS ni Coches R)")
    p.add_argument("--limite", type=int, help="con --todos: procesar como mucho N coches")
    p.add_argument("--desde", help="con --todos: empezar en esta referencia (según el orden de la hoja)")
    p.add_argument("--sheet", metavar="XLSX", help="usar un export local xlsx en vez de la hoja de Google")
    p.add_argument("--ventas-dir", default=str(locate.DEFAULT_VENTAS_DIR), help="carpeta 1_Ventas de OneDrive")
    p.add_argument("--motor", choices=list(extract.MOTORES),
                   help=f"motor de lectura: claude (Claude Code, suscripción) u openai (defecto: FICHAS_MOTOR o {extract.DEFAULT_MOTOR})")
    p.add_argument("--modelo", help=f"modelo de OpenAI para --motor openai (defecto: FICHAS_MODEL o {extract.DEFAULT_MODEL})")
    p.add_argument("--sin-ia", action="store_true", help="no leer documentos con IA: solo ficha-expo + hoja")
    p.add_argument("--completo", action="store_true",
                   help="modo completo: enviar todas las imágenes (permiso + ficha técnica); por defecto es el modo "
                        "liviano (una sola imagen: permiso cara 1, o ficha cara 1 si no hay permiso)")
    p.add_argument("--solo-permiso", action="store_true", help=argparse.SUPPRESS)   # alias of the lean default
    p.add_argument("--sin-ventas", action="store_true", help="no consultar la hoja Ventas-Sevencars")
    p.add_argument("--forzar", action="store_true", help="ignorar la caché de extracciones")
    p.add_argument("--sin-fotos-caja", action="store_true", help="no detectar la caja de cambios por las fotos")
    p.add_argument("--cuotas", action="store_true",
                   help="tabla de financiación (tarifa, plazo, importe y cuota como Presupuesto_2025) y, con --escribir, "
                        "rellenar las AD vacías")
    p.add_argument("--solo-docs", action="store_true", help="solo listar los documentos encontrados por coche")
    p.add_argument("--debug", action="store_true", help="mostrar la petición a la IA (motor, imágenes, prompt) sin llamar")
    p.add_argument("--escribir", action="store_true", help="escribir en Base_Datos (solo con identidad confirmada)")
    p.add_argument("--corregir", action="store_true",
                   help="con --cuotas --escribir: sobrescribir las AD cuyo valor difiere del cálculo (antes muestra "
                        "la tabla antes/después y el recuento)")
    p.add_argument("--bastidores", action="store_true",
                   help="auditar la columna 'bastidor' (AE) contra el permiso de cada coche (usa la caché de lecturas)")
    p.add_argument("--corregir-identidad", nargs="*", metavar="REF",
                   help="proponer correcciones de A/D/E/AE (y X) desde la carpeta y el permiso para estas referencias "
                        "(o --matricula / --fila)")
    p.add_argument("--probar-sheet", action="store_true", help="probar la conexión con las hojas de Google (solo lectura)")
    p.add_argument("--restaurar", action="store_true",
                   help="restaurar una columna desde un export xlsx de respaldo: --columna kms --desde <xlsx> [--filas 29,37]")
    p.add_argument("--columna", help="con --restaurar: campo (kms, motor cv, cubicaje, caja, bastidor, matricula...) o letra")
    p.add_argument("--filas", help="con --restaurar: filas concretas separadas por coma (defecto: todas las que difieren)")
    p.add_argument("--reports-dir", default=str(report.REPORTS_DIR), help=argparse.SUPPRESS)
    return p


@dataclass
class RunState:
    args: argparse.Namespace
    sheet_src: object
    data: SheetData
    ventas: ventas_mod.VentasData | None
    model: str
    motor: str = extract.DEFAULT_MOTOR
    scope: str = extract.SCOPE_FULL
    folders: list = field(default_factory=list)
    quiet: bool = False
    ai_failed: bool = False
    errors: int = 0
    writes_done: int = 0
    audit: list = field(default_factory=list)


@dataclass
class CarResult:
    row: VehicleRow | None
    loc: locate.LocateResult
    docs: list
    ai_result: dict | None
    ai_status: str
    source: str                    # "caché" | "ia" | "sin-ia" | "fallo" | "sin documentos"
    identity: idm.IdentityCheck | None = None
    findings: list = field(default_factory=list)
    writes: list = field(default_factory=list)


# ------------------------------------------------------------------ setup
def load_sheets(args) -> tuple[object, SheetData, ventas_mod.VentasData | None]:
    sheet_src = open_sheet(args.sheet)
    data = sheet_src.load()
    say(f"Hoja Base_Datos: {sheet_src.label} — {len(data.rows)} filas con referencia")
    ventas_data = None
    if not args.sin_ventas:
        try:
            vs = ventas_mod.VentasSheet()
            ventas_data = vs.load()
            say(f"Hoja Ventas-Sevencars: {vs.title or 'ok'} — pestañas: {', '.join(ventas_data.tab_titles)}")
        except CredentialsMissing as exc:
            warn(f"Ventas-Sevencars no disponible (credenciales): {exc}. Se continúa sin Ventas.")
        except SheetError as exc:
            warn(f"{exc} Se continúa sin Ventas.")
    return sheet_src, data, ventas_data


def probar_sheet(args) -> int:
    say("Probando la conexión con Google Sheets (solo lectura)...")
    src = open_sheet(None)
    info = src.probe()
    say(f"Base_Datos: '{info['titulo']}' pestaña '{info['pestaña']}' ({info['filas']} filas x {info['columnas']} columnas)")
    data = src.load()
    say(f"  Filas con referencia: {len(data.rows)}")
    letter, msg = data.bastidor_target_column()
    say(f"  Columna 'bastidor': {msg}" + (f" → {letter}" if letter else ""))
    row = data.find_by_ref("1082")
    if row:
        say(f"  Fila 1082: referencia {row.referencia}, matrícula {row.matricula}, fecha {fmt_value(row.fecha_matriculacion)}, "
            f"bastidor {row.bastidor or '-'} (fila {row.row_number})")
    else:
        warn("  No se encontró la referencia 1082 en la pestaña.")
    vs = ventas_mod.VentasSheet()
    vdata = vs.load()
    say(f"Ventas-Sevencars: '{vs.title}' — pestañas: {', '.join(vdata.tab_titles)}")
    vrow = vdata.find("1082", row.matricula if row else None)
    say("  Fila 1082 en Ventas: " + (vrow.summary() if vrow else "no encontrada"))
    return EXIT_OK


# ---------------------------------------------------------------- targets
def select_rows(args, data: SheetData, refs: list[str] | None = None) -> list[VehicleRow]:
    """Rows named on the command line (referencias, --matricula, --fila). Duplicated referencias need --fila."""
    rows: list[VehicleRow] = []
    dup_refs, _ = data.duplicates()
    for ref in (refs if refs is not None else args.referencias):
        ref_c = locate.canonical_ref(ref)
        if ref_c in dup_refs:
            warn(f"La referencia {ref_c} está repetida en la hoja (filas {', '.join(map(str, dup_refs[ref_c]))}): "
                 f"usá --fila N o --matricula para elegir la fila.")
            continue
        row = data.find_by_ref(ref_c)
        if row is None:
            warn(f"'{ref}' no está en la hoja Base_Datos ({data.source_label}).")
            continue
        rows.append(row)
    for plate in args.matricula:
        row = data.find_by_plate(plate)
        if row is None:
            warn(f"La matrícula {normalize_plate(plate)} no está en la hoja Base_Datos.")
            continue
        rows.append(row)
    for n in args.fila:
        row = next((r for r in data.rows if r.row_number == n), None)
        if row is None:
            warn(f"La fila {n} no tiene referencia en la hoja.")
            continue
        rows.append(row)
    return rows


def select_rows_trust(args, data: SheetData, refs: list[str]) -> list[tuple[VehicleRow, str]]:
    """Like select_rows but remembers which key the user typed: 'ref' (referencia / --fila) or 'plate' (--matricula).
    For --corregir-identidad that key is the trusted one when the row's referencia and matrícula disagree."""
    out: list[tuple[VehicleRow, str]] = []
    for ref in refs:
        for row in select_rows(argparse.Namespace(referencias=[ref], matricula=[], fila=[]), data):
            out.append((row, "ref"))
    for plate in args.matricula:
        for row in select_rows(argparse.Namespace(referencias=[], matricula=[plate], fila=[]), data):
            out.append((row, "plate"))
    for n in args.fila:
        for row in select_rows(argparse.Namespace(referencias=[], matricula=[], fila=[n]), data):
            out.append((row, "ref"))
    return out


def locate_for_correction(folders, row: VehicleRow, trust: str) -> tuple[locate.LocateResult, str]:
    """Locate by the trusted key only (referencia or matrícula); fall back to the other one."""
    by_ref = locate.locate(folders, ref=row.referencia)
    by_plate = locate.locate(folders, plate=row.matricula) if row.matricula else locate.LocateResult(None)
    first, second = (by_ref, by_plate) if trust == "ref" else (by_plate, by_ref)
    if first.found:
        loc, how = first, ("referencia" if trust == "ref" else "matrícula")
    elif second.found:
        loc, how = second, ("matrícula" if trust == "ref" else "referencia") + " (la clave preferida no localizó carpeta)"
    else:
        return by_ref, "ninguna"
    # identity flags against the row (informative; identity_for_correction checks folder vs permiso)
    loc.ref = row.referencia
    loc.plate = row.matricula
    loc.ref_agrees = loc.folder in by_ref.candidates if by_ref.found or by_ref.candidates else False
    loc.plate_agrees = None if loc.folder.plate is None else locate.plate_matches(loc.folder.plate, row.matricula)
    return loc, how


def rows_todos(state: RunState) -> list[VehicleRow]:
    """Every Datos row with a folder (any location); --en-venta keeps only cars for sale; --desde / --limite."""
    args, data = state.args, state.data
    out: list[VehicleRow] = []
    started = args.desde is None
    for row in data.rows:
        if not started:
            if row.referencia == locate.canonical_ref(args.desde):
                started = True
            else:
                continue
        loc = locate.locate(state.folders, ref=row.referencia, plate=row.matricula)
        if not loc.found:
            continue
        if args.en_venta and not loc.folder.is_for_sale:
            continue
        out.append(row)
        if args.limite and len(out) >= args.limite:
            break
    return out


# ------------------------------------------------------------------- core
def print_docs(docs: list[Document]) -> None:
    if not docs:
        warn("  sin documentos reconocidos (ficha técnica / permiso / ficha-expo)")
        return
    for d in docs:
        say(f"  - {d.name}  [{KIND_LABELS[d.kind]}]  {d.size / 1024:.0f} KB")


def describe_request(state: RunState, req: extract.ExtractionRequest) -> list[str]:
    lines = req.describe()
    if state.motor == "claude":
        lines[0] = f"Motor: claude (Claude Code CLI {extract_claude.claude_bin()}; modelo: " \
                   f"{extract_claude.claude_model() or 'el que decida el CLI'})"
    else:
        lines[0] = f"Motor: openai · {lines[0]}"
    lines.insert(1, f"Alcance: {req.scope}")
    return lines


def read_documents(state: RunState, loc: locate.LocateResult, row_plate: str, docs: list[Document],
                   allow_ai: bool = True) -> tuple[dict | None, str, str]:
    """Extraction result from cache or AI. Returns (ai_result, status, source)."""
    args = state.args
    official = [d for d in docs if d.kind != KIND_EXPO]
    if args.sin_ia or not allow_ai:
        if not official:
            return None, "sin documentos oficiales", "sin documentos"
        key = extract.cache_key(loc.folder.name if loc.found else None, row_plate)
        cached = extract.load_cache(key, docs, force=False, scope=state.scope, legacy_key=row_plate)
        if cached and not args.sin_ia:
            return cached["resultado"], f"caché {cached.get('timestamp', '')} ({cached.get('alcance', 'completo')})", "caché"
        return None, "no solicitada (--sin-ia)" if args.sin_ia else "sin lectura en caché", "sin-ia"
    if not official:
        return None, "sin documentos oficiales", "sin documentos"
    key = extract.cache_key(loc.folder.name if loc.found else None, row_plate)
    cached = extract.load_cache(key, docs, force=args.forzar, scope=state.scope, legacy_key=row_plate)
    if cached:
        status = (f"caché {cached.get('timestamp', '')} (motor {cached.get('motor', 'openai')}, "
                  f"alcance {cached.get('alcance', 'completo')}, {cached.get('modelo', '')})")
        if not state.quiet:
            say("Extracción IA: usando " + status)
        return cached["resultado"], status, "caché"
    req = extract.build_request(docs, state.model, scope=state.scope)
    if not req.images:
        return None, "sin imagen utilizable (permiso/ficha cara 1)", "sin documentos"
    if args.debug and not state.quiet:
        for line in describe_request(state, req):
            say("  " + line)
    if not state.quiet:
        say(f"Extracción IA: motor {state.motor}, alcance {req.scope}, {len(req.images)} imágenes"
            + (f", modelo {req.model}" if state.motor == "openai" else "") + "...")
    try:
        t0 = time.monotonic()
        out = extract_claude.run_claude_extraction(req) if state.motor == "claude" else extract.run_extraction(req)
        result = out["resultado"]
        extract.save_cache(key, docs, out.get("modelo", req.model), result, out.get("uso"), motor=state.motor,
                           alcance=req.scope, plate=row_plate)
        if not state.quiet:
            say(f"  Extracción completada en {time.monotonic() - t0:.0f} s ({out.get('modelo', '')}).")
            if result.get("notas"):
                say("  Notas del modelo: " + result["notas"])
        return result, f"ok (motor {state.motor}, alcance {req.scope}, {out.get('modelo', req.model)})", "ia"
    except extract.ExtractionError as exc:
        warn(exc.user_message())
        state.ai_failed = True
        return None, f"falló ({exc.code})", "fallo"


def planned_writes(row: VehicleRow, data: SheetData, findings, identity: idm.IdentityCheck | None) -> list[CellWrite]:
    """Cells to fill (RELLENAR on an empty cell) — only when the identity is confirmed."""
    if identity is None or not identity.confirmed:
        return []
    columns = data.column_letters()
    targets: dict[str, str] = {}                 # creatable columns that do not exist yet -> planned letter
    for field_name in CREATABLE_COLUMNS:
        if not data.has_column(field_name):
            letter, _ = data.header_target(field_name, exclude=set(targets.values()))
            if letter:
                targets[field_name] = letter
    writes: list[CellWrite] = []
    for f in findings:
        if f.estado != cmp_mod.RELLENAR or f.field_name not in WRITABLE_FIELDS or f.valor_documento is None:
            continue
        if f.field_name in NEVER_WRITE_FIELDS or not row.is_empty(f.field_name):
            continue
        if data.is_formula_column(f.field_name) or data.cell_has_formula(row.row_number, f.field_name):
            f.nota = "; ".join(p for p in (f.nota, "columna calculada por fórmula en la hoja: no se escribe") if p)
            continue
        col = columns.get(f.field_name) or targets.get(f.field_name)
        if not col:
            continue
        value = f.valor_documento
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        elif f.field_name == "fecha_matriculacion":
            value = fmt_value(value)
        writes.append(CellWrite(row.row_number, f.field_name, col, value))
    if identity.matricula_a_rellenar and row.is_empty("matricula") and not any(w.field_name == "matricula" for w in writes):
        writes.insert(0, CellWrite(row.row_number, "matricula", columns.get("matricula", "D"), identity.matricula_a_rellenar))
    return writes


def header_writes_for(data: SheetData, writes: list[CellWrite], quiet: bool = False) -> tuple[list[CellWrite], list[CellWrite]]:
    """Header CellWrites for creatable columns used by `writes` that do not exist yet; drops writes whose header
    cannot be created (occupied cell). Returns (headers, writes)."""
    headers: list[CellWrite] = []
    reserved: set[str] = set()
    for field_name in CREATABLE_COLUMNS:
        if not any(w.field_name == field_name for w in writes) or data.has_column(field_name):
            continue
        try:
            hw = header_write_for(field_name, data, exclude=reserved)
        except SheetError as exc:
            warn(str(exc))
            writes = [w for w in writes if w.field_name != field_name]
            continue
        if hw is None:
            continue
        reserved.add(hw.column)
        headers.append(hw)
        beyond = col_index_of(hw.column) >= len(data.header)
        if not quiet:
            say(f"  La columna '{field_name}' no existe: se crearía la cabecera en {hw.a1}"
                + (f" (se añade la columna {hw.column} a la hoja)" if beyond else "") + ".")
    return headers, writes


def col_index_of(letter: str) -> int:
    from sheet import col_index
    return col_index(letter)


def caja_por_fotos(state: RunState, row: VehicleRow, loc: locate.LocateResult, findings: list) -> None:
    """Evidence 2-3 for the gearbox (eléctrico, fotos) when MODELO did not decide (compare left SIN DATO)."""
    f = next((x for x in findings if x.field_name == "caja"), None)
    if f is None or f.estado != cmp_mod.SIN_DATO or not row.is_empty("caja") or not loc.found or state.args.sin_ia:
        return
    fuel_f = next((x for x in findings if x.field_name == "combustible"), None)
    fuel = fuel_f.valor_documento if fuel_f is not None and fuel_f.estado != cmp_mod.REVISAR else None
    fotos_dir = fotos_mod.carpeta_fotos(loc.folder.path)
    fotos = fotos_mod.listar_fotos(fotos_dir) if fotos_dir else []
    if not state.quiet and fotos and not state.args.sin_fotos_caja:
        say(f"Caja de cambios: sin pista en MODELO; analizando {min(len(fotos), caja_fotos.MAX_FOTOS_PASO1)} fotos...")
    v = caja_fotos.detectar_caja(row.modelo, fuel, fotos, loc.folder.name,
                                 force=state.args.forzar, sin_fotos=state.args.sin_fotos_caja)
    fuente = f"fotos (confianza {v.confianza})" if v.fuente == "fotos" else v.fuente
    if v.escribible:
        f.estado, f.valor_documento, f.fuente, f.nota = cmp_mod.RELLENAR, v.caja, fuente, v.motivo or "detectada por fotos"
    else:
        f.estado, f.valor_documento, f.fuente = cmp_mod.REVISAR, (v.caja if v.decidido else None), fuente
        f.nota = v.para_verificar() or "sin confirmar"


def items_para_verificar(findings: list) -> list[str]:
    """REVISAR items marked 'sin confirmar' plus anything asking to 'confirmar' (hybrid total power)."""
    out = []
    for f in findings:
        if ("sin confirmar" in f.nota and f.estado == cmp_mod.REVISAR) or "confirmar la potencia total" in f.nota:
            out.append(f.nota if f.nota.startswith(f.campo + ":") else f"{f.campo}: {f.nota}")
    return out


def apply_writes(state: RunState, writes: list[CellWrite], header) -> list[str]:
    """Write (with --escribir on the live sheet) or describe the dry run. Returns the lines logged.
    `header`: None, one CellWrite or a list of header CellWrites."""
    lines: list[str] = []
    headers = header if isinstance(header, list) else ([header] if header else [])
    all_writes = headers + writes
    if not all_writes:
        if not state.quiet:
            say("  Nada que escribir en Base_Datos.")
        return lines
    if state.args.escribir:
        if not getattr(state.sheet_src, "can_write", False):
            warn("  --escribir ignorado: con --sheet (xlsx local) no se escribe nada.")
            return [w.describe() + " (no escrito: xlsx local)" for w in all_writes]
        refused = state.sheet_src.write(all_writes) or []
        for note in getattr(state.sheet_src, "last_notes", []):
            say(report.paint("  " + note, cmp_mod.RELLENAR))
        done = [w for w in all_writes if w not in refused]
        state.writes_done += len(done)
        for w in done:
            if w.row_number == 1 and w.field_name in CREATABLE_COLUMNS:
                state.data.reserve_header(w.field_name, w.column)      # later cars in this run see the new column
        for w in done:
            lines.append(w.describe())
            say(report.paint(f"  ✔ escrito: {w.describe()}", cmp_mod.OK))
        for w in refused:
            lines.append(w.describe() + " (NO escrito: la celda ya tiene contenido)")
            warn(f"  NO escrito (la celda ya tiene contenido): {w.describe()}")
    else:
        if not state.quiet:
            say("  Se escribiría en Base_Datos (usar --escribir para hacerlo):")
        for w in all_writes:
            lines.append(w.describe())
            if not state.quiet:
                say(f"    · {w.describe()}")
    return lines


def safety_findings(findings: list, data: SheetData, row: VehicleRow) -> None:
    """Duplicated referencia/matrícula inside Datos and VINs already present in another row -> REVISAR."""
    dup_refs, dup_plates = data.duplicates()
    if row.referencia in dup_refs:
        findings.append(cmp_mod.Finding("referencia repetida en Datos", "A", row.referencia, None, "hoja", cmp_mod.REVISAR,
                                        "filas " + ", ".join(str(n) for n in dup_refs[row.referencia])))
    if row.matricula and row.matricula in dup_plates:
        findings.append(cmp_mod.Finding("matrícula repetida en Datos", "D", row.matricula, None, "hoja", cmp_mod.REVISAR,
                                        "filas " + ", ".join(str(n) for n in dup_plates[row.matricula])))
    for f in findings:
        if f.field_name == "bastidor" and f.estado == cmp_mod.RELLENAR and f.valor_documento:
            others = data.rows_with_vin(str(f.valor_documento), except_row=row.row_number)
            if others:
                f.estado = cmp_mod.REVISAR
                filas = ", ".join(str(n) for n in [row.row_number] + others)
                f.nota = "; ".join(p for p in (f.nota, f"bastidor repetido en filas {filas}") if p)


def identity_finding(idc: idm.IdentityCheck) -> cmp_mod.Finding:
    return cmp_mod.Finding("identidad (carpeta + permiso)", "", None, None, "carpeta / permiso", idc.estado, idc.nota)


def print_datos_duplicates(data: SheetData) -> None:
    dup_refs, dup_plates = data.duplicates()
    for ref, filas in dup_refs.items():
        say(report.paint(f"REVISAR: referencia {ref} repetida en Datos (filas {', '.join(map(str, filas))})", cmp_mod.REVISAR))
    for plate, filas in dup_plates.items():
        say(report.paint(f"REVISAR: matrícula {plate} repetida en Datos (filas {', '.join(map(str, filas))})", cmp_mod.REVISAR))


def process_car(state: RunState, row: VehicleRow) -> CarResult:
    args, data = state.args, state.data
    q = state.quiet
    if not q:
        say()
        say(report.paint(f"######## {row.referencia} (fila {row.row_number}) ########", "bold"))
        say(f"Hoja: ref {row.referencia} · {row.modelo} · {row.matricula or '-'} · matriculado "
            f"{fmt_value(row.fecha_matriculacion)} · {fmt_value(row.kms)} km · bastidor {row.bastidor or '-'}")
    loc = locate.locate(state.folders, ref=row.referencia, plate=row.matricula)
    if not q:
        say(f"Carpeta: {loc.describe()}")
    docs: list[Document] = []
    if loc.found:
        docs = find_documents(loc.folder.path)
        if not q:
            say("Documentos:")
            print_docs(docs)
    else:
        state.errors += 1

    if args.solo_docs:
        if args.debug and docs:
            req = extract.build_request(docs, state.model, scope=state.scope)
            say("Petición a la IA (simulación, sin llamar):")
            for line in describe_request(state, req):
                say("  " + line)
        return CarResult(row, loc, docs, None, "solo-docs", "sin-ia")

    ai_result, ai_status, source = read_documents(state, loc, row.matricula, docs)

    vrow, vtab, vmatch = None, None, None
    if state.ventas is not None:
        vmatch = state.ventas.match(row.referencia, row.matricula)
        vrow = vmatch.row
        vtab = state.ventas.tab(vrow.tab) if vrow else None
        if vmatch.nota and not q:
            warn("Ventas: " + vmatch.nota)

    idc = idm.check_identity(row.matricula, loc, ai_result, has_docs=any(d.kind != KIND_EXPO for d in docs))
    columns = data.column_letters()
    for field_name in CREATABLE_COLUMNS:          # show the planned letter (AE / AF) even before the column exists
        if field_name not in columns:
            columns[field_name] = data.header_target(field_name, exclude=set(columns.values()))[0] or ""
    comparison = cmp_mod.compare(row, ai_result, columns, ventas_bastidor=vrow.bastidor if vrow else None)
    comparison.findings.insert(0, identity_finding(idc))
    safety_findings(comparison.findings, data, row)
    caja_por_fotos(state, row, loc, comparison.findings)
    para_verificar = items_para_verificar(comparison.findings)
    ventas_findings = []
    if state.ventas is not None:
        ds = cmp_mod.doc_summary(ai_result)
        ventas_findings = ventas_mod.compare_ventas(vrow, row, ds["vin"], ds["date"], ds["kms"], ds["kms_date"],
                                                    ds["marca"], ds["denominacion"], vtab, match=vmatch)
    if not q:
        report.print_findings(comparison.findings, "Documentos vs Base_Datos")
        if state.ventas is not None:
            report.print_findings(ventas_findings, "Ventas-Sevencars (solo lectura)", report.VENTAS_HEADERS)
        say()
        say("Resumen: " + report.summary_counts(comparison.findings + ventas_findings))
        report.print_para_verificar(para_verificar)

    writes_log: list[str] = []
    writes = planned_writes(row, data, comparison.findings, idc)
    if not idc.confirmed:
        pending = [f for f in comparison.findings if f.estado == cmp_mod.RELLENAR and f.field_name in WRITABLE_FIELDS]
        if not q:
            say(report.paint(f"  Sin escritura: {idc.estado} — {idc.nota}"
                             + (f" ({len(pending)} celda(s) RELLENAR retenidas)" if pending else ""), cmp_mod.REVISAR))
    else:
        headers, writes = header_writes_for(data, writes, quiet=q)
        try:
            writes_log = apply_writes(state, writes, headers)
        except SheetError as exc:
            warn(str(exc))
            state.errors += 1

    state.audit.append(idm.audit_row(row, loc, ai_result, vrow.bastidor if vrow else None))
    reports_dir = Path(args.reports_dir)
    md = report.write_markdown(
        reports_dir / f"{row.referencia}-{row.matricula or 'SIN-MATRICULA'}.md",
        {"referencia": row.referencia, "matricula": row.matricula, "hoja": data.source_label,
         "fila": row.row_number, "modelo": row.modelo,
         "carpeta": str(loc.folder.path) if loc.found else loc.describe(), "documentos": docs,
         "ventas_fila": vrow.summary() if vrow else ""},
        comparison, ventas_findings, writes_log, f"{ai_status} · identidad: {idc.estado}", para_verificar)
    csv_path = report.append_csv(reports_dir / "propuesta.csv", row.referencia, row.matricula,
                                 comparison.findings + ventas_findings)
    if not q:
        say(f"Informe: {md}  ·  CSV: {csv_path}")
    return CarResult(row, loc, docs, ai_result, ai_status, source, idc, comparison.findings, writes)


# ------------------------------------------------------------------ --todos
def write_audit_csv(path: Path, records: list[idm.AuditRecord]) -> Path:
    """Merge on (referencia, fila) so partial runs (--limite / --desde) accumulate."""
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: list[dict] = []
    keys = {(r.referencia, str(r.fila)) for r in records}
    if path.is_file():
        with path.open(newline="", encoding="utf-8") as fh:
            existing = [r for r in csv.DictReader(fh) if (r.get("referencia"), r.get("fila")) not in keys]
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=idm.AUDIT_FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in existing:
            w.writerow({k: r.get(k, "") for k in idm.AUDIT_FIELDS})
        for r in records:
            w.writerow(r.as_row())
    return path


def run_todos(state: RunState) -> None:
    rows = rows_todos(state)
    say(f"Coches a procesar: {len(rows)}" + (" (solo en venta)" if state.args.en_venta else "")
        + (f", alcance {state.scope}" if not state.args.sin_ia else ", sin IA"))
    state.quiet = not state.args.solo_docs
    for i, row in enumerate(rows, start=1):
        t0 = time.monotonic()
        res = process_car(state, row)
        idc = res.identity
        estado = idc.estado if idc else "-"
        rellenar = sum(1 for f in res.findings if f.estado == cmp_mod.RELLENAR and f.field_name in WRITABLE_FIELDS)
        say(report.paint(f"[{i}/{len(rows)}] ", "dim") + f"{row.referencia:<6} {row.matricula or '-':<8} "
            + report.paint(f"{estado:<24}", estado) + f" lectura: {res.source:<9} RELLENAR: {rellenar}"
            + (f"  escritas: {len(res.writes)}" if res.writes and state.args.escribir else "")
            + report.paint(f"  ({time.monotonic() - t0:.0f} s)", "dim"))
    state.quiet = False
    if state.audit:
        path = write_audit_csv(Path(state.args.reports_dir) / "auditoria.csv", state.audit)
        counts: dict[str, int] = {}
        for r in state.audit:
            counts[r.estado] = counts.get(r.estado, 0) + 1
        say("Auditoría: " + "  ".join(report.paint(f"{k}: {v}", k) for k, v in counts.items()))
        say(f"CSV: {path}")
    print_datos_duplicates(state.data)


# ------------------------------------------------------------------ --cuotas
def run_cuotas(state: RunState) -> int:
    data, args = state.data, state.args
    corregir = getattr(args, "corregir", False)
    rows = select_rows(args, data) if (args.referencias or args.matricula or args.fila) else data.rows
    plans = cuota_mod.planificar_cuotas(data, rows)
    say(f"Financiación como Presupuesto_2025 (ESTANDAR): tarifa de J o por antigüedad, descuento, "
        f"+{cuota_mod.GESTION_PREPARACION} € gestión, plazo más largo con edad + plazo ≤ {cuota_mod.VIDA_MAX_MESES} meses "
        f"· columna {data.column_letter('cuota') or 'AD (no existe)'}")
    table = [[p.referencia, str(p.fila), fmt_value(p.precio), p.tarifa or "", fmt_value(p.plazo), fmt_value(p.importe),
              fmt_value(p.cuota_actual), fmt_value(p.cuota), p.estado] for p in plans]
    report.print_table(["Ref", "Fila", "Precio contado", "Tarifa", "Plazo", "Importe", "AD actual", "Cuota", "Estado"],
                       table, [7, 5, 14, 11, 5, 8, 9, 6, 12], color_col=8, notes=[p.nota for p in plans])
    counts: dict[str, int] = {}
    for p in plans:
        counts[p.estado] = counts.get(p.estado, 0) + 1
    say("Resumen: " + "  ".join(report.paint(f"{k}: {v}", k) for k, v in counts.items()))
    if data.column_letter("cuota") is None:
        warn("La hoja no tiene la columna 'cuota': no se escribe nada.")
        return EXIT_ERROR
    if data.is_formula_column("cuota"):
        warn("La columna 'cuota' está calculada por fórmula: no se escribe nada.")
        return EXIT_ERROR
    if corregir:
        difs = [p for p in plans if p.estado == cuota_mod.DISCREPANCIA and p.cuota is not None]
        say()
        say(report.paint(f"== --corregir: {len(difs)} celda/s AD con otro valor que se sobrescribirían", "bold"))
        if difs:
            report.print_table(["Ref", "Fila", "AD antes", "AD después"],
                               [[p.referencia, str(p.fila), fmt_value(p.cuota_actual), fmt_value(p.cuota)] for p in difs],
                               [7, 5, 10, 10])
    try:
        apply_writes(state, cuota_mod.cuota_writes(data, plans, corregir=corregir), None)
    except SheetError as exc:
        warn(str(exc))
        return EXIT_ERROR
    return EXIT_OK


# ------------------------------------------------------------ --bastidores
def run_bastidores(state: RunState) -> int:
    """AE vs the permiso VIN of every row (cache only; run --todos --solo-permiso first to read the permisos)."""
    data = state.data
    letter, msg = data.bastidor_target_column()
    say(f"Columna 'bastidor' en Datos: {msg}" + (f" → {letter}" if letter else ""))
    results: list[idm.BastidorCheck] = []
    for row in data.rows:
        loc = locate.locate(state.folders, ref=row.referencia, plate=row.matricula)
        docs = find_documents(loc.folder.path) if loc.found else []
        ai_result, _, _ = read_documents(state, loc, row.matricula, docs, allow_ai=False)
        ventas_vin = None
        if state.ventas is not None:
            m = state.ventas.match(row.referencia, row.matricula)
            ventas_vin = m.row.bastidor if m.row else None
        results.append(idm.bastidor_check(row, loc, ai_result, ventas_vin))
    idm.flag_duplicate_vins(results)
    rows = [[r.referencia, r.matricula, r.bastidor_datos, r.bastidor_permiso, r.bastidor_ventas, r.estado] for r in results]
    report.print_table(["Ref", "Matrícula", "AE (Datos)", "permiso", "Ventas", "Estado"], rows,
                       [7, 9, 18, 18, 18, 24], color_col=5, notes=[r.nota for r in results])
    say()
    counts: dict[str, int] = {}
    for r in results:
        counts[r.estado] = counts.get(r.estado, 0) + 1
    say("Resumen: " + "  ".join(report.paint(f"{k}: {v}", k) for k, v in counts.items()))
    if counts.get(idm.SIN_PERMISO):
        say("  (SIN PERMISO = todavía no se leyó el permiso de ese coche: ejecutá --todos --solo-permiso y repetí)")
    print_datos_duplicates(data)
    path = Path(state.args.reports_dir) / "bastidores.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=idm.BASTIDOR_FIELDS)
        w.writeheader()
        for r in results:
            w.writerow(r.as_row())
    say(f"CSV: {path}")

    writes = [CellWrite(r.fila, "bastidor", letter, r.bastidor_permiso)
              for r in results if r.estado == idm.RELLENAR and letter]
    col_d = data.column_letter("matricula") or "D"
    writes += [CellWrite(r.fila, "matricula", col_d, r.matricula_a_rellenar)
               for r in results if r.matricula_a_rellenar and r.estado in (idm.RELLENAR, idm.OK)]
    header = None
    if writes and not data.has_bastidor_column:
        try:
            header = header_write_for_bastidor(data)
            say(f"La columna 'bastidor' no existe: se crearía la cabecera en {header.a1}.")
        except SheetError as exc:
            warn(str(exc))
            return EXIT_ERROR
    try:
        apply_writes(state, writes, header)
    except SheetError as exc:
        warn(str(exc))
        return EXIT_ERROR
    return EXIT_OK


# ------------------------------------------------------ --corregir-identidad
def correction_writes(props: list, row_number: int) -> list[CellWrite]:
    """CellWrites for the writable corrections. CORREGIR (explicit, two-source) may overwrite; RELLENAR may not."""
    writes = []
    for c in props:
        if not c.writable or not c.columna or c.field_name in NEVER_WRITE_FIELDS:
            continue
        value = c.despues
        if c.field_name == "fecha_matriculacion":
            value = fmt_value(value)
        elif c.field_name == "referencia" and str(value).isdigit():
            value = int(value)
        writes.append(CellWrite(row_number, c.field_name, c.columna, value, allow_overwrite=(c.estado == idm.CORREGIR)))
    return writes


# ---------------------------------------------------------------- --restaurar
@dataclass
class RestoreEntry:
    row_number: int
    referencia: str
    column: str
    ahora: object
    respaldo: object
    accion: str            # "vaciar" (formula column: clear the literal so the formula recalculates) | "escribir"
    nota: str = ""


def restore_plan(live: SheetData, backup: SheetData, field_name: str, rows: list[int] | None = None) -> list[RestoreEntry]:
    """Cells of `field_name` whose live value differs from the backup. Formula-driven column -> the literal is cleared
    (the formula recalculates); otherwise the backup value is written back. Rows are matched by row number and
    verified by referencia."""
    col = live.column_letter(field_name)
    if col is None:
        raise SheetError(f"La hoja en vivo no tiene la columna '{field_name}'")
    formula_col = live.is_formula_column(field_name)
    entries: list[RestoreEntry] = []
    for lrow in live.rows:
        if rows and lrow.row_number not in rows:
            continue
        brow = backup.row_by_number(lrow.row_number)
        if formula_col:
            # ARRAYFORMULA spill: EVERY literal must be cleared, whatever the backup says (else the formula stays broken)
            now = lrow.raw.get(field_name)
            if now is None or live.cell_has_formula(lrow.row_number, field_name):
                continue
            then = brow.raw.get(field_name) if (brow is not None and brow.referencia == lrow.referencia) else None
            entries.append(RestoreEntry(lrow.row_number, lrow.referencia, col, now, then, "vaciar",
                                        "columna calculada por fórmula: se vacía la celda y la fórmula vuelve a dar el valor"
                                        + ("" if then is not None else " (sin valor de respaldo comparable)")))
            continue
        if brow is None:
            if rows:
                entries.append(RestoreEntry(lrow.row_number, lrow.referencia, col, lrow.raw.get(field_name), None, "omitir",
                                            "la fila no existe en el respaldo"))
            continue
        if brow.referencia != lrow.referencia:
            if rows:
                entries.append(RestoreEntry(lrow.row_number, lrow.referencia, col, lrow.raw.get(field_name),
                                            brow.raw.get(field_name), "omitir",
                                            f"referencia distinta en el respaldo ({brow.referencia}): no se restaura"))
            continue
        now, then = lrow.raw.get(field_name), brow.raw.get(field_name)
        same = fmt_value(parse_number(now) if parse_number(now) is not None else now) == \
               fmt_value(parse_number(then) if parse_number(then) is not None else then)
        if not same and then is not None:
            entries.append(RestoreEntry(lrow.row_number, lrow.referencia, col, now, then, "escribir"))
    return entries


def run_restaurar(state: RunState) -> int:
    args, live = state.args, state.data
    if not args.columna or not args.desde:
        say("Uso: --restaurar --columna kms --desde data/base_datos_vehiculos.xlsx [--filas 29,37] [--escribir]")
        return EXIT_ERROR
    field_name = None
    wanted = args.columna.strip()
    for f, letter in live.column_letters().items():
        if wanted.lower() == f.lower() or wanted.upper() == letter or wanted.lower() == FIELD_LABEL(f).lower():
            field_name = f
            break
    if field_name is None:
        say(f"Columna desconocida: {wanted}. Opciones: " + ", ".join(f"{f} ({l})" for f, l in live.column_letters().items()))
        return EXIT_ERROR
    backup = XlsxSheet(args.desde).load()
    rows = [int(x) for x in args.filas.split(",")] if args.filas else None
    entries = restore_plan(live, backup, field_name, rows)
    say(f"Restaurar columna {live.column_letter(field_name)} ({field_name}) desde {args.desde}"
        + (" — columna calculada por fórmula (ARRAYFORMULA): se vacían las celdas con valores literales"
           if live.is_formula_column(field_name) else ""))
    if not entries:
        say("  Nada que restaurar: la hoja en vivo ya coincide con el respaldo.")
        return EXIT_OK
    table = [[str(e.row_number), e.referencia, e.column, fmt_value(e.ahora), fmt_value(e.respaldo), e.accion] for e in entries]
    report.print_table(["Fila", "Ref", "Col", "Ahora (hoja)", "Respaldo", "Acción"], table, [5, 7, 4, 16, 16, 8],
                       notes=[e.nota for e in entries])
    writes = []
    for e in entries:
        if e.accion == "vaciar":
            writes.append(CellWrite(e.row_number, field_name, e.column, "", allow_overwrite=True))
        elif e.accion == "escribir":
            value = e.respaldo
            if isinstance(value, float) and value.is_integer():
                value = int(value)
            elif field_name == "fecha_matriculacion":
                value = fmt_value(value)
            writes.append(CellWrite(e.row_number, field_name, e.column, value, allow_overwrite=True))
    try:
        apply_writes(state, writes, None)
    except SheetError as exc:
        warn(str(exc))
        return EXIT_ERROR
    return EXIT_OK


def FIELD_LABEL(field_name: str) -> str:
    from sheet import FIELD_LABELS
    return FIELD_LABELS.get(field_name, field_name)


def run_corregir(state: RunState, rows: list[tuple[VehicleRow, str]]) -> None:
    data, args = state.data, state.args
    columns = data.column_letters()
    columns.setdefault("referencia", "A")
    if "bastidor" not in columns:
        columns["bastidor"] = data.bastidor_target_column()[0] or ""
    for row, trust in rows:
        say()
        say(report.paint(f"######## corregir identidad: fila {row.row_number} (ref {row.referencia}, {row.matricula or '-'}) ########", "bold"))
        say(f"Hoja: {row.modelo} · matriculado {fmt_value(row.fecha_matriculacion)} · {fmt_value(row.kms)} km · bastidor {row.bastidor or '-'}")
        loc, how = locate_for_correction(state.folders, row, trust)
        say(f"Carpeta (localizada por {how}): {loc.describe()}")
        docs = find_documents(loc.folder.path) if loc.found else []
        if docs:
            print_docs(docs)
        ai_result, ai_status, _ = read_documents(state, loc, row.matricula, docs)
        p = idm.permiso_data(ai_result)
        ventas_vin = None
        if state.ventas is not None and loc.found:
            m = state.ventas.match(loc.folder.ref_from_prefix() or row.referencia, (p.plate if p else None) or row.matricula)
            ventas_vin = m.row.bastidor if m.row else None
            if m.nota:
                say("Ventas: " + m.nota)
        estado, nota, props = idm.corrections(row, loc, ai_result, ventas_vin, columns, escribir=args.escribir)
        say("Identidad: " + report.paint(estado, estado) + f" — {nota}")
        if p:
            say(f"Permiso: matrícula {p.plate or '-'} · bastidor {p.vin or '-'} · fecha {fmt_value(p.date) or '-'} ({p.date_kind or '-'})"
                + (f" · kms {p.kms} a fecha {p.kms_date}" if p.kms else "") + f" · {p.marca or ''} {p.modelo or ''}")
        if not props:
            say("  " + ("Sin correcciones: la fila ya coincide con la carpeta y el permiso." if estado == idm.OK
                        else "Sin correcciones posibles."))
            continue
        say()
        say(report.paint("== Antes / después", "bold"))
        table = [[c.campo, c.columna, fmt_value(c.antes), fmt_value(c.despues), c.fuente, c.estado] for c in props]
        report.print_table(["Campo", "Col", "Antes", "Después", "Fuente", "Estado"], table, [20, 5, 18, 18, 34, 10],
                           color_col=5, notes=[c.nota for c in props])
        writes = correction_writes(props, row.row_number)
        try:
            apply_writes(state, writes, None)
        except SheetError as exc:
            warn(str(exc))
            state.errors += 1


# ------------------------------------------------------------------- main
def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.corregir and not args.cuotas:
        say("--corregir solo va con --cuotas (y con --escribir para aplicarlo).")
        return EXIT_ERROR
    try:
        sys.stdout.reconfigure(line_buffering=True)     # progress visible when redirected to a file
    except (AttributeError, ValueError):
        pass
    extract.load_env()
    model = args.modelo or extract.default_model()

    try:
        if args.probar_sheet:
            return probar_sheet(args)
        sheet_src, data, ventas_data = load_sheets(args)
    except CredentialsMissing as exc:
        say(credentials_help(exc))
        return EXIT_CREDENTIALS
    except SheetError as exc:
        say(f"Error: {exc}")
        return EXIT_ERROR

    state = RunState(args=args, sheet_src=sheet_src, data=data, ventas=ventas_data, model=model,
                     motor=args.motor or extract.default_motor(),
                     scope=extract.SCOPE_FULL if args.completo else extract.SCOPE_LEAN)
    try:
        state.folders = locate.scan_folders(args.ventas_dir)
    except FileNotFoundError as exc:
        say(f"Error: {exc}")
        return EXIT_ERROR

    if args.restaurar:
        return run_restaurar(state)
    if args.cuotas:
        return run_cuotas(state)
    if args.bastidores:
        return run_bastidores(state)

    if not args.sin_ia and not args.solo_docs:
        say(f"Motor IA: {state.motor}" + (f" (modelo {model})" if state.motor == "openai" else " (Claude Code)")
            + f" · alcance: {state.scope}")

    if args.corregir_identidad is not None:
        pairs = select_rows_trust(args, data, args.corregir_identidad)
        if not pairs:
            say("Indicá referencias, --matricula o --fila para --corregir-identidad.")
            return EXIT_ERROR
        run_corregir(state, pairs)
    elif args.todos:
        run_todos(state)
    else:
        rows = select_rows(args, data)
        if not rows:
            say("Indicá una referencia, --matricula, --fila, --todos, --bastidores, --corregir-identidad o --probar-sheet.  (-h para ayuda)")
            return EXIT_ERROR
        for row in rows:
            try:
                process_car(state, row)
            except SheetError as exc:
                warn(str(exc))
                state.errors += 1

    say()
    if state.ai_failed:
        say(report.paint("Terminado con fallos de la IA: los informes se generaron al nivel --sin-ia.", cmp_mod.REVISAR))
        return EXIT_AI
    if state.errors:
        say(report.paint(f"Terminado con {state.errors} problema(s).", cmp_mod.DISCREPANCIA))
        return EXIT_ERROR
    say(report.paint("Terminado.", cmp_mod.OK))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
