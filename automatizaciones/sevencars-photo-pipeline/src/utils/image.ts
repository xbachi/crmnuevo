import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { readFile } from 'fs/promises';
import { atomicWrite } from './fs.js';

export async function convertHEIC(inputPath: string, outputPath: string): Promise<void> {
  try {
    await sharp(inputPath).jpeg({ quality: 95 }).toFile(outputPath);
  } catch (err) {
    const inputBuffer = await readFile(inputPath);
    const result = await heicConvert({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: 0.95,
    });
    await atomicWrite(outputPath, Buffer.from(result));
  }
}

export async function resizeAndCrop(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
  quality: number
): Promise<void> {
  await sharp(inputPath)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .jpeg({ quality, mozjpeg: true })
    .toFile(outputPath);
}

export async function getMetadata(filePath: string) {
  const meta = await sharp(filePath).metadata();
  return {
    width: meta.width || 0,
    height: meta.height || 0,
    format: meta.format,
  };
}

export async function compositeOnBackground(
  foregroundPath: string,
  backgroundPath: string,
  outputPath: string,
  width: number,
  height: number,
  quality: number
): Promise<void> {
  const background = await sharp(backgroundPath)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .toBuffer();

  await sharp(background)
    .composite([{ input: foregroundPath, gravity: 'centre' }])
    .jpeg({ quality, mozjpeg: true })
    .toFile(outputPath);
}
