"""report.py: CSV accumulation, Markdown report and console helpers."""
import csv
from pathlib import Path

from compare import DISCREPANCIA, OK, RELLENAR, Comparison, Finding, SourceValues
from conftest import VIN_A
from docs import Document
from report import CSV_FIELDS, append_csv, paint, summary_counts, write_bastidores_csv, write_markdown
from ventas import BastidorResult


def finding(campo, estado, hoja=None, doc=None, fuente="ficha técnica", col="Z", nota=""):
    return Finding(campo=campo, columna_sheet=col, valor_sheet=hoja, valor_documento=doc, fuente=fuente,
                   estado=estado, nota=nota)


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


# ------------------------------------------------------------------- append_csv
def test_append_csv_replaces_rows_of_same_referencia(tmp_path):
    path = tmp_path / "propuesta.csv"
    append_csv(path, "1082", "9028LXG", [finding("cubicaje", RELLENAR, doc=1600),
                                         finding("caja", RELLENAR, doc="Automático", col="AA")])
    append_csv(path, "1085", "5475LKK", [finding("kms", OK, hoja=100, doc=100, col="X")])
    append_csv(path, "1082", "9028LXG", [finding("cubicaje", OK, hoja=1600, doc=1600, nota="ya no se escribe")])

    header = path.read_text(encoding="utf-8").splitlines()[0]
    assert header == "referencia,matricula,campo,columna_sheet,valor_sheet,valor_documento,fuente,estado"
    assert header.split(",") == CSV_FIELDS
    rows = read_csv(path)
    assert [(r["referencia"], r["campo"], r["estado"]) for r in rows] == [("1085", "kms", "OK"), ("1082", "cubicaje", "OK")]
    assert rows[1] == {"referencia": "1082", "matricula": "9028LXG", "campo": "cubicaje", "columna_sheet": "Z",
                       "valor_sheet": "1600", "valor_documento": "1600", "fuente": "ficha técnica", "estado": "OK"}


def test_append_csv_creates_parent_dir_and_formats_values(tmp_path):
    path = tmp_path / "sub" / "propuesta.csv"
    append_csv(path, "D5", "1111BBB", [finding("motor cv", DISCREPANCIA, hoja=110.0, doc=116)])
    rows = read_csv(path)
    assert rows[0]["valor_sheet"] == "110" and rows[0]["valor_documento"] == "116"
    assert "nota" not in rows[0]


# --------------------------------------------------------------- write_markdown
def make_comparison() -> Comparison:
    return Comparison(findings=[finding("cubicaje", RELLENAR, doc=1600, fuente="ficha-expo", nota="fuente | baja")],
                      sources=[SourceValues("cilindrada (P.1)", hoja=None, ficha=1580, permiso=1580)],
                      hybrid=True)


def test_write_markdown_with_ventas_section(tmp_path):
    ventas = [Finding(campo="bastidor", columna_sheet="STOCK!F", valor_sheet=VIN_A, valor_documento=VIN_A,
                      fuente="ventas", estado=OK, nota="Ventas vs ficha")]
    info = {"referencia": "1082", "matricula": "9028LXG", "hoja": "test", "fila": 2, "modelo": "KIA XCeed",
            "carpeta": "/fake/82-Kia Xceed-9028LXG", "ventas_fila": "pestaña 'STOCK' fila 2",
            "documentos": [Document(path=Path("Ficha técnica cara 1.jpeg"), kind="ficha")]}
    path = write_markdown(tmp_path / "reports" / "1082.md", info, make_comparison(), ventas,
                          ["fila 2, columna Z: 1600"], "ok (caché)")
    text = path.read_text(encoding="utf-8")
    assert text.startswith("# Verificación 1082 – 9028LXG")
    assert "- Documentos: Ficha técnica cara 1.jpeg [ficha]" in text
    assert "- Extracción IA: ok (caché)" in text
    assert "| cilindrada (P.1) |  | 1580 | 1580 |" in text
    assert "## Hallazgos" in text
    assert "| cubicaje | Z |  | 1600 | ficha-expo | **RELLENAR** | fuente \\| baja |" in text
    assert "## Ventas-Sevencars (solo lectura)" in text
    assert "Fila encontrada: pestaña 'STOCK' fila 2" in text
    assert f"| bastidor | STOCK!F | {VIN_A} | {VIN_A} | **OK** | Ventas vs ficha |" in text
    assert "- fila 2, columna Z: 1600" in text
    assert "Vehículo híbrido" in text


def test_write_markdown_without_ventas(tmp_path):
    cmp = make_comparison()
    cmp.hybrid = False
    path = write_markdown(tmp_path / "1082.md", {"referencia": "1082"}, cmp, [], [], "sin IA")
    text = path.read_text(encoding="utf-8")
    assert "Ventas-Sevencars" not in text
    assert "- Documentos: ninguna" in text or "- Documentos: ninguno" in text
    assert "- ninguna" in text
    assert "híbrido" not in text
    assert "- Carpeta: no encontrada" in text


# --------------------------------------------------------- write_bastidores_csv
def test_write_bastidores_csv(tmp_path):
    results = [BastidorResult("1082", "9028LXG", 2, "", VIN_A, "RELLENAR", "", "STOCK"),
               BastidorResult("1999", "0000ZZZ", 3, "", "", "NO ENCONTRADO", "no está en Ventas-Sevencars")]
    path = write_bastidores_csv(tmp_path / "out" / "bastidores.csv", results)
    with path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.reader(fh))
    assert rows[0] == ["referencia", "matricula", "bastidor_datos", "bastidor_ventas", "estado", "nota"]
    assert rows[1] == ["1082", "9028LXG", "", VIN_A, "RELLENAR", ""]
    assert rows[2] == ["1999", "0000ZZZ", "", "", "NO ENCONTRADO", "no está en Ventas-Sevencars"]


# ------------------------------------------------------------------- console
def test_summary_counts_and_paint_without_tty(monkeypatch):
    monkeypatch.setenv("NO_COLOR", "1")
    findings = [finding("a", OK), finding("b", RELLENAR), finding("c", RELLENAR)]
    assert summary_counts(findings) == "OK: 1  RELLENAR: 2"
    assert paint("x", OK) == "x"
