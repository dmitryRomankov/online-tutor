'use client';

import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import { authHref, validInvitationToken } from '@/features/auth/invitation-links';
import { useConnectionSession } from './useConnectionSession';
import { connectionsApi, ConnectionApiError } from './api';

export function useInvitation() {
  const parameters = useSearchParams();
  const token = parameters.get('token');
  const auth = useAuth();
  const client = useQueryClient();
  const valid = validInvitationToken(token);
  const allowed = Boolean(valid && auth.user?.role === 'STUDENT' && !auth.error);

  const preview = useQuery({
    queryKey: ['connections', auth.user?.id, 'preview', token],
    queryFn: ({ signal }) => connectionsApi.preview(token!, signal),
    enabled: allowed,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });

  const accept = useMutation({
    mutationFn: () => connectionsApi.accept(token!),
    retry: false,
    gcTime: 0,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['connections', auth.user?.id] });
    },
  });

  useConnectionSession([preview.error, accept.error]);

  const expired = [preview.error, accept.error].some(
    (error) => error instanceof ConnectionApiError && error.status === 401
  );

  return {
    auth,
    valid,
    preview,
    accept,
    expired,
    signInHref: authHref('login', token),
    registerHref: authHref('register', token),
  };
}
