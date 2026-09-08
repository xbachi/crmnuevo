export interface FileRecord {
  id: number;
  original_path: string;
  original_hash: string;
  original_ext: string;
  created_at: string;
}

export interface RunRecord {
  id: number;
  file_id: number;
  run_type: 'batch' | 'watch';
  params_json: string;
  started_at: string;
  ended_at?: string;
  status: 'processing' | 'complete' | 'error' | 'partial';
  error?: string;
}

export interface ArtifactRecord {
  id: number;
  run_id: number;
  stage: 'converted' | 'resized' | 'nobg' | 'final';
  path: string;
  width?: number;
  height?: number;
  size_bytes?: number;
  checksum?: string;
  created_at: string;
}

export interface RunParams {
  removeBg: boolean;
  quality: number;
  targetDims: { width: number; height: number };
}
