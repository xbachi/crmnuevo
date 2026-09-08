"""Console output (colored tables), per-car Markdown report and CSV accumulation."""
from __future__ import annotations

import csv
import os
import sys
from datetime import datetime
from pathlib import Path

from common import PROJECT_DIR, fmt_value
from compare import DISCREPANCIA, OK, RELLENAR, REVISAR, SIN_DATO, Comparison, Finding

REPORTS_DIR = PROJECT_DIR / "reports"
CSV_FIELDS = ["referencia", "matricula", "campo", "columna_sheet", "valor_sheet", "valor_documento", "fuente", "estado"]

_ANSI = {
    OK: "\033[32m", RELLENAR: "\033[36m", DISCREPANCIA: "\033[31m", SIN_DATO: "\033[90m", REVISAR: "\033[33m",
    "NO ENCONTRADO": "\033[35m", "bold": "\033[1m", "dim": "\033[2m", "reset": "\033[0m",
}


def use_color() -> bool:
    return sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def paint(text: str, key: str) -> str:
    if not use_color() or key not in _ANSI:
        return text
    return f"{_ANSI[key]}{text}{_ANSI['reset']}"


def _cut(text: str, width: int) -> str:
    text = "" if text is None else str(text).replace("\n", " ")
    return text if len(text) <= width else text[: width - 1] + "…"


def print_table(headers: list[str], rows: list[list[str]], widths: list[int], color_col: int | None = None,
                notes: list[str] | None = None) -> None:
    line = "  ".join(_cut(h, w).ljust(w) for h, w in zip(headers, widths))
    print(paint(line, "bold"))
    print(paint("-" * len(line), "dim"))
    for i, row in enumerate(rows):
        cells = []
        for j, (value, w) in enumerate(zip(row, widths)):
            cell = _cut(value, w).ljust(w)
            if color_col is not None and j == color_col:
                cell = paint(cell, str(value))
            cells.append(cell)
        print("  ".join(cells))
        if notes and notes[i]:
            print(paint("      ↳ " + notes[i], "dim"))


FINDINGS_HEADERS = ["Campo", "Col", "Hoja", "Documento", "Fuente", "Estado"]
VENTAS_HEADERS = ["Campo", "Col (Ventas)", "Referencia", "Ventas", "Fuente", "Estado"]


def print_findings(findings: list[Finding], title: str = "Comparación", headers: list[str] | None = None) -> None:
    print()
    print(paint(f"== {title}", "bold"))
    rows = [[f.campo, f.columna_sheet, fmt_value(f.valor_sheet), fmt_value(f.valor_documento), f.fuente, f.estado]
            for f in findings]
    print_table(headers or FINDINGS_HEADERS, rows, [24, 12, 20, 22, 30, 13], color_col=5,
                notes=[f.nota for f in findings])


def print_para_verificar(items: list[str]) -> None:
    if not items:
        return
    print()
    print(paint("== PARA VERIFICAR", DISCREPANCIA))
    for item in items:
        print(paint("  ! " + item, REVISAR))


def summary_counts(findings: list[Finding]) -> str:
    order = [OK, RELLENAR, DISCREPANCIA, REVISAR, SIN_DATO, "NO ENCONTRADO"]
    counts = {s: sum(1 for f in findings if f.estado == s) for s in order}
    return "  ".join(paint(f"{s}: {n}", s) for s, n in counts.items() if n)


# ---------------------------------------------------------------- markdown
def _md_cell(value) -> str:
    return fmt_value(value).replace("|", "\\|").replace("\n", " ")


def write_markdown(path: Path, info: dict, cmp: Comparison, ventas_findings: list[Finding],
                   writes_preview: list[str], ai_status: str, para_verificar: list[str] | None = None) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"# Verificación {info.get('referencia', '')} – {info.get('matricula', '')}", ""]
    lines.append(f"- Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    lines.append(f"- Hoja: {info.get('hoja', '')}  (fila {info.get('fila', '')})")
    lines.append(f"- MODELO en hoja: {info.get('modelo', '')}")
    lines.append(f"- Carpeta: {info.get('carpeta', 'no encontrada')}")
    lines.append(f"- Extracción IA: {ai_status}")
    docs = info.get("documentos") or []
    lines.append("- Documentos: " + (", ".join(f"{d.name} [{d.kind}]" for d in docs) if docs else "ninguno"))
    lines.append("")
    lines.append("## Valores por fuente")
    lines.append("")
    lines.append("| Campo | Hoja (Base_Datos) | Permiso | Ficha técnica |")
    lines.append("|---|---|---|---|")
    for s in cmp.sources:
        lines.append(f"| {s.campo} | {_md_cell(s.hoja)} | {_md_cell(s.permiso)} | {_md_cell(s.ficha)} |")
    lines.append("")
    lines.append("## Hallazgos")
    lines.append("")
    lines.append("| Campo | Col | Hoja | Documento | Fuente | Estado | Nota |")
    lines.append("|---|---|---|---|---|---|---|")
    for f in cmp.findings:
        lines.append(f"| {f.campo} | {f.columna_sheet} | {_md_cell(f.valor_sheet)} | {_md_cell(f.valor_documento)} | "
                     f"{f.fuente} | **{f.estado}** | {_md_cell(f.nota)} |")
    lines.append("")
    if ventas_findings:
        lines.append("## Ventas-Sevencars (solo lectura)")
        lines.append("")
        if info.get("ventas_fila"):
            lines.append(f"Fila encontrada: {info['ventas_fila']}")
            lines.append("")
        lines.append("| Campo | Col (Ventas) | Referencia (doc/Base_Datos) | Valor en Ventas | Estado | Nota |")
        lines.append("|---|---|---|---|---|---|")
        for f in ventas_findings:
            lines.append(f"| {f.campo} | {f.columna_sheet} | {_md_cell(f.valor_sheet)} | {_md_cell(f.valor_documento)} | "
                         f"**{f.estado}** | {_md_cell(f.nota)} |")
        lines.append("")
    lines.append("## Celdas a rellenar en Base_Datos")
    lines.append("")
    if writes_preview:
        lines.extend(f"- {w}" for w in writes_preview)
    else:
        lines.append("- ninguna")
    lines.append("")
    if cmp.hybrid:
        lines.append("> Vehículo híbrido: la ficha técnica indica la potencia del motor térmico; "
                     "la potencia comercial del sistema puede ser mayor.")
        lines.append("")
    if para_verificar:
        lines.append("## PARA VERIFICAR")
        lines.append("")
        lines.extend(f"- {item}" for item in para_verificar)
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


# --------------------------------------------------------------------- csv
def append_csv(path: Path, referencia: str, matricula: str, findings: list[Finding]) -> Path:
    """Accumulate rows; previous rows of the same referencia are replaced."""
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: list[dict] = []
    if path.is_file():
        with path.open(newline="", encoding="utf-8") as fh:
            existing = [r for r in csv.DictReader(fh) if r.get("referencia") != str(referencia)]
    new_rows = []
    for f in findings:
        row = f.as_row()
        row.pop("nota", None)
        row.update({"referencia": referencia, "matricula": matricula})
        new_rows.append(row)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for r in existing + new_rows:
            writer.writerow({k: r.get(k, "") for k in CSV_FIELDS})
    return path


def write_bastidores_csv(path: Path, results) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["referencia", "matricula", "bastidor_datos", "bastidor_ventas", "estado", "nota"])
        for r in results:
            writer.writerow([r.referencia, r.matricula, r.bastidor_datos, r.bastidor_ventas, r.estado, r.nota])
    return path
