import type { UserIdentity } from '../../auth/application/authentication.js';
import { LessonError, requireTutor } from './lessons.js';

export interface SessionVersion {
  id: string;
  state: 'scheduled' | 'active' | 'ended' | 'cancelled';
  version: { id: string; number: number; title: string; activityCount: number } | null;
}

export interface SessionVersionsRepository {
  getSessionVersion(tutorId: string, id: string): Promise<SessionVersion | undefined>;
  startSession(tutorId: string, id: string): Promise<SessionVersion | undefined>;
  endSession(tutorId: string, id: string): Promise<SessionVersion | undefined>;
}

export class SessionVersions {
  constructor(private readonly repository: SessionVersionsRepository) {}

  async get(actor: UserIdentity, id: string) {
    return this.publicVersion(await this.repository.getSessionVersion(requireTutor(actor), id));
  }

  async start(actor: UserIdentity, id: string) {
    return this.publicVersion(await this.repository.startSession(requireTutor(actor), id));
  }

  async end(actor: UserIdentity, id: string) {
    return this.publicVersion(await this.repository.endSession(requireTutor(actor), id));
  }

  private publicVersion(result?: SessionVersion): SessionVersion {
    if (!result) throw new LessonError('not_found');
    const { id, state, version } = result;
    return { id, state, version };
  }
}
