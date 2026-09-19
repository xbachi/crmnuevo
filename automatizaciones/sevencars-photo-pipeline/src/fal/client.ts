import { fal } from '@fal-ai/client';
import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class FalClient {
  constructor(apiKey: string) {
    fal.config({ credentials: apiKey });
  }

  async removeBg(imagePath: string, retries = 3): Promise<Buffer> {
    const imageBuffer = await readFile(imagePath);
    const base64 = imageBuffer.toString('base64');
    const dataUri = `data:image/jpeg;base64,${base64}`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await fal.subscribe('fal-ai/imageutils/rembg', {
          input: { image_url: dataUri },
        });

        const imageUrl = (result.data as any).image?.url;
        if (!imageUrl) throw new Error('No image URL in response');

        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err: any) {
        if (attempt === retries - 1) {
          throw err;
        }
        const backoffMs = 1000 * 2 ** attempt;
        logger.warn(`Retry ${attempt + 1}/${retries} after ${backoffMs}ms`, {
          file: imagePath,
          error: err.message,
        });
        await sleep(backoffMs);
      }
    }

    throw new Error('Unreachable');
  }

  private async createMask(carImagePath: string, width: number, height: number): Promise<Buffer> {
    const carBuffer = await readFile(carImagePath);
    const { width: carWidth, height: carHeight } = await sharp(carBuffer).metadata();

    const targetCarWidth = Math.floor(width * 0.7);
    const scale = targetCarWidth / (carWidth || 1);
    const scaledWidth = Math.floor((carWidth || 0) * scale);
    const scaledHeight = Math.floor((carHeight || 0) * scale);

    const left = Math.floor((width - scaledWidth) / 2);
    const top = Math.floor(height - scaledHeight - height * 0.05);

    const mask = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg><rect x="${left}" y="${top}" width="${scaledWidth}" height="${scaledHeight}" fill="white"/></svg>`
          ),
          blend: 'over',
        },
      ])
      .png()
      .toBuffer();

    return mask;
  }

  async compositeRealistic(carImagePath: string, backgroundPath: string, retries = 3): Promise<Buffer> {
    const bgBuffer = await readFile(backgroundPath);
    const { width, height } = await sharp(bgBuffer).metadata();

    if (!width || !height) throw new Error('Invalid background dimensions');

    const maskBuffer = await this.createMask(carImagePath, width, height);

    const bgBase64 = bgBuffer.toString('base64');
    const maskBase64 = maskBuffer.toString('base64');
    const bgDataUri = `data:image/png;base64,${bgBase64}`;
    const maskDataUri = `data:image/png;base64,${maskBase64}`;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await fal.subscribe('fal-ai/flux-pro/v1/fill', {
          input: {
            image_url: bgDataUri,
            mask_url: maskDataUri,
            prompt: 'luxury car placed naturally on the surface with realistic shadows, reflections, and lighting that matches the environment. photorealistic automotive photography',
            num_images: 1,
          },
        });

        const imageUrl = (result.data as any).images?.[0]?.url;
        if (!imageUrl) throw new Error('No image URL in response');

        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err: any) {
        if (attempt === retries - 1) {
          throw err;
        }
        const backoffMs = 1000 * 2 ** attempt;
        logger.warn(`Retry ${attempt + 1}/${retries} after ${backoffMs}ms`, {
          file: carImagePath,
          error: err.message,
        });
        await sleep(backoffMs);
      }
    }

    throw new Error('Unreachable');
  }
}
