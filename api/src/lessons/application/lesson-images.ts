import { randomUUID } from 'node:crypto';
import type { UserIdentity } from '../../auth/application/authentication.js';
import { LessonError, requireTutor } from './lessons.js';

export const maxImageBytes = 2 * 1024 * 1024;
export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';
export type ImageAsset = { objectKey: string; mediaType: ImageType };

export interface LessonImageRepository {
  createAsset(ownerId: string, asset: ImageAsset, byteSize: number): Promise<string>;
  findAsset(ownerId: string, id: string): Promise<ImageAsset | undefined>;
}

export abstract class LessonImageStorage {
  abstract put(key: string, data: Uint8Array, mediaType: ImageType): Promise<void>;
  abstract get(key: string): Promise<ReadableStream<Uint8Array> | undefined>;
  abstract delete(key: string): Promise<void>;
}

export interface ImageInspector {
  detect(data: Uint8Array): Promise<ImageType | undefined>;
}

export class LessonImages {
  constructor(
    private readonly repository: LessonImageRepository,
    private readonly storage: LessonImageStorage,
    private readonly inspector: ImageInspector
  ) {}

  async upload(actor: UserIdentity, data?: Uint8Array) {
    const ownerId = requireTutor(actor);
    if (!data?.length) throw new LessonError('invalid_image');
    if (data.length > maxImageBytes) throw new LessonError('image_too_large');

    const mediaType = await this.inspector.detect(data);
    if (!mediaType) throw new LessonError('invalid_image');
    const objectKey = `lesson-images/${randomUUID()}.${mediaType.split('/')[1]}`;
    await this.storage.put(objectKey, data, mediaType);
    try {
      return {
        id: await this.repository.createAsset(ownerId, { objectKey, mediaType }, data.length),
      };
    } catch (error) {
      await this.storage.delete(objectKey).catch(() => {});
      throw error;
    }
  }

  async read(actor: UserIdentity, id: string) {
    const asset = await this.repository.findAsset(requireTutor(actor), id);
    if (!asset) throw new LessonError('not_found');
    const stream = await this.storage.get(asset.objectKey);
    if (!stream) throw new LessonError('not_found');
    return { mediaType: asset.mediaType, stream };
  }
}
