"""Modo liviano: una sola imagen (permiso cara 1 o ficha cara 1), caché y turnos."""
import json
from pathlib import Path

import pytest

import extract_claude
from docs import KIND_FICHA, KIND_PERMISO, Document, document_side, pick_lean_document
from extract import SCOPE_FULL, SCOPE_LEAN, SCOPE_PERMISO, ExtractionRequest, load_cache, save_cache
from docs import PreparedImage


def d(name, kind):
    return Document(Path("/x") / name, kind, 1.0, 10)


@pytest.mark.parametrize("name,side", [
    ("Permiso de circulación cara 1.jpeg", "front"), ("permiso de circulación cara 2.jpeg", "back"),
    ("ficha técnica parte delantera.jpeg", "front"), ("ficha técnica parte trasera.jpeg", "back"),
    ("Permiso de circulación cara 1 Seven.jpeg", "front"), ("permiso-circulacion.pdf", None),
    ("duplicado-tarjetaItv-0.pdf", None), ("Permiso circulación.jpeg", None), ("FICHA TÉCNICA CARA 2.jpeg", "back"),
    ("ficha cara1.jpg", "front"), ("permiso reverso.jpg", "back"),
])
def test_document_side(name, side):
    assert document_side(name) == side


def test_pick_lean_prefers_permiso_cara_1():
    docs = [d("Ficha técnica cara 1.jpeg", KIND_FICHA), d("Ficha técnica cara 2.jpeg", KIND_FICHA),
            d("Permiso de circulación cara 2.jpeg", KIND_PERMISO), d("Permiso de circulación cara 1.jpeg", KIND_PERMISO)]
    assert pick_lean_document(docs).name == "Permiso de circulación cara 1.jpeg"


def test_pick_lean_permiso_sin_lado_y_provisional():
    docs = [d("provisional-circulacion.pdf", KIND_PERMISO), d("permiso-circulacion.pdf", KIND_PERMISO),
            d("Ficha técnica cara 1.jpeg", KIND_FICHA)]
    assert pick_lean_document(docs).name == "permiso-circulacion.pdf"
    assert pick_lean_document([d("Permiso circulación.jpeg", KIND_PERMISO)]).name == "Permiso circulación.jpeg"


def test_pick_lean_nunca_una_cara_2():
    docs = [d("Permiso de circulación cara 2.jpeg", KIND_PERMISO), d("duplicado-tarjetaItv-0.pdf", KIND_FICHA),
            d("FICHA TÉCNICA CARA 2.jpeg", KIND_FICHA)]
    assert pick_lean_document(docs).name == "duplicado-tarjetaItv-0.pdf"
    assert pick_lean_document([d("Permiso de circulación cara 2.jpeg", KIND_PERMISO)]) is None
    assert pick_lean_document([d("ficha-expo.pdf", "expo")]) is None
    assert pick_lean_document([]) is None


def test_pick_lean_ficha_delantera_cuando_no_hay_permiso():
    docs = [d("ficha técnica parte trasera.jpeg", KIND_FICHA), d("ficha técnica parte delantera.jpeg", KIND_FICHA)]
    assert pick_lean_document(docs).name == "ficha técnica parte delantera.jpeg"


def test_cache_liviano(tmp_path):
    docs = [d("p.pdf", KIND_PERMISO)]
    save_cache("k", docs, "m", {"x": 1}, cache_dir=tmp_path, alcance=SCOPE_LEAN)
    assert load_cache("k", docs, cache_dir=tmp_path, scope=SCOPE_LEAN)["resultado"] == {"x": 1}
    assert load_cache("k", docs, cache_dir=tmp_path, scope=SCOPE_PERMISO)["resultado"] == {"x": 1}
    assert load_cache("k", docs, cache_dir=tmp_path, scope=SCOPE_FULL) is None        # upgraded only with --completo
    save_cache("k", docs, "m", {"x": 2}, cache_dir=tmp_path, alcance=SCOPE_FULL)
    assert load_cache("k", docs, cache_dir=tmp_path, scope=SCOPE_LEAN)["resultado"] == {"x": 2}


def test_claude_lean_max_turns_and_prompt(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        from types import SimpleNamespace
        return SimpleNamespace(returncode=0, stdout=json.dumps({"structured_output": {"ok": 1}}), stderr="")
    monkeypatch.setattr(extract_claude.subprocess, "run", fake_run)
    img = PreparedImage("Permiso de circulación cara 1.jpeg", b"\xff\xd8\xff", 10, 10)
    lean = ExtractionRequest(model="x", images=[img], prompt="PROMPT-LIVIANO", scope=SCOPE_LEAN)
    extract_claude.run_claude_extraction(lean)
    cmd = calls[-1]
    assert cmd[cmd.index("--max-turns") + 1] == "4" and "--model" not in cmd
    assert cmd[2].startswith("PROMPT-LIVIANO") and "Read" in cmd[2] and len(cmd[2]) < 600
    full = ExtractionRequest(model="x", images=[img], prompt="P", scope=SCOPE_FULL, image_kinds=["PERMISO"])
    extract_claude.run_claude_extraction(full, model="sonnet")
    cmd = calls[-1]
    assert cmd[cmd.index("--max-turns") + 1] == "12" and cmd[cmd.index("--model") + 1] == "sonnet"
