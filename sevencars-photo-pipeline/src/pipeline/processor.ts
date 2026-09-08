import { extname } from 'path';
import { fileHash } from '../utils/hash.js';
import { logger } from '../utils/logger.js';
import { DBQueries } from '../db/queries.js';
import { PipelineStages } from './stages.js';
import type { Config } from '../utils/config.js';
import type { RunParams } from '../db/models.js';

export class FileProcessor {
  constructor(
    private config: Config,
    private db: DBQueries,
    private stages: PipelineStages,
    private runType: 'batch' | 'watch'
  ) {}

  async process(filePath: string): Promise<void> {
    const hash = await fileHash(filePath);
    const ext = extname(filePath);

    const params: RunParams = {
      removeBg: this.config.removeBg,
      quality: this.config.quality,
      targetDims: { width: this.config.targetWidth, height: this.config.targetHeight },
    };

    if (!this.config.overwrite) {
      const existing = this.db.findExistingRun(hash, params);
      if (existing) {
        logger.info(`Skipping (already processed)`, { file: filePath, hash });
        return;
      }
    }

    if (this.config.dryRun) {
      logger.info(`[DRY-RUN] Would process`, { file: filePath });
      return;
    }

    const fileId = this.db.insertFile(filePath, hash, ext);
    const runId = this.db.insertRun(fileId, this.runType, params);

    try {
      const resized = await this.stages.stage1Convert(filePath, hash);
      this.db.insertArtifact(runId, 'resized', resized.path, {
        width: resized.width,
        height: resized.height,
        size_bytes: resized.size,
      });

      if (this.config.removeBg) {
        try {
          const nobg = await this.stages.stage2RemoveBg(resized.path);
          if (nobg) {
            this.db.insertArtifact(runId, 'nobg', nobg.path, {
              width: nobg.width,
              height: nobg.height,
              size_bytes: nobg.size,
            });

            const studio = await this.stages.stage3Composite(nobg.path);
            if (studio) {
              this.db.insertArtifact(runId, 'final', studio.path, {
                width: studio.width,
                height: studio.height,
                size_bytes: studio.size,
              });
            }
          }
          this.db.updateRun(runId, 'complete');
        } catch (err: any) {
          logger.error(`BG removal failed, marking partial`, { file: filePath, error: err.message });
          this.db.updateRun(runId, 'partial', `BG removal failed: ${err.message}`);
        }
      } else {
        this.db.updateRun(runId, 'complete');
      }

      logger.info(`Processed`, { file: filePath, runId });
    } catch (err: any) {
      logger.error(`Processing failed`, { file: filePath, error: err.message });
      this.db.updateRun(runId, 'error', err.message);
      throw err;
    }
  }
}
