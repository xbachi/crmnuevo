#!/usr/bin/env bash
# Copia el arranque automático del vigilante a la carpeta de inicio de Windows.
set -e
ORIGEN="$(dirname "$(readlink -f "$0")")/sevencars-vigilar-fotos.vbs"
DESTINO="/mnt/c/Users/Usuario/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup"
cp "$ORIGEN" "$DESTINO/"
echo "Listo: instalado en $DESTINO"
ls -la "$DESTINO"/sevencars-vigilar-fotos.vbs
