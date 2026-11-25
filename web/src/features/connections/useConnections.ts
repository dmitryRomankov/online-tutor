'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import { useConnectionSession } from './useConnectionSession';
import { connectionsApi } from './api';

export function useConnections(manage = false) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [createdId, setCreatedId] = useState('');
  const key = ['connections', user?.id];

  const connections = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => connectionsApi.list(signal),
    enabled: Boolean(user),
    retry: false,
    refetchInterval: 15_000,
  });

  const invitations = useQuery({
    queryKey: [...key, 'invitations'],
    queryFn: ({ signal }) => connectionsApi.invitations(signal),
    enabled: Boolean(user?.role === 'TUTOR' && manage),
    retry: false,
    refetchInterval: 15_000,
  });

  const create = useMutation({
    mutationFn: connectionsApi.create,
    retry: false,
    gcTime: 0,
    onSuccess: (value) => {
      setLink(`${window.location.origin}/invite?token=${value.token}`);
      setCreatedId(value.id);
      setCopied(false);
      setCopyFailed(false);
      void client.invalidateQueries({ queryKey: key });
    },
  });

  const revoke = useMutation({
    mutationFn: connectionsApi.revoke,
    retry: false,
    onSuccess: (_, id) => {
      if (id === createdId) {
        setLink('');
        setCopied(false);
      }
      void client.invalidateQueries({ queryKey: key });
    },
  });

  useConnectionSession([connections.error, invitations.error, create.error, revoke.error]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }
  return { connections, invitations, create, revoke, link, copied, copyFailed, copy };
}
