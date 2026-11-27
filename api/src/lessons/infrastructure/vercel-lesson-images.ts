import { del, get, put } from '@vercel/blob';
import sharp from 'sharp';
import { LessonError } from '../application/lessons.js';
import type {
  ImageInspector,
  ImageType,
  LessonImageStorage,
} from '../application/lesson-images.js';

export class VercelLessonImages implements LessonImageStorage {
  async put(key: string, data: Uint8Array, mediaType: ImageType) {
    try {
      await put(key, Buffer.from(data), { access: 'private', contentType: mediaType });
    } catch {
      throw new LessonError('unavailable');
    }
  }

  async get(key: string) {
    try {
      const result = await get(key, { access: 'private' });
      return result?.statusCode === 200 ? result.stream : undefined;
    } catch {
      throw new LessonError('unavailable');
    }
  }

  async delete(key: string) {
    await del(key);
  }
}

const imageTypes = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;

export class LessonImageInspector implements ImageInspector {
  async detect(data: Uint8Array): Promise<ImageType | undefined> {
    try {
      const image = sharp(data, { limitInputPixels: 12_000_000, failOn: 'warning' });
      const { format } = await image.metadata();
      if (format !== 'png' && format !== 'jpeg' && format !== 'webp') return undefined;
      await image.stats();
      return imageTypes[format];
    } catch {
      return undefined;
    }
  }
}
