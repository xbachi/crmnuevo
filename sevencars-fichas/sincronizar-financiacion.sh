#!/usr/bin/env bash
# Actualiza SOLO los datos de financiación (_precio, _precio_financiado, _cuota, _tipo_vehiculo,
# _fecha_matriculacion) de los coches ya publicados en sevencars.es, sin tocar fotos ni descripciones.
# Uso: bash sincronizar-financiacion.sh [--simular]
#   Sin argumentos aplica los cambios; con --simular solo muestra las diferencias.
set -u
cd "$(dirname "$(readlink -f "$0")")"
MODO=${1:-}
if [ "$MODO" = "--simular" ]; then EXTRA="--simular"; else EXTRA="--si"; fi
# Matrículas de los coches publicados el 08/09/2026 (la del Ford Kuga "ALEMANA" no está en la hoja y se omite).
for M in 0483MBJ 1650MJR 2848NRN 5475LKK 2979NGK 3429LHT 4744LRS 9028LXG 1113JZL 7487MGV 5153KNV 2202KSC 6913MDM; do
  echo "=================== $M ==================="
  FICHAS_NO_BROWSER=1 ../.venv/bin/python publicar.py --matricula "$M" --actualizar --solo-financiacion $EXTRA 2>&1 | grep -v "accounts.google"
done
