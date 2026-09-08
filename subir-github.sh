#!/usr/bin/env bash
# Primer commit de las herramientas de fotosseven y creación del repo privado en GitHub (xbachi/fotosseven).
# Uso: bash ~/fotosseven/subir-github.sh
# Las siguientes veces basta con: git add -A && git commit -m "..." && git push
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

echo "== comprobación: nada sensible en el índice"
git add -A .
if git status --short | grep -iE '\.env$|credentials/|cochesnet-perfil|reports/|token\.json'; then
  echo "ERROR: hay archivos sensibles en el índice, no se sube nada."; exit 1
fi
echo "   ok ($(git status --short | wc -l) archivos)"

echo "== commit"
git commit -q -m "Herramientas Sevencars: pipeline de fotos, fichas, publicación web, vigilante y luna

- sevencars-photo-pipeline: edición de fotos por lote con OpenAI images.edit
- sevencars-fichas: verificación de documentos contra la hoja, publicar.py (WooCommerce),
  normalización de fotos, vigilar.py (vigilante de carpetas), cuotas según Presupuesto_2025,
  luna.py (imágenes de precio para la luna) y kit para coches.net

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TTY47Mtuk4LkY5U9gt6Qfa"
git log --oneline -1

echo "== repo privado en GitHub y push"
if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin main
else
  gh repo create xbachi/fotosseven --private --source=. --remote=origin --push
fi
echo "Listo: https://github.com/xbachi/fotosseven"
