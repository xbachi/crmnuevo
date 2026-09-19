import { join } from 'path';
import { existsSync } from 'fs';
import { fileHash, stringHash } from '../utils/hash.js';
import { atomicWrite } from '../utils/fs.js';
import { DBQueries } from '../db/queries.js';

export class BgRemovalCache {
  private cacheDir: string;

  constructor(workDir: string, private db: DBQueries) {
    this.cacheDir = join(workDir, 'cache');
  }

  async check(filePath: string): Promise<string | null> {
    const hash = await fileHash(filePath);
    const paramsHash = stringHash(JSON.stringify({ model: 'rembg', version: '1' }));
    const fullHash = `${hash}_${paramsHash}`;

    const cached = this.db.findCachedArtifact(fullHash, 'nobg');
    if (cached && existsSync(cached.path)) {
      return cached.path;
    }

    return null;
  }

  async store(filePath: string, resultBuffer: Buffer): Promise<{ path: string; checksum: string }> {
    const hash = await fileHash(filePath);
    const paramsHash = stringHash(JSON.stringify({ model: 'rembg', version: '1' }));
    const fullHash = `${hash}_${paramsHash}`;

    const cachePath = join(this.cacheDir, `${fullHash}.jpg`);
    await atomicWrite(cachePath, resultBuffer);

    return { path: cachePath, checksum: fullHash };
  }
}
