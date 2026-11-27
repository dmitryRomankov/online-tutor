'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { lessonErrorMessage } from './api';
import { useSessionLifecycle } from './useSessionLifecycle';

export function SessionPreparation({ id }: { id: string }) {
  const { session, transition } = useSessionLifecycle(id);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  if (session.isPending) return <p role="status">Loading session…</p>;
  if (!session.data)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          {lessonErrorMessage(session.error)}
        </p>
        <Button variant="outline" onClick={() => void session.refetch()}>
          Try again
        </Button>
      </div>
    );

  const { state, version } = session.data;
  const scheduled = state === 'scheduled';
  const active = state === 'active';
  const showConfirmation = active && confirmingEnd;
  const title = {
    scheduled: 'Classroom preparation',
    active: showConfirmation ? 'End lesson' : 'Active classroom',
    ended: 'Session record',
    cancelled: 'Session cancelled',
  }[state];

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <Button asChild variant="link" className="min-h-11 px-0">
        <Link href="/tutor">Back to dashboard</Link>
      </Button>
      <h1 className="text-3xl font-semibold tracking-tight phone:text-2xl">{title}</h1>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">
          {scheduled
            ? 'Lesson ready'
            : state === 'cancelled'
              ? 'Booking cancelled'
              : 'Preserved lesson'}
        </h2>
        {version ? (
          <>
            <p className="wrap-anywhere">{version.title}</p>
            <p className="text-sm text-muted-foreground" role="status">
              {scheduled ? 'Latest prepared lesson' : 'Locked lesson'} v{version.number}
              {' · '}
              {version.activityCount} {version.activityCount === 1 ? 'activity' : 'activities'}
            </p>
          </>
        ) : (
          scheduled && <p>Save a lesson version before starting the session.</p>
        )}
        {scheduled && (
          <p className="text-sm text-muted-foreground">
            Starting preserves this session’s lesson version.
          </p>
        )}
        {state === 'ended' && (
          <p className="text-sm text-muted-foreground">Completed session content is read-only.</p>
        )}
        {transition.error && (scheduled || showConfirmation) && (
          <p role="alert" className="text-sm text-destructive">
            {lessonErrorMessage(transition.error)}
          </p>
        )}
        {scheduled && (
          <Button
            className="min-h-11 phone:w-full"
            disabled={!version || transition.isPending}
            onClick={() => transition.mutate('start')}
          >
            {transition.isPending ? 'Starting…' : 'Start lesson'}
          </Button>
        )}
        {active && !showConfirmation && (
          <Button
            variant="destructive"
            className="min-h-11 phone:w-full"
            onClick={() => {
              transition.reset();
              setConfirmingEnd(true);
            }}
          >
            End lesson
          </Button>
        )}
      </div>
      {showConfirmation && (
        <section
          aria-labelledby="confirm-end-heading"
          className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-6"
        >
          <h2 id="confirm-end-heading" className="text-lg font-semibold">
            End this lesson?
          </h2>
          <p className="text-sm">
            Both participants will leave the live classroom. Confirmed work is preserved.
          </p>
          <p className="text-sm text-muted-foreground">
            Changes that are still saving may be lost.
          </p>
          <div className="flex flex-wrap gap-3 phone:flex-col">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={transition.isPending}
              onClick={() => {
                transition.reset();
                setConfirmingEnd(false);
              }}
            >
              Keep teaching
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={transition.isPending}
              onClick={() => transition.mutate('end')}
            >
              {transition.isPending ? 'Ending…' : 'End lesson'}
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}
