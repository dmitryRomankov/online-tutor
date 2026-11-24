'use client';

import { AuthHeader, AuthSwitch } from './auth-navigation';
import { DesktopProfileField, MobileProfileField } from './auth-profile-field';
import { AuthFields } from './auth-fields';
import { AuthFormActions } from './auth-form-actions';
import { useAuthForm } from './useAuthForm';
import styles from './auth.module.css';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const {
    registering,
    invitation,
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
    <main className="auth-shell p-12 min-h-[100svh] phone:p-4 phone:bg-card flex flex-col items-center justify-center">
      <AuthHeader invitation={invitation} />
      <section className={styles.card} aria-labelledby="auth-title">
        <h1 id="auth-title" className={styles.heading}>
          {registering ? 'Create your account' : 'Sign in'}
        </h1>
        <p className={styles.description}>
          {registering
            ? 'Choose your profile to get started.'
            : 'Welcome back. Sign in to your lessons.'}
        </p>
        {notice && (
          <p
            className="mb-5 rounded-lg border border-info-border bg-info-surface px-3.5 py-3 text-[14px] text-info"
            role="status"
          >
            {notice}
          </p>
        )}
        <form onSubmit={onSubmit} noValidate aria-busy={pending}>
          <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
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
        <AuthSwitch registering={registering} invitation={invitation} />
      </section>
    </main>
  );
}
