'use client';

import { AuthHeader, AuthSwitch } from './auth-navigation';
import { DesktopProfileField, MobileProfileField } from './auth-profile-field';
import { AuthFields } from './auth-fields';
import { AuthFormActions } from './auth-form-actions';
import { useAuthForm } from './useAuthForm';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const {
    registering,
    role,
    visible,
    pending,
    errors,
    failure,
    notice,
    field,
    onSubmit,
    togglePassword,
    selectRole,
    onRoleChange,
  } = useAuthForm(mode);

  return (
    <main className="auth-shell p-12 min-h-[100svh] max-[640.01px]:p-4 max-[640.01px]:bg-card flex flex-col items-center justify-center">
      <AuthHeader />
      <section
        className="auth-card w-130 max-w-full p-6 [border:1px_solid_var(--border)] rounded-[16px] bg-card [&_h1]:m-0 [&_h1]:text-[22px] [&_h1]:leading-[1.3] [&_h1]:tracking-[-0.3px] [&_h1]:font-semibold max-[640.01px]:w-full max-[640.01px]:border-0 max-[640.01px]:rounded-[0] max-[640.01px]:p-0 max-[640.01px]:[&_h1]:text-[24px]"
        aria-labelledby="auth-title"
      >
        <h1 id="auth-title">{registering ? 'Create your account' : 'Sign in'}</h1>
        <p className="auth-description [margin:8px_0_24px] text-muted-foreground text-[14px] leading-[1.5] max-[640.01px]:[margin:10px_0_24px]">
          {registering
            ? 'Choose your profile to get started.'
            : 'Welcome back. Sign in to your lessons.'}
        </p>
        {notice && (
          <p
            className="auth-notice [padding:12px_14px] [margin:0_0_20px] [border:1px_solid_#bfdbfe] rounded-[8px] bg-[#eff6ff] text-[#1d4ed8] text-[14px]"
            role="status"
          >
            {notice}
          </p>
        )}
        <form onSubmit={onSubmit} noValidate aria-busy={pending}>
          <fieldset
            disabled={pending}
            className="auth-fields flex flex-col gap-5 m-0 p-0 border-0 min-w-0 max-[640.01px]:gap-5 max-[640.01px]:[&_[data-slot='input']]:min-h-11 max-[640.01px]:[&_[data-slot='input']]:text-[16px]"
          >
            <legend className="sr-only">
              {registering ? 'Create your account' : 'Sign in to your account'}
            </legend>
            {registering && (
              <DesktopProfileField role={role} errors={errors} selectRole={selectRole} />
            )}
            <AuthFields
              registering={registering}
              field={field}
              errors={errors}
              visible={visible}
              togglePassword={togglePassword}
            />
            {registering && (
              <MobileProfileField role={role} errors={errors} onRoleChange={onRoleChange} />
            )}
            <AuthFormActions registering={registering} failure={failure} pending={pending} />
          </fieldset>
        </form>
        <AuthSwitch registering={registering} />
      </section>
    </main>
  );
}
