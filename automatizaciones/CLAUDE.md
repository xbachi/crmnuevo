# automatizaciones/ — herramientas de Sevencars que corren en la PC

Antes vivían en el repo `xbachi/fotosseven` (importado acá con `git subtree`, con historial). Corren en la PC del
dueño (WSL) porque necesitan OneDrive (`/mnt/c/Users/Usuario/OneDrive/1_Ventas`), el `claude` CLI, las fuentes de
Windows y las credenciales de Google/WooCommerce de `~/editor-fotos-seven/`. Nada de esto se despliega en Vercel.

- `sevencars-fichas/` (Python 3.12, venv en `automatizaciones/.venv`): `publicar.py` (borrador en sevencars.es,
  `--actualizar --solo-financiacion`, `--solo-ficha`, `--cambiar-fotos`), `luna.py` (carteles del parabrisas),
  `verificar.py` (hoja Base_Datos contra documentos), `vigilar.py` (vigilante 24/7 que arranca con Windows),
  `cochesnet.py`. Atajos en `~/.local/bin`: `publicar-cambioprecio|cambiofotos|cambioficha <ref|matrícula>`.
  Documentación completa en `sevencars-fichas/README.md`.
- `sevencars-photo-pipeline/` (TypeScript/tsx, su propio `package.json`): fotos de estudio con IA.

## Reglas
- **Verificación acá es pytest, no npm:** `cd automatizaciones/sevencars-fichas && ../.venv/bin/python -m pytest -q`.
  El type-check, lint, jest y el build del CRM ignoran esta carpeta a propósito.
- **Nunca `--actualizar` con `--si` a ciegas:** primero sin `--si` (o `--simular`) y confirmar cada diferencia; el
  dueño edita borradores a mano en WordPress y la herramienta no guarda copia de los valores anteriores.
- **Identidad:** un coche se identifica por referencia + matrícula del permiso de circulación, nunca por el modelo.
  Las referencias del CRM (`#1088`) valen tal cual (entre comillas en bash: `'#1088'`).
- **Nunca leer** `.env`, `credentials/` ni `data/cochesnet-perfil/`.
- El vigilante corre desde esta carpeta (lock `sevencars-fichas/data/vigilar.lock`, log `logs/vigilar.log`); para
  reiniciarlo: matar el PID del lock y lanzar `sevencars-vigilar-fotos.vbs` de la carpeta Inicio de Windows con
  `wscript.exe`. Después de moverlo, `bash sevencars-fichas/instalar-vigilante.sh`.
- Un push a `main` despliega el CRM en producción aunque el cambio sea solo de esta carpeta (inofensivo: mismo CRM).
