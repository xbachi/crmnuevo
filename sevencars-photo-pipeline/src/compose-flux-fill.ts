import 'dotenv/config';
import { fal } from '@fal-ai/client';
import { readFile, writeFile } from 'fs/promises';
import sharp from 'sharp';

fal.config({ credentials: process.env.FAL_KEY || process.env.FAL_API_KEY });

async function createMask(carImagePath: string, width: number, height: number): Promise<Buffer> {
  // Create white mask for car area
  const carBuffer = await readFile(carImagePath);
  const { width: carWidth, height: carHeight } = await sharp(carBuffer).metadata();

  // Scale car to fit (e.g., 70% of canvas width)
  const targetCarWidth = Math.floor(width * 0.7);
  const scale = targetCarWidth / (carWidth || 1);
  const scaledWidth = Math.floor((carWidth || 0) * scale);
  const scaledHeight = Math.floor((carHeight || 0) * scale);

  // Center position
  const left = Math.floor((width - scaledWidth) / 2);
  const top = Math.floor(height - scaledHeight - height * 0.05); // 5% from bottom

  // Create mask: white where car will be placed, black elsewhere
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

async function compositeFluxFill(
  carImagePath: string,
  backgroundPath: string,
  outputPath: string
): Promise<void> {
  // Read background
  const bgBuffer = await readFile(backgroundPath);
  const { width, height } = await sharp(bgBuffer).metadata();

  if (!width || !height) throw new Error('Invalid background dimensions');

  // Create mask for car area
  const maskBuffer = await createMask(carImagePath, width, height);

  // Convert to base64
  const bgBase64 = bgBuffer.toString('base64');
  const maskBase64 = maskBuffer.toString('base64');

  const bgDataUri = `data:image/png;base64,${bgBase64}`;
  const maskDataUri = `data:image/png;base64,${maskBase64}`;

  // Call FLUX Fill
  const result = await fal.subscribe('fal-ai/flux-pro/v1/fill', {
    input: {
      image_url: bgDataUri,
      mask_url: maskDataUri,
      prompt:
        'luxury car placed naturally on the surface with realistic shadows, reflections, and lighting that matches the environment. photorealistic automotive photography',
      num_images: 1,
    },
  });

  const imageUrl = (result.data as any).images?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL in response');

  const response = await fetch(imageUrl);
  const arrayBuffer = await response.arrayBuffer();
  const resultBuffer = Buffer.from(arrayBuffer);

  await writeFile(outputPath, resultBuffer);
  console.log(`Saved to ${outputPath}`);
}

// Example usage
const carPath = process.argv[2] || '/home/seb/fotosseven/sevencars-photo-pipeline/output/test_1300x730_nobg.jpg';
const bgPath = process.argv[3] || '/home/seb/fotosseven/sevencars-photo-pipeline/backgrounds/bg.png';
const outputPath = process.argv[4] || '/home/seb/fotosseven/sevencars-photo-pipeline/output/flux_fill_result.jpg';

compositeFluxFill(carPath, bgPath, outputPath).catch(console.error);
