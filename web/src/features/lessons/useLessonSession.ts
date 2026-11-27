import { useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { LessonApiError } from './api';

export function useLessonSession(error: unknown) {
  const { user, expire } = useAuth();
  useEffect(() => {
    if (user && error instanceof LessonApiError && error.status === 401) void expire();
  }, [user, expire, error]);
}
