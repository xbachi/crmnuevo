import { readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { logger } from '../utils/logger.js';
import { PipelineStages } from './stages.js';
import { DBQueries } from '../db/queries.js';
import { OpenAIImageClient, planStudioInputs, buildStudioPrompt, resolveImageSize } from '../openai/client.js';
import { SpyneClient } from '../fal/spyne-client.js';
import { BgRemovalCache } from '../fal/cache.js';
import { fileHash } from '../utils/hash.js';
import { sizeSuffix, type Config } from '../utils/config.js';
import type Database from 'better-sqlite3';
import type { RunParams } from '../db/models.js';
import pLimit from 'p-limit';

const SUPPORTED_EXTS = ['.jpg', '.jpeg', '.heic', '.heif', '.png'];

export class Orchestrator {
  private db: DBQueries;
  private openaiClient: OpenAIImageClient | null;
  private spyneClient: SpyneClient | null;
  private cache: BgRemovalCache;
  private stages: PipelineStages;

  constructor(private config: Config, database: Database.Database) {
    this.db = new DBQueries(database);
    this.openaiClient = config.openaiApiKey
      ? new OpenAIImageClient({
          apiKey: config.openaiApiKey,
          model: config.openaiImageModel,
          quality: config.openaiImageQuality,
          referenceMaxWidth: config.referenceMaxWidth,
        })
      : null;
    this.spyneClient = config.spyneApiKey ? new SpyneClient(config.spyneApiKey) : null;
    this.cache = new BgRemovalCache(config.workDir, this.db);
    this.stages = new PipelineStages(config, this.db, this.openaiClient, this.cache, this.spyneClient);
  }

  async resizeMode(): Promise<void> {
    logger.info('PHASE 1: Resize/Convert', {
      inputDir: this.config.inputDir,
      size: `${this.config.targetWidth}x${this.config.targetHeight}`,
      dryRun: this.config.dryRun,
    });

    const files = await this.scanDir(this.config.inputDir);
    if (files.length === 0) {
      logger.info('No files to process');
      return;
    }

    if (this.config.dryRun) {
      for (const file of files) logger.info(`[dry-run] Would resize: ${basename(file)}`);
      logger.info(`[dry-run] ${files.length} file(s) would be resized`);
      return;
    }

    const limiter = pLimit(this.config.concurrency);
    let done = 0, errors = 0;
    const start = Date.now();

    const promises = files.map(file => limiter(async () => {
      try {
        const hash = await fileHash(file);
        const ext = extname(file);
        const fileId = this.db.insertFile(file, hash, ext);
        const params: RunParams = {
          removeBg: false,
          quality: this.config.quality,
          targetDims: { width: this.config.targetWidth, height: this.config.targetHeight },
        };
        const runId = this.db.insertRun(fileId, 'batch', params);

        const resized = await this.stages.stage1Convert(file, hash);
        this.db.insertArtifact(runId, 'resized', resized.path, {
          width: resized.width,
          height: resized.height,
          size_bytes: resized.size,
        });
        this.db.updateRun(runId, 'complete');
        done++;
        logger.info(`[${done}/${files.length}] Resized: ${basename(file)}`);
      } catch (err: any) {
        errors++;
        logger.error(`Failed: ${basename(file)}`, { error: err.message });
      }
    }));

    await Promise.allSettled(promises);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    logger.info(`Done: ${done} succeeded, ${errors} failed [${elapsed}s]`);
    if (errors > 0) process.exitCode = 1;
  }

  async removeBgMode(): Promise<void> {
    const suffix = sizeSuffix(this.config);
    logger.info('PHASE 2: Remove Background', {
      outputDir: this.config.outputDir,
      model: this.config.openaiImageModel,
      quality: this.config.openaiImageQuality,
      dryRun: this.config.dryRun,
    });

    const files = await this.scanDir(this.config.outputDir, [`${suffix}.jpg`]);
    if (files.length === 0) {
      logger.info(`No resized files (*${suffix}.jpg) found`);
      return;
    }

    const limiter = pLimit(this.config.concurrency);
    let done = 0, errors = 0, skipped = 0;
    const succeeded: string[] = [];
    const start = Date.now();

    const promises = files.map(file => limiter(async () => {
      const outputPath = this.stages.nobgOutputPath(file);
      if (!this.config.overwrite && existsSync(outputPath)) {
        skipped++;
        logger.info(`Skipping (output exists): ${basename(outputPath)}`);
        return;
      }
      if (this.config.dryRun) {
        logger.info(`[dry-run] Would remove background: ${basename(file)} -> ${basename(outputPath)}`);
        return;
      }
      try {
        const nobg = await this.stages.stage2RemoveBg(file);
        if (nobg) {
          done++;
          succeeded.push(file);
          logger.info(`[${done}/${files.length}] Removed BG: ${basename(file)}`);
        }
      } catch (err: any) {
        errors++;
        logger.error(`Failed: ${basename(file)}`, { error: err.message });
      }
    }));

    await Promise.allSettled(promises);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    logger.info(`Done: ${done} succeeded, ${errors} failed, ${skipped} skipped [${elapsed}s]`);
    if (errors > 0) process.exitCode = 1;

    if (!this.config.dryRun) await this.cleanupInputs(succeeded, errors);
  }

  async addBackgroundMode(): Promise<void> {
    const suffix = sizeSuffix(this.config);
    const size = resolveImageSize({ width: this.config.targetWidth, height: this.config.targetHeight });
    const backgrounds = await this.stages.getBackgrounds();
    const bgPath = backgrounds[0] ?? null;

    logger.info('PHASE 3: Add Studio Background', {
      outputDir: this.config.outputDir,
      engine: this.spyneClient ? 'spyne' : 'openai',
      model: this.config.openaiImageModel,
      quality: this.config.openaiImageQuality,
      size,
      background: bgPath ? basename(bgPath) : null,
      references: this.config.referencePaths.length,
      prompt: this.config.studioPromptSource,
      dryRun: this.config.dryRun,
    });

    const files = await this.scanDir(this.config.outputDir, [`${suffix}.jpg`]);
    if (files.length === 0) {
      logger.info(`No resized files (*${suffix}.jpg) found. Run "npm run resize" first`);
      return;
    }

    const limiter = pLimit(this.config.concurrency);
    let done = 0, errors = 0, skipped = 0;
    const succeeded: string[] = [];
    const start = Date.now();

    const promises = files.map(file => limiter(async () => {
      const outputPath = this.stages.studioOutputPath(file);
      if (!this.config.overwrite && existsSync(outputPath)) {
        skipped++;
        logger.info(`Skipping (output exists, use --overwrite): ${basename(outputPath)}`);
        return;
      }
      if (this.config.dryRun) {
        this.logDryRunStudio(file, outputPath, bgPath, size);
        return;
      }
      try {
        const studio = await this.stages.stage3Composite(file);
        if (studio) {
          done++;
          succeeded.push(file);
          logger.info(`[${done}/${files.length}] Added background: ${basename(file)} -> ${basename(studio.path)}`);
        }
      } catch (err: any) {
        errors++;
        logger.error(`Failed: ${basename(file)}`, { error: err.message });
      }
    }));

    await Promise.allSettled(promises);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    logger.info(`Done: ${done} succeeded, ${errors} failed, ${skipped} skipped [${elapsed}s]`);

    if (!this.config.dryRun) await this.cleanupInputs(succeeded, errors);
  }

  private logDryRunStudio(file: string, outputPath: string, bgPath: string | null, size: string): void {
    const plan = planStudioInputs(file, bgPath, this.config.referencePaths);
    const prompt = buildStudioPrompt(this.config.studioPrompt, Boolean(bgPath), plan.referencePaths.length);
    const lines = [
      `[dry-run] ${basename(file)} -> ${basename(outputPath)}`,
      `  model=${this.config.openaiImageModel} quality=${this.config.openaiImageQuality} size=${size} prompt=${prompt.length} chars`,
      `  images (${plan.imagePaths.length}):`,
      ...plan.imagePaths.map((p, i) => `    ${i + 1}. ${p}`),
    ];
    if (plan.dropped.length > 0) lines.push(`  dropped references (over the 16-image cap): ${plan.dropped.length}`);
    logger.info(lines.join('\n'));
  }

  /** Removes intermediate inputs only for files that were processed successfully. */
  private async cleanupInputs(succeeded: string[], errors: number): Promise<void> {
    for (const file of succeeded) {
      try {
        await unlink(file);
      } catch (err: any) {
        logger.warn(`Could not remove intermediate file: ${basename(file)}`, { error: err.message });
      }
    }
    if (errors > 0) {
      logger.warn(`${errors} file(s) failed and were left in place; re-run the command to retry them`);
      process.exitCode = 1;
    }
  }

  private async scanDir(dir: string, filters: string[] = []): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const name = entry.name;
        const ext = extname(name).toLowerCase();

        if (filters.length > 0) {
          if (filters.some(f => name.endsWith(f))) {
            files.push(join(dir, name));
          }
        } else {
          if (SUPPORTED_EXTS.includes(ext)) {
            files.push(join(dir, name));
          }
        }
      }
    }

    return files.sort();
  }
}
