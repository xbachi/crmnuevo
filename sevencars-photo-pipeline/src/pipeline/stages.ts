import { basename, extname, join } from 'path';
import { stat, readdir, readFile } from 'fs/promises';
import sharp from 'sharp';
import { convertHEIC, resizeAndCrop, getMetadata } from '../utils/image.js';
import { OpenAIImageClient } from '../openai/client.js';
import { SpyneClient } from '../fal/spyne-client.js';
import { BgRemovalCache } from '../fal/cache.js';
import { DBQueries } from '../db/queries.js';
import { atomicWrite } from '../utils/fs.js';
import { logger } from '../utils/logger.js';
import { sizeSuffix, type Config } from '../utils/config.js';

export interface StageResult {
  path: string;
  width: number;
  height: number;
  size: number;
}

/** Accepts bg.jpg|jpeg|png and bg_N.jpg|jpeg|png; the first sorted match is used. */
const BACKGROUND_RE = /^bg(_\d+)?\.(jpg|jpeg|png)$/i;

export class PipelineStages {
  private backgroundsPromise: Promise<string[]>;
  private warnedNoBackground = false;

  constructor(
    private config: Config,
    private db: DBQueries,
    private openaiClient: OpenAIImageClient | null,
    private cache: BgRemovalCache,
    private spyneClient: SpyneClient | null = null
  ) {
    this.backgroundsPromise = this.loadBackgrounds();
  }

  /** Sorted background images found in ./backgrounds (never rejects). */
  getBackgrounds(): Promise<string[]> {
    return this.backgroundsPromise;
  }

  private async loadBackgrounds(): Promise<string[]> {
    const bgDir = join(process.cwd(), 'backgrounds');
    try {
      const files = await readdir(bgDir);
      return files
        .filter((f) => BACKGROUND_RE.test(f))
        .sort()
        .map((f) => join(bgDir, f));
    } catch {
      return [];
    }
  }

  /** "X_1536x1024.jpg" -> "X" (also strips a legacy "_nobg"). */
  private stem(filePath: string): string {
    const suffix = sizeSuffix(this.config);
    return basename(filePath, extname(filePath))
      .replace(/_nobg$/, '')
      .replace(new RegExp(`${suffix}$`), '');
  }

  nobgOutputPath(resizedPath: string): string {
    return join(this.config.outputDir, `${this.stem(resizedPath)}${sizeSuffix(this.config)}_nobg.png`);
  }

  studioOutputPath(inputPath: string): string {
    return join(this.config.outputDir, `${this.stem(inputPath)}${sizeSuffix(this.config)}_studio.jpg`);
  }

  async stage1Convert(inputPath: string, hash: string): Promise<StageResult> {
    const ext = extname(inputPath).toLowerCase();
    const base = basename(inputPath, ext);
    const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_');

    let convertedPath = inputPath;

    if (['.heic', '.heif'].includes(ext)) {
      convertedPath = join(this.config.workDir, 'temp', `${hash}.jpg`);
      await convertHEIC(inputPath, convertedPath);
    }

    const outputPath = join(this.config.outputDir, `${sanitized}${sizeSuffix(this.config)}.jpg`);

    await resizeAndCrop(
      convertedPath,
      outputPath,
      this.config.targetWidth,
      this.config.targetHeight,
      this.config.quality
    );

    return this.result(outputPath);
  }

  async stage2RemoveBg(resizedPath: string): Promise<StageResult | null> {
    const cachedPath = await this.cache.check(resizedPath);

    let nobgBuffer: Buffer;
    if (cachedPath) {
      nobgBuffer = await readFile(cachedPath);
    } else {
      if (!this.openaiClient) throw new Error('OPENAI_API_KEY is required for background removal');
      nobgBuffer = await this.openaiClient.removeBg(resizedPath);
      await this.cache.store(resizedPath, nobgBuffer);
    }

    const outputPath = this.nobgOutputPath(resizedPath);
    await atomicWrite(outputPath, nobgBuffer);
    return this.result(outputPath);
  }

  /**
   * Takes a resized car photo ("X_1536x1024.jpg"; a legacy "X_1536x1024_nobg.*" also
   * works) and produces "X_1536x1024_studio.jpg". The model output is kept as-is
   * (no crop/resize), only re-encoded to JPEG.
   */
  async stage3Composite(inputPath: string): Promise<StageResult | null> {
    const backgrounds = await this.backgroundsPromise;
    const bgPath = backgrounds[0] ?? null;
    if (!bgPath && !this.warnedNoBackground) {
      this.warnedNoBackground = true;
      logger.warn('No background found in ./backgrounds (bg.jpg|png or bg_N.jpg|png); sending the prompt without a studio reference');
    }

    const outputPath = this.studioOutputPath(inputPath);
    const width = this.config.targetWidth;
    const height = this.config.targetHeight;

    let raw: Buffer;
    if (this.spyneClient) {
      if (!bgPath) throw new Error('Spyne compositing requires a background image in ./backgrounds');
      raw = await this.spyneClient.compositeBackground(inputPath, bgPath);
    } else {
      if (!this.openaiClient) throw new Error('OPENAI_API_KEY is required for add-background');
      raw = await this.openaiClient.compositeStudio(
        inputPath,
        bgPath,
        this.config.referencePaths,
        this.config.studioPrompt,
        { width, height }
      );
    }

    const meta = await sharp(raw).metadata();
    if (meta.width !== width || meta.height !== height) {
      logger.warn(`Model returned ${meta.width}x${meta.height}, expected ${width}x${height}; keeping it as-is (no crop)`, {
        file: basename(inputPath),
      });
    }

    const jpeg = await sharp(raw).jpeg({ quality: this.config.quality, mozjpeg: true }).toBuffer();
    await atomicWrite(outputPath, jpeg);
    return this.result(outputPath);
  }

  private async result(outputPath: string): Promise<StageResult> {
    const meta = await getMetadata(outputPath);
    const stats = await stat(outputPath);
    return { path: outputPath, width: meta.width, height: meta.height, size: stats.size };
  }
}
