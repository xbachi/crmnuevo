import { writeFile, rename, unlink, mkdir } from 'fs/promises';
import { dirname } from 'path';

export async function atomicWrite(filePath: string, data: Buffer | string): Promise<void> {
  const tempPath = `${filePath}.tmp`;

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tempPath, data);
  await rename(tempPath, filePath);
}

export async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}
