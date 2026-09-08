import { config as loadEnv } from 'dotenv';
import { resolve, join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

// DOTENV_CONFIG_PATH lets tests/CI point at a different env file (or an empty one).
loadEnv(process.env.DOTENV_CONFIG_PATH ? { path: process.env.DOTENV_CONFIG_PATH } : undefined);

export const DEFAULT_IMAGE_MODEL = 'gpt-image-1.5';
export const DEFAULT_IMAGE_QUALITY = 'high';
export const DEFAULT_STUDIO_PROMPT =
  'luxury car placed naturally on the surface with realistic shadows, reflections, and lighting that matches the environment. photorealistic automotive photography';

const REFERENCE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

export interface Config {
  openaiApiKey: string;
  openaiImageModel: string;
  openaiImageQuality: string;
  studioPrompt: string;
  /** Where studioPrompt came from (for logging). */
  studioPromptSource: string;
  spyneApiKey?: string;
  inputDir: string;
  outputDir: string;
  workDir: string;
  logsDir: string;
  referencesDir: string;
  /** Shot reference images found in referencesDir, sorted by name. */
  referencePaths: string[];
  /** Background and reference images are downscaled to this width (px) before upload. */
  referenceMaxWidth: number;
  concurrency: number;
  quality: number;
  targetWidth: number;
  targetHeight: number;
  removeBg: boolean;
  overwrite: boolean;
  dryRun: boolean;
}

/** Suffix used in resized/nobg/studio file names, e.g. "_1536x1024". */
export function sizeSuffix(config: Pick<Config, 'targetWidth' | 'targetHeight'>): string {
  return `_${config.targetWidth}x${config.targetHeight}`;
}

function readPromptFile(path: string): string {
  return readFileSync(path, 'utf8').trim();
}

/** STUDIO_PROMPT_FILE -> ./prompt.txt -> STUDIO_PROMPT -> built-in default. */
function resolveStudioPrompt(): { prompt: string; source: string } {
  const envFile = process.env.STUDIO_PROMPT_FILE;
  if (envFile) {
    const path = resolve(envFile);
    if (!existsSync(path)) throw new Error(`STUDIO_PROMPT_FILE not found: ${path}`);
    const prompt = readPromptFile(path);
    if (!prompt) throw new Error(`STUDIO_PROMPT_FILE is empty: ${path}`);
    return { prompt, source: path };
  }

  const local = resolve('prompt.txt');
  if (existsSync(local)) {
    const prompt = readPromptFile(local);
    if (prompt) return { prompt, source: local };
  }

  const envPrompt = process.env.STUDIO_PROMPT?.trim();
  if (envPrompt) return { prompt: envPrompt, source: 'STUDIO_PROMPT' };

  return { prompt: DEFAULT_STUDIO_PROMPT, source: 'built-in default' };
}

function loadReferences(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && REFERENCE_EXTS.includes(e.name.slice(e.name.lastIndexOf('.')).toLowerCase()))
      .map((e) => e.name)
      .sort()
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

export function loadConfig(): Config {
  const args = process.argv.slice(3);

  const getArg = (flag: string, def: string) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
  };

  const hasFlag = (flag: string) => args.includes(flag);

  const { prompt: studioPrompt, source: studioPromptSource } = resolveStudioPrompt();
  const referencesDir = resolve(process.env.REFERENCES_DIR || './references');

  return {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiImageModel: process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    openaiImageQuality: process.env.OPENAI_IMAGE_QUALITY || DEFAULT_IMAGE_QUALITY,
    studioPrompt,
    studioPromptSource,
    spyneApiKey: process.env.SPYNE_API_KEY,
    inputDir: resolve(getArg('--input', process.env.INPUT_DIR || './input')),
    outputDir: resolve(getArg('--output', process.env.OUTPUT_DIR || './output')),
    workDir: resolve(process.env.WORK_DIR || './work'),
    logsDir: resolve(process.env.LOGS_DIR || './logs'),
    referencesDir,
    referencePaths: loadReferences(referencesDir),
    referenceMaxWidth: parseInt(process.env.REFERENCE_MAX_WIDTH || '1536'),
    concurrency: parseInt(getArg('--concurrency', process.env.DEFAULT_CONCURRENCY || '2')),
    quality: parseInt(getArg('--quality', process.env.DEFAULT_QUALITY || '85')),
    targetWidth: parseInt(getArg('--width', process.env.DEFAULT_WIDTH || '1536')),
    targetHeight: parseInt(getArg('--height', process.env.DEFAULT_HEIGHT || '1024')),
    removeBg: getArg('--remove-bg', 'true') === 'true',
    overwrite: hasFlag('--overwrite'),
    dryRun: hasFlag('--dry-run'),
  };
}
