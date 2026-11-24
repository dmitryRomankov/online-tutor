import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { AuthErrorNotice } from './auth-feedback';
import type { useAuthForm } from './useAuthForm';

export function AuthFormActions({
  registering,
  failure,
  pending,
}: Pick<ReturnType<typeof useAuthForm>, 'registering' | 'failure' | 'pending'>) {
  return (
    <div className="form-actions order-5 phone:mt-[-4px]">
      {failure && (
        <AuthErrorNotice
          title={registering ? 'Could not create account' : 'Could not sign in'}
          showIcon
        >
          <p>{failure}</p>
          {registering && failure.includes('temporarily unavailable') && (
            <p>If your account was created, try signing in after service recovers.</p>
          )}
        </AuthErrorNotice>
      )}
      <Button type="submit" disabled={pending} className="phone:min-h-11 phone:w-full">
        {pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
        {pending
          ? registering
            ? 'Creating account…'
            : 'Signing in…'
          : registering
            ? 'Create account'
            : 'Sign in'}
      </Button>
      <p className="sr-only" role="status">
        {pending ? 'Please wait while your request is processed.' : ''}
      </p>
    </div>
  );
}
