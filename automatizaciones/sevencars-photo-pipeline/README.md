# sevencars-photo-pipeline

Convierte fotos reales de autos en fotos "de estudio" Sevencars usando la API de imágenes de OpenAI (`images.edit`, modelos `gpt-image-*`). Hace por lote lo mismo que se hacía a mano en ChatGPT: manda la foto real del auto + el fondo de estudio + fotos de referencia con el prompt, y guarda el resultado.

## Flujo

```bash
npm install
npm run resize            # input/*.heic|jpg|png  ->  output/<nombre>_1536x1024.jpg
npm run add-background    # output/*_1536x1024.jpg ->  output/<nombre>_1536x1024_studio.jpg
# o los dos pasos juntos:
npm run studio
```

- `resize`: convierte HEIC, recorta y redimensiona al tamaño objetivo (1536x1024 por defecto). No usa la API.
- `add-background`: por cada `*_1536x1024.jpg` llama a `images.edit` con `[auto, fondo, referencias...]` y el prompt. La salida del modelo se guarda tal cual (sin recorte), re-encodeada a JPEG. Si sale bien, borra el `_1536x1024.jpg` intermedio; si falla, lo deja para reintentar. Si el `_studio.jpg` ya existe lo saltea (usar `--overwrite` para regenerar).
- `remove-bg` (opcional, no hace falta para el flujo principal): genera `*_1536x1024_nobg.png` con fondo transparente.
- `generate-backgrounds`: genera `backgrounds/bg_1..5.jpg` (1536x1024) a partir de prompts de texto con `images.generate`.

Flags (después de `--`): `--input DIR --output DIR --concurrency N --quality Q --width W --height H --overwrite --dry-run`.
`--dry-run` en `add-background` muestra por archivo qué imágenes se mandarían (en orden), modelo, calidad, tamaño y largo del prompt, sin llamar a la API.

## Variables de entorno (`.env`)

| Variable | Default | Descripción |
|---|---|---|
| `OPENAI_API_KEY` | (requerida para `add-background`, `remove-bg`, `generate-backgrounds`) | API key de platform.openai.com |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1.5` | `gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`, `gpt-image-2` |
| `OPENAI_IMAGE_QUALITY` | `high` | `low`, `medium`, `high`, `auto` |
| `STUDIO_PROMPT_FILE` | – | Ruta a un archivo con el prompt (tiene prioridad sobre todo) |
| `STUDIO_PROMPT` | – | Prompt inline (se usa si no hay archivo) |
| `REFERENCES_DIR` | `./references` | Carpeta con fotos de referencia de tomas terminadas |
| `SPYNE_API_KEY` | – | Opcional: si está, `add-background` usa Spyne en vez de OpenAI |
| `INPUT_DIR` / `OUTPUT_DIR` / `WORK_DIR` / `LOGS_DIR` | `./input` `./output` `./work` `./logs` | Directorios |
| `DEFAULT_WIDTH` / `DEFAULT_HEIGHT` | `1536` / `1024` | Tamaño de salida. 1536x1024 es un tamaño nativo del modelo; otros tamaños deben ser múltiplos de 16, ratio <= 3:1 y >= 655.360 px |
| `DEFAULT_QUALITY` | `85` | Calidad JPEG de salida |
| `DEFAULT_CONCURRENCY` | `2` | Llamadas en paralelo (los rate limits de imágenes son bajos) |

`.env` no se versiona; ver `.env.example`.

## Prompt (`prompt.txt`)

El prompt se resuelve en este orden: `STUDIO_PROMPT_FILE` → `./prompt.txt` (si existe) → `STUDIO_PROMPT` → un default genérico.

`prompt.txt` son las instrucciones que se usaban en ChatGPT. Antes de mandarlo, el pipeline le antepone un preámbulo que explica en qué orden van las imágenes ("imagen 1 es la foto real del auto, imagen 2 es el estudio vacío, imágenes 3 a N son referencias de tomas terminadas"), así el prompt puede hablar de "la foto subida", "el master del estudio" y "las referencias" como en ChatGPT.

## Fondo y referencias

- `backgrounds/bg.jpg|png` (o `bg_N.jpg|png`, se usa el primero ordenado por nombre): el estudio vacío. Se manda como segunda imagen, reducido a <= 1536 px de ancho.
- `references/*.jpg|jpeg|png|webp`: ejemplos de fotos terminadas (una por tipo de toma: frente 3/4, perfil, trasera, interior, etc.). Se mandan después del fondo, ordenadas por nombre, reducidas a <= 1536 px. Cuantos más tipos de toma cubran, mejor. El límite de la API es 16 imágenes por llamada (auto + fondo + hasta 14 referencias); las que sobran se descartan con un aviso.

## Notas

- Una suscripción ChatGPT Plus **no** incluye acceso a la API: hace falta una API key con crédito en platform.openai.com. Para los modelos `gpt-image-*` la organización puede necesitar verificación.
- El costo por imagen depende del modelo y la calidad (`gpt-image-1-mini` es el más barato, `gpt-image-2` el más caro) y de la cantidad de imágenes de entrada; con `quality=high` está en el orden de decenas de centavos de dólar por foto. Verificar precios actuales en la página de pricing de OpenAI.
- El tamaño de salida por defecto es 1536x1024. El pipeline no recorta lo que devuelve el modelo: si devuelve otro tamaño, lo avisa en el log y lo guarda igual.
- `src/fal/client.ts` y los scripts `src/compose-*.ts` (fal.ai) quedan como experimentos, no se usan en los comandos.
