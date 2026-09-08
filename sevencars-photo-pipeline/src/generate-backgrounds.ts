import { mkdir } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { loadConfig } from './utils/config.js';
import { OpenAIImageClient } from './openai/client.js';

const PROMPTS = [
  'professional car photography studio background, modern showroom with spotlights, grey gradient backdrop, soft studio lighting, 4k',
  'luxury car studio background, white cyc wall, dramatic side lighting, minimalist automotive showroom, photorealistic',
  'automotive photography studio, dark background with rim lighting, professional car showroom environment, high contrast',
  'car dealership showroom background, polished concrete floor, soft ambient lighting, clean modern space',
  'premium auto studio backdrop, black gradient background, accent lights, professional car photography setup',
];

const SIZE = '1536x1024';

async function generateBackgrounds() {
  const config = loadConfig();
  if (!config.openaiApiKey) {
    console.error('OPENAI_API_KEY is required to generate backgrounds');
    process.exit(1);
  }

  const client = new OpenAIImageClient({
    apiKey: config.openaiApiKey,
    model: config.openaiImageModel,
    quality: config.openaiImageQuality,
  });

  const outDir = join(process.cwd(), 'backgrounds');
  await mkdir(outDir, { recursive: true });

  console.log(`Generating ${PROMPTS.length} backgrounds with ${client.model} (${SIZE}, quality ${client.quality})...`);

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    console.log(`[${i + 1}/${PROMPTS.length}] ${prompt.substring(0, 50)}...`);

    const buffer = await client.generate(prompt, SIZE);

    const outputPath = join(outDir, `bg_${i + 1}.jpg`);
    await sharp(buffer).jpeg({ quality: 92, mozjpeg: true }).toFile(outputPath);
    console.log(`  ✓ Saved: bg_${i + 1}.jpg`);
  }

  console.log('\nDone! Run: npm run add-background -- --overwrite');
}

generateBackgrounds().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
