# Sevencars – verificación de fichas

Herramienta de línea de comandos que, para cada coche de la hoja **Base_Datos** (pestaña `Datos`),
busca su carpeta en OneDrive (`1_Ventas`), lee los documentos oficiales (**ficha técnica / tarjeta ITV**
y **permiso de circulación**), compara los datos con la hoja y propone qué celdas vacías rellenar.
Además cruza los datos con la hoja **Ventas-Sevencars** (solo lectura).

Fuentes, por orden:

1. **Permiso de circulación** (fuente principal, siempre más legible) y **ficha técnica / tarjeta ITV**
   (complemento: CO2, norma Euro, neumáticos, y lo que el permiso no traiga).
2. Base_Datos (`Datos`): se rellenan sus celdas vacías a partir de los documentos.
3. Ventas-Sevencars: solo se compara y se informa; nunca se escribe.

**`ficha-expo.pdf` NO es una fuente**: se genera desde WordPress después de publicar el coche (botón «generar
PDF» de la ficha del producto), así que es una exportación de los datos de la propia web y no existe para un coche
sin publicar. Solo se lista en la carpeta como «generada desde la web, no es fuente».

## Qué hace

Para cada referencia (`1082`, `26` = `1026`, `D5`, …):

1. Busca la fila en Base_Datos (por referencia o por matrícula).
2. Localiza la carpeta en `1_Ventas` (y en sus subcarpetas `-------Consignacion`, `----VENDIDOS`, etc.)
   por número de carpeta (`1082` → `82-…`) o por matrícula (`5475 LKK` = `5475LKK`).
3. Reconoce los documentos: `Ficha técnica cara 1.jpeg`, `duplicado-tarjetaItv-0.pdf`,
   `Permiso de circulación cara 2.jpeg`, `permiso-circulacion.pdf`, `ficha-expo.pdf`, etc.
4. Envía las imágenes (JPEG o páginas de PDF) a un modelo de visión de OpenAI que devuelve los campos
   (A matrícula, I fecha de matriculación, D.1 marca, D.3 denominación, E bastidor, P.1 cilindrada,
   P.2 kW, P.3 combustible, kilometraje del permiso, …). El resultado se guarda en
   `data/extracciones/<MATRICULA>.json` y se reutiliza mientras los documentos no cambien.
5. Compara con la hoja y muestra una tabla por coche con el estado de cada campo:

   | Estado | Significado |
   |---|---|
   | `OK` | la hoja y el documento coinciden |
   | `RELLENAR` | la hoja está vacía y el documento tiene el valor (candidato a escribir) |
   | `DISCREPANCIA` | ambos tienen valor y no coinciden (nunca se sobrescribe) |
   | `SIN DATO` | ni la hoja ni los documentos tienen el dato |
   | `REVISAR` | hay que mirarlo a mano (p. ej. potencia de un híbrido) |
   | `NO ENCONTRADO` | el coche no aparece en Ventas-Sevencars |

6. Escribe `reports/<ref>-<MATRICULA>.md` (valores por fuente + hallazgos + sección Ventas) y acumula
   `reports/propuesta.csv` (`referencia, matricula, campo, columna_sheet, valor_sheet, valor_documento,
   fuente, estado`).

## Regla de identidad (prioridad máxima)

El concesionario compra los mismos modelos una y otra vez: el nombre del modelo no identifica al coche.
**Un coche es su referencia + su permiso de circulación (matrícula A y bastidor E).** Ventas-Sevencars es
una pista, nunca una prueba. No se escribe nada en una fila sin esta confirmación doble:

1. **Carpeta**: localizada con acuerdo de referencia (prefijo numérico = referencia − 1000, o prefijo
   `D-`/`C-`/`R-` normalizado) y, si el nombre de la carpeta lleva matrícula, acuerdo de matrícula con la
   fila (se aceptan matrículas truncadas en el nombre, p. ej. `2848NR`, con al menos 6 caracteres).
2. **Permiso**: el permiso de circulación se leyó y su matrícula coincide con la de la fila.

Si falla, el estado es `SIN CARPETA`, `SIN DOCUMENTOS`, `SIN PERMISO` o `IDENTIDAD NO CONFIRMADA` y las
celdas `RELLENAR` quedan retenidas (se ven en el informe pero no se escriben). Esto aplica a todos los modos.

**Fila sin matrícula (D vacía)**: no se excluye. La identidad queda confirmada si la carpeta se localiza por
referencia y la matrícula del permiso coincide con la del nombre de la carpeta (si lo tiene); entonces la
escritura incluye D = matrícula del permiso (y E/AE solo si están vacías, Y/Z/AA desde los documentos).
Si la hoja tiene matrícula y difiere de carpeta+permiso (p. ej. 0480LNJ vs 0480NLJ) sigue siendo
`IDENTIDAD NO CONFIRMADA`: corregirla con `--corregir-identidad`.

## Cómo ejecutarlo

```bash
cd /home/seb/fotosseven/sevencars-fichas
PY=/home/seb/fotosseven/.venv/bin/python

$PY verificar.py 1082                 # un coche
$PY verificar.py 1082 1085 26         # varios (26 = 1026)
$PY verificar.py --matricula 9028LXG  # por matrícula
$PY verificar.py --todos              # todas las filas con carpeta en 1_Ventas (no VENDIDOS)

$PY verificar.py 1082 --solo-docs          # solo listar los documentos encontrados
$PY verificar.py 1082 --solo-docs --debug  # además simular la petición a la IA (modelo, imágenes, prompt)
$PY verificar.py 1082 --sin-ia             # sin OpenAI: solo ficha-expo + hoja (+ Ventas)
$PY verificar.py 1082 --forzar             # ignorar la caché de extracciones
$PY verificar.py 1082 --escribir           # escribir en Base_Datos las celdas vacías con RELLENAR
$PY verificar.py 1082 --completo           # modo completo: todas las imágenes (lento)
$PY verificar.py --todos --en-venta        # auditoría de identidad de los coches en venta (modo liviano)
$PY verificar.py --todos --limite 10 --desde 1050   # por tandas; se reanuda gracias a la caché
$PY verificar.py --bastidores              # auditar AE contra el bastidor del PERMISO (usa la caché de lecturas)
$PY verificar.py --corregir-identidad 1037 --matricula 2979NGK --fila 124   # proponer correcciones A/D/E/AE (+X)
$PY verificar.py --probar-sheet            # probar la conexión con las dos hojas (solo lectura)
$PY verificar.py 1082 --sheet data/base_datos_vehiculos.xlsx   # usar un export local en vez de Google
```

Otras opciones: `--ventas-dir <ruta>` (carpeta `1_Ventas`), `--modelo <id>` (modelo de OpenAI),
`--sin-ventas` (no consultar Ventas-Sevencars).

Códigos de salida: `0` todo bien · `1` error (hoja, carpeta no encontrada…) · `2` falló la IA (el informe
se genera igual al nivel `--sin-ia`) · `3` faltan credenciales de Google.

### Escritura en Base_Datos (`--escribir`)

Sin `--escribir` la herramienta solo muestra lo que escribiría (`Se escribiría en Base_Datos: fila 111,
columna Y: 141`). Con `--escribir`:

- Solo se escriben celdas **vacías** con estado `RELLENAR` en las columnas `motor cv` (Y), `cubicaje` (Z),
  `caja` (AA), `bastidor` (AE) y, con identidad confirmada, `matrícula` (D) y `fecha` (E). `kms` (X) nunca.
- Nunca se sobrescribe una celda con contenido; las `DISCREPANCIA` solo se informan.
- Una sola actualización por coche (batch); cada celda escrita se registra como
  `fila R, columna Y: <valor>`.
- Si la columna `bastidor` no existe, se crea la cabecera `bastidor` en AE1 (primera celda de cabecera
  libre a partir de AE). Si AE1 tiene otra cabecera, se avisa y no se escribe el bastidor.
- Con `--sheet <xlsx>` no se escribe nada (el xlsx nunca se modifica).

### Modo `--todos` (auditoría)

Recorre todas las filas de `Datos` que tienen carpeta (1_Ventas, `-------Consignacion`, `------IMPORTACION`,
`----VENDIDOS`, `-----------Coches R`). `--en-venta` deja solo los coches en venta (excluye VENDIDOS y
Coches R). `--limite N` y `--desde <ref>` permiten ir por tandas; las lecturas quedan en caché, así que se
puede reanudar. Imprime una línea de progreso por coche y escribe `reports/auditoria.csv`
(`referencia, fila, matricula_datos, matricula_permiso, bastidor_AE, bastidor_permiso, bastidor_ventas,
fecha_datos, fecha_permiso, carpeta, estado, nota`; estados `OK / DISCREPANCIA / SIN PERMISO / SIN CARPETA /
IDENTIDAD NO CONFIRMADA / REVISAR`), fusionando por (referencia, fila). En modo liviano (por defecto) es una auditoría
de identidad rápida. En este modo nunca se sobrescribe AE (solo se rellenan celdas vacías con `--escribir`
y con identidad confirmada).

### Modo `--corregir-identidad`

Para filas cuya referencia o matrícula están mal: localiza la carpeta (por referencia o por matrícula), lee
el permiso (y la ficha) y, si la carpeta y el permiso coinciden entre sí, propone corregir A (referencia
según el prefijo de la carpeta), D (matrícula del permiso), E (fecha del permiso, B si existe, si no I), AE
(bastidor del permiso) y X (kms) solo desde «Kilometraje a fecha» del permiso si la celda está vacía. Muestra
una tabla antes/después. Sobrescribir una celda con contenido requiere `--escribir` y, para el bastidor,
que coincida con una segunda fuente (ficha técnica o Ventas); si no, queda `REVISAR`. Si la referencia está
repetida en la hoja, elegí la fila con `--fila N` o `--matricula`.

### Guardas de escritura

- Solo se rellenan celdas **vacías**. Antes de cada escritura se vuelve a leer el contenido actual de las celdas
  (incluidas fórmulas) y se rechaza cualquier celda con contenido, salvo en las correcciones explícitas
  (`--corregir-identidad` con `--escribir` y doble fuente) y en `--restaurar`.
- **kms (X) nunca se escribe**: en la hoja en vivo la columna X es una `ARRAYFORMULA` alimentada desde
  Ventas-Sevencars; la ficha-expo y el «kilometraje a fecha» del permiso son solo informativos. Las columnas
  calculadas por fórmula se detectan y no se tocan.
- `--restaurar --columna kms --desde data/base_datos_vehiculos.xlsx [--filas 29,37]`: compara la hoja en vivo
  con un export de respaldo y muestra una tabla antes/después; con `--escribir` restaura (en columnas con
  fórmula, vacía las celdas con valores literales para que la fórmula vuelva a calcular; en las demás, escribe
  el valor del respaldo). Sin `--filas` toma todas las filas que difieren.

### Modo `--bastidores`

Audita la columna `bastidor` (AE) de todas las filas contra el bastidor del **permiso de circulación** (la
única fuente que se escribe). Usa las lecturas en caché (no llama a la IA): primero ejecutá
`--todos`. Estados: `RELLENAR` (AE vacía, identidad confirmada), `OK`, `DISCREPANCIA` (AE no
coincide con el permiso; no se sobrescribe, usar `--corregir-identidad`), `SIN PERMISO`, `SIN CARPETA`,
`IDENTIDAD NO CONFIRMADA`, `REVISAR` (mismo bastidor propuesto para varias filas). La coincidencia con Ventas
se informa en la nota. Escribe `reports/bastidores.csv` y, con `--escribir`, rellena solo las celdas
`RELLENAR` en una sola actualización.

En la verificación por coche el bastidor sigue esta prioridad: ficha técnica (E) > permiso > Ventas.
Si no se pudo leer ningún documento (`--sin-ia`, sin documentos o fallo de la IA) se usa el de Ventas con
`fuente = ventas`.

## De dónde salen los datos

- **Base_Datos** (Google Sheet `1pm2KiO1…`, pestaña `Datos`): se lee en vivo con la API de Google Sheets.
  Cabecera en la fila 1 (A1 es el número 300, se trata como `referencia`). Columnas usadas: A referencia,
  C MODELO, D MATRICULA, E FECHA MATRICULACION, X kms, Y motor cv, Z cubicaje, AA caja, AB matriculacion,
  AC matriculacion num, AE bastidor. Las fechas pueden venir como `11/04/2022` o `2022-04-11`.
  Con `--sheet data/base_datos_vehiculos.xlsx` se usa un export local (útil sin conexión y para pruebas).
- **Ventas-Sevencars** (Google Sheet `1RwnqBY…`): se leen todas las pestañas; la referencia va en la
  columna A (`#1082`, `#C2`, `D-26`, `R-11`, `1065` → `1082`, `C2`, `D26`, `R11`, `1065`). Las cabeceras
  se reconocen por alias (MATRICULA, BASTIDOR, KMS, FECHA MATRI/MATR/MATRIC, MARCA, MODELO). Se prefiere
  la pestaña en la que el coche tiene bastidor.
- **Carpetas**: `/mnt/c/Users/Usuario/OneDrive/1_Ventas/` (OneDrive sincronizado en Windows, visto desde WSL).
- Variables de entorno opcionales: `SHEET_ID`, `SHEET_TAB`, `VENTAS_SHEET_ID`, `FICHAS_MODEL`,
  `OPENAI_API_KEY`, `GOOGLE_OAUTH_CLIENT_JSON`, `GOOGLE_OAUTH_TOKEN_JSON`, `GOOGLE_SERVICE_ACCOUNT_JSON`.
  Se leen de `.env` en esta carpeta y, para la clave de OpenAI, del `.env` de `sevencars-photo-pipeline`.

## Acceso a Google

La herramienta **reutiliza la autorización de Google del proyecto `editor-fotos-seven`**: el mismo
archivo de cliente (`credentials.json`) y el mismo token de usuario (`token.json`) que ya usa ese
proyecto para Drive. No hay que configurar nada nuevo; esos archivos solo los carga la librería de Google
en el momento de ejecutar (nunca se copian ni se muestran).

- Si aparece una **ventana del navegador pidiendo iniciar sesión en Google**, es porque el token caducó o
  no existe: iniciá sesión con la misma cuenta de Google que usa `editor-fotos-seven` y aceptá los permisos.
  El token renovado se guarda en el mismo archivo y no vuelve a pedirlo.
- Si el mensaje dice que **la API de Google Sheets no está habilitada** en el proyecto de Google Cloud
  de esas credenciales, hay que habilitarla una sola vez: abrir el enlace que muestra el mensaje
  (`console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=…`) con esa cuenta de
  Google, pulsar **Habilitar**, esperar un par de minutos y volver a ejecutar `--probar-sheet`.
- La cuenta de Google autorizada tiene que tener acceso a las dos hojas (Base_Datos y Ventas-Sevencars).
  El dueño de las hojas es otra cuenta (`infosevenmotors@gmail.com`): si no están compartidas, pedile al
  dueño que las comparta con permiso de **Editor** (Base_Datos) y **Lector** (Ventas-Sevencars).
- Alternativa: una cuenta de servicio de Google Cloud, indicando su JSON en `GOOGLE_SERVICE_ACCOUNT_JSON`
  (la carpeta `credentials/` está ignorada por git para guardarlo ahí) y compartiendo las hojas con el email
  de esa cuenta.

Para comprobar el acceso: `verificar.py --probar-sheet` (imprime el título de las hojas, las pestañas,
si existe la columna `bastidor` y la fila 1082 en cada hoja; no escribe nada).

## Modo liviano (por defecto) y modo completo

- **Liviano** (defecto): se envía **una sola imagen** por coche: el permiso de circulación «cara 1» (el archivo
  cuyo nombre no indica cara 2 / trasera / reverso; si es PDF, solo la página 1). Si el coche no tiene permiso,
  la ficha técnica cara 1 (`cara 1`, `cara1`, `parte delantera`, `tarjetaItv`). Nunca más de una imagen.
  Prompt corto con los campos A, B/I, D.1, D.2, D.3, E, P.1, P.2, P.3, S.1 y observaciones (próxima ITV,
  kilometraje). Imagen reducida a 2000 px; con Claude Code, `--max-turns 4`. La ficha-expo sigue siendo la
  tercera fuente sin IA. Sin permiso ni ficha → estado `SIN DOCUMENTOS`.
- **Completo** (`--completo`): todas las imágenes (permiso primero, con más resolución; ficha técnica como
  complemento), prompt largo, 12 turnos. Es el modo anterior, ~4 minutos por coche.
- Caché: una lectura `completo` sirve para peticiones livianas; una lectura `liviano` sirve para peticiones
  livianas y solo se sustituye cuando se pide `--completo`.

## Motor de lectura de documentos (IA)

La lectura de la ficha técnica y del permiso la hace un modelo de visión. Hay dos motores, que devuelven
la misma estructura y comparten la caché `data/extracciones/<MATRICULA>.json` (guarda motor, modelo y fecha):

- **Claude Code (por defecto)** — `--motor claude` o `FICHAS_MOTOR=claude`. Usa el CLI `claude`
  (`/home/seb/.local/bin/claude`, configurable con `FICHAS_CLAUDE_BIN`) en modo no interactivo con la
  **suscripción del usuario: sin coste por coche**. La suscripción tiene cupos de uso que se renuevan por
  **franjas de 5 horas**; si se agota el cupo el programa lo avisa, genera el informe al nivel `--sin-ia` y
  termina con código 2 (probar más tarde o usar `--motor openai`). Las imágenes reducidas y el texto de los PDF
  (`contexto.txt`) se copian a una carpeta temporal; el CLI solo puede usar la herramienta Read sobre esa
  carpeta (sin Bash, sin escritura, sin agentes, sin sesión guardada, sin cargar la configuración global).
  Modelo opcional con `FICHAS_CLAUDE_MODEL` (por defecto, el modelo por defecto del CLI). Tiempo máximo: 300 s por coche.
- **OpenAI** — `--motor openai` o `FICHAS_MOTOR=openai`. Clave en `OPENAI_API_KEY` (o en el `.env` de
  `sevencars-photo-pipeline`). Modelo por defecto `gpt-5.4-mini` (`FICHAS_MODEL` / `--modelo`), Responses API
  con imágenes y salida estructurada (JSON schema). Coste orientativo: **unos pocos céntimos por coche**.
  Si la cuenta no tiene saldo (429 `insufficient_quota`) se avisa, se genera el informe sin IA y el código de
  salida es 2.

En ambos casos las imágenes se reducen a 2000 px de lado mayor (JPEG calidad 85, giradas según EXIF) y las
páginas de los PDF se renderizan a 150 dpi. `--forzar` ignora la caché; `--solo-docs --debug` muestra la
petición (motor, imágenes, tamaño del prompt) sin llamar a nada.

## Limitaciones

- **Caja de cambios**: no figura en la ficha técnica ni en el permiso. Orden de evidencias: tokens del texto
  de MODELO (AT, DSG, S tronic, EAT8, DCT, CVT, Automático → `Automático`; MT, manual → `Manual`) →
  combustible Eléctrico → `Automático` → **fotos** (`caja_fotos.py`: dos pasadas con Claude Code. La primera
  envía **todas** las fotos como miniaturas de 512 px (tope 40) y pide una clasificación por foto
  (`exterior`/`interior`/`detalle` + `muestra_palanca_o_pedales`, marcando la zona entre los asientos, el pomo,
  la consola central o los pedales); la selección de candidatas la hace Python con esa bandera, en orden de
  galería, hasta 5. La segunda decide con esas fotos a 1600 px: tres pedales = manual, dos = automático,
  pomo con esquema en H y números = Manual con confianza alta, selector P R N D = automático; si sale `Duda`
  y quedan más candidatas, se reintenta una vez con la siguiente tanda) → `Duda`. Solo se escribe
  `caja` (y `_caja` en la web) con veredicto Manual/Automático y, si viene de las fotos, confianza **alta**;
  si no, la celda queda vacía y el coche aparece en el bloque **PARA VERIFICAR**. Veredicto en caché en
  `data/extracciones/<carpeta>-caja.json`; `--sin-fotos-caja` lo desactiva.
- **Prioridad de documentos**: el permiso de circulación es la fuente principal (siempre más legible; se
  envía primero y con más resolución, 2600 px) y la ficha técnica es el complemento: se usa para lo que el
  permiso no trae (CO2, norma Euro, neumáticos, CL, fecha de emisión, observaciones) o cuando el permiso no
  se pudo leer. Cada hallazgo indica la fuente elegida (`permiso circulación` / `ficha técnica`).
- **Híbridos** (HEV/PHEV, «híbrido», eléctrico + gasolina/diésel): `motor cv` debe ser la potencia TOTAL
  del sistema, no la P.2 del motor térmico. Se toma únicamente de los CV que aparezcan en el texto de MODELO
  (regex `(\d{2,3})\s*cv`); si MODELO no los trae, NO se escribe: `REVISAR` con nota «híbrido: falta la
  potencia total del sistema (el permiso solo da el motor térmico, N CV)». Los híbridos aparecen siempre en el
  bloque **PARA VERIFICAR** para que se confirme la potencia total.
- No híbridos: la potencia en CV se calcula como kW × 1,36 (P.2 del permiso o la ficha) redondeado, con
  tolerancia de ±3 CV; si el texto de MODELO indica otra cifra se anota.
- Cubicaje: se acepta la hoja redondeada a la centena (1600 por 1580).
- Los kilómetros del permiso («Kilometraje a fecha …») son una lectura antigua: solo se comparan de forma
  informativa (`REVISAR` si la hoja tiene menos km que esa lectura).
- Ventas-Sevencars solo se lee: sus discrepancias se informan (`fuente = ventas`) y nunca generan escrituras.
- Si hay varias carpetas candidatas se prefiere la coincidencia por matrícula y se avisa de la ambigüedad.

## Combustible (columna `combustible`)

`Datos` no tenía columna de combustible: se detecta por la cabecera `combustible` (sin distinguir mayúsculas) en
la fila 1 y, si no existe, `--escribir` crea la cabecera en la primera celda libre a partir de AF (si la hoja
termina en AE se añade la columna con `add_cols`; en seco solo se avisa «se crearía»; si AF1 tiene otra cabecera
se rechaza). Valor: P.3 del permiso mapeado al vocabulario de la web (`Gasolina / Diésel / Híbrido / Eléctrico`),
solo en celdas vacías y con identidad confirmada (estados RELLENAR / OK / DISCREPANCIA). Si el permiso no da
nada usable se deduce de los tokens de MODELO como «sin confirmar»: se informa, no se escribe. El mismo valor va
a `_combustible` en la web.

## Cuotas (`verificar.py --cuotas`)

La cuota se calcula igual que la hoja «Presupuesto_2025» (columna ESTANDAR, sin entrada), a partir del precio
contado (F), la fecha de matriculación (E) y la tarifa (J «TARIFA FINANCIACION»):

1. **Tarifa**: la de J; si J está vacía, por antigüedad (meses = `DAYS360(E, hoy)/30`): menos de 72 → NORMAL,
   menos de 120 → ESPECIAL, menos de 156 → SIN DTO, más → Consultanos.
2. **Descuento financiación**: NORMAL 7 %, ESPECIAL 3 %, SIN DTO / Consultanos 0, calculado como
   `MROUND(min(F/(1+M)·M, M·20 000), 5)` (redondeo a 5 €).
3. **Importe a financiar** = F − descuento + 390 € (gestión y preparación).
4. **Plazo**: edad = meses completos desde E (`DATEDIF`); entra cada plazo n con `180 − edad > n − 1`. Con NORMAL,
   ESPECIAL o Consultanos solo 120/108/96/84/72 meses (60 únicamente si 72 no entra); con SIN DTO también 60/48/36/24.
5. **Cuota** = importe × coeficiente del plazo más largo que entra (Tarifas_Finan «9,99 DIC-2022»: 120 → 0,0151,
   108 → 0,016, 96 → 0,0171, 84 → 0,0186, 72 → 0,021, 60 → 0,024, 48 → 0,028, 36 → 0,035, 24 → 0,05), en euros enteros.

Ejemplo: Opel Astra, 12 485 € contado, matriculado el 29/11/2019, calculado el 08/09/2026 → ESPECIAL, descuento
365 €, importe 12 510 €, 81 meses de edad → plazo 96 → **214 €/mes**. Si ningún plazo entra (coche muy viejo) no
hay cuota: AD queda vacía y se avisa en PARA VERIFICAR.

`verificar.py --cuotas [refs]` imprime la tabla Ref / Fila / Precio contado / Tarifa / Plazo / Importe / AD actual /
Cuota / Estado (`RELLENAR` AD vacía, `OK` ±1 €, `DISCREPANCIA` no se pisa, `SIN PRECIO`, `SIN FECHA`, `SIN PLAZO`);
con `--escribir` rellena solo las AD vacías (nunca si AD fuera una fórmula). `--cuotas --escribir --corregir`
sobrescribe además las AD con DISCREPANCIA, mostrando antes la tabla antes/después y el recuento (sin `--escribir`
solo la muestra). `publicar.py` escribe la misma cuota en AD al crear el borrador.

## Publicar en la web (`publicar.py`)

```bash
$PY publicar.py D29 --simular            # resumen del borrador + comprobación de duplicado, sin subir nada
$PY publicar.py D29                      # crea el BORRADOR en sevencars.es (fotos + producto) y escribe AD/G
$PY publicar.py 1082 --categoria suv-4x4,familiar   # categorías a mano para modelos desconocidos
$PY publicar.py D29 --actualizar --simular          # anuncio ya publicado: diferencias con la web, sin enviar nada
$PY publicar.py D29 --actualizar --solo-financiacion --si   # solo precio, precio financiado, cuota, tipo y fecha
```

Flujo: hoja en vivo → fila → carpeta (`locate`) → lectura liviana del permiso (caché) → **puerta de identidad**
(sin confirmar: sale con código 1 sin tocar la web) → campos (marca/modelo/versión desde MODELO con
`data/marcas.json`, combustible del permiso, caja según el orden de evidencias, km «88.858», CV, cubicaje,
matriculación «Abril 2022» / 202204, garantía, precio, precio financiado, cuota, categorías según
`data/categorias.json`, fotos de `fotos/` en orden natural con nombres SEO `kia-xceed-9028lxg-01.jpg`) →
«Resumen del borrador» → **duplicado** (`data/publicados.json` y búsqueda en la web por sku, texto y barrido de
`meta_data.matricula`; si existe, aborta mostrando la URL del admin) → `--simular` termina aquí → subida de
fotos en orden (si una falla se borran las ya subidas) → producto WooCommerce simple en **borrador** (`sku` =
matrícula, `regular_price` 300 = reserva online, categorías, galería con 1.jpg de portada, campos ACF con sus
`field_xxx`, `_precio_financiado`, `_yoast_wpseo_primary_product_cat`) → registro en `data/publicados.json` →
hoja: AD cuota y G URL IMAGEN solo si están vacías → URL de edición. `--publicar-directo` publica en vez de
borrador; `--sin-hoja` no toca la hoja; `--forzar` ignora las cachés; `--sin-fotos-caja` omite las fotos para la
caja. Descripción y equipamiento: punto de extensión `descripcion.py` (`plantillas/descripcion.html` con
placeholders `{marca} {modelo} {version} {kms} {cv} {cubicaje} {caja} {combustible} {matriculacion} {garantia}
{precio} {precio_financiado} {cuota} {matricula}`); sin plantilla no se envía el campo.

`--actualizar` completa un anuncio ya publicado (campos ACF y, si cambiaron, título y categorías; nunca las
fotos, el estado, el sku ni el precio de reserva): busca el producto por `data/publicados.json` o por matrícula,
muestra la tabla de diferencias con la web y pide confirmación antes de pisar valores (`--si` no pregunta,
`--simular` no envía nada). `--actualizar --solo-financiacion` manda solo `_precio`, `_precio_financiado`,
`_cuota`, `_tipo_vehiculo` y `_fecha_matriculacion`, calculados desde la fila de la hoja sin leer documentos
(la identidad es la matrícula de la hoja contra el sku del producto; exige D, E y F rellenas); nunca título,
categorías ni `_destacado`/`_equipamiento`. Al terminar recuerda que la web recalcula `_precio_financiado` en el
próximo guardado desde wp-admin. **Guarda de modelo** (en los dos modos de `--actualizar`): la marca del MODELO
de la hoja (`marcas.split_modelo`) tiene que aparecer en el nombre del producto o en sus metas
`_marca`/`_marca_completa` (sin acentos, mayúsculas ni signos); si no —una matrícula mal cargada en la web, como
un «Hyundai I10» con la matrícula de un Fiat 500— avisa con los dos textos y sale con código 1 sin escribir nada.
`--forzar` salta la guarda (avisa y actualiza igual).

Credenciales de la web: `WC_URL`, `WC_KEY`, `WC_SECRET`, `WP_USER`, `WP_APP_PASSWORD` desde `.env` del proyecto
y, si faltan, del `.env` de `editor-fotos-seven` (nunca se muestran). Las claves ACF `_dto_renove` (850),
`_a_domicilio` (290), `_tipo_vehiculo` y `_fecha_matriculacion` (fecha de matriculación E, o la del permiso, en ISO
`2022-04-11`; vacía si no se conoce; el tema de la web la lee para calcular la edad exacta del coche) se envían como
meta plano hasta conocer su `field_key` (`wc_client.CAMPOS_ACF_EXTRA`).

Financiación en la web: `_precio` y `_precio_financiado` van como entero sin puntos (`12485`); `_cuota` como
«214 €/mes» con la regla de [Cuotas](#cuotas-verificarpy---cuotas); `_tipo_vehiculo` sale de la tarifa (NORMAL →
vacío, ESPECIAL → `especial`, SIN DTO y Consultanos → `especial_dto`). **Ojo**: la web recalcula
`_precio_financiado` ella sola en cada guardado desde wp-admin, a partir de `_precio`, `_dto_renove` y
`_tipo_vehiculo` (`_precio − MROUND(min((_precio − 850)/(1+M)·M, M·20 000), 5) − 850`), así que `_tipo_vehiculo`
tiene que corresponder a la tarifa del coche. `publicar.py` manda el precio campaña de la hoja (N) y, si no
coincide con lo que la web va a recalcular, lo avisa en PARA VERIFICAR con los dos números. El resumen de
`--simular` muestra tarifa, plazo e importe financiado junto a la cuota.

El bloque **PARA VERIFICAR** (final del resumen e informe por coche) reúne lo que queda sin confirmar: caja,
combustible deducido del MODELO, potencia total de híbridos, categoría desconocida, portada dudosa (la primera
foto no es `1.jpg`), cuota sin plazo posible y precio financiado que la web recalculará distinto.

### Fotos: qué dejar en la carpeta

- Las fotos van en la subcarpeta `fotos/` de la carpeta del coche (`1_Ventas/<n>-<Marca>-<Modelo>-<Matrícula>/fotos/`).
  En la raíz solo van los documentos: la raíz nunca se escanea buscando fotos.
- Dejá ahí las descargas de ChatGPT tal cual (PNG, JPG o WEBP, con cualquier nombre, por ejemplo
  `ChatGPT Image 5 sept 2026, 10_23_45.png`). Si querés elegir la portada, renombrá esa foto a `portada`
  (con cualquier extensión).
- `publicar.py <ref>` normaliza la carpeta antes de subir nada: queda `1.jpg…N.jpg`, JPEG de ≤ 400 KB y ≤ 1600 px
  de lado (sin recortar). Orden: `portada` primero, después las que ya tienen número (`1.jpg`, `3b.jpg`…) en orden
  natural y al final las nuevas por fecha de descarga. Las que cambian de contenido (convertidas o recomprimidas)
  dejan su original en `fotos/originales/` (nunca se borra nada); las que solo cambian de número se renombran sin
  duplicarse. Repetir el comando sobre una carpeta ya normalizada no cambia nada.
- `--simular` solo muestra qué se haría; `--solo-fotos` hace únicamente ese paso (ni web ni hoja) y termina;
  `--sin-normalizar-fotos` lo omite. `cochesnet.py preparar` hace la misma normalización (mismo flag para omitirla).

## Imágenes para la luna (`luna.py`)

Al crear el producto, `publicar.py` deja en `<carpeta del coche>/luna/` tres JPEG (A4 apaisado, 3508×2480 a
300 ppp) para imprimir y pegar en la hoja de precios de la luna: `precio1.jpg` (los miles con punto, «12.»),
`precio2.jpg` (los cientos, «120») y `cuota.jpg` (la cuota, «214»). Salen de las plantillas de
`plantillas/luna/` cambiando solo los dígitos: mismo marco, misma fuente (Arial Bold de Windows) y misma altura
de dígito; si un texto no cabe (una cuota de cuatro cifras) se reduce hasta que quepa, centrado en la misma línea.
Valores: **precio luna = PRECIO CONTADO (F) − descuento de financiación** de la tarifa ESTANDAR (el mismo `dto`
de la cuota; sin renove ni los 390 € de gestión): 12485 − 365 = 12120 → «12.» y «120». La cuota es la que va a
la web; si no hay plazo posible no se genera `cuota.jpg` (y se borra uno viejo). Se pisan en cada publicación y
en `--actualizar --solo-financiacion` (el precio puede haber cambiado); `--sin-luna` lo evita y `--simular` no
las genera. `publicar.py` imprime la línea `Luna: precio1.jpg (12.) · precio2.jpg (120) · cuota.jpg (214) → …`
y el vigilante la copia a RESULTADO.txt. Un fallo al generarlas avisa pero no detiene la publicación.

```bash
$PY luna.py D29                              # rehace las tres imágenes en <carpeta del coche>/luna/
$PY luna.py --matricula 1234ABC --simular    # muestra los textos y las rutas sin escribir nada
$PY luna.py D29 --salida /tmp/luna           # en otra carpeta
```

Plantillas: `precio1.jpg` («31.» con marco rectangular), `precio2.jpg` («585» grande entre dos líneas a todo el
ancho) y `cuota.jpg` («483» con marco). La fuente se toma de `/mnt/c/Windows/Fonts/arialbd.ttf` (variable
`LUNA_FONT` para otra). `test_luna` vuelve a medir las plantillas: si se cambia una, hay que revisar `GEOMETRIAS`.

## Vigilante automático (`vigilar.py`)

Para no tener que acordarse de lanzar `publicar.py`: el vigilante revisa `1_Ventas` cada 2 minutos y, cuando en la
subcarpeta `fotos/` de un coche aparecen fotos nuevas (las descargas de ChatGPT tal cual), espera a que terminen de
bajar (3 minutos sin cambios en la carpeta) y lanza `publicar.py` solo. Esa única pasada ordena las fotos
(`1.jpg…N.jpg`) y crea el **borrador** en sevencars.es; nunca publica directo. Solo cuentan las fotos que aparecen
**después** de la primera ejecución: esa primera vez únicamente registra el punto de partida y avisa en el log
qué carpetas ya tenían fotos pendientes (esas se publican a mano con `publicar.py <ref>`). Procesa un coche por
ciclo, identifica el coche por la matrícula del nombre de la carpeta (o por el prefijo → referencia si el nombre
no trae la matrícula completa) y no toca las carpetas de `----VENDIDOS` ni `Coches R`. Un coche ya publicado no se
vuelve a subir: si le llegan fotos nuevas solo se ordenan (`--solo-fotos`). inotify no funciona sobre `/mnt/c`,
por eso se sondea.

**RESULTADO.txt** (en la carpeta del coche, se reescribe en cada intento): fecha, qué pasó, el enlace del
borrador, el bloque PARA VERIFICAR tal cual lo imprime `publicar.py` y el próximo paso. Al final, un historial
con los últimos 3 intentos. Resultados posibles:

- `publicado`: borrador creado → revisarlo en WordPress y publicarlo.
- `ya_publicado`: el coche ya estaba en la web → no se sube nada.
- `falta_hoja`: el coche no está en Base_Datos → cargarlo en la hoja; se reintenta cada 30 min hasta que aparezca.
- `google_autorizar`: caducó la autorización de Google → ejecutar `../.venv/bin/python verificar.py --probar-sheet`
  en la terminal y completar el inicio de sesión; se reintenta cada 30 min.
- `error`: cualquier otro fallo (identidad no confirmada, web caída, tiempo agotado a los 20 min…) → se reintenta
  cada 30 min hasta 5 veces y después queda `abandonado` hasta que cambien las fotos de `fotos/`.
- `fotos_normalizadas`: fotos nuevas en un coche ya publicado → solo se ordenaron; subirlas a mano si hacen falta.

Si en `fotos/` hay archivos que no se pueden leer (OneDrive todavía no los descargó), espera hasta 3 ciclos más y
después sigue igual, dejándolos como están y nombrándolos en RESULTADO.txt.

```bash
$PY vigilar.py                 # bucle sin fin (lo lanza vigilar.sh al iniciar Windows)
$PY vigilar.py --una-vez       # un solo ciclo; la primera vez registra el punto de partida
$PY vigilar.py --ahora 9028LXG # procesar ese coche (ref o matrícula) ya mismo, sin esperas, y salir
$PY vigilar.py --estado        # tabla: carpeta, estado, intentos, último y próximo intento
$PY vigilar.py --simular       # qué haría en este ciclo, sin lanzar nada ni escribir
```

Ajustes: `--intervalo` (segundos entre revisiones, 120), `--espera` (segundos de calma antes de actuar, 180),
`--reintento` (segundos hasta el siguiente intento, 1800), `--ventas-dir`. Estado en `data/vigilar.json`
(`inicio` y, por carpeta, estado, intentos, próximo intento y la «firma» de `fotos/`), cerrojo `data/vigilar.lock`
(un solo vigilante a la vez) y registro en `logs/vigilar.log` (rota a 1 MB, 3 copias; solo escribe cuando pasa
algo y una línea de «sigo vigilando» por hora). `publicar.py` se ejecuta sin navegador (`FICHAS_NO_BROWSER=1`):
si Google pide autorizar, no se queda colgado, lo anota y avisa.

### Activación en Windows

`vigilar.sh` entra en la carpeta del proyecto y ejecuta `../.venv/bin/python vigilar.py` con los argumentos que
reciba. Para que arranque solo al iniciar sesión, un `.vbs` en la carpeta de inicio de Windows
(`shell:startup`) lanza, oculto, `wsl.exe -d Ubuntu -u seb -- /home/seb/fotosseven/sevencars-fichas/vigilar.sh`
(por ejemplo: `CreateObject("WScript.Shell").Run "wsl.exe -d Ubuntu -u seb -- /home/seb/fotosseven/sevencars-fichas/vigilar.sh", 0, False`).
Antes de activarlo conviene ejecutar una vez `$PY vigilar.py --una-vez` en la terminal para fijar el punto de
partida y ver qué carpetas ya tenían fotos pendientes. Para comprobar que está andando: `$PY vigilar.py --estado`
(muestra el punto de partida y las carpetas con intentos) y `logs/vigilar.log`; si sale «Ya hay un vigilante en
marcha», es que el del arranque está activo. Para pararlo: `pkill -f vigilar.py` desde Ubuntu.

## Pruebas

```bash
/home/seb/fotosseven/.venv/bin/python -m pytest -q
```

Las pruebas no necesitan OneDrive, Google ni OpenAI (usan carpetas temporales y datos de ejemplo).

## Estructura

```
verificar.py   CLI (referencias, --matricula, --todos, --bastidores, --cuotas, --restaurar, --probar-sheet, --escribir…)
publicar.py    crear el borrador del coche en sevencars.es (WooCommerce); --solo-fotos normaliza fotos/ y sale
luna.py        imágenes para la hoja de precios de la luna (precio en miles y cientos, y cuota) desde plantillas/luna/
vigilar.py     vigilante: sondea 1_Ventas y lanza publicar.py cuando aparecen fotos nuevas en fotos/;
               deja RESULTADO.txt en la carpeta del coche (vigilar.sh lo arranca desde Windows)
cochesnet.py   panel de coches.net con Playwright (login/explorar/grabar/estado); `preparar <ref>` arma el kit para
               copiar y pegar (datos, ficha técnica, fotos, descripción) en reports/cochesnet/
wc_client.py   cliente REST de WordPress/WooCommerce (medios, productos, búsqueda de duplicados)
cuota.py       cuota financiada y planificación de la columna AD
marcas.py      marca / modelo / versión (data/marcas.json), combustible, caja, km y matriculación en formato web
combustible.py vocabulario de combustible (P.3 → Gasolina/Diésel/Híbrido/Eléctrico)
categorias.py  categorías product_cat y tabla modelo → categoría (data/categorias.json)
caja_fotos.py  caja de cambios por evidencias (MODELO → eléctrico → fotos con Claude Code → Duda)
fotos.py       fotos editadas: carpeta, orden natural, nombres SEO, recompresión y normalización de fotos/
               (1.jpg…N.jpg, JPEG ≤ 400 KB, originales en fotos/originales/)
descripcion.py punto de extensión de la descripción (plantillas/)
locate.py      localizar la carpeta del coche en 1_Ventas
docs.py        reconocer documentos, parsear ficha-expo, preparar imágenes
extract.py     petición a OpenAI (Responses API + JSON schema) y caché en data/extracciones/
compare.py     reglas de comparación documentos vs Base_Datos
ventas.py      lectura y cruce (solo lectura) con Ventas-Sevencars; modo --bastidores
sheet.py       Base_Datos: Google Sheet en vivo (gspread) o export xlsx; escritura por lotes
gauth.py       autorización de Google (OAuth de editor-fotos-seven o cuenta de servicio)
report.py      tabla en consola, informe Markdown y CSV
tests/         pruebas unitarias (pytest)
```
