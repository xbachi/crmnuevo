"""locate.py: parsing of folder names and resolution of a car folder by reference / plate."""
from pathlib import Path

import pytest

from common import normalize_ref
from locate import canonical_ref, locate, make_car_folder, parse_prefix, plate_from_name, ref_to_prefix, scan_folders


@pytest.mark.parametrize("name, expected", [
    ("82-Kia Xceed-9028LXG", (None, 82)),
    ("58 -Citröen-C4-2394HRV", (None, 58)),
    ("91- Renault clio- 0110 MLK", (None, 91)),
    ("D-18 Smart Forfour 8536 JFF", ("D", 18)),
    ("D-30-Audi-TTs-9649NFR", ("D", 30)),
    ("R-22-Ford Focus-V4892-GT", ("R", 22)),
    ("Yamaha Raptor quad-E9961BDJ", (None, None)),
])
def test_parse_prefix(name, expected):
    assert parse_prefix(name) == expected


@pytest.mark.parametrize("name, expected", [
    ("85-Nissan Qashqai-5475 LKK", "5475LKK"),
    ("66-Mercedes-clase A180-5153KNV", "5153KNV"),
    ("R-22-Ford Focus-V4892-GT", "V4892GT"),
    ("88- Tesla Model 3-AlemanIa-2848NR", "2848NR"),   # truncated plate (>= 6 chars) is kept
])
def test_plate_from_name(name, expected):
    assert plate_from_name(name) == expected


@pytest.mark.parametrize("ref, expected", [("1082", (None, 82)), (1082.0, (None, 82)), ("D18", ("D", 18)),
                                           ("d-18", ("D", 18)), ("", (None, None))])
def test_ref_to_prefix(ref, expected):
    assert ref_to_prefix(ref) == expected


@pytest.mark.parametrize("ref, expected", [("26", "1026"), ("1082", "1082"), ("d-5", "D5"),
                                           ("#1088", "1088"), (" #D-28 ", "D28"), ("#26", "1026")])
def test_canonical_ref(ref, expected):
    assert canonical_ref(ref) == expected


@pytest.mark.parametrize("ref, expected", [
    ("#1088", "1088"), (" #D-28 ", "D28"), ("# 1088", "1088"), ("#d-5", "D5"),   # referencias del CRM
    ("1082", "1082"), (1082, "1082"), (1082.0, "1082"), ("1082.0", "1082"), ("d-5", "D5"), (" r_11 ", "R11"),
    ("C-2", "C2"), ("", ""), (None, ""),                                        # comportamiento de siempre
])
def test_normalize_ref(ref, expected):
    assert normalize_ref(ref) == expected


def test_ref_to_prefix_accepts_crm_refs():
    assert ref_to_prefix("#1088") == (None, 88)
    assert ref_to_prefix(" #D-28 ") == ("D", 28)


# ------------------------------------------------------------------ scan_folders
@pytest.fixture
def ventas_tree(tmp_path):
    """A tree that mimics OneDrive/1_Ventas."""
    root = tmp_path / "1_Ventas"
    (root / "82-Kia Xceed-9028LXG" / "fotos").mkdir(parents=True)
    (root / "85-Nissan Qashqai-5475 LKK").mkdir()
    (root / "-------Consignacion" / "D-18 Smart Forfour 8536 JFF").mkdir(parents=True)
    (root / "----VENDIDOS" / "82-Kia Ceed-1234BCD").mkdir(parents=True)
    (root / "MASTER-BASE.xlsx").write_text("no soy una carpeta")
    return root


def test_scan_folders_lists_cars_and_groups(ventas_tree):
    folders = scan_folders(ventas_tree)
    by_name = {f.name: f for f in folders}
    assert set(by_name) == {"82-Kia Xceed-9028LXG", "85-Nissan Qashqai-5475 LKK",
                            "D-18 Smart Forfour 8536 JFF", "82-Kia Ceed-1234BCD"}
    assert "fotos" not in by_name and "MASTER-BASE.xlsx" not in by_name
    assert by_name["82-Kia Xceed-9028LXG"].group == "1_Ventas"
    assert by_name["D-18 Smart Forfour 8536 JFF"].group == "Consignacion"
    assert by_name["82-Kia Ceed-1234BCD"].group == "VENDIDOS"


def test_scan_folders_sold_flag_and_parsed_fields(ventas_tree):
    by_name = {f.name: f for f in scan_folders(ventas_tree)}
    assert by_name["82-Kia Ceed-1234BCD"].is_sold
    assert not by_name["82-Kia Xceed-9028LXG"].is_sold
    assert not by_name["D-18 Smart Forfour 8536 JFF"].is_sold
    smart = by_name["D-18 Smart Forfour 8536 JFF"]
    assert (smart.prefix_letter, smart.prefix_number, smart.plate) == ("D", 18, "8536JFF")
    assert by_name["85-Nissan Qashqai-5475 LKK"].plate == "5475LKK"


def test_scan_folders_missing_root(tmp_path):
    with pytest.raises(FileNotFoundError):
        scan_folders(tmp_path / "no-existe")


# ------------------------------------------------------------------------ locate
def car(name, group="1_Ventas"):
    return make_car_folder(Path("/fake") / group / name, group)


@pytest.fixture
def folders():
    return [car("82-Kia Xceed-9028LXG"), car("85-Nissan Qashqai-5475 LKK"),
            car("D-18 Smart Forfour 8536 JFF", "Consignacion"), car("82-Kia Ceed-1234BCD", "VENDIDOS")]


def test_locate_by_prefix(folders):
    res = locate(folders, ref="1085")
    assert res.found and res.folder.name == "85-Nissan Qashqai-5475 LKK"
    assert res.matched_by == "prefijo" and not res.ambiguous
    assert locate(folders, ref="D18").folder.name == "D-18 Smart Forfour 8536 JFF"


def test_locate_by_plate_with_space_in_folder_name(folders):
    res = locate(folders, plate="5475 LKK")
    assert res.folder.name == "85-Nissan Qashqai-5475 LKK"
    assert res.matched_by == "matrícula" and not res.ambiguous


def test_locate_plate_and_prefix_agree(folders):
    res = locate(folders, ref="1085", plate="5475LKK")
    assert res.folder.name == "85-Nissan Qashqai-5475 LKK"
    assert res.matched_by == "matrícula y prefijo" and not res.ambiguous


def test_locate_plate_wins_over_prefix(folders):
    res = locate(folders, ref="1085", plate="9028LXG")
    assert res.folder.name == "82-Kia Xceed-9028LXG"
    assert res.matched_by == "matrícula"
    assert res.ambiguous
    assert {c.name for c in res.candidates} == {"82-Kia Xceed-9028LXG", "85-Nissan Qashqai-5475 LKK"}
    assert "ambiguo" in res.describe()


def test_locate_two_prefix_matches_prefers_the_one_not_sold(folders):
    res = locate(folders, ref="1082")
    assert res.folder.name == "82-Kia Xceed-9028LXG"
    assert res.matched_by == "prefijo" and res.ambiguous
    assert len(res.candidates) == 2


def test_locate_two_active_prefix_matches_is_ambiguous():
    both_active = [car("82-Kia Xceed-9028LXG"), car("82-Kia Rio-5555FGH", "Consignacion")]
    res = locate(both_active, ref="1082")
    assert res.folder is None and res.ambiguous
    assert len(res.candidates) == 2
    assert "varias carpetas candidatas" in res.describe()


def test_locate_not_found(folders):
    res = locate(folders, ref="1999", plate="0000ZZZ")
    assert res.folder is None and not res.found
    assert res.candidates == [] and not res.ambiguous
    assert res.describe() == "carpeta no encontrada"
