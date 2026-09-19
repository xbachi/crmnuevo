import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';

export function initDB(logsDir: string): Database.Database {
  mkdirSync(logsDir, { recursive: true });
  const dbPath = join(logsDir, 'pipeline.sqlite');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_path TEXT NOT NULL,
      original_hash TEXT NOT NULL UNIQUE,
      original_ext TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      run_type TEXT NOT NULL,
      params_json TEXT NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      status TEXT NOT NULL,
      error TEXT,
      FOREIGN KEY(file_id) REFERENCES files(id)
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      stage TEXT NOT NULL,
      path TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      size_bytes INTEGER,
      checksum TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(run_id) REFERENCES runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_files_hash ON files(original_hash);
    CREATE INDEX IF NOT EXISTS idx_runs_file ON runs(file_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
  `);

  return db;
}
