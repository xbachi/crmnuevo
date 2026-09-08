import 'dotenv/config';
import { fal } from '@fal-ai/client';
import { readFile, writeFile } from 'fs/promises';
import sharp from 'sharp';

fal.config({ credentials: process.env.FAL_KEY || process.env.FAL_API_KEY });

async function compositeICLight(
  carImagePath: string,
  backgroundPath: string,
  outputPath: string
): Promise<void> {
  // Step 1: Manual composition using Sharp (preserves exact background)
  const carBuffer = await readFile(carImagePath);
  const bgBuffer = await readFile(backgroundPath);

  const bgMeta = await sharp(bgBuffer).metadata();
  const carMeta = await sharp(carBuffer).metadata();

  if (!bgMeta.width || !bgMeta.height) throw new Error('Invalid background dimensions');

  // Scale car to fit (70% of canvas width)
  const targetCarWidth = Math.floor(bgMeta.width * 0.7);
  const scale = targetCarWidth / (carMeta.width || 1);
  const scaledWidth = Math.floor((carMeta.width || 0) * scale);
  const scaledHeight = Math.floor((carMeta.height || 0) * scale);

  // Center horizontally, place near bottom
  const left = Math.floor((bgMeta.width - scaledWidth) / 2);
  const top = Math.floor(bgMeta.height - scaledHeight - bgMeta.height * 0.05);

  // Composite car onto background
  const compositeBuffer = await sharp(bgBuffer)
    .composite([
      {
        input: await sharp(carBuffer).resize(scaledWidth, scaledHeight).toBuffer(),
        top,
        left,
        blend: 'over',
      },
    ])
    .png()
    .toBuffer();

  // Step 2: Apply IC-Light V2 for realistic lighting/shadows
  const compositeBase64 = compositeBuffer.toString('base64');
  const compositeDataUri = `data:image/png;base64,${compositeBase64}`;

  const result = await fal.subscribe('fal-ai/iclight-v2', {
    input: {
      image_url: compositeDataUri,
      prompt: 'professional automotive photography with natural studio lighting and realistic shadows',
    },
  });

  const imageUrl = (result.data as any).image?.url;
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
const outputPath = process.argv[4] || '/home/seb/fotosseven/sevencars-photo-pipeline/output/iclight_result.jpg';

compositeICLight(carPath, bgPath, outputPath).catch(console.error);
