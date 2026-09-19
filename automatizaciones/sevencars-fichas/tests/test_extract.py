"""extract.py without the API: request building, cache, schema and error messages."""
import os

import pytest

from conftest import write_jpeg, write_pdf
from docs import find_documents
from extract import (EXTRACTION_SCHEMA, SCOPE_FULL, ExtractionError, ExtractionRequest, build_request, cache_path,
                     docs_fingerprint, load_cache, run_extraction, save_cache)

RESULT = {"ficha_tecnica": {"presente": True}, "permiso_circulacion": {"presente": True}, "notas": ""}


@pytest.fixture
def car_folder(tmp_path):
    write_jpeg(tmp_path / "Ficha técnica cara 1.jpeg", size=(120, 80))
    write_pdf(tmp_path / "permiso-circulacion.pdf", "PERMISO DE CIRCULACION\nA 9028LXG\nE WAUZZZGA2KA020714")
    write_pdf(tmp_path / "ficha-expo.pdf", "Kia Xceed\nPotencia: 141 CV\nCubicaje: 1600")
    return tmp_path


# ---------------------------------------------------------------- build_request
def test_build_request_images_and_prompt(car_folder):
    docs = find_documents(car_folder)
    req = build_request(docs, model="modelo-test", scope=SCOPE_FULL)
    assert req.model == "modelo-test"
    assert len(req.images) == 2
    assert req.doc_names == ["permiso-circulacion.pdf", "Ficha técnica cara 1.jpeg"]      # permiso first, expo excluded
    assert "Imagen 1: permiso-circulacion.pdf (pág. 1) -> PERMISO DE CIRCULACIÓN" in req.prompt
    assert "Imagen 2: Ficha técnica cara 1.jpeg -> TARJETA ITV / ficha técnica" in req.prompt
    assert "fuente principal" in req.prompt
    assert "WAUZZZGA2KA020714" in req.prompt and "Texto extraído de permiso-circulacion.pdf" in req.prompt
    assert (req.images[1].width, req.images[1].height, req.images[1].page) == (120, 80, None)
    assert req.images[0].page == 1
    assert req.image_kinds == ["PERMISO DE CIRCULACIÓN", "TARJETA ITV / ficha técnica"]
    assert req.total_bytes == sum(len(i.jpeg) for i in req.images) > 0
    assert any(line.startswith("Imágenes: 2") for line in req.describe())


def test_build_request_without_official_docs(tmp_path):
    write_pdf(tmp_path / "ficha-expo.pdf", "Kia Xceed\nPotencia: 141 CV\nCubicaje: 1600")
    req = build_request(find_documents(tmp_path), model="m")
    assert req.images == [] and req.doc_names == []
    with pytest.raises(ExtractionError) as exc:
        run_extraction(req)
    assert exc.value.code == "sin_documentos"


def test_build_request_uses_env_model(car_folder, monkeypatch):
    monkeypatch.setenv("FICHAS_MODEL", "modelo-env")
    assert build_request(find_documents(car_folder)).model == "modelo-env"


# ------------------------------------------------------------------------ cache
def test_cache_round_trip(car_folder, tmp_path):
    cache_dir = tmp_path / "cache"
    docs = find_documents(car_folder)
    path = save_cache("9028LXG", docs, "modelo-test", RESULT, {"input_tokens": 10}, cache_dir=cache_dir, plate="9028LXG")
    assert path == cache_dir / "9028LXG.json" == cache_path("9028LXG", cache_dir)
    data = load_cache("9028LXG", docs, cache_dir=cache_dir)
    assert data["resultado"] == RESULT
    assert data["modelo"] == "modelo-test" and data["uso"] == {"input_tokens": 10} and data["matricula"] == "9028LXG"
    assert data["documentos"] == docs_fingerprint(docs)
    assert [d["nombre"] for d in data["documentos"]] == ["Ficha técnica cara 1.jpeg", "permiso-circulacion.pdf"]


def test_cache_miss_cases(car_folder, tmp_path):
    cache_dir = tmp_path / "cache"
    docs = find_documents(car_folder)
    save_cache("9028LXG", docs, "m", RESULT, cache_dir=cache_dir)
    assert load_cache("9028LXG", docs, force=True, cache_dir=cache_dir) is None
    assert load_cache("0000ZZZ", docs, cache_dir=cache_dir) is None
    cache_path("1111BBB", cache_dir).write_text("no es json", encoding="utf-8")
    assert load_cache("1111BBB", docs, cache_dir=cache_dir) is None
    cache_path("2222CCC", cache_dir).write_text('{"documentos": %s}' % "[]", encoding="utf-8")
    assert load_cache("2222CCC", [], cache_dir=cache_dir) is None      # no 'resultado'


def test_cache_invalid_after_document_mtime_changes(car_folder, tmp_path):
    cache_dir = tmp_path / "cache"
    docs = find_documents(car_folder)
    save_cache("9028LXG", docs, "m", RESULT, cache_dir=cache_dir)
    assert load_cache("9028LXG", find_documents(car_folder), cache_dir=cache_dir) is not None

    expo = car_folder / "ficha-expo.pdf"
    st = expo.stat()
    os.utime(expo, (st.st_atime + 100, st.st_mtime + 100))
    assert load_cache("9028LXG", find_documents(car_folder), cache_dir=cache_dir) is not None   # expo not fingerprinted

    permiso = car_folder / "permiso-circulacion.pdf"
    st = permiso.stat()
    os.utime(permiso, (st.st_atime + 100, st.st_mtime + 100))
    assert load_cache("9028LXG", find_documents(car_folder), cache_dir=cache_dir) is None


def test_cache_path_without_plate(tmp_path):
    assert cache_path("", tmp_path) == tmp_path / "SIN_MATRICULA.json"


# ----------------------------------------------------------------------- schema
def _assert_strict(schema: dict, where: str = "root") -> None:
    assert schema.get("type") == "object", where
    assert schema.get("additionalProperties") is False, where
    props = schema["properties"]
    assert set(schema["required"]) == set(props), where
    for name, sub in props.items():
        types = sub.get("type")
        if types == "object" or (isinstance(types, list) and "object" in types):
            _assert_strict(sub, f"{where}.{name}")


def test_extraction_schema_is_strict_compatible():
    _assert_strict(EXTRACTION_SCHEMA)
    assert set(EXTRACTION_SCHEMA["properties"]) == {"ficha_tecnica", "permiso_circulacion", "notas"}
    ficha = EXTRACTION_SCHEMA["properties"]["ficha_tecnica"]
    assert ficha["properties"] == EXTRACTION_SCHEMA["properties"]["permiso_circulacion"]["properties"]
    assert ficha["properties"]["presente"]["type"] == "boolean"
    assert ficha["properties"]["bastidor"]["type"] == ["string", "null"]
    assert ficha["properties"]["potencia_kw"]["type"] == ["number", "null"]


# ----------------------------------------------------------------------- errors
def test_extraction_error_messages():
    assert "crédito" in ExtractionError("sin_credito").user_message()
    assert "OPENAI_API_KEY" in ExtractionError("sin_clave").user_message()
    err = ExtractionError("modelo", "gpt-x")
    assert "gpt-x" in err.user_message() and str(err) == "gpt-x" and err.code == "modelo"
    assert "autenticación" in ExtractionError("auth", "401").user_message()
    assert "Error llamando a OpenAI" in ExtractionError("api", "boom").user_message()


def test_extraction_request_describe():
    req = ExtractionRequest(model="m", images=[], prompt="hola")
    assert req.total_bytes == 0
    assert req.describe() == ["Modelo: m", "Imágenes: 0 (0 KB en total)", "Prompt: 4 caracteres"]
