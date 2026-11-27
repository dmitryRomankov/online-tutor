'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import { lessonErrorMessage, sessionVersionsApi } from './api';
import { useLessonSession } from './useLessonSession';

export function SessionPreparation({ id }: { id: string }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['session-version', user?.id, id];
  const session = useQuery({
    queryKey,
    queryFn: ({ signal }) => sessionVersionsApi.get(id, signal),
    enabled: user?.role === 'TUTOR',
    retry: false,
  });
  const start = useMutation({
    mutationFn: () => sessionVersionsApi.start(id),
    onSuccess: async (result) => {
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, result);
    },
    retry: false,
  });

  useLessonSession(session.error ?? start.error);
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
  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight phone:text-2xl">
        {state === 'ended' ? 'Session record' : 'Classroom preparation'}
      </h1>
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">
          {scheduled
            ? 'Lesson ready'
            : state === 'cancelled'
              ? 'Session cancelled'
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
        {start.error && scheduled && (
          <p role="alert" className="text-sm text-destructive">
            {lessonErrorMessage(start.error)}
          </p>
        )}
        {scheduled && (
          <Button
            className="min-h-11 phone:w-full"
            disabled={!version || start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? 'Starting…' : 'Start lesson'}
          </Button>
        )}
      </div>
    </section>
  );
}
