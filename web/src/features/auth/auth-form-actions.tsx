import { AlertCircle, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useAuthForm } from './useAuthForm';

export function AuthFormActions({
  registering,
  failure,
  pending,
}: Pick<ReturnType<typeof useAuthForm>, 'registering' | 'failure' | 'pending'>) {
  return (
    <div className="form-actions order-[5] max-[640.01px]:mt-[-4px]">
      {failure && (
        <div
          className="auth-error flex items-start gap-2.5 [padding:14px_16px] mb-4 [border:1px_solid_#f3b9b3] rounded-[8px] text-destructive bg-[#fef2f2] text-[14px] leading-[1.5] [overflow-wrap:anywhere] [&>svg]:shrink-0 [&>svg]:mt-0.5 [&_strong]:font-medium [&_p]:[margin:4px_0_0]"
          role="alert"
        >
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>
              {registering ? 'Could not create account' : 'Could not sign in'}
            </strong>
            <p>{failure}</p>
            {registering && failure.includes('temporarily unavailable') && (
              <p>If your account was created, try signing in after service recovers.</p>
            )}
          </div>
        </div>
      )}
      <Button
        type="submit"
        className="auth-submit max-[640.01px]:w-full max-[640.01px]:min-h-11"
      >
        {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
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
