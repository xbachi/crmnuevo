"""Document discovery in a car folder, ficha-expo parsing and image preparation."""
from __future__ import annotations

import io
import re
import warnings
from dataclasses import dataclass, field
from pathlib import Path

from common import norm_text

warnings.filterwarnings("ignore", message=".*fitz.*")

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
PDF_EXTS = {".pdf"}
ACCEPTED_EXTS = IMAGE_EXTS | PDF_EXTS

KIND_FICHA = "ficha"        # tarjeta ITV / ficha técnica (official)
KIND_PERMISO = "permiso"    # permiso de circulación (official)
KIND_EXPO = "expo"          # ficha-expo.pdf: generated FROM the website after publishing -> NOT a source (only listed)
KIND_LABELS = {KIND_FICHA: "Ficha técnica (tarjeta ITV)",
               KIND_PERMISO: "Permiso de circulación",
               KIND_EXPO: "ficha-expo (generada desde la web, no es fuente)"}

MAX_SIDE = 2000              # ficha técnica (tarjeta ITV)
MAX_SIDE_PERMISO = 2600      # permiso de circulación: fuente principal, se envía con más resolución
JPEG_QUALITY = 85
PDF_DPI = 150


@dataclass
class Document:
    path: Path
    kind: str
    mtime: float = 0.0
    size: int = 0

    @property
    def name(self) -> str:
        return self.path.name

    @property
    def is_pdf(self) -> bool:
        return self.path.suffix.lower() in PDF_EXTS

    def fingerprint(self) -> dict:
        return {"nombre": self.name, "mtime": round(self.mtime, 3), "tamano": self.size}


@dataclass
class PreparedImage:
    label: str
    jpeg: bytes
    width: int
    height: int
    page: int | None = None


def classify_filename(filename: str) -> str | None:
    """Classify a file by its name only. Returns KIND_* or None if not a relevant document."""
    if "zone.identifier" in filename.lower():
        return None
    path = Path(filename)
    if path.suffix.lower() not in ACCEPTED_EXTS:
        return None
    n = norm_text(path.stem)
    compact = re.sub(r"[\s_]+", "-", n)
    if "ficha-expo" in compact or "fichaexpo" in compact.replace("-", ""):
        return KIND_EXPO
    if "ficha" in n or ("tarjeta" in n and "itv" in n):
        return KIND_FICHA
    if "permiso" in n or "circulaci" in n:
        return KIND_PERMISO
    return None


def looks_like_expo_text(text: str) -> bool:
    """The dealer's exposition PDF has 'Potencia:' and 'Cubicaje:' lines."""
    n = norm_text(text)
    return "potencia:" in n and "cubicaje:" in n


def pdf_text(path: Path) -> str:
    import pymupdf
    try:
        with pymupdf.open(str(path)) as doc:
            return "\n".join(page.get_text() for page in doc)
    except Exception:
        return ""


def find_documents(folder: Path) -> list[Document]:
    """Relevant documents in a car folder (non recursive)."""
    docs: list[Document] = []
    for entry in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
        if not entry.is_file():
            continue
        kind = classify_filename(entry.name)
        if kind is None:
            continue
        # A PDF named 'ficha-<algo>.pdf' may actually be the dealer's expo sheet
        if kind == KIND_FICHA and entry.suffix.lower() in PDF_EXTS and looks_like_expo_text(pdf_text(entry)):
            kind = KIND_EXPO
        st = entry.stat()
        docs.append(Document(path=entry, kind=kind, mtime=st.st_mtime, size=st.st_size))
    order = {KIND_FICHA: 0, KIND_PERMISO: 1, KIND_EXPO: 2}
    docs.sort(key=lambda d: (order[d.kind], d.name.lower()))
    return docs


# ------------------------------------------------------------------- images
def prepare_image(image, label: str, max_side: int = MAX_SIDE, quality: int = JPEG_QUALITY,
                  page: int | None = None) -> PreparedImage:
    """EXIF auto-rotate, downscale to max_side on the long side, encode JPEG."""
    from PIL import ImageOps
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    w, h = image.size
    scale = max(w, h) / float(max_side)
    if scale > 1:
        image = image.resize((max(1, round(w / scale)), max(1, round(h / scale))))
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality, optimize=True)
    return PreparedImage(label=label, jpeg=buf.getvalue(), width=image.size[0], height=image.size[1], page=page)


def pdf_pages_as_images(path: Path, dpi: int = PDF_DPI):
    """Yield (page_number, PIL.Image) for each page of a PDF."""
    import pymupdf
    from PIL import Image
    with pymupdf.open(str(path)) as doc:
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            yield i + 1, Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def load_document_images(doc: Document, max_side: int | None = None, first_page_only: bool = False) -> list[PreparedImage]:
    from PIL import Image
    if max_side is None:
        max_side = MAX_SIDE_PERMISO if doc.kind == KIND_PERMISO else MAX_SIDE
    if doc.is_pdf:
        out = []
        for n, img in pdf_pages_as_images(doc.path):
            out.append(prepare_image(img, f"{doc.name} (pág. {n})", max_side=max_side, page=n))
            if first_page_only:
                break
        return out
    with Image.open(doc.path) as img:
        img.load()
        return [prepare_image(img, doc.name, max_side=max_side)]


# ------------------------------------------------------------ modo liviano
_BACK_RE = re.compile(r"(?:cara|parte|lado)\s*-?\s*(?:2|trasera|posterior|b)\b|trasera|reverso|dorso|posterior")
_FRONT_RE = re.compile(r"(?:cara|parte|lado)\s*-?\s*(?:1|delantera|frontal|a)\b|delantera|anverso|frontal|\bcara1\b")


def document_side(filename: str) -> str | None:
    """'front' / 'back' / None according to the file name (cara 1 / cara 2 / parte delantera / trasera...)."""
    n = norm_text(Path(filename).stem)
    if _BACK_RE.search(n):
        return "back"
    if _FRONT_RE.search(n):
        return "front"
    return None


def _lean_rank(doc: Document) -> tuple:
    side = document_side(doc.name)
    rank = {"front": 0, None: 1}[side]
    if "provisional" in norm_text(doc.name):
        rank = 2
    return (rank, 0 if not doc.is_pdf else 1, doc.name.lower())


def pick_lean_document(docs: list[Document]) -> Document | None:
    """The single document sent in lean mode: permiso 'cara 1' (never a back side); else ficha técnica cara 1
    (cara 1 / cara1 / parte delantera / tarjetaItv); else None."""
    for kind in (KIND_PERMISO, KIND_FICHA):
        candidates = [d for d in docs if d.kind == kind and document_side(d.name) != "back"]
        if candidates:
            return sorted(candidates, key=_lean_rank)[0]
    return None
