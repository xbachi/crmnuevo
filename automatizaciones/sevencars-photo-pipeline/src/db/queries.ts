import type Database from 'better-sqlite3';
import type { FileRecord, RunRecord, ArtifactRecord, RunParams } from './models.js';

export class DBQueries {
  constructor(private db: Database.Database) {}

  insertFile(path: string, hash: string, ext: string): number {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO files (original_path, original_hash, original_ext)
      VALUES (?, ?, ?)
    `);
    stmt.run(path, hash, ext);

    const row = this.db.prepare('SELECT id FROM files WHERE original_hash = ?').get(hash) as { id: number };
    return row.id;
  }

  insertRun(fileId: number, type: 'batch' | 'watch', params: RunParams): number {
    const stmt = this.db.prepare(`
      INSERT INTO runs (file_id, run_type, params_json, status)
      VALUES (?, ?, ?, 'processing')
    `);
    const result = stmt.run(fileId, type, JSON.stringify(params));
    return result.lastInsertRowid as number;
  }

  updateRun(runId: number, status: RunRecord['status'], error?: string): void {
    const stmt = this.db.prepare(`
      UPDATE runs
      SET status = ?, ended_at = CURRENT_TIMESTAMP, error = ?
      WHERE id = ?
    `);
    stmt.run(status, error || null, runId);
  }

  insertArtifact(
    runId: number,
    stage: ArtifactRecord['stage'],
    path: string,
    meta?: { width?: number; height?: number; size_bytes?: number; checksum?: string }
  ): number {
    const stmt = this.db.prepare(`
      INSERT INTO artifacts (run_id, stage, path, width, height, size_bytes, checksum)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      runId,
      stage,
      path,
      meta?.width || null,
      meta?.height || null,
      meta?.size_bytes || null,
      meta?.checksum || null
    );
    return result.lastInsertRowid as number;
  }

  findExistingRun(fileHash: string, params: RunParams): RunRecord | null {
    const paramsJson = JSON.stringify(params);
    const stmt = this.db.prepare(`
      SELECT r.*
      FROM runs r
      JOIN files f ON r.file_id = f.id
      WHERE f.original_hash = ? AND r.params_json = ? AND r.status IN ('complete', 'partial')
      ORDER BY r.ended_at DESC
      LIMIT 1
    `);
    return stmt.get(fileHash, paramsJson) as RunRecord | null;
  }

  findCachedArtifact(checksum: string, stage: ArtifactRecord['stage']): ArtifactRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM artifacts
      WHERE checksum = ? AND stage = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(checksum, stage) as ArtifactRecord | null;
  }
}
