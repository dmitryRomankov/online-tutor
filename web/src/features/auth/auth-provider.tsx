'use client';

import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, signIn, registerAccount, signOut } from './api';
import type { AuthUser, Credentials, Registration } from './api';

const SESSION_KEY = ['auth', 'session'] as const;

interface AuthContextValue {
  user: AuthUser | null | undefined;
  checking: boolean;
  error: Error | null;
  refresh: () => void;
  expire: () => Promise<void>;
  login: (credentials: Credentials, signal?: AbortSignal) => Promise<void>;
  register: (registration: Registration, signal?: AbortSignal) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: SESSION_KEY,
    queryFn: ({ signal }) => getCurrentUser(signal),
    staleTime: 0,
    retry: false,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  async function setIdentity(user: AuthUser | null) {
    await queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
    queryClient.setQueryData(SESSION_KEY, user);
  }

  return (
    <AuthContext.Provider
      value={{
        user: session.data,
        checking: session.isPending,
        error: session.error,
        expire: () => setIdentity(null),
        refresh: () => {
          void session.refetch();
        },
        login: async (credentials, signal) => {
          const user = await signIn(credentials, signal);
          if (!signal?.aborted) await setIdentity(user);
        },
        register: async (registration, signal) => {
          const user = await registerAccount(registration, signal);
          if (!signal?.aborted) await setIdentity(user);
        },
        logout: async () => {
          await signOut();
          await setIdentity(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Authentication requires AuthProvider.');
  return context;
}
