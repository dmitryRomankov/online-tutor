'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import { scheduleKey } from '@/features/schedule/schedule-queries';
import { LessonApiError, sessionVersionsApi } from './api';
import { useLessonSession } from './useLessonSession';

export function useSessionLifecycle(id: string) {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['session-version', user?.id, id];

  const session = useQuery({
    queryKey,
    queryFn: ({ signal }) => sessionVersionsApi.get(id, signal),
    enabled: user?.role === 'TUTOR',
    retry: false,
  });

  const transition = useMutation({
    mutationFn: (action: 'start' | 'end') => sessionVersionsApi[action](id),
    onSuccess: async (result) => {
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, result);
      void client.invalidateQueries({ queryKey: scheduleKey(user?.id) });
    },

    onError: (error) => {
      if (error instanceof LessonApiError && error.status === 409) {
        void client.invalidateQueries({ queryKey });
      }
    },
    retry: false,
  });

  useLessonSession(transition.error ?? session.error);

  return { session, transition };
}
