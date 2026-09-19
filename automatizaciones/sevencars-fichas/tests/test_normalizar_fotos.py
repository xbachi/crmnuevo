"""fotos.py: normalización de la carpeta fotos/ (1.jpg…N.jpg, JPEG ≤ 400 KB, originales a originales/)."""
import io
import os

from PIL import Image

import pytest

import fotos
from fotos import (MANTENER, NORMAL_KB, NORMAL_SIDE, OMITIR, RECOMPRIMIR, RENOMBRAR, comprimir_bytes,
                   normalizar_carpeta, planificar_normalizacion, resumen_normalizacion)
from tests.conftest import write_jpeg

MAX_BYTES = NORMAL_KB * 1024


def _decode(data: bytes):
    with Image.open(io.BytesIO(data)) as img:
        img.load()
        return img.format, img.size


def ruido(size=(900, 600), sigma=40) -> Image.Image:
    return Image.merge("RGB", [Image.effect_noise(size, sigma) for _ in range(3)])


def png_grande(path, size=(900, 600)):
    ruido(size).save(path, format="PNG")
    assert path.stat().st_size > MAX_BYTES
    return path


def nombres(carpeta) -> list[str]:
    return sorted(p.name for p in carpeta.iterdir() if p.is_file())


def mtime(path, segundos: int) -> None:
    os.utime(path, (segundos, segundos))


# ----------------------------------------------------------- comprimir_bytes
def test_comprimir_bytes_jpeg_pequeno_intacto(tmp_path):
    p = write_jpeg(tmp_path / "1.jpg", size=(640, 480))
    assert comprimir_bytes(p) == p.read_bytes()


def test_comprimir_bytes_baja_de_400kb(tmp_path):
    p = png_grande(tmp_path / "grande.png")
    out = comprimir_bytes(p)
    assert len(out) <= MAX_BYTES
    assert _decode(out) == ("JPEG", (900, 600))


def test_comprimir_bytes_redimensiona_sin_recortar(tmp_path):
    p = tmp_path / "ancha.jpg"
    Image.new("RGB", (3200, 1600), (30, 40, 50)).save(p, format="JPEG")
    fmt, (w, h) = _decode(comprimir_bytes(p))
    assert fmt == "JPEG" and (w, h) == (NORMAL_SIDE, NORMAL_SIDE // 2)
    q = tmp_path / "alta.png"
    Image.new("RGB", (1000, 4000), (30, 40, 50)).save(q, format="PNG")
    assert _decode(comprimir_bytes(q))[1] == (400, 1600)


def test_comprimir_bytes_webp_y_png_con_transparencia(tmp_path):
    w = tmp_path / "foto.webp"
    Image.new("RGB", (300, 200), (10, 20, 30)).save(w, format="WEBP")
    assert _decode(comprimir_bytes(w)) == ("JPEG", (300, 200))
    p = tmp_path / "foto.png"
    Image.new("RGBA", (300, 200), (10, 20, 30, 0)).save(p, format="PNG")
    out = comprimir_bytes(p)
    assert _decode(out) == ("JPEG", (300, 200))
    with Image.open(io.BytesIO(out)) as img:
        assert img.getpixel((0, 0)) == (255, 255, 255)          # transparencia sobre blanco


def test_comprimir_bytes_respeta_orientacion_exif(tmp_path):
    p = tmp_path / "rotada.jpg"
    img = Image.new("RGB", (3000, 1500), (5, 6, 7))
    exif = img.getexif()
    exif[274] = 6                                                # el móvil la guardó girada
    img.save(p, format="JPEG", exif=exif)
    assert _decode(comprimir_bytes(p))[1] == (800, 1600)         # transpuesta: 1500x3000 -> 800x1600


# ------------------------------------------------------------------ orden
def test_plan_orden_portada_numerados_y_resto_por_fecha(tmp_path):
    for n in ("2.jpg", "10.jpg", "1.jpg", "3b.jpg", "3.jpg"):
        write_jpeg(tmp_path / n)
    write_jpeg(tmp_path / "Portada.png")
    a = write_jpeg(tmp_path / "ChatGPT Image 5 sept 2026, 10_23_45.png")
    b = write_jpeg(tmp_path / "ChatGPT Image 5 sept 2026, 10_23_45 (1).png")
    c = write_jpeg(tmp_path / "zzz.webp")
    mtime(a, 3_000), mtime(b, 1_000), mtime(c, 2_000)
    plan = planificar_normalizacion(tmp_path)
    assert [(it.origen.name, it.destino) for it in plan] == [
        ("Portada.png", "1.jpg"), ("1.jpg", "2.jpg"), ("2.jpg", "3.jpg"), ("3.jpg", "4.jpg"), ("3b.jpg", "5.jpg"),
        ("10.jpg", "6.jpg"), ("ChatGPT Image 5 sept 2026, 10_23_45 (1).png", "7.jpg"), ("zzz.webp", "8.jpg"),
        ("ChatGPT Image 5 sept 2026, 10_23_45.png", "9.jpg")]
    assert [it.numero for it in plan] == list(range(1, 10))


def test_plan_empate_de_fecha_desempata_por_nombre(tmp_path):
    for n in ("b.png", "a.png", "c.png"):
        mtime(write_jpeg(tmp_path / n), 5_000)
    assert [it.origen.name for it in planificar_normalizacion(tmp_path)] == ["a.png", "b.png", "c.png"]


def test_plan_acciones(tmp_path):
    write_jpeg(tmp_path / "1.jpg")
    png_grande(tmp_path / "2.jpg")                              # bien nombrada pero pesa > 400 KB
    Image.new("RGB", (300, 200)).save(tmp_path / "3.png")       # bien numerada pero es PNG
    write_jpeg(tmp_path / "4.jpeg")
    write_jpeg(tmp_path / "foto.jpg")
    plan = {it.origen.name: it for it in planificar_normalizacion(tmp_path)}
    assert plan["1.jpg"].accion == MANTENER and not plan["1.jpg"].recomprime
    assert plan["2.jpg"].accion == RECOMPRIMIR and plan["2.jpg"].recomprime
    assert (plan["3.png"].accion, plan["3.png"].destino, plan["3.png"].recomprime) == (RENOMBRAR, "3.jpg", True)
    assert (plan["4.jpeg"].accion, plan["4.jpeg"].destino, plan["4.jpeg"].recomprime) == (RENOMBRAR, "4.jpg", False)
    assert (plan["foto.jpg"].accion, plan["foto.jpg"].destino) == (RENOMBRAR, "5.jpg")


def test_plan_ignora_zone_identifier_subcarpetas_y_omite_ilegibles(tmp_path):
    write_jpeg(tmp_path / "1.jpg")
    (tmp_path / "1.jpg:Zone.Identifier").write_text("[ZoneTransfer]")
    (tmp_path / "originales").mkdir()
    write_jpeg(tmp_path / "originales" / "vieja.jpg")
    (tmp_path / "rota.png").write_bytes(b"no soy una imagen")
    (tmp_path / "3.jpg.tmp").write_bytes(b"resto de una ejecucion cortada")
    plan = planificar_normalizacion(tmp_path)
    assert [(it.origen.name, it.accion) for it in plan] == [("1.jpg", MANTENER), ("rota.png", OMITIR)]
    res = normalizar_carpeta(tmp_path, ejecutar=True)
    assert not res.ejecutado and (tmp_path / "rota.png").exists()
    assert "no se pudo leer" in resumen_normalizacion(res)


# --------------------------------------------------------------- ejecutar
def test_ejecutar_false_no_toca_nada(tmp_path):
    write_jpeg(tmp_path / "2.jpg")
    png_grande(tmp_path / "nueva.png")
    antes = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    res = normalizar_carpeta(tmp_path, ejecutar=False)
    assert not res.ejecutado and len(res.cambios) == 2
    assert {p.name: p.read_bytes() for p in tmp_path.iterdir()} == antes
    assert not (tmp_path / "originales").exists()
    texto = resumen_normalizacion(res)
    assert texto.startswith(f"{tmp_path.name}/: se haría: 2 fotos listas (2 cambios: '2.jpg' -> 1.jpg, "
                            "'nueva.png' -> 2.jpg (convertida); los originales irían a ")


def test_renumerar_con_colisiones(tmp_path):
    fotos = tmp_path / "fotos"
    fotos.mkdir()
    write_jpeg(fotos / "1.jpg", size=(10, 10))
    write_jpeg(fotos / "2.jpg", size=(20, 20))
    write_jpeg(fotos / "3.jpg", size=(30, 30))
    write_jpeg(fotos / "portada.jpg", size=(40, 40))
    res = normalizar_carpeta(fotos, ejecutar=True)
    assert res.ejecutado
    assert nombres(fotos) == ["1.jpg", "2.jpg", "3.jpg", "4.jpg"]
    assert [_decode((fotos / f"{i}.jpg").read_bytes())[1] for i in range(1, 5)] == [(40, 40), (10, 10), (20, 20), (30, 30)]
    assert not (fotos / "originales").exists()                 # solo cambian de nombre: no se duplica nada
    assert [it.original for it in res.cambios] == [None] * 4
    texto = resumen_normalizacion(res)
    assert texto == ("fotos/: 4 fotos listas (4 cambios: 'portada.jpg' -> 1.jpg, '1.jpg' -> 2.jpg, '2.jpg' -> 3.jpg, "
                     "'3.jpg' -> 4.jpg)")


def test_portada_nueva_solo_deja_su_original(tmp_path):
    fotos = tmp_path / "fotos"
    fotos.mkdir()
    for i in range(1, 6):
        write_jpeg(fotos / f"{i}.jpg", size=(10 * i, 10))
    Image.new("RGB", (300, 200), (9, 9, 9)).save(fotos / "portada.png", format="PNG")
    res = normalizar_carpeta(fotos, ejecutar=True)
    assert nombres(fotos) == [f"{i}.jpg" for i in range(1, 7)]
    assert [_decode((fotos / f"{i}.jpg").read_bytes())[1] for i in range(1, 7)] == [(300, 200)] + [(10 * i, 10) for i in range(1, 6)]
    assert nombres(fotos / "originales") == ["portada.png"]   # las cinco renombradas no dejan copia
    assert [it.original.name if it.original else None for it in res.cambios] == ["portada.png"] + [None] * 5
    texto = resumen_normalizacion(res)
    assert texto.startswith("fotos/: 6 fotos listas (6 cambios: 'portada.png' -> 1.jpg (convertida), '1.jpg' -> 2.jpg, ")
    assert texto.endswith("y 1 más; originales en fotos/originales/)")


def test_nuevas_de_chatgpt_se_convierten_y_van_al_final(tmp_path):
    fotos = tmp_path / "fotos"
    fotos.mkdir()
    for n in ("1.jpg", "2.jpg", "3.jpg"):
        write_jpeg(fotos / n)
    a = png_grande(fotos / "ChatGPT Image 5 sept 2026, 10_23_45.png")
    b = fotos / "ChatGPT Image 5 sept 2026, 10_30_00.webp"
    Image.new("RGB", (300, 200), (1, 2, 3)).save(b, format="WEBP")
    mtime(a, 2_000), mtime(b, 1_000)
    res = normalizar_carpeta(fotos, ejecutar=True)
    assert nombres(fotos) == ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg"]
    assert _decode((fotos / "4.jpg").read_bytes()) == ("JPEG", (300, 200))
    assert _decode((fotos / "5.jpg").read_bytes()) == ("JPEG", (900, 600))
    assert (fotos / "5.jpg").stat().st_size <= MAX_BYTES
    assert nombres(fotos / "originales") == [a.name, b.name]
    assert int((fotos / "5.jpg").stat().st_mtime) == 2_000                   # conserva la fecha de la foto
    texto = resumen_normalizacion(res)
    assert texto.startswith("fotos/: 5 fotos listas (2 cambios: ")
    assert f"'{b.name}' -> 4.jpg (convertida)" in texto and f"'{a.name}' -> 5.jpg (convertida)" in texto
    assert texto.endswith("; originales en fotos/originales/)")


def test_recomprimir_en_sitio_y_sufijo_en_originales(tmp_path):
    fotos = tmp_path / "fotos"
    (fotos / "originales").mkdir(parents=True)
    write_jpeg(fotos / "originales" / "1.jpg")                # ya había un original con ese nombre
    write_jpeg(fotos / "originales" / "1 (2).jpg")
    png_grande(fotos / "1.jpg")
    res = normalizar_carpeta(fotos, ejecutar=True)
    assert [it.accion for it in res.plan] == [RECOMPRIMIR]
    assert (fotos / "1.jpg").stat().st_size <= MAX_BYTES and _decode((fotos / "1.jpg").read_bytes())[0] == "JPEG"
    assert nombres(fotos / "originales") == ["1 (2).jpg", "1 (3).jpg", "1.jpg"]
    assert (fotos / "originales" / "1 (3).jpg").stat().st_size > MAX_BYTES
    assert "'1.jpg' recomprimida" in resumen_normalizacion(res)


def test_idempotente(tmp_path):
    fotos = tmp_path / "fotos"
    fotos.mkdir()
    write_jpeg(fotos / "portada.png")
    write_jpeg(fotos / "5.jpg")
    png_grande(fotos / "nueva.png")
    assert normalizar_carpeta(fotos, ejecutar=True).ejecutado
    estado = {p.name: p.read_bytes() for p in fotos.iterdir() if p.is_file()}
    res = normalizar_carpeta(fotos, ejecutar=True)
    assert not res.ejecutado and res.cambios == [] and [it.accion for it in res.plan] == [MANTENER] * 3
    assert {p.name: p.read_bytes() for p in fotos.iterdir() if p.is_file()} == estado
    assert nombres(fotos / "originales") == ["nueva.png"]      # 5.jpg y portada.png solo cambiaron de nombre
    assert resumen_normalizacion(res) == "fotos/: 3 fotos ya normalizadas"


def test_plan_sin_recompresion_no_menciona_originales(tmp_path):
    fotos = tmp_path / "fotos"
    fotos.mkdir()
    write_jpeg(fotos / "3.jpg")
    write_jpeg(fotos / "portada.jpg")
    texto = resumen_normalizacion(normalizar_carpeta(fotos, ejecutar=False))
    assert texto == "fotos/: se haría: 2 fotos listas (2 cambios: 'portada.jpg' -> 1.jpg, '3.jpg' -> 2.jpg)"
    assert not (fotos / "originales").exists()


def test_un_fallo_al_comprimir_deja_la_carpeta_como_estaba(tmp_path, monkeypatch):
    carpeta = tmp_path / "fotos"
    carpeta.mkdir()
    write_jpeg(carpeta / "2.jpg")                              # renombrado puro: pasaría a 1.jpg
    a = png_grande(carpeta / "a.png")
    b = png_grande(carpeta / "b.png")
    mtime(a, 1_000), mtime(b, 2_000)
    antes = {p.name: p.read_bytes() for p in carpeta.iterdir()}
    llamadas = []

    def rota(path, *a, **k):
        llamadas.append(path.name)
        if len(llamadas) == 2:
            raise RuntimeError("disco lleno")
        return comprimir_bytes(path, *a, **k)
    monkeypatch.setattr(fotos, "comprimir_bytes", rota)
    with pytest.raises(RuntimeError, match="disco lleno"):
        normalizar_carpeta(carpeta, ejecutar=True)
    assert llamadas == ["a.png", "b.png"]
    assert {p.name: p.read_bytes() for p in carpeta.iterdir()} == antes   # ni .tmp, ni originales/, ni renombres


def test_resumen_carpeta_vacia_y_muchos_cambios(tmp_path):
    fotos = tmp_path / "fotos"
    fotos.mkdir()
    assert resumen_normalizacion(normalizar_carpeta(fotos, ejecutar=True)) == "fotos/: sin fotos"
    for i in range(8):
        Image.new("RGB", (30, 20), (1, 2, 3)).save(fotos / f"foto{i}.png", format="PNG")
        mtime(fotos / f"foto{i}.png", 1_000 + i)
    texto = resumen_normalizacion(normalizar_carpeta(fotos, ejecutar=False))
    assert texto.startswith("fotos/: se haría: 8 fotos listas (8 cambios: 'foto0.png' -> 1.jpg (convertida), ")
    assert "y 3 más; los originales irían a fotos/originales/" in texto
