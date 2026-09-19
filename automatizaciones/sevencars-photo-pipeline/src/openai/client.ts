import OpenAI, { toFile } from 'openai';
import type { ImageEditParamsNonStreaming, ImageGenerateParamsNonStreaming } from 'openai/resources/images';
import { readFile } from 'fs/promises';
import { basename, extname } from 'path';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

/** Fixed sizes accepted by gpt-image models (the SDK also accepts a free "WxH" string). */
export const FIXED_IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536'] as const;

/** gpt-image models accept up to 16 input images per edit call. */
export const MAX_INPUT_IMAGES = 16;
const MAX_REFERENCE_WIDTH = 1536;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 120_000;

const REMOVE_BG_PROMPT =
  'Remove the background completely. Keep the car exactly as it is, same angle, same details, no changes to the car. Transparent background.';

export interface OpenAIImageClientOptions {
  apiKey: string;
  model: string;
  quality: string;
  timeoutMs?: number;
  /** Max width (px) for background/reference images before upload. Default 1536. */
  referenceMaxWidth?: number;
}

export interface TargetSize {
  width: number;
  height: number;
}

export interface StudioInputPlan {
  /** Image paths in the exact order they are sent: [car, background?, ...references]. */
  imagePaths: string[];
  /** References actually sent (after the 16-image cap). */
  referencePaths: string[];
  /** References dropped because of the cap. */
  dropped: string[];
}

export function isImageQuality(value: string): value is ImageQuality {
  return (IMAGE_QUALITIES as readonly string[]).includes(value);
}

/**
 * Size string sent to the API. The SDK type accepts any "WxH" string, so the
 * configured target is requested as-is; the API enforces its own rules for
 * custom sizes (both edges multiples of 16, ratio <= 3:1, >= 655,360 pixels).
 */
export function resolveImageSize(target: TargetSize): string {
  const size = `${target.width}x${target.height}`;
  if (!(FIXED_IMAGE_SIZES as readonly string[]).includes(size)) {
    const problems: string[] = [];
    if (target.width % 16 !== 0 || target.height % 16 !== 0) problems.push('both edges must be multiples of 16');
    const ratio = Math.max(target.width, target.height) / Math.min(target.width, target.height);
    if (ratio > 3) problems.push('aspect ratio must be <= 3:1');
    if (target.width * target.height < 655_360) problems.push('must be >= 655,360 pixels');
    if (problems.length > 0) {
      logger.warn(
        `Custom size ${size} may be rejected by the API (${problems.join('; ')}). Fixed sizes: ${FIXED_IMAGE_SIZES.join(', ')}`
      );
    }
  }
  return size;
}

/** Decides which images are sent and in which order, applying the 16-image cap. */
export function planStudioInputs(
  carImagePath: string,
  backgroundPath: string | null,
  referencePaths: string[]
): StudioInputPlan {
  const fixed = backgroundPath ? [carImagePath, backgroundPath] : [carImagePath];
  const room = Math.max(0, MAX_INPUT_IMAGES - fixed.length);
  const kept = referencePaths.slice(0, room);
  const dropped = referencePaths.slice(room);
  return { imagePaths: [...fixed, ...kept], referencePaths: kept, dropped };
}

/** Preamble mapping image order to the roles used in the prompt, then the prompt itself. */
export function buildStudioPrompt(prompt: string, hasBackground: boolean, referenceCount: number): string {
  const parts: string[] = [
    'Input images, in order: image 1 is the uploaded real car photo to transform (the authority for the vehicle).',
  ];
  let next = 2;
  if (hasBackground) {
    parts.push(
      `Image ${next} is the empty Sevencars studio master reference (the authority for wall, floor, lighting, reflections).`
    );
    next++;
  }
  if (referenceCount === 1) {
    parts.push(
      `Image ${next} is a Sevencars shot reference example of finished output (only for angle, framing, composition and shadow/reflection behavior).`
    );
  } else if (referenceCount > 1) {
    parts.push(
      `Images ${next} to ${next + referenceCount - 1} are Sevencars shot reference examples of finished output (only for angle, framing, composition and shadow/reflection behavior).`
    );
  }
  parts.push('Output a single finished photo of the car from image 1 in that studio.');
  return `${parts.join(' ')}\n\n${prompt}`;
}

function mimeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

function isRetryable(err: any): boolean {
  const status: number | undefined = err?.status;
  if (status === undefined) return true; // connection error / timeout
  // Out of credits / quota: retrying cannot help.
  if (err?.code === 'insufficient_quota' || /no credits|insufficient_quota|exceeded your current quota/i.test(String(err?.message))) {
    return false;
  }
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function readHeader(headers: any, name: string): string | null {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function retryDelayMs(err: any, attempt: number): number {
  const backoff = 2000 * 2 ** (attempt - 1); // 2s, 4s, 8s
  if (err?.status !== 429) return backoff;

  const retryAfterMs = readHeader(err.headers, 'retry-after-ms');
  if (retryAfterMs && Number.isFinite(Number(retryAfterMs))) {
    return Math.min(Math.max(Number(retryAfterMs), 0), MAX_RETRY_AFTER_MS);
  }
  const retryAfter = readHeader(err.headers, 'retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 0), MAX_RETRY_AFTER_MS);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }
  return backoff;
}

export class OpenAIImageClient {
  private client: OpenAI;
  readonly model: string;
  readonly quality: ImageQuality;
  readonly referenceMaxWidth: number;

  constructor(opts: OpenAIImageClientOptions) {
    if (!opts.apiKey) throw new Error('OpenAIImageClient: apiKey is required');
    if (!isImageQuality(opts.quality)) {
      throw new Error(
        `Invalid OPENAI_IMAGE_QUALITY "${opts.quality}". Valid values: ${IMAGE_QUALITIES.join(', ')}`
      );
    }
    // Retries are handled by this class (see withRetry) so the SDK's own retry loop is disabled.
    this.client = new OpenAI({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? 180_000, maxRetries: 0 });
    this.model = opts.model;
    this.quality = opts.quality;
    this.referenceMaxWidth =
      opts.referenceMaxWidth && opts.referenceMaxWidth > 0 ? opts.referenceMaxWidth : MAX_REFERENCE_WIDTH;
  }

  /**
   * Sends the real car photo (+ optional studio background + shot references) to
   * images.edit and returns the raw PNG returned by the model (no resizing).
   */
  async compositeStudio(
    carImagePath: string,
    backgroundPath: string | null,
    referencePaths: string[],
    prompt: string,
    target: TargetSize
  ): Promise<Buffer> {
    const label = basename(carImagePath);
    const plan = planStudioInputs(carImagePath, backgroundPath, referencePaths);
    if (plan.dropped.length > 0) {
      logger.warn(`Too many reference images; dropping ${plan.dropped.length} (max ${MAX_INPUT_IMAGES} images per call)`, {
        file: label,
        dropped: plan.dropped.map((p) => basename(p)),
      });
    }

    const images = [await this.loadOriginal(carImagePath)];
    if (backgroundPath) images.push(await this.loadDownscaled(backgroundPath));
    for (const ref of plan.referencePaths) images.push(await this.loadDownscaled(ref));

    const params: ImageEditParamsNonStreaming = {
      model: this.model,
      image: images,
      prompt: buildStudioPrompt(prompt, Boolean(backgroundPath), plan.referencePaths.length),
      size: resolveImageSize(target),
      quality: this.quality,
      input_fidelity: 'high',
      output_format: 'png',
      n: 1,
    };

    return this.edit(params, label);
  }

  /** Removes the background, returning a PNG with transparency. */
  async removeBg(imagePath: string): Promise<Buffer> {
    const params: ImageEditParamsNonStreaming = {
      model: this.model,
      image: await this.loadOriginal(imagePath),
      prompt: REMOVE_BG_PROMPT,
      size: 'auto',
      quality: this.quality,
      input_fidelity: 'high',
      background: 'transparent',
      output_format: 'png',
      n: 1,
    };
    return this.edit(params, basename(imagePath));
  }

  /** Text-to-image (used to generate studio backgrounds). Returns the raw PNG. */
  async generate(prompt: string, size: string): Promise<Buffer> {
    const params: ImageGenerateParamsNonStreaming = {
      model: this.model,
      prompt,
      size,
      quality: this.quality,
      output_format: 'png',
      n: 1,
    };
    const response = await this.withRetry(prompt.slice(0, 40), () => this.client.images.generate(params));
    return this.decode(response, 'images.generate', prompt.slice(0, 40));
  }

  private async edit(params: ImageEditParamsNonStreaming, label: string): Promise<Buffer> {
    let response: OpenAI.Images.ImagesResponse;
    try {
      response = await this.withRetry(label, () => this.client.images.edit(params));
    } catch (err: any) {
      // Some models reject input_fidelity; retry once without it.
      if (err?.status === 400 && params.input_fidelity && /input_fidelity/i.test(String(err?.message))) {
        logger.warn(`Model ${this.model} rejected input_fidelity; retrying without it`, { file: label });
        const { input_fidelity: _omit, ...rest } = params;
        response = await this.withRetry(label, () => this.client.images.edit(rest));
      } else {
        throw err;
      }
    }
    return this.decode(response, 'images.edit', label);
  }

  private decode(response: OpenAI.Images.ImagesResponse, endpoint: string, label: string): Buffer {
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      const summary = JSON.stringify(response.data ?? null)?.slice(0, 300);
      throw new Error(`OpenAI ${endpoint} returned no b64_json image for ${label} (data: ${summary})`);
    }
    const usage = response.usage;
    if (usage) {
      logger.info(`OpenAI usage: ${label}`, {
        model: this.model,
        input_tokens: usage.input_tokens,
        image_input_tokens: usage.input_tokens_details?.image_tokens,
        text_input_tokens: usage.input_tokens_details?.text_tokens,
        output_tokens: usage.output_tokens,
      });
    }
    return Buffer.from(b64, 'base64');
  }

  private async withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (!isRetryable(err) || attempt === MAX_ATTEMPTS) throw err;
        const delay = retryDelayMs(err, attempt);
        logger.warn(`OpenAI attempt ${attempt}/${MAX_ATTEMPTS} failed, retrying in ${delay}ms`, {
          file: label,
          status: err?.status ?? null,
          error: err?.message,
        });
        await sleep(delay);
      }
    }
    throw new Error('Unreachable');
  }

  private async loadOriginal(filePath: string) {
    return toFile(await readFile(filePath), basename(filePath), { type: mimeFor(filePath) });
  }

  /** Backgrounds/references can be huge; downscale to <=1536px wide JPEG before upload. */
  private async loadDownscaled(filePath: string) {
    const buffer = await sharp(filePath)
      .rotate()
      .resize({ width: this.referenceMaxWidth, withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    const name = `${basename(filePath, extname(filePath))}.jpg`;
    return toFile(buffer, name, { type: 'image/jpeg' });
  }
}
