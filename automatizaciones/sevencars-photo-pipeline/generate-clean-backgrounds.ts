import { fal } from '@fal-ai/client';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { config } from 'dotenv';

config();

const PROMPTS = [
  'professional automotive photography studio, empty white cyc wall backdrop, polished concrete floor, soft overhead studio lighting, modern minimalist car showroom space, no cars, ultra realistic, 4k',
  'luxury car dealership showroom background, empty studio space, dark grey gradient wall, professional studio lighting setup, reflective floor surface, premium automotive photography environment, no vehicles, photorealistic, 4k',
];

async function generateCleanBackgrounds() {
  fal.config({ credentials: process.env.FAL_API_KEY });

  console.log(`Generating ${PROMPTS.length} clean studio backgrounds...`);

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    console.log(`[${i + 1}/${PROMPTS.length}] Generating...`);

    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt,
        image_size: { width: 1300, height: 730 },
        num_images: 1,
      },
    });

    const imageUrl = (result.data as any).images[0].url;
    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    const outputPath = join(process.cwd(), 'backgrounds', `bg_${i + 2}.jpg`);
    await writeFile(outputPath, buffer);
    console.log(`  ✓ Saved: bg_${i + 2}.jpg`);
  }

  console.log('\nDone! Clean backgrounds ready.');
}

generateCleanBackgrounds().catch(console.error);
