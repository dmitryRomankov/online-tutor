'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { scheduleErrorMessage } from './api';
import type { Booking } from './api';
import { useBooking, useSchedule } from './schedule-queries';
import { bookingTime, viewerZone } from './time';

const noSubscription = () => () => {};
const scheduleCard = 'min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-6';

function BookingDetails({ booking }: { booking: Booking }) {
  const zone = useSyncExternalStore(noSubscription, viewerZone, () => 'UTC');
  return (
    <>
      <p className="wrap-anywhere text-base font-medium">{booking.title}</p>
      <p className="wrap-anywhere text-sm text-muted-foreground">{booking.participantName}</p>
      <p className="text-sm">
        <time dateTime={booking.scheduledStart}>
          {bookingTime(booking.scheduledStart, booking.durationMinutes, zone)}
        </time>
      </p>
      <p className="text-sm text-muted-foreground">{zone}</p>
    </>
  );
}

function BookingError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">
        {scheduleErrorMessage(error)}
      </p>
      <Button variant="outline" className="min-h-11" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

export function ScheduleDashboard({ role }: { role: 'TUTOR' | 'STUDENT' }) {
  const query = useSchedule();
  const tutor = role === 'TUTOR';
  return (
    <section aria-labelledby="schedule-title" className="my-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 phone:items-stretch phone:flex-col">
        <h2 id="schedule-title" className="text-xl font-semibold">
          Lesson schedule
        </h2>
        {tutor && (
          <Button asChild className="min-h-11">
            <Link href="/tutor/sessions/new">Schedule lesson</Link>
          </Button>
        )}
      </div>
      {query.isPending && (
        <p role="status" className="text-sm">
          Loading schedule…
        </p>
      )}
      {query.error && <BookingError error={query.error} retry={() => void query.refetch()} />}
      {query.data?.sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">No scheduled lessons yet.</p>
      )}
      <ul className="grid gap-3 lg:grid-cols-2">
        {query.data?.sessions.map((booking) => (
          <li key={booking.id} className={scheduleCard}>
            <p className="text-sm font-medium">
              {booking.state === 'active' ? 'In progress' : 'Scheduled'}
            </p>
            <BookingDetails booking={booking} />
            {tutor ? (
              <Button asChild variant="outline" className="min-h-11 phone:w-full">
                <Link href={`/tutor/sessions/${booking.id}/booking`}>View booking</Link>
              </Button>
            ) : booking.canJoin ? (
              <Button asChild className="min-h-11 phone:w-full">
                <Link href={`/student/sessions/${booking.id}`}>Join</Link>
              </Button>
            ) : (
              <>
                <p id={`join-${booking.id}`} className="text-sm text-muted-foreground">
                  {booking.canPrepare
                    ? 'Join becomes available at the scheduled start.'
                    : 'Entry is unavailable.'}
                </p>
                <Button
                  className="min-h-11 phone:w-full"
                  disabled
                  aria-describedby={`join-${booking.id}`}
                >
                  Join
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BookingScreen({ id, audience }: { id: string; audience: 'student' | 'tutor' }) {
  const query = useBooking(id, audience);
  const booking = query.data;
  const isStudent = audience === 'student';
  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="link" className="min-h-11 px-0">
        <Link href={isStudent ? '/student' : '/tutor'}>Back to dashboard</Link>
      </Button>
      <h1 className="text-3xl font-semibold tracking-tight phone:text-2xl">
        {isStudent ? 'Session status' : 'Scheduled session'}
      </h1>
      {query.isPending && <p role="status">Loading session…</p>}
      {query.error ? (
        <BookingError error={query.error} retry={() => void query.refetch()} />
      ) : (
        booking && (
          <div className={scheduleCard}>
            <h2 className="text-lg font-semibold">
              {isStudent
                ? booking.state === 'scheduled'
                  ? 'Waiting for your tutor'
                  : 'Lesson started'
                : {
                    scheduled: 'Booking confirmed',
                    active: 'In progress',
                    ended: 'Completed',
                    cancelled: 'Cancelled',
                  }[booking.state]}
            </h2>
            <BookingDetails booking={booking} />
            {isStudent && booking.state === 'scheduled' && (
              <p className="text-sm text-muted-foreground">
                The lesson will begin when your tutor selects Start lesson.
              </p>
            )}
            {!isStudent && booking.canPrepare && (
              <Button asChild className="min-h-11 phone:w-full">
                <Link href={`/tutor/sessions/${id}`}>Prepare classroom</Link>
              </Button>
            )}
          </div>
        )
      )}
    </section>
  );
}
