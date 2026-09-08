"""Financiación de Sevencars: descuento, importe, plazo y cuota mensual, replicando la hoja «Presupuesto_2025»
(columna ESTANDAR, sin entrada) del propietario; y planificación de la columna AD 'cuota' de Base_Datos.

Regla, por coche (F precio contado, E fecha de matriculación, J tarifa; `hoy` = fecha del cálculo):
  · tarifa: la de J si está escrita; si no, por antigüedad m = DAYS360(E, hoy) / 30:
        m < 72 → NORMAL · m < 120 → ESPECIAL · m < 156 → SIN DTO · si no → Consultanos
  · descuento M: NORMAL 7 % · ESPECIAL 3 % · SIN DTO y Consultanos 0
  · dto = MROUND(min(F / (1 + M) · M, M · 20 000), 5)
  · importe a financiar = F − dto + 390 (gestión y preparación)
  · edad = DATEDIF(E, hoy, "M"); meses_max = 180 − edad; plazos permitidos según la tarifa (ver plazos_permitidos)
  · cuota = min(importe · coeficiente[n]) entre los plazos permitidos (= el plazo más largo), en euros enteros
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from common import norm_text, parse_date
from sheet import CellWrite, SheetData, VehicleRow

# ------------------------------------------------------------------ tarifas
TARIFA_NORMAL = "NORMAL"
TARIFA_ESPECIAL = "ESPECIAL"
TARIFA_SIN_DTO = "SIN DTO"
TARIFA_CONSULTANOS = "Consultanos"
TARIFAS = (TARIFA_NORMAL, TARIFA_ESPECIAL, TARIFA_SIN_DTO, TARIFA_CONSULTANOS)
# Antigüedad en meses (DAYS360/30) por debajo de la cual aplica cada tarifa; más vieja → Consultanos
LIMITES_TARIFA = ((72, TARIFA_NORMAL), (120, TARIFA_ESPECIAL), (156, TARIFA_SIN_DTO))
DESCUENTO_TARIFA = {TARIFA_NORMAL: 0.07, TARIFA_ESPECIAL: 0.03, TARIFA_SIN_DTO: 0.0, TARIFA_CONSULTANOS: 0.0}
TOPE_BASE_DESCUENTO = 20000          # el descuento nunca supera M · 20 000 €
GESTION_PREPARACION = 390            # se suma al importe a financiar
DTO_RENOVE = 850                     # descuento «renove» de la web (ACF _dto_renove)
VIDA_MAX_MESES = 180                 # edad del coche + plazo ≤ 180 meses
PLAZOS_NORMAL = (120, 108, 96, 84, 72)                     # regla «PLAZO NORMAL»; 60 solo si 72 no entra
PLAZOS_SIN_DTO = (120, 108, 96, 84, 72, 60, 48, 36, 24)    # SIN DTO: solo por edad
# Coeficientes cuota/importe (pestaña Tarifas_Finan). ESTANDAR = columna «9,99 DIC-2022»: es la que se publica.
COEFICIENTES_ESTANDAR = {120: 0.0151, 108: 0.016, 96: 0.0171, 84: 0.0186, 72: 0.021, 60: 0.024, 48: 0.028,
                         36: 0.035, 24: 0.05}
# Columna «8,99 ATENEA sept-2026» (MEJOR OPCIÓN del presupuesto). No se usa: se deja documentada por si el
# propietario decide publicar esa cuota en vez de la ESTANDAR.
COEFICIENTES_MEJOR_OPCION = {120: 0.01476, 108: 0.0155, 96: 0.016501, 84: 0.017863, 72: 0.019758, 60: 0.022494,
                             48: 0.026691, 36: 0.033799}
# Valor del ACF _tipo_vehiculo que el tema de sevencars.es comprueba para cada tarifa
TIPO_VEHICULO_WEB = {TARIFA_NORMAL: "", TARIFA_ESPECIAL: "especial", TARIFA_SIN_DTO: "especial_dto",
                     TARIFA_CONSULTANOS: "especial_dto"}

OK = "OK"
RELLENAR = "RELLENAR"
DISCREPANCIA = "DISCREPANCIA"
SIN_PRECIO = "SIN PRECIO"
SIN_FECHA = "SIN FECHA"
SIN_PLAZO = "SIN PLAZO"


def hoy_por_defecto() -> date:
    """Fecha del cálculo cuando no se indica otra (los tests la fijan)."""
    return date.today()


# ------------------------------------------------------------- fechas (Sheets)
def days360_us(d1: date, d2: date) -> int:
    """DAYS360(d1, d2) de Google Sheets/Excel con el método por defecto (US/NASD, años de 360 días):
    un inicio el 31 (o el último día de febrero) cuenta como 30; un final el 31 cuenta como 30 si el inicio
    quedó en 30 y como día 31 (1 del mes siguiente) si no. El último día de febrero como final no se ajusta."""
    dd1, dd2 = d1.day, d2.day
    if dd1 == 31 or (d1.month == 2 and dd1 == calendar.monthrange(d1.year, 2)[1]):
        dd1 = 30
    if dd2 == 31 and dd1 >= 30:
        dd2 = 30
    return (d2.year - d1.year) * 360 + (d2.month - d1.month) * 30 + (dd2 - dd1)


def datedif_meses(d1: date, d2: date) -> int:
    """DATEDIF(d1, d2, "M") de Google Sheets: meses completos (el día del mes de d2 debe llegar al de d1)."""
    meses = (d2.year - d1.year) * 12 + (d2.month - d1.month)
    if d2.day < d1.day:
        meses -= 1
    return meses


def mround(valor, multiplo: int = 5) -> int:
    """MROUND de Google Sheets: múltiplo más cercano; la mitad exacta se aleja de cero (362,5 → 365)."""
    cociente = Decimal(str(round(float(valor), 9))) / Decimal(multiplo)
    return int(cociente.quantize(Decimal("1"), rounding=ROUND_HALF_UP)) * multiplo


def _miles(valor) -> str:
    n = int(round(float(valor)))
    return f"{n:,}".replace(",", ".")


# ---------------------------------------------------------------- cálculo
def normalizar_tarifa(valor) -> str | None:
    """Texto de la columna J → NORMAL / ESPECIAL / SIN DTO / Consultanos; None si está vacío o no se reconoce."""
    t = norm_text(valor)
    if not t:
        return None
    if t == "normal":
        return TARIFA_NORMAL
    if t == "especial":
        return TARIFA_ESPECIAL
    if t.replace(" ", "") in ("sindto", "sindescuento"):
        return TARIFA_SIN_DTO
    if t.replace(" ", "") in ("consultanos", "consultar"):
        return TARIFA_CONSULTANOS
    return None


def tarifa_por_antiguedad(fecha_matriculacion: date, hoy: date) -> str:
    """Tarifa que la hoja pone cuando J está vacía: por meses de antigüedad DAYS360/30."""
    m = days360_us(fecha_matriculacion, hoy) / 30
    for limite, tarifa in LIMITES_TARIFA:
        if m < limite:
            return tarifa
    return TARIFA_CONSULTANOS


def descuento_financiacion(precio_contado: float, tarifa: str) -> int:
    """MROUND(min(precio / (1 + M) · M, M · 20 000), 5) con M según la tarifa (0 → sin descuento)."""
    m = DESCUENTO_TARIFA[tarifa]
    if m == 0:
        return 0
    return mround(min(precio_contado / (1 + m) * m, m * TOPE_BASE_DESCUENTO), 5)


def plazos_permitidos(meses_max: int, tarifa: str) -> list[int]:
    """Plazos (meses) que la hoja admite con `meses_max` = 180 − edad. Regla PLAZO NORMAL (NORMAL, ESPECIAL,
    Consultanos): 120…72 si meses_max > n − 1; 60 solo si 72 no entra y meses_max > 59; nunca 48/36/24.
    SIN DTO: solo por edad, cualquiera de 120…24 con meses_max > n − 1."""
    if tarifa == TARIFA_SIN_DTO:
        return [n for n in PLAZOS_SIN_DTO if meses_max > n - 1]
    plazos = [n for n in PLAZOS_NORMAL if meses_max > n - 1]
    if 72 not in plazos and meses_max > 59:
        plazos.append(60)
    return plazos


@dataclass
class Financiacion:
    tarifa: str | None            # NORMAL / ESPECIAL / SIN DTO / Consultanos (None si no hay tarifa ni fecha)
    dto: int | None               # descuento financiación (€)
    importe: float | None         # importe a financiar = precio − dto + 390
    edad_meses: int | None        # DATEDIF(E, hoy, "M")
    plazo: int | None             # meses del plazo elegido (el más largo permitido)
    coeficiente: float | None
    cuota: int | None             # €/mes enteros
    meses_max: int | None = None  # 180 − edad
    tarifa_de_hoja: bool = False  # True si la tarifa vino escrita en J
    nota: str = ""                # por qué no hay cuota, o avisos sobre la tarifa

    def descripcion(self) -> str:
        """'tarifa ESPECIAL · 96 meses · 12.510 € financiados' (lo que haya)."""
        partes = []
        if self.tarifa:
            partes.append(f"tarifa {self.tarifa}" + ("" if self.tarifa_de_hoja else " (por antigüedad)"))
        if self.plazo:
            partes.append(f"{self.plazo} meses")
        if self.importe is not None:
            partes.append(f"{_miles(self.importe)} € financiados")
        return " · ".join(partes)


def _precio(valor) -> float | None:
    if valor is None or valor == "":
        return None
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def calcular_financiacion(precio_contado, fecha_matriculacion, tarifa=None, hoy: date | None = None) -> Financiacion:
    """Réplica de Presupuesto_2025 (ESTANDAR, sin entrada). `tarifa`: texto de J (si está, manda sobre la
    calculada por antigüedad). `hoy`: fecha del cálculo (defecto: hoy). Siempre devuelve una Financiacion;
    `cuota` es None si falta el precio, la fecha o no hay plazo posible (ver `nota`)."""
    hoy = hoy or hoy_por_defecto()
    precio = _precio(precio_contado)
    fecha = fecha_matriculacion if isinstance(fecha_matriculacion, date) else parse_date(fecha_matriculacion)
    notas: list[str] = []
    tarifa_hoja = normalizar_tarifa(tarifa)
    if tarifa is not None and str(tarifa).strip() and tarifa_hoja is None:
        notas.append(f"tarifa '{str(tarifa).strip()}' no reconocida en la hoja (J): se calcula por antigüedad")
    if tarifa_hoja:
        t = tarifa_hoja
    elif fecha:
        t = tarifa_por_antiguedad(fecha, hoy)
    else:
        t = None
    edad = max(0, datedif_meses(fecha, hoy)) if fecha else None
    meses_max = VIDA_MAX_MESES - edad if edad is not None else None
    dto = descuento_financiacion(precio, t) if precio is not None and t else None
    importe = precio - dto + GESTION_PREPARACION if dto is not None else None
    plazo = coef = cuota = None
    if precio is None:
        notas.append("sin precio contado (F): no se calcula la cuota")
    elif fecha is None:
        notas.append("sin fecha de matriculación (E): no se calcula la cuota")
    else:
        plazos = plazos_permitidos(meses_max, t)
        if not plazos:
            notas.append(f"sin plazo de financiación posible (coche de {edad} meses)")
        else:
            _, plazo = min((importe * COEFICIENTES_ESTANDAR[n], -n) for n in plazos)
            plazo, coef = -plazo, COEFICIENTES_ESTANDAR[-plazo]
            cuota = int(Decimal(str(importe * coef)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return Financiacion(tarifa=t, dto=dto, importe=importe, edad_meses=edad, plazo=plazo, coeficiente=coef,
                        cuota=cuota, meses_max=meses_max, tarifa_de_hoja=tarifa_hoja is not None,
                        nota="; ".join(notas))


def cuota_entera(precio_contado, fecha_matriculacion, tarifa=None, hoy: date | None = None) -> int | None:
    """Cuota en euros enteros (redondeo half-up) o None."""
    return calcular_financiacion(precio_contado, fecha_matriculacion, tarifa, hoy).cuota


def formato_cuota(cuota: int | None) -> str:
    return f"{cuota} €/mes" if cuota is not None else ""


def cuota_texto(precio_contado, fecha_matriculacion, tarifa=None, hoy: date | None = None) -> str:
    return formato_cuota(cuota_entera(precio_contado, fecha_matriculacion, tarifa, hoy))


def tipo_vehiculo_web(tarifa: str | None) -> str:
    """ACF _tipo_vehiculo según la tarifa: NORMAL (o desconocida) '', ESPECIAL 'especial', SIN DTO y
    Consultanos 'especial_dto'. El tema de la web lo usa para recalcular _precio_financiado al guardar."""
    return TIPO_VEHICULO_WEB.get(tarifa, "")


def precio_financiado_web(precio_contado, tarifa: str | None) -> int | None:
    """Lo que sevencars.es recalcula en cada guardado desde _precio, _dto_renove y _tipo_vehiculo:
    precio − MROUND(min((precio − 850) / (1 + M) · M, M · 20 000), 5) − 850. None sin precio o sin tarifa."""
    precio = _precio(precio_contado)
    if precio is None or tarifa not in DESCUENTO_TARIFA:
        return None
    base = precio - DTO_RENOVE
    m = DESCUENTO_TARIFA[tarifa]
    dto = mround(min(base / (1 + m) * m, m * TOPE_BASE_DESCUENTO), 5) if m else 0
    return int(round(precio - dto - DTO_RENOVE))


# ------------------------------------------------------------ columna AD
@dataclass
class CuotaPlan:
    referencia: str
    fila: int
    precio: float | None          # precio contado (F)
    cuota_actual: float | None    # AD tal como está
    cuota: int | None             # calculada
    estado: str
    nota: str = ""
    tarifa: str | None = None
    plazo: int | None = None
    importe: float | None = None
    edad_meses: int | None = None


def precio_financiado(row: VehicleRow) -> tuple[float | None, str]:
    """Precio financiado que se publica (_precio_financiado): precio campaña (N); si falta, precio contado (F)
    con nota. La cuota NO sale de aquí: se calcula sobre el precio contado (ver calcular_financiacion)."""
    if row.precio_campana:
        return row.precio_campana, ""
    if row.precio_contado:
        return row.precio_contado, "sin precio campaña: se usa el precio contado"
    return None, ""


def financiacion_de_fila(row: VehicleRow, hoy: date | None = None) -> Financiacion:
    return calcular_financiacion(row.precio_contado, row.fecha_matriculacion, row.tarifa_financiacion, hoy)


def planificar_cuotas(data: SheetData, rows: list[VehicleRow] | None = None,
                      hoy: date | None = None) -> list[CuotaPlan]:
    """Una fila por coche: RELLENAR (AD vacía), OK (coincide ±1 €), DISCREPANCIA (no se pisa salvo --corregir),
    SIN PRECIO, SIN FECHA, SIN PLAZO."""
    plans: list[CuotaPlan] = []
    for row in (rows if rows is not None else data.rows):
        fin = financiacion_de_fila(row, hoy)
        actual = row.cuota
        nota = fin.nota
        if fin.cuota is None:
            estado = SIN_PRECIO if row.precio_contado is None else (SIN_FECHA if fin.edad_meses is None else SIN_PLAZO)
        elif row.is_empty("cuota"):
            estado = RELLENAR
        elif actual is not None and abs(actual - fin.cuota) <= 1:
            estado = OK
        else:
            estado = DISCREPANCIA
            nota = "; ".join(p for p in (nota, "la celda AD ya tiene otro valor: no se sobrescribe (salvo --corregir)") if p)
        plans.append(CuotaPlan(row.referencia, row.row_number, row.precio_contado, actual, fin.cuota, estado, nota,
                               tarifa=fin.tarifa, plazo=fin.plazo, importe=fin.importe, edad_meses=fin.edad_meses))
    return plans


def cuota_writes(data: SheetData, plans: list[CuotaPlan], corregir: bool = False) -> list[CellWrite]:
    """Las filas RELLENAR (celda vacía) y, solo con `corregir`, las DISCREPANCIA con allow_overwrite.
    Nada si la columna AD estuviera calculada por fórmula."""
    col = data.column_letter("cuota")
    if col is None or data.is_formula_column("cuota"):
        return []
    writes = []
    for p in plans:
        if p.cuota is None or data.cell_has_formula(p.fila, "cuota"):
            continue
        if p.estado == RELLENAR:
            writes.append(CellWrite(p.fila, "cuota", col, p.cuota))
        elif corregir and p.estado == DISCREPANCIA:
            writes.append(CellWrite(p.fila, "cuota", col, p.cuota, allow_overwrite=True))
    return writes
