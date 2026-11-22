import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/auth-form';
import { Suspense } from 'react';

export const metadata: Metadata = { title: 'Sign in | Online Tutor' };
export default function SignInPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
