#!/usr/bin/env python
"""Corrige la matrícula cargada en un producto de sevencars.es y vuelve a sincronizar su financiación.

Uso: ../.venv/bin/python corregir-matricula-web.py <id_producto> <matricula_correcta>
Ejemplo (Hyundai i10 ref 1070, que en la web tenía la matrícula del Fiat 500):
      ../.venv/bin/python corregir-matricula-web.py 36022 0480NLJ
"""
import os
import subprocess
import sys

from wc_client import WcClient, construir_meta


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    product_id, plate = int(sys.argv[1]), sys.argv[2].replace(" ", "").upper()
    c = WcClient.desde_env()
    p = c.obtener_producto(product_id)
    antes = {m["key"]: m["value"] for m in p.get("meta_data", [])}
    print(f"Producto {product_id}: {p['name']} · matrícula en la web: {antes.get('matricula')!r} → {plate}")
    meta = [m for m in construir_meta({"matricula": plate, "matricula_crm": plate}) if m["key"] in ("matricula", "matricula_crm")]
    c.actualizar_producto(product_id, {"meta_data": meta})
    despues = {m["key"]: m["value"] for m in c.obtener_producto(product_id).get("meta_data", [])}
    print(f"Matrícula corregida: {despues.get('matricula')!r}")
    print("== Vuelvo a sincronizar la financiación desde la hoja")
    env = dict(os.environ, FICHAS_NO_BROWSER="1")
    return subprocess.call([sys.executable, "publicar.py", "--matricula", plate, "--actualizar", "--solo-financiacion", "--si"], env=env)


if __name__ == "__main__":
    sys.exit(main())
