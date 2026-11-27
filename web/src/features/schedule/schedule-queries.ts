'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import { ScheduleApiError, scheduleApi } from './api';

const pollInterval = 15_000;
const classroomPollInterval = 2_000;
export const scheduleKey = (userId?: string) => ['schedule', userId] as const;

export function useScheduleAuth(error: unknown) {
  const { user, expire } = useAuth();

  useEffect(() => {
    if (user && error instanceof ScheduleApiError && error.status === 401) void expire();
  }, [user, expire, error]);
}

export function useSchedule() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: scheduleKey(user?.id),
    queryFn: ({ signal }) => scheduleApi.list(signal),
    enabled: Boolean(user),
    refetchInterval: (query) =>
      user?.role === 'STUDENT' &&
      query.state.data?.sessions.some(
        (session) => session.state === 'scheduled' && session.canPrepare && !session.canJoin
      )
        ? classroomPollInterval
        : pollInterval,
    retry: false,
  });
  const { data, refetch } = query;

  useEffect(() => {
    if (!data || user?.role !== 'STUDENT') return;

    const now = Date.parse(data.serverNow);
    const next = data.sessions.find(
      (session) =>
        session.canPrepare && !session.canJoin && Date.parse(session.scheduledStart) > now
    );
    if (!next) return;

    const delay = Date.parse(next.scheduledStart) - now;

    if (delay > pollInterval) return;

    const timeout = window.setTimeout(() => void refetch(), delay);
    return () => window.clearTimeout(timeout);
  }, [data, refetch, user?.role]);

  useScheduleAuth(query.error);

  return query;
}

export function useBooking(id: string, audience: 'tutor' | 'student') {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: [...scheduleKey(user?.id), audience, id],
    queryFn: ({ signal }) =>
      (audience === 'student' ? scheduleApi.studentSession : scheduleApi.detail)(id, signal),
    enabled: Boolean(user),
    retry: false,
    refetchInterval: (query) => {
      if (audience !== 'student' || query.state.data?.state === 'ended') return false;
      const error = query.state.error;
      if (
        error instanceof ScheduleApiError &&
        error.status < 500 &&
        error.code !== 'schedule_early'
      )
        return false;
      return classroomPollInterval;
    },
  });
  useScheduleAuth(query.error);
  return query;
}
