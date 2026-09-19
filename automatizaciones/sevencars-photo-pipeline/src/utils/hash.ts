import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export async function fileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function stringHash(str: string): string {
  return createHash('sha256').update(str).digest('hex');
}
