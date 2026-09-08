import pLimit from 'p-limit';
import { FileProcessor } from './processor.js';
import { logger } from '../utils/logger.js';

export class PipelineQueue {
  private limiter: ReturnType<typeof pLimit>;
  private progress = { total: 0, done: 0, errors: 0 };
  private startTime = 0;

  constructor(concurrency: number, private processor: FileProcessor) {
    this.limiter = pLimit(concurrency);
  }

  async addBatch(files: string[]): Promise<void> {
    this.progress = { total: files.length, done: 0, errors: 0 };
    this.startTime = Date.now();

    logger.info(`Starting batch`, { total: files.length });

    const promises = files.map((file) =>
      this.limiter(async () => {
        try {
          await this.processor.process(file);
          this.progress.done++;
        } catch (err) {
          this.progress.errors++;
        }
        this.logProgress();
      })
    );

    await Promise.allSettled(promises);
    this.logSummary();
  }

  async addSingle(file: string): Promise<void> {
    try {
      await this.processor.process(file);
      logger.info(`Watch: processed`, { file });
    } catch (err: any) {
      logger.error(`Watch: failed`, { file, error: err.message });
    }
  }

  private logProgress(): void {
    const { total, done, errors } = this.progress;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    logger.info(`Progress: ${done}/${total} (${errors} errors) [${elapsed}s]`);
  }

  private logSummary(): void {
    const { total, done, errors } = this.progress;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const avgTime = total > 0 ? (parseFloat(elapsed) / total).toFixed(2) : '0';
    logger.info(`Batch complete: ${done} succeeded, ${errors} failed, avg ${avgTime}s/file`);
  }
}
