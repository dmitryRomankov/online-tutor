import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/auth-form';
import { Suspense } from 'react';

export const metadata: Metadata = { title: 'Create your account | Online Tutor' };
export default function RegistrationPage() {
  return (
    <Suspense>
      <AuthForm mode="register" />
    </Suspense>
  );
}
