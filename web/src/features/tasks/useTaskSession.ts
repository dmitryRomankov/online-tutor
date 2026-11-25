import { useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { TaskApiError } from './api';

export function useTaskSession(error: unknown) {
  const { user, expire } = useAuth();
  useEffect(() => {
    if (user && error instanceof TaskApiError && error.status === 401) void expire();
  }, [user, expire, error]);
}
