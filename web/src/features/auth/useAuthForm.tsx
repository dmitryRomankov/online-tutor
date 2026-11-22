'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { authSchema } from './auth-schema';
import type { AuthFormValues } from './auth-schema';
import { authErrorMessage, AuthApiError, dashboardPath } from './api';
import type { ProfileRole } from './api';
import { useAuth } from './auth-provider';

type Field = keyof AuthFormValues;

export function useAuthForm(mode: 'login' | 'register') {
  const registering = mode === 'register';
  const auth = useAuth();
  const router = useRouter();
  const parameters = useSearchParams();
  const controller = useRef<AbortController | null>(null);
  const {
    register: field,
    control,
    handleSubmit,
    setError,
    setFocus,
    clearErrors,
    setValue,
    formState,
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema(mode)),
    defaultValues: {
      name: '',
      lastname: '',
      email: '',
      password: '',
      confirmation: '',
      role: 'TUTOR',
    },
  });
  const role = useWatch({ control, name: 'role' });
  const errors = formState.errors;
  const failure = errors.root?.server?.message ?? '';
  const [visible, setVisible] = useState(false);
  const mutation = useMutation({
    mutationFn: async ({ name, lastname, email, password, role }: AuthFormValues) => {
      controller.current = new AbortController();
      if (registering)
        await auth.register({ name, lastname, email, password, role }, controller.current.signal);
      else await auth.login({ email, password }, controller.current.signal);
    },
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  });
  const pending = mutation.isPending || formState.isSubmitting;
  const reason = parameters.get('reason');
  const notice =
    reason === 'session-expired'
      ? 'Your session has ended. Sign in again to continue.'
      : reason === 'signed-out'
        ? 'You have been signed out.'
        : '';

  useEffect(() => {
    if (auth.user && !auth.error) router.replace(dashboardPath(auth.user.role));
  }, [auth.user, auth.error, router]);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (pending) return;
    const first = (['name', 'lastname', 'email', 'password', 'confirmation', 'role'] as const).find(
      (name) => errors[name]
    );
    if (first) setFocus(first);
  }, [errors, pending, setFocus]);
  async function submit(values: AuthFormValues) {
    if (mutation.isPending) return;
    clearErrors('root');
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (error instanceof AuthApiError && error.status === 409) {
        setError(
          'email',
          {
            type: 'server',
            message: 'An account with this email already exists. Sign in or use another email.',
          },
          { shouldFocus: true }
        );
      } else if (registering && error instanceof AuthApiError && Object.keys(error.fields).length) {
        let first = true;
        for (const [name, message] of Object.entries(error.fields)) {
          setError(name as Field, { type: 'server', message }, { shouldFocus: first });
          first = false;
        }
      } else setError('root.server', { message: authErrorMessage(error) });
    }
  }

  function changeRole(value: ProfileRole) {
    setValue('role', value, { shouldValidate: formState.isSubmitted });
  }

  return {
    registering,
    role,
    visible,
    pending,
    errors,
    failure,
    notice,
    field,
    onSubmit: handleSubmit(submit),
    togglePassword: () => setVisible((value) => !value),
    selectRole: changeRole,
    onRoleChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
      changeRole(event.target.value as ProfileRole),
  };
}
