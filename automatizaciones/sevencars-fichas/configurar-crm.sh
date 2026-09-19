#!/usr/bin/env bash
# Conecta el vigilante con el CRM (botones «Web y carteles» de la ficha del coche).
# Genera la clave compartida, la guarda en .env (CRM_URL, CRM_WORKER_SECRET, CRM_TRABAJOS=1) y la copia al
# portapapeles de Windows para pegarla en Vercel como AUTOMATIZACIONES_WORKER_SECRET. No la muestra en pantalla.
# Uso: bash configurar-crm.sh            (si ya hay una clave en .env, la vuelve a copiar sin cambiarla)
#      bash configurar-crm.sh --nueva    (genera otra: hay que pegarla de nuevo en Vercel)
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
ENV=.env
touch "$ENV"
chmod 600 "$ENV"

actual=$(grep -E '^CRM_WORKER_SECRET=' "$ENV" | tail -1 | cut -d= -f2- || true)
if [ -z "$actual" ] || [ "${1:-}" = "--nueva" ]; then
  clave=$(openssl rand -hex 32)
  grep -vE '^(CRM_URL|CRM_WORKER_SECRET|CRM_TRABAJOS)=' "$ENV" > "$ENV.tmp" || true
  mv "$ENV.tmp" "$ENV"
  chmod 600 "$ENV"
  {
    echo "CRM_URL=https://sevencars.vercel.app"
    echo "CRM_WORKER_SECRET=$clave"
    echo "CRM_TRABAJOS=1"
  } >> "$ENV"
  echo "Clave nueva guardada en $(pwd)/$ENV"
else
  clave=$actual
  echo "Ya había una clave en $ENV: se copia la misma."
fi

printf '%s' "$clave" | /mnt/c/Windows/System32/clip.exe
echo
echo "La clave está en el portapapeles. Ahora:"
echo "  1. Abrí https://vercel.com → proyecto sevencars-crm → Settings → Environment Variables"
echo "  2. Add: nombre AUTOMATIZACIONES_WORKER_SECRET, valor = pegar (Ctrl+V), entorno Production → Save"
echo "  3. Deployments → el último → «Redeploy» (las variables nuevas se usan desde el próximo deploy)"
echo "  4. Avisale a Claude: prueba la conexión con  ../.venv/bin/python vigilar.py --probar-crm"
