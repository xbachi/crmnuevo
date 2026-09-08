import { readFile } from 'fs/promises';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SpyneClient {
  constructor(private apiKey: string) {}

  async compositeBackground(carImagePath: string, backgroundPath: string, retries = 3): Promise<Buffer> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const formData = new FormData();
        formData.append('image', await readFile(carImagePath), 'car.png');
        formData.append('background_image', await readFile(backgroundPath), 'bg.jpg');
        formData.append('add_shadow', 'true');
        formData.append('shadow_type', 'dual');
        formData.append('add_reflection', 'true');
        formData.append('ground_contact', 'true');

        const response = await fetch('https://api.spyne.ai/api/pv1/image/replace-bg', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Spyne API error: ${response.status} - ${error}`);
        }

        const data = await response.json();

        // Spyne puede ser asíncrono, verificar si hay inference_id
        if (data.inference_id) {
          return await this.pollResult(data.inference_id);
        }

        // O puede devolver URL directa
        if (data.result_url || data.image_url) {
          const imageUrl = data.result_url || data.image_url;
          const imgResponse = await fetch(imageUrl);
          return Buffer.from(await imgResponse.arrayBuffer());
        }

        throw new Error('No result URL in Spyne response');
      } catch (err: any) {
        if (attempt === retries - 1) {
          throw err;
        }
        const backoffMs = 1000 * 2 ** attempt;
        logger.warn(`Retry ${attempt + 1}/${retries} after ${backoffMs}ms`, {
          error: err.message,
        });
        await sleep(backoffMs);
      }
    }

    throw new Error('Unreachable');
  }

  private async pollResult(inferenceId: string, maxAttempts = 30): Promise<Buffer> {
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(2000);

      const response = await fetch(`https://api.spyne.ai/api/pv1/results/${inferenceId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      const data = await response.json();

      if (data.status === 'completed' && data.result_url) {
        const imgResponse = await fetch(data.result_url);
        return Buffer.from(await imgResponse.arrayBuffer());
      }

      if (data.status === 'failed') {
        throw new Error(`Spyne processing failed: ${data.error}`);
      }

      logger.info(`Spyne status: ${data.status}, attempt ${i + 1}/${maxAttempts}`);
    }

    throw new Error('Spyne polling timeout');
  }
}
