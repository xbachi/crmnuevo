"""Locate a car folder under OneDrive/1_Ventas by reference number or plate."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from common import normalize_plate, normalize_ref, strip_accents

DEFAULT_VENTAS_DIR = Path("/mnt/c/Users/Usuario/OneDrive/1_Ventas")
SOLD_GROUP_KEYWORDS = ("vendido",)

# "82-Kia Xceed-9028LXG", "58 -Citröen-C4", "91- Renault", "D-18 Smart", "D-30-Audi", "R-22-Ford", "I1-Mercedes"
_PREFIX_RE = re.compile(r"^\s*([A-Z]{1,2})?\s*-?\s*(\d{1,4})\s*(?:-|\s|$)")
# Modern Spanish plate: 4 digits + 3 consonants (allow a space/dash between)
_PLATE_MODERN_RE = re.compile(r"(?<![A-Z0-9])(\d{4})\s*-?\s*([BCDFGHJKLMNPRSTVWXYZ]{3})(?![A-Z0-9])")
# Old provincial plate: 1-2 letters, 4 digits, 1-2 letters (e.g. V-4892-GT)
_PLATE_OLD_RE = re.compile(r"(?<![A-Z0-9])([A-Z]{1,2})\s*-?\s*(\d{4})\s*-?\s*([A-Z]{1,2})(?![A-Z0-9])")
# Truncated modern plate in a folder name (e.g. "2848NR"): 4 digits + 2 consonants
_PLATE_TRUNC_RE = re.compile(r"(?<![A-Z0-9])(\d{4})\s*-?\s*([BCDFGHJKLMNPRSTVWXYZ]{2})(?![A-Z0-9])")
MIN_TRUNCATED_PLATE = 6


@dataclass
class CarFolder:
    path: Path
    group: str                      # "1_Ventas", "Consignacion", "VENDIDOS", ...
    prefix_letter: str | None = None
    prefix_number: int | None = None
    plate: str | None = None

    @property
    def name(self) -> str:
        return self.path.name

    @property
    def is_sold(self) -> bool:
        return any(k in self.group.lower() for k in SOLD_GROUP_KEYWORDS)

    @property
    def is_for_sale(self) -> bool:
        """1_Ventas top level, Consignacion, IMPORTACION (not VENDIDOS, not Coches R)."""
        g = self.group.lower()
        return not self.is_sold and "coches r" not in g

    def prefix_label(self) -> str:
        if self.prefix_number is None:
            return "-"
        return f"{self.prefix_letter or ''}{self.prefix_number}"

    def ref_from_prefix(self) -> str | None:
        """Sheet referencia implied by the folder prefix: 82 -> '1082', ('D', 18) -> 'D18'."""
        if self.prefix_number is None:
            return None
        if self.prefix_letter:
            return f"{self.prefix_letter}{self.prefix_number}"
        return str(self.prefix_number + 1000)


@dataclass
class LocateResult:
    folder: CarFolder | None
    matched_by: str | None = None            # "matrícula" | "prefijo" | "matrícula y prefijo"
    candidates: list[CarFolder] = field(default_factory=list)
    ambiguous: bool = False
    ref_agrees: bool = False                 # folder prefix == referencia
    plate_agrees: bool | None = None         # None when the folder name or the row has no plate
    ref: str = ""
    plate: str = ""

    @property
    def found(self) -> bool:
        return self.folder is not None

    @property
    def identity_ok(self) -> bool:
        """Folder located with referencia agreement and (when the folder name has a plate) plate agreement."""
        return self.found and self.ref_agrees and self.plate_agrees is not False

    def identity_problem(self) -> str:
        if not self.found:
            return "carpeta no encontrada"
        problems = []
        if not self.ref_agrees:
            problems.append(f"el prefijo de la carpeta ({self.folder.prefix_label()}) no coincide con la referencia ({self.ref})")
        if self.plate_agrees is False:
            problems.append(f"la matrícula de la carpeta ({self.folder.plate}) no coincide con la de la hoja ({self.plate or '-'})")
        if self.ambiguous:
            problems.append("carpeta ambigua (varias candidatas)")
        return "; ".join(problems)

    def describe(self) -> str:
        if self.folder is not None:
            extra = " (ambiguo: se eligió la coincidencia por matrícula)" if self.ambiguous else ""
            problem = self.identity_problem()
            if problem and not self.ambiguous:
                extra += f" ⚠ {problem}"
            return f"{self.folder.path} [por {self.matched_by}]{extra}"
        if self.candidates:
            names = "; ".join(str(c.path) for c in self.candidates)
            return f"ambiguo, varias carpetas candidatas: {names}"
        return "carpeta no encontrada"


def parse_prefix(folder_name: str) -> tuple[str | None, int | None]:
    """'82-Kia Xceed-9028LXG' -> (None, 82); 'D-18 Smart Forfour' -> ('D', 18)."""
    m = _PREFIX_RE.match(strip_accents(folder_name).upper())
    if not m:
        return None, None
    return m.group(1), int(m.group(2))


def plate_from_name(folder_name: str) -> str | None:
    """Extract a plate from a folder name ('85-Nissan Qashqai-5475 LKK' -> '5475LKK')."""
    text = strip_accents(folder_name).upper()
    m = _PLATE_MODERN_RE.search(text)
    if m:
        return m.group(1) + m.group(2)
    m = _PLATE_OLD_RE.search(text)
    if m:
        return m.group(1) + m.group(2) + m.group(3)
    m = _PLATE_TRUNC_RE.search(text)
    if m:
        return m.group(1) + m.group(2)
    return None


def plate_matches(folder_plate: str | None, plate: str | None) -> bool:
    """Exact match, or a truncated folder plate (>= 6 chars, e.g. '2848NR') that is a prefix of the plate."""
    if not folder_plate or not plate:
        return False
    if folder_plate == plate:
        return True
    return MIN_TRUNCATED_PLATE <= len(folder_plate) < len(plate) and plate.startswith(folder_plate)


def make_car_folder(path: Path, group: str) -> CarFolder | None:
    letter, number = parse_prefix(path.name)
    plate = plate_from_name(path.name)
    if number is None and plate is None:
        return None
    return CarFolder(path=path, group=group, prefix_letter=letter, prefix_number=number, plate=plate)


def group_name(dir_path: Path, root: Path) -> str:
    if dir_path == root:
        return root.name
    return dir_path.name.strip("-").strip() or dir_path.name


def scan_folders(ventas_dir: Path | str = DEFAULT_VENTAS_DIR) -> list[CarFolder]:
    """Car folders directly under 1_Ventas plus those in its group subfolders (one level deep)."""
    root = Path(ventas_dir)
    if not root.is_dir():
        raise FileNotFoundError(f"No existe la carpeta de ventas: {root}")
    result: list[CarFolder] = []
    for child in sorted(root.iterdir(), key=lambda p: p.name.lower()):
        if not child.is_dir():
            continue
        car = make_car_folder(child, group_name(root, root))
        if car is not None:
            result.append(car)
            continue
        # Not a car folder itself -> a group folder (Consignacion, VENDIDOS...)
        grp = group_name(child, root)
        try:
            grandchildren = sorted(child.iterdir(), key=lambda p: p.name.lower())
        except OSError:
            continue
        for sub in grandchildren:
            if sub.is_dir():
                car = make_car_folder(sub, grp)
                if car is not None:
                    result.append(car)
    return result


def ref_to_prefix(ref: str) -> tuple[str | None, int | None]:
    """Sheet reference to expected folder prefix: '1082' -> (None, 82); 'D18' -> ('D', 18)."""
    ref = normalize_ref(ref)
    if not ref:
        return None, None
    if ref.isdigit():
        n = int(ref)
        return None, (n - 1000 if n >= 1000 else n)
    m = re.fullmatch(r"([A-Z]{1,2})(\d{1,4})", ref)
    if m:
        return m.group(1), int(m.group(2))
    return None, None


def canonical_ref(ref: str) -> str:
    """CLI convenience: '26' -> '1026', 'd-18' -> 'D18', '1082' -> '1082'."""
    ref = normalize_ref(ref)
    if ref.isdigit() and int(ref) < 1000:
        return str(int(ref) + 1000)
    return ref


def locate(folders: list[CarFolder], ref: str | None = None, plate: str | None = None) -> LocateResult:
    """Find the folder for a reference and/or plate. Plate match wins over prefix match; the result also says
    whether the folder agrees with the referencia (prefix) and with the plate (identity check)."""
    plate_n = normalize_plate(plate) if plate else ""
    ref_n = normalize_ref(ref) if ref else ""
    letter, number = ref_to_prefix(ref) if ref else (None, None)

    by_plate = [f for f in folders if plate_n and plate_matches(f.plate, plate_n)]
    by_prefix = [f for f in folders if number is not None and f.prefix_number == number
                 and (f.prefix_letter or None) == (letter or None)]

    def result(folder, matched_by, candidates, ambiguous=False):
        res = LocateResult(folder, matched_by, candidates, ambiguous=ambiguous, ref=ref_n, plate=plate_n)
        if folder is not None:
            res.ref_agrees = folder in by_prefix
            # None = not checkable here (folder without plate, or row without plate: the permiso decides)
            res.plate_agrees = None if (folder.plate is None or not plate_n) else plate_matches(folder.plate, plate_n)
        return res

    both = [f for f in by_plate if f in by_prefix]
    if len(both) == 1:
        return result(both[0], "matrícula y prefijo", by_plate + [f for f in by_prefix if f not in by_plate])
    if len(by_plate) == 1:
        others = [f for f in by_prefix if f not in by_plate]
        return result(by_plate[0], "matrícula", by_plate + others, ambiguous=bool(others))
    if len(by_plate) > 1:
        return result(None, None, by_plate, ambiguous=True)
    if len(by_prefix) == 1:
        return result(by_prefix[0], "prefijo", by_prefix)
    if len(by_prefix) > 1:
        # Prefer folders that are not sold when the sheet gives no plate to disambiguate
        active = [f for f in by_prefix if not f.is_sold]
        if len(active) == 1:
            return result(active[0], "prefijo", by_prefix, ambiguous=True)
        return result(None, None, by_prefix, ambiguous=True)
    return result(None, None, [])
