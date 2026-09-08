import { readFile, writeFile } from 'fs/promises';
import { config } from 'dotenv';

config();

const PICSART_API_KEY = process.env.PICSART_API_KEY || '';
const ENDPOINT = 'https://genai-api.picsart.io/v1/painting/replace-background';

async function testPicsart(carImagePath: string, outputPath: string) {
  const carBuffer = await readFile(carImagePath);
  const base64 = carBuffer.toString('base64');

  console.log('Enviando request a Picsart...');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PICSART_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64,
      prompt: 'professional car photography studio with white backdrop, soft overhead lighting, polished concrete floor, modern automotive showroom',
      width: 1300,
      height: 730,
      count: 1,
    }),
  });

  const data = await response.json() as any;
  console.log('Response:', data);

  if (data.inference_id) {
    console.log('Esperando resultado...');
    const resultUrl = `https://genai-api.picsart.io/v1/painting/results/${data.inference_id}`;

    let attempts = 0;
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const resultResponse = await fetch(resultUrl, {
        headers: { 'Authorization': `Bearer ${PICSART_API_KEY}` },
      });

      const resultData = await resultResponse.json() as any;

      if (resultData.status === 'success' && resultData.images?.length > 0) {
        const imageUrl = resultData.images[0].url;
        console.log('Descargando:', imageUrl);

        const imgResponse = await fetch(imageUrl);
        const buffer = Buffer.from(await imgResponse.arrayBuffer());
        await writeFile(outputPath, buffer);

        console.log(`✓ Guardado: ${outputPath}`);
        return;
      }

      if (resultData.status === 'error') {
        throw new Error(`Picsart error: ${JSON.stringify(resultData)}`);
      }

      attempts++;
      console.log(`Status: ${resultData.status}, retry ${attempts}/30...`);
    }

    throw new Error('Timeout esperando resultado');
  }
}

const carPath = process.argv[2] || 'output/IMG_9481_HEIC_1300x730_nobg.jpg';
const outputPath = process.argv[3] || 'output/picsart_test.jpg';

testPicsart(carPath, outputPath).catch(console.error);
