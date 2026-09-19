"""Regla de identidad: carpeta (referencia + matrícula) + permiso (A, E). Puerta de escritura, prefijos del
localizador y regla de doble fuente para sobrescribir."""
from datetime import date
from pathlib import Path

import pytest

import identity as idm
import verificar
from compare import Finding
from extract import SCOPE_FULL, SCOPE_PERMISO, build_request, load_cache, save_cache
from locate import CarFolder, LocateResult, locate, parse_prefix, plate_from_name, plate_matches, scan_folders
from sheet import SheetData

HEADER = (["300", "IVA", "MODELO", "MATRICULA", "FECHA MATRICULACION"] + [""] * 18
          + ["kms", "motor cv", "cubicaje", "caja", "matriculacion", "matriculacion num", "", "bastidor"])
COLUMNS = {"referencia": "A", "modelo": "C", "matricula": "D", "fecha_matriculacion": "E", "kms": "X",
           "motor_cv": "Y", "cubicaje": "Z", "caja": "AA", "bastidor": "AE"}
VIN_H = "NLHBM51H6SZ680880"
VIN_T = "LRW3E7FD5PC818006"
VIN_F = "WF0LXXGAHLNK12345"


def datos_row(ref, plate, modelo="X", vin="", fecha="11/04/2022", kms="1000"):
    return [ref, "", modelo, plate, fecha] + [""] * 18 + [kms, "", "", "", "", "", "", vin]


def datos(*rows):
    return SheetData([HEADER] + list(rows))


def folder(name, group="1_Ventas"):
    from locate import make_car_folder
    return make_car_folder(Path("/x") / name, group)


def permiso(plate, vin=None, fecha="2022-04-11", b=None, kms=None, kms_date=None):
    return {"presente": True, "matricula": plate, "bastidor": vin, "fecha_matriculacion": fecha,
            "fecha_primera_matriculacion": b, "kilometraje": kms, "kilometraje_fecha": kms_date,
            "marca": "KIA", "denominacion_comercial": "XCEED"}


def ai(permiso_doc=None, ficha_doc=None):
    return {"permiso_circulacion": permiso_doc, "ficha_tecnica": ficha_doc, "notas": ""}


FOLDERS = [folder(n, g) for n, g in [
    ("82-Kia Xceed-9028LXG", "1_Ventas"), ("87-Hyundai-I20-2979NGK", "1_Ventas"),
    ("88- Tesla Model 3-AlemanIa-2848NR", "1_Ventas"), ("34 Nissan-Qashqai-0550 LLP", "1_Ventas"),
    ("37-Ford-Puma-1050LTG", "VENDIDOS"), ("D-32- Opel Astra-7194LXY", "Consignacion"),
    ("D-2-Nissan Juke", "Consignacion"), ("C-2-Citroen C3-1111BBB", "Consignacion"), ("R-13-Seat Leon", "Coches R"),
    ("D-10 Peugeot 208-2222CCC", "Consignacion"), ("I1-Mercedes A35 Amg Alemania", "IMPORTACION"),
    ("39-VW Golf-4121LMZ", "1_Ventas"),
]]


# ------------------------------------------------------------ localizador
@pytest.mark.parametrize("name,expected", [
    ("D-32- Opel Astra-7194LXY", ("D", 32)), ("D-2-Nissan Juke", ("D", 2)), ("C-2-", ("C", 2)), ("R-13-", ("R", 13)),
    ("34 Nissan-Qashqai-0550 LLP", (None, 34)), ("D-10 Peugeot 208", ("D", 10)), ("88- Tesla Model 3", (None, 88)),
    ("58 -Citröen-C4-2394HRV", (None, 58)), ("D 7 Fiat 500", ("D", 7)), ("MASTER-BASE", (None, None)),
])
def test_parse_prefix_variantes(name, expected):
    assert parse_prefix(name) == expected


def test_plate_truncada_en_carpeta():
    assert plate_from_name("88- Tesla Model 3-AlemanIa-2848NR") == "2848NR"
    assert plate_from_name("34 Nissan-Qashqai-0550 LLP") == "0550LLP"
    assert plate_matches("2848NR", "2848NRN") and plate_matches("9028LXG", "9028LXG")
    assert not plate_matches("2848N", "2848NRN") and not plate_matches("2848NR", "2848NR") is False
    assert not plate_matches("2848NR", "2848NM") and not plate_matches(None, "2848NRN") and not plate_matches("2848NR", "")


def test_locate_tesla_truncada_identidad_ok():
    loc = locate(FOLDERS, ref="1088", plate="2848NRN")
    assert loc.folder.name.startswith("88-") and loc.matched_by == "matrícula y prefijo"
    assert loc.ref_agrees and loc.plate_agrees and loc.identity_ok


def test_locate_hyundai_ref_equivocada_no_confirma():
    loc = locate(FOLDERS, ref="1088", plate="2979NGK")
    assert loc.folder.name == "87-Hyundai-I20-2979NGK" and loc.matched_by == "matrícula" and loc.ambiguous
    assert not loc.ref_agrees and loc.plate_agrees is True and not loc.identity_ok
    assert "prefijo de la carpeta (87)" in loc.identity_problem() and "1088" in loc.identity_problem()
    assert loc.folder.ref_from_prefix() == "1087"


def test_locate_puma_plate_distinta_no_confirma():
    # plate 4121LMZ belongs to folder 39, referencia 1037 to the Puma: plate wins, ambiguity reported, no identity
    loc = locate(FOLDERS, ref="1037", plate="4121LMZ")
    assert loc.folder.name == "39-VW Golf-4121LMZ" and loc.matched_by == "matrícula" and loc.ambiguous
    assert not loc.ref_agrees and loc.plate_agrees is True and not loc.identity_ok
    assert "prefijo de la carpeta (39)" in loc.identity_problem()
    # without the VW folder the Puma is found by prefix but its plate disagrees with the row
    loc = locate([f for f in FOLDERS if not f.name.startswith("39-")], ref="1037", plate="4121LMZ")
    assert loc.folder.name == "37-Ford-Puma-1050LTG" and loc.matched_by == "prefijo"
    assert loc.ref_agrees and loc.plate_agrees is False and not loc.identity_ok
    assert "1050LTG" in loc.identity_problem()


def test_locate_carpeta_sin_matricula_confirma_por_prefijo():
    loc = locate(FOLDERS, ref="D2", plate="3333DDD")
    assert loc.folder.name == "D-2-Nissan Juke" and loc.plate_agrees is None and loc.identity_ok
    assert locate(FOLDERS, ref="R13").folder.ref_from_prefix() == "R13"
    assert locate(FOLDERS, ref="D32", plate="7194LXY").identity_ok
    assert locate(FOLDERS, ref="1034", plate="0550LLP").identity_ok


def test_scan_folders_grupos_y_en_venta(tmp_path):
    for name in ["82-Kia Xceed-9028LXG", "----VENDIDOS/37-Ford-Puma-1050LTG", "-------Consignacion/D-2-Nissan",
                 "------IMPORTACION/I1-Mercedes A35", "-----------Coches R/R-13-Seat Leon-V1234GT"]:
        (tmp_path / name).mkdir(parents=True)
    (tmp_path / "82-Kia Xceed-9028LXG" / "fotos").mkdir()
    found = {f.name: f for f in scan_folders(tmp_path)}
    assert set(found) == {"82-Kia Xceed-9028LXG", "37-Ford-Puma-1050LTG", "D-2-Nissan", "I1-Mercedes A35",
                          "R-13-Seat Leon-V1234GT"}
    assert found["37-Ford-Puma-1050LTG"].is_sold and not found["37-Ford-Puma-1050LTG"].is_for_sale
    assert not found["R-13-Seat Leon-V1234GT"].is_for_sale and found["R-13-Seat Leon-V1234GT"].group == "Coches R"
    assert all(found[n].is_for_sale for n in ("82-Kia Xceed-9028LXG", "D-2-Nissan", "I1-Mercedes A35"))


# ------------------------------------------------------------ puerta de escritura
def test_check_identity_estados():
    ok_loc = locate(FOLDERS, ref="1082", plate="9028LXG")
    assert idm.check_identity("9028LXG", LocateResult(None), ai(permiso("9028LXG"))).estado == idm.SIN_CARPETA
    assert idm.check_identity("2979NGK", locate(FOLDERS, ref="1088", plate="2979NGK"), ai(permiso("2979NGK"))).estado == idm.NO_CONFIRMADA
    assert idm.check_identity("9028LXG", ok_loc, None).estado == idm.SIN_PERMISO
    assert idm.check_identity("9028LXG", ok_loc, ai(None)).estado == idm.SIN_PERMISO
    assert idm.check_identity("9028LXG", ok_loc, ai({"presente": False})).estado == idm.SIN_PERMISO
    assert idm.check_identity("9028LXG", ok_loc, ai(permiso(None))).estado == idm.SIN_PERMISO
    bad = idm.check_identity("9028LXG", ok_loc, ai(permiso("9028LXH")))
    assert bad.estado == idm.NO_CONFIRMADA and "9028LXH" in bad.nota and bad.folder_ok and not bad.permiso_ok
    good = idm.check_identity("9028 lxg", ok_loc, ai(permiso("9028LXG", VIN_H)))
    assert good.estado == idm.OK and good.confirmed and good.permiso.vin == VIN_H


def test_planned_writes_gate():
    data = datos(datos_row("1082", "9028LXG"))
    row = data.rows[0]
    findings = [Finding("cubicaje", "Z", None, 1580, "permiso", "RELLENAR", "", field_name="cubicaje"),
                Finding("bastidor", "AE", None, VIN_H, "permiso", "RELLENAR", "", field_name="bastidor")]
    ok_loc = locate(FOLDERS, ref="1082", plate="9028LXG")
    confirmed = idm.check_identity("9028LXG", ok_loc, ai(permiso("9028LXG", VIN_H)))
    assert [w.a1 for w in verificar.planned_writes(row, data, findings, confirmed)] == ["Z2", "AE2"]
    for blocked in (None, idm.check_identity("9028LXG", ok_loc, None),
                    idm.check_identity("9028LXG", ok_loc, ai(permiso("0000XXX", VIN_H))),
                    idm.check_identity("9028LXG", LocateResult(None), ai(permiso("9028LXG", VIN_H)))):
        assert verificar.planned_writes(row, data, findings, blocked) == []


def test_audit_row():
    loc = locate(FOLDERS, ref="1082", plate="9028LXG")
    row = datos(datos_row("1082", "9028LXG", vin=VIN_T)).rows[0]
    rec = idm.audit_row(row, loc, ai(permiso("9028LXG", VIN_H)), VIN_H)
    assert rec.estado == idm.DISCREPANCIA and "bastidor AE" in rec.nota and "Ventas coincide" in rec.nota
    row = datos(datos_row("1082", "9028LXG", vin=VIN_H)).rows[0]
    rec = idm.audit_row(row, loc, ai(permiso("9028LXG", VIN_H, fecha="2022-04-12")), VIN_T)
    assert rec.estado == idm.DISCREPANCIA and "fecha E" in rec.nota and f"Ventas difiere ({VIN_T})" in rec.nota
    rec = idm.audit_row(row, loc, ai(permiso("9028LXG", VIN_H)), None)
    assert rec.estado == idm.OK and rec.as_row()["bastidor_permiso"] == VIN_H
    rec = idm.audit_row(row, loc, None, VIN_H)
    assert rec.estado == idm.SIN_PERMISO and "sin confirmar" in rec.nota


def test_bastidor_check_usa_permiso_no_ventas():
    loc = locate(FOLDERS, ref="1082", plate="9028LXG")
    row = datos(datos_row("1082", "9028LXG")).rows[0]
    r = idm.bastidor_check(row, loc, ai(permiso("9028LXG", VIN_H)), VIN_T)
    assert (r.estado, r.bastidor_permiso, r.bastidor_ventas) == (idm.RELLENAR, VIN_H, VIN_T) and "Ventas difiere" in r.nota
    assert idm.bastidor_check(row, loc, None, VIN_T).estado == idm.SIN_PERMISO      # Ventas alone never fills
    assert idm.bastidor_check(row, LocateResult(None), ai(permiso("9028LXG", VIN_H)), None).estado == idm.SIN_CARPETA
    row_ae = datos(datos_row("1082", "9028LXG", vin=VIN_T)).rows[0]
    assert idm.bastidor_check(row_ae, loc, ai(permiso("9028LXG", VIN_H)), None).estado == idm.DISCREPANCIA
    assert idm.bastidor_check(row_ae, loc, ai(permiso("9028LXG", VIN_T)), VIN_T).estado == idm.OK


def test_flag_duplicate_vins():
    loc = locate(FOLDERS, ref="1082", plate="9028LXG")
    rows = datos(datos_row("1082", "9028LXG"), datos_row("1082", "9028LXG")).rows
    results = [idm.bastidor_check(r, loc, ai(permiso("9028LXG", VIN_H)), None) for r in rows]
    idm.flag_duplicate_vins(results)
    assert [r.estado for r in results] == [idm.REVISAR, idm.REVISAR] and "filas 2, 3" in results[0].nota


# ------------------------------------------------------------ corregir identidad
def test_corregir_hyundai_fila_122():
    row = datos(datos_row("1088", "2979NGK", "Hyundai i20")).rows[0]
    loc = locate(FOLDERS, ref="1088", plate="2979NGK")
    estado, nota, props = idm.corrections(row, loc, ai(permiso("2979NGK", VIN_H)), VIN_H, COLUMNS)
    assert estado == idm.NO_CONFIRMADA and props == []     # ambiguous: 1088 also matches the Tesla folder
    loc_single = locate([f for f in FOLDERS if not f.name.startswith("88-")], ref="1088", plate="2979NGK")
    estado, nota, props = idm.corrections(row, loc_single, ai(permiso("2979NGK", VIN_H)), VIN_H, COLUMNS)
    assert estado == idm.OK
    by = {c.campo: c for c in props}
    assert (by["referencia"].antes, by["referencia"].despues, by["referencia"].estado) == ("1088", "1087", idm.CORREGIR)
    assert "requiere --escribir" in by["referencia"].nota and by["referencia"].columna == "A"
    assert (by["bastidor"].estado, by["bastidor"].despues) == (idm.RELLENAR, VIN_H)
    assert "matrícula" not in by and "fecha matriculación" not in by


def test_corregir_puma_fila_55():
    row = datos(datos_row("1037", "4121LMZ", "Ford Puma", vin=VIN_T, fecha="01/01/2020")).rows[0]
    loc, how = verificar.locate_for_correction(FOLDERS, row, "ref")     # the typed referencia is trusted
    assert loc.folder.name == "37-Ford-Puma-1050LTG" and how == "referencia"
    p = permiso("1050LTG", VIN_F, fecha="2021-06-15", kms=30000, kms_date="2023-06-15")
    estado, nota, props = idm.corrections(row, loc, ai(p), VIN_F, COLUMNS, escribir=True)
    assert estado == idm.OK and "1050LTG" in nota
    by = {c.campo: c for c in props}
    assert (by["matrícula"].antes, by["matrícula"].despues, by["matrícula"].estado) == ("4121LMZ", "1050LTG", idm.CORREGIR)
    assert (by["fecha matriculación"].despues, by["fecha matriculación"].estado) == (date(2021, 6, 15), idm.CORREGIR)
    assert (by["bastidor"].estado, by["bastidor"].despues) == (idm.CORREGIR, VIN_F) and "Ventas" in by["bastidor"].nota
    assert "kms" not in by                                       # X nunca se corrige (informativo)
    assert "referencia" not in by
    # permiso plate that does not match the folder plate -> nothing proposed
    estado, nota, props = idm.corrections(row, loc, ai(permiso("4121LMZ", VIN_F)), VIN_F, COLUMNS)
    assert estado == idm.NO_CONFIRMADA and props == [] and "1050LTG" in nota


def test_sobrescribir_bastidor_requiere_dos_fuentes():
    row = datos(datos_row("1082", "9028LXG", vin=VIN_T)).rows[0]
    loc = locate(FOLDERS, ref="1082", plate="9028LXG")
    only_permiso = idm.corrections(row, loc, ai(permiso("9028LXG", VIN_H)), None, COLUMNS, escribir=True)[2]
    assert only_permiso[0].estado == idm.REVISAR and not only_permiso[0].writable
    with_ficha = idm.corrections(row, loc, ai(permiso("9028LXG", VIN_H), {"presente": True, "bastidor": VIN_H}),
                                 None, COLUMNS, escribir=True)[2]
    assert with_ficha[0].estado == idm.CORREGIR and "ficha técnica" in with_ficha[0].nota and with_ficha[0].writable
    with_ventas = idm.corrections(row, loc, ai(permiso("9028LXG", VIN_H)), VIN_H, COLUMNS, escribir=True)[2]
    assert with_ventas[0].estado == idm.CORREGIR and "Ventas" in with_ventas[0].nota
    empty = datos(datos_row("1082", "9028LXG")).rows[0]
    assert idm.corrections(empty, loc, ai(permiso("9028LXG", VIN_H)), None, COLUMNS)[2][0].estado == idm.RELLENAR
    kms_row = datos(datos_row("1082", "9028LXG", kms="")).rows[0]
    props = idm.corrections(kms_row, loc, ai(permiso("9028LXG", kms=24320, kms_date="2022-12-05")), None, COLUMNS)[2]
    assert [c.campo for c in props] == []                       # ni siquiera con X vacía se propone kms


# ------------------------------------------------------------ alcance y caché
def test_cache_scope(tmp_path):
    from docs import Document
    docs = [Document(Path("p.pdf"), "permiso", 1.0, 10)]
    save_cache("k", docs, "m", {"x": 1}, cache_dir=tmp_path, alcance=SCOPE_PERMISO, plate="9028LXG")
    assert load_cache("k", docs, cache_dir=tmp_path, scope=SCOPE_PERMISO)["resultado"] == {"x": 1}
    assert load_cache("k", docs, cache_dir=tmp_path, scope=SCOPE_FULL) is None
    save_cache("k", docs, "m", {"x": 2}, cache_dir=tmp_path, alcance=SCOPE_FULL)
    assert load_cache("k", docs, cache_dir=tmp_path, scope=SCOPE_PERMISO)["resultado"] == {"x": 2}
    assert load_cache("otro", docs, cache_dir=tmp_path, legacy_key="k")["resultado"] == {"x": 2}
    from extract import cache_key
    assert cache_key("82-Kia Xceed-9028LXG") == "82-Kia_Xceed-9028LXG" and cache_key(None, "9028LXG") == "9028LXG"


def test_build_request_liviano(tmp_path):
    from docs import find_documents, pick_lean_document
    from extract import SCOPE_LEAN
    from tests.conftest import write_jpeg, write_pdf
    write_jpeg(tmp_path / "Ficha técnica cara 1.jpeg", size=(120, 80))
    write_jpeg(tmp_path / "Ficha técnica cara 2.jpeg", size=(120, 80))
    write_pdf(tmp_path / "permiso-circulacion.pdf", "2202KSC")
    docs = find_documents(tmp_path)
    assert pick_lean_document(docs).name == "permiso-circulacion.pdf"
    for scope in (SCOPE_LEAN, SCOPE_PERMISO):
        req = build_request(docs, model="m", scope=scope)
        assert req.scope == scope and len(req.images) == 1 and req.doc_names == ["permiso-circulacion.pdf"]
        assert "permiso_circulacion" in req.prompt and "2202CSC" not in req.prompt and "2202KSC" in req.prompt
        assert len(req.prompt) < 2500
    full = build_request(docs, model="m", scope=SCOPE_FULL)
    assert len(full.images) == 3
    # without permiso: ficha cara 1 only
    (tmp_path / "permiso-circulacion.pdf").unlink()
    req = build_request(find_documents(tmp_path), model="m")
    assert req.doc_names == ["Ficha técnica cara 1.jpeg"] and "ficha_tecnica" in req.prompt and len(req.images) == 1
    assert build_request([], model="m").images == []


# ------------------------------------------------------------ fila sin matrícula
def test_fila_sin_matricula_se_confirma_por_referencia_y_permiso():
    loc = locate(FOLDERS, ref="1088", plate="")
    assert loc.folder.name.startswith("88-") and loc.plate_agrees is None and loc.identity_ok
    ok = idm.check_identity("", loc, ai(permiso("2848NRN", VIN_T)))
    assert ok.estado == idm.OK and ok.confirmed and ok.matricula_a_rellenar == "2848NRN"
    bad = idm.check_identity("", loc, ai(permiso("0000XXX", VIN_T)))
    assert bad.estado == idm.NO_CONFIRMADA and "0000XXX" in bad.nota and "2848NR" in bad.nota
    # folder without plate in its name: referencia + permiso
    loc2 = locate(FOLDERS, ref="D2", plate="")
    ok2 = idm.check_identity("", loc2, ai(permiso("3333DDD", VIN_H)))
    assert ok2.confirmed and ok2.matricula_a_rellenar == "3333DDD"
    # row plate present but different from folder+permiso stays unconfirmed (1070 case)
    loc3 = locate([folder("70-Hyundai-I10-Alemania-0480NLJ")], ref="1070", plate="0480LNJ")
    assert not loc3.identity_ok
    assert idm.check_identity("0480LNJ", loc3, ai(permiso("0480NLJ", VIN_H))).estado == idm.NO_CONFIRMADA


def test_fila_sin_matricula_escribe_D_y_bastidor():
    data = datos(datos_row("1088", "", "Tesla"))
    row = data.rows[0]
    loc = locate(FOLDERS, ref="1088", plate="")
    idc = idm.check_identity("", loc, ai(permiso("2848NRN", VIN_T, fecha="2023-05-05")))
    findings = [Finding("matrícula", "D", None, "2848NRN", "permiso", "RELLENAR", "", field_name="matricula"),
                Finding("bastidor", "AE", None, VIN_T, "permiso", "RELLENAR", "", field_name="bastidor")]
    writes = verificar.planned_writes(row, data, findings, idc)
    assert [(w.a1, w.value) for w in writes] == [("D2", "2848NRN"), ("AE2", VIN_T)]
    # fecha vacía se rellena como texto dd/mm/yyyy; matrícula no se duplica
    data2 = datos(datos_row("1088", "", "Tesla", fecha=""))
    findings2 = [Finding("fecha matriculación", "E", None, date(2023, 5, 5), "permiso", "RELLENAR", "",
                         field_name="fecha_matriculacion")]
    writes = verificar.planned_writes(data2.rows[0], data2, findings2, idc)
    assert [(w.a1, w.value) for w in writes] == [("D2", "2848NRN"), ("E2", "05/05/2023")]
    check = idm.bastidor_check(row, loc, ai(permiso("2848NRN", VIN_T)), VIN_T)
    assert check.estado == idm.RELLENAR and check.matricula_a_rellenar == "2848NRN" and "se rellenaría D" in check.nota
