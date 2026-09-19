#!/usr/bin/env bash
# Lanzador del vigilante: se ejecuta desde el arranque de Windows con
#   wsl.exe -d Ubuntu -u seb -- /home/seb/crmnuevo/automatizaciones/sevencars-fichas/vigilar.sh
# Carga el perfil (PATH con el CLI de Claude, etc.) porque wsl.exe no abre una shell de inicio de sesión.
[ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1
cd "$(dirname "$(readlink -f "$0")")" || exit 1
exec ../.venv/bin/python vigilar.py "$@"
