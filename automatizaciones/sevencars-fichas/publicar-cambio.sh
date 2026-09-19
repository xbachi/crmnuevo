#!/usr/bin/env bash
# Atajos para coches ya publicados. Se usan con estos nombres, desde cualquier carpeta
# (enlaces en ~/.local/bin a este archivo):
#   publicar-cambioprecio <ref|matrícula> ...  precio y cuota a la web, carteles de precios y ficha de exposición
#   publicar-cambiofotos  <ref|matrícula> ...  reemplaza las fotos del coche en la web por las de su carpeta fotos/
#   publicar-cambioficha  <ref|matrícula> ...  vuelve a bajar la ficha de exposición (PDF de la web)
# Acepta varios coches seguidos (1033 1090 6913MDM). Lo que empieza por - (--simular, --si) va tal cual a publicar.py.
set -u
DIR=$(dirname "$(readlink -f "$0")")
PY="$DIR/../.venv/bin/python"
MODO=$(basename "$0")
cd "$DIR" || exit 1

FLAGS=()
COCHES=()
for a in "$@"; do
  case "$a" in
    -*) FLAGS+=("$a") ;;
    *) COCHES+=("$a") ;;
  esac
done
if [ ${#COCHES[@]} -eq 0 ]; then
  echo "Uso: $MODO <referencia o matrícula> [más coches] [--simular]"
  exit 2
fi

rc=0
for C in "${COCHES[@]}"; do
  # 6913MDM → por matrícula; 1033 → por referencia.
  if [[ "$C" =~ ^[0-9]{4}[A-Za-z]{3}$ ]]; then SEL=(--matricula "${C^^}"); else SEL=("$C"); fi
  echo "=================== $C ==================="
  case "$MODO" in
    publicar-cambioprecio)
      # Primero la web (y los carteles, que salen con --solo-financiacion); la ficha la arma la web con ese precio.
      if "$PY" publicar.py "${SEL[@]}" --actualizar --solo-financiacion "${FLAGS[@]}"; then
        "$PY" publicar.py "${SEL[@]}" --solo-ficha "${FLAGS[@]}" || rc=1
      else
        rc=1
      fi
      ;;
    publicar-cambiofotos) "$PY" publicar.py "${SEL[@]}" --cambiar-fotos "${FLAGS[@]}" || rc=1 ;;
    publicar-cambioficha) "$PY" publicar.py "${SEL[@]}" --solo-ficha "${FLAGS[@]}" || rc=1 ;;
    *) echo "Este script se usa como publicar-cambioprecio, publicar-cambiofotos o publicar-cambioficha."; exit 2 ;;
  esac
done
exit $rc
