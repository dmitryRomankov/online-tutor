'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { ConnectionApiError } from './api';

export function useConnectionSession(errors: unknown[]) {
  const auth = useAuth();
  const handled = useRef<unknown>(null);
  const expired = errors.find(
    (error) => error instanceof ConnectionApiError && error.status === 401
  );

  useEffect(() => {
    if (expired && handled.current !== expired) {
      handled.current = expired;
      void auth.expire();
    }
  }, [expired, auth]);
}
