"""Vehicle identity: a Datos row may only be written when its folder (referencia + plate) and its permiso de
circulación (matrícula A, bastidor E) agree with the row. Ventas-Sevencars is a hint, never proof."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from common import fmt_value, normalize_plate, parse_date, parse_int
from locate import LocateResult, plate_matches
from sheet import VehicleRow, normalize_vin, validate_vin

OK = "OK"
DISCREPANCIA = "DISCREPANCIA"
REVISAR = "REVISAR"
RELLENAR = "RELLENAR"
CORREGIR = "CORREGIR"
SIN_PERMISO = "SIN PERMISO"
SIN_DOCUMENTOS = "SIN DOCUMENTOS"
SIN_CARPETA = "SIN CARPETA"
NO_CONFIRMADA = "IDENTIDAD NO CONFIRMADA"

AUDIT_FIELDS = ["referencia", "fila", "matricula_datos", "matricula_permiso", "bastidor_AE", "bastidor_permiso",
                "bastidor_ventas", "fecha_datos", "fecha_permiso", "carpeta", "estado", "nota"]
BASTIDOR_FIELDS = ["referencia", "fila", "matricula", "bastidor_datos", "bastidor_permiso", "bastidor_ventas",
                   "estado", "nota"]


def _get(doc: dict | None, key: str):
    if not doc or not doc.get("presente", True):
        return None
    v = doc.get(key)
    return None if v is None or (isinstance(v, str) and not v.strip()) else v


def _join(*parts: str) -> str:
    return "; ".join(p for p in parts if p)


@dataclass
class PermisoData:
    plate: str | None = None
    vin: str | None = None
    date: date | None = None
    date_kind: str = ""            # "B" (primera matriculación) | "I"
    kms: int | None = None
    kms_date: str | None = None
    marca: str | None = None
    modelo: str | None = None


def permiso_data(ai: dict | None) -> PermisoData | None:
    """Identity fields read from the permiso de circulación (None if the permiso was not read)."""
    p = (ai or {}).get("permiso_circulacion")
    if not p or not p.get("presente", True):
        return None
    b = parse_date(_get(p, "fecha_primera_matriculacion"))
    i = parse_date(_get(p, "fecha_matriculacion"))
    d, kind = (b, "B") if b else (i, "I" if i else "")
    kms_date = parse_date(_get(p, "kilometraje_fecha"))
    return PermisoData(
        plate=normalize_plate(_get(p, "matricula")) or None,
        vin=normalize_vin(_get(p, "bastidor")) or None,
        date=d, date_kind=kind,
        kms=parse_int(_get(p, "kilometraje")),
        kms_date=fmt_value(kms_date) if kms_date else (_get(p, "kilometraje_fecha") or None),
        marca=_get(p, "marca"), modelo=_get(p, "denominacion_comercial"),
    )


def ficha_vin(ai: dict | None) -> str | None:
    return normalize_vin(_get((ai or {}).get("ficha_tecnica"), "bastidor")) or None


# ------------------------------------------------------------- write gate
@dataclass
class IdentityCheck:
    estado: str
    nota: str = ""
    folder_ok: bool = False
    permiso_ok: bool = False
    permiso: PermisoData | None = None
    matricula_a_rellenar: str | None = None    # row without plate: D to fill from the permiso

    @property
    def confirmed(self) -> bool:
        return self.folder_ok and self.permiso_ok


def check_identity(row_plate: str | None, loc: LocateResult, ai: dict | None, has_docs: bool = True) -> IdentityCheck:
    """(a) folder located with referencia agreement and plate agreement (when the folder name has a plate);
    (b) permiso read and its matrícula equals the row's matrícula. has_docs=False -> SIN DOCUMENTOS."""
    p = permiso_data(ai)
    if not loc.found:
        return IdentityCheck(SIN_CARPETA, loc.identity_problem() or "carpeta no encontrada", permiso=p)
    if not loc.identity_ok or loc.ambiguous:
        return IdentityCheck(NO_CONFIRMADA, loc.identity_problem(), False, False, p)
    if not has_docs:
        return IdentityCheck(SIN_DOCUMENTOS, "la carpeta no tiene permiso ni ficha técnica", True, False, p)
    if p is None:
        return IdentityCheck(SIN_PERMISO, "permiso de circulación no leído", True, False, p)
    if not p.plate:
        return IdentityCheck(SIN_PERMISO, "matrícula ilegible en el permiso", True, False, p)
    row_plate = normalize_plate(row_plate)
    if not row_plate:
        # Row without plate: identity = folder by referencia + permiso plate equal to the folder plate (if any)
        fp = loc.folder.plate
        if fp and not plate_matches(fp, p.plate):
            return IdentityCheck(NO_CONFIRMADA, f"fila sin matrícula: la del permiso ({p.plate}) no coincide con la de "
                                                f"la carpeta ({fp})", True, False, p)
        nota = (f"fila sin matrícula: permiso ({p.plate}) coincide con la carpeta; se rellenaría D" if fp
                else f"fila sin matrícula y carpeta sin matrícula en el nombre: referencia + permiso ({p.plate}); se rellenaría D")
        return IdentityCheck(OK, nota, True, True, p, matricula_a_rellenar=p.plate)
    if p.plate != row_plate:
        return IdentityCheck(NO_CONFIRMADA,
                             f"la matrícula del permiso ({p.plate}) no coincide con la de la hoja ({row_plate})", True, False, p)
    return IdentityCheck(OK, "carpeta y permiso coinciden con la fila", True, True, p)


# ---------------------------------------------------------------- audit
@dataclass
class AuditRecord:
    referencia: str
    fila: int
    matricula_datos: str
    matricula_permiso: str
    bastidor_AE: str
    bastidor_permiso: str
    bastidor_ventas: str
    fecha_datos: str
    fecha_permiso: str
    carpeta: str
    estado: str
    nota: str

    def as_row(self) -> dict:
        return {k: getattr(self, k) for k in AUDIT_FIELDS}


def ventas_note(permiso_vin: str | None, ventas_vin: str | None) -> str:
    if not ventas_vin:
        return ""
    if not permiso_vin:
        return f"Ventas: {ventas_vin} (sin confirmar con el permiso)"
    return "Ventas coincide" if ventas_vin == permiso_vin else f"Ventas difiere ({ventas_vin})"


def audit_row(row: VehicleRow, loc: LocateResult, ai: dict | None, ventas_vin: str | None) -> AuditRecord:
    idc = check_identity(row.matricula, loc, ai)
    p = idc.permiso
    estado = idc.estado
    notas = [] if idc.estado == OK else [idc.nota]
    if idc.confirmed:
        if p.vin and row.bastidor and row.bastidor != p.vin:
            estado = DISCREPANCIA
            notas.append(f"bastidor AE ({row.bastidor}) ≠ permiso ({p.vin})")
        if p.date and row.fecha_matriculacion and row.fecha_matriculacion != p.date:
            estado = DISCREPANCIA
            notas.append(f"fecha E ({fmt_value(row.fecha_matriculacion)}) ≠ permiso ({fmt_value(p.date)})")
        if p.vin and not row.bastidor:
            notas.append("AE vacía (bastidor del permiso disponible)")
        if p.vin and not validate_vin(p.vin):
            notas.append("formato de bastidor dudoso")
    notas.append(ventas_note(p.vin if p else None, ventas_vin))
    return AuditRecord(
        referencia=row.referencia, fila=row.row_number, matricula_datos=row.matricula,
        matricula_permiso=(p.plate or "") if p else "", bastidor_AE=row.bastidor,
        bastidor_permiso=(p.vin or "") if p else "", bastidor_ventas=ventas_vin or "",
        fecha_datos=fmt_value(row.fecha_matriculacion), fecha_permiso=fmt_value(p.date) if p and p.date else "",
        carpeta=loc.folder.name if loc.found else "", estado=estado, nota=_join(*notas))


# ------------------------------------------------------------ --bastidores
@dataclass
class BastidorCheck:
    referencia: str
    fila: int
    matricula: str
    bastidor_datos: str
    bastidor_permiso: str
    bastidor_ventas: str
    estado: str
    nota: str = ""

    @property
    def row_number(self) -> int:
        return self.fila

    matricula_a_rellenar: str | None = None

    def as_row(self) -> dict:
        return {k: getattr(self, k) for k in BASTIDOR_FIELDS}


def bastidor_check(row: VehicleRow, loc: LocateResult, ai: dict | None, ventas_vin: str | None) -> BastidorCheck:
    """AE vs the PERMISO VIN (only source that may be written). Ventas agreement is reported only."""
    idc = check_identity(row.matricula, loc, ai)
    p = idc.permiso
    pvin = (p.vin or "") if p else ""
    notas = []
    if not idc.confirmed:
        estado = idc.estado
        notas.append(idc.nota)
    elif not pvin:
        estado = SIN_PERMISO
        notas.append("bastidor ilegible en el permiso")
    elif not row.bastidor:
        estado = RELLENAR
        if not validate_vin(pvin):
            notas.append("formato de bastidor dudoso")
    elif row.bastidor == pvin:
        estado = OK
    else:
        estado = DISCREPANCIA
        notas.append("AE no coincide con el permiso (no se sobrescribe; usar --corregir-identidad)")
    notas.append(ventas_note(pvin or None, ventas_vin))
    if idc.matricula_a_rellenar and estado in (RELLENAR, OK):
        notas.append(f"se rellenaría D = {idc.matricula_a_rellenar}")
    return BastidorCheck(row.referencia, row.row_number, row.matricula, row.bastidor, pvin, ventas_vin or "",
                         estado, _join(*notas), matricula_a_rellenar=idc.matricula_a_rellenar)


def flag_duplicate_vins(results: list, attr: str = "bastidor_permiso") -> None:
    """A VIN proposed (RELLENAR) for more than one row is never written: all rows sharing it -> REVISAR."""
    groups: dict[str, list] = {}
    for r in results:
        vin = getattr(r, attr)
        if vin:
            groups.setdefault(vin, []).append(r)
    for group in groups.values():
        if len(group) < 2:
            continue
        filas = ", ".join(str(g.row_number) for g in group)
        if any(g.estado == RELLENAR for g in group):
            for g in group:
                g.estado = REVISAR
                g.nota = _join(g.nota, f"bastidor repetido en filas {filas}")
        else:
            for g in group:
                g.nota = _join(g.nota, f"mismo bastidor en filas {filas}")


# ------------------------------------------------------- --corregir-identidad
@dataclass
class Correction:
    campo: str
    columna: str
    field_name: str
    antes: object
    despues: object
    fuente: str
    estado: str
    nota: str = ""
    row_number: int = 0

    @property
    def overwrite(self) -> bool:
        return self.antes not in (None, "")

    @property
    def writable(self) -> bool:
        return self.estado in (RELLENAR, CORREGIR)

    @property
    def a1(self) -> str:
        return f"{self.columna}{self.row_number}"


def identity_for_correction(loc: LocateResult, ai: dict | None) -> tuple[bool, str, str]:
    """For corrections the row itself may be wrong: the folder and the permiso must agree with EACH OTHER
    (folder plate == permiso plate; or, if the folder name has no plate, folder prefix == row referencia)."""
    if not loc.found:
        return False, SIN_CARPETA, loc.identity_problem() or "carpeta no encontrada"
    if loc.ambiguous:
        return False, NO_CONFIRMADA, "carpeta ambigua: " + loc.identity_problem()
    p = permiso_data(ai)
    if p is None:
        return False, SIN_PERMISO, "permiso de circulación no leído"
    if not p.plate:
        return False, SIN_PERMISO, "matrícula ilegible en el permiso"
    folder = loc.folder
    if folder.plate:
        if not plate_matches(folder.plate, p.plate):
            return False, NO_CONFIRMADA, (f"la matrícula del permiso ({p.plate}) no coincide con la de la carpeta "
                                          f"({folder.plate})")
        return True, OK, f"carpeta {folder.name} y permiso coinciden en la matrícula {p.plate}"
    if not loc.ref_agrees:
        return False, NO_CONFIRMADA, "la carpeta no tiene matrícula en el nombre y su prefijo no coincide con la referencia"
    return True, OK, f"carpeta {folder.name} (sin matrícula en el nombre) coincide por referencia; permiso {p.plate}"


def corrections(row: VehicleRow, loc: LocateResult, ai: dict | None, ventas_vin: str | None,
                columns: dict[str, str], escribir: bool = False) -> tuple[str, str, list[Correction]]:
    """Proposed corrections for A, D, E, AE (and X from the permiso reading). Overwriting a non-empty cell needs
    --escribir; for the VIN it also needs a second source (ficha or Ventas), otherwise REVISAR."""
    ok, estado, nota = identity_for_correction(loc, ai)
    if not ok:
        return estado, nota, []
    p = permiso_data(ai)
    fvin = ficha_vin(ai)
    folder = loc.folder
    out: list[Correction] = []

    def propose(campo, field_name, antes, despues, fuente, extra_nota="", vin_check=False):
        if despues in (None, "") or antes == despues:
            return
        col = columns.get(field_name, "")
        if antes in (None, ""):
            est, n = RELLENAR, extra_nota
        else:
            est, n = CORREGIR, extra_nota
            if vin_check:
                second = (fvin and fvin == despues) or (ventas_vin and ventas_vin == despues)
                if not second:
                    est = REVISAR
                    n = _join(n, "bastidor solo en el permiso: para sobrescribir debe coincidir con la ficha o con Ventas")
                else:
                    n = _join(n, "confirmado por " + ("ficha técnica" if fvin == despues else "Ventas"))
            if est == CORREGIR and not escribir:
                n = _join(n, "sobrescribir requiere --escribir")
        out.append(Correction(campo, col, field_name, antes, despues, fuente, est, n, row.row_number))

    propose("referencia", "referencia", row.referencia, folder.ref_from_prefix(), f"carpeta {folder.name}")
    propose("matrícula", "matricula", row.matricula or "", p.plate, "permiso (A)")
    if p.date:
        propose("fecha matriculación", "fecha_matriculacion", row.fecha_matriculacion, p.date, f"permiso ({p.date_kind})")
    if p.vin:
        propose("bastidor", "bastidor", row.bastidor or "", p.vin, "permiso (E)", vin_check=True)
    # kms (X) is never corrected: informational only (column X is formula-driven in the live sheet)
    return OK, nota, out
