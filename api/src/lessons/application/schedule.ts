import { z } from 'zod';
import type { UserIdentity } from '../../auth/application/authentication.js';

export const scheduleInput = z.strictObject({
  id: z.uuid(),
  connectionId: z.uuid(),
  lessonId: z.uuid(),
  scheduledStart: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value).toISOString()),
  durationMinutes: z.number().int().positive().max(2_147_483_647),
});

export type ScheduleInput = z.infer<typeof scheduleInput>;
export type Booking = ScheduleInput & {
  title: string;
  participantName: string;
  state: 'scheduled' | 'active' | 'ended' | 'cancelled';
  connected: boolean;
};

export interface ScheduleRepository {
  create(tutorId: string, input: ScheduleInput): Promise<Booking>;
  list(actor: UserIdentity): Promise<Booking[]>;
  find(actor: UserIdentity, id: string): Promise<Booking | undefined>;
}

export type ScheduleErrorCode =
  | 'schedule_invalid'
  | 'schedule_forbidden'
  | 'schedule_missing'
  | 'schedule_conflict'
  | 'schedule_early'
  | 'schedule_closed'
  | 'schedule_unavailable';

export class ScheduleError extends Error {
  constructor(readonly code: ScheduleErrorCode) {
    super(code);
  }
}

function joinable(booking: Booking, now: Date) {
  return (
    booking.connected &&
    (booking.state === 'active' ||
      (booking.state === 'scheduled' && Date.parse(booking.scheduledStart) <= now.getTime()))
  );
}

function summary(booking: Booking, now: Date) {
  const { id, lessonId, title, participantName, scheduledStart, durationMinutes, state } = booking;
  return {
    id,
    lessonId,
    title,
    participantName,
    scheduledStart,
    durationMinutes,
    state,
    canJoin: joinable(booking, now),
    canPrepare: booking.connected && (state === 'scheduled' || state === 'active'),
  };
}

export class Schedule {
  constructor(
    private readonly repository: ScheduleRepository,
    private readonly now = () => new Date()
  ) {}

  async create(actor: UserIdentity, body: unknown) {
    if (actor.role !== 'TUTOR') throw new ScheduleError('schedule_forbidden');
    const input = scheduleInput.safeParse(body);
    if (!input.success) throw new ScheduleError('schedule_invalid');
    return summary(await this.repository.create(actor.id, input.data), this.now());
  }

  async list(actor: UserIdentity) {
    const bookings = await this.repository.list(actor);
    const now = this.now();
    return {
      serverNow: now.toISOString(),
      sessions: bookings.map((booking) => summary(booking, now)),
    };
  }

  async detail(actor: UserIdentity, id: string) {
    return summary(await this.requireParticipant(actor, id), this.now());
  }

  async studentEntry(actor: UserIdentity, id: string) {
    if (actor.role !== 'STUDENT') throw new ScheduleError('schedule_forbidden');
    const booking = await this.requireParticipant(actor, id);
    const now = this.now();
    if (!joinable(booking, now)) {
      throw new ScheduleError(
        booking.connected && booking.state === 'scheduled' ? 'schedule_early' : 'schedule_closed'
      );
    }
    return summary(booking, now);
  }

  private async requireParticipant(actor: UserIdentity, id: string) {
    const booking = await this.repository.find(actor, id);
    if (!booking) throw new ScheduleError('schedule_missing');
    return booking;
  }
}
