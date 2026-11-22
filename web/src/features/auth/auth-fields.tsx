import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { useAuthForm } from './useAuthForm';

export function AuthFields({
  registering,
  field,
  errors,
  visible,
  togglePassword,
}: Pick<ReturnType<typeof useAuthForm>, 'registering' | 'field' | 'errors' | 'visible' | 'togglePassword'>) {
  return (
    <>
      {registering &&
        (['name', 'lastname'] as const).map((nameField) => (
          <div
            className="form-field flex flex-col gap-2 min-w-0 [&_label]:text-[14px] [&_label]:font-medium [&_label]:leading-[20px] name-field order-[1]"
            key={nameField}
          >
            <label htmlFor={nameField}>{nameField === 'name' ? 'Name' : 'Last name'}</label>
            <Input
              id={nameField}
              {...field(nameField)}
              autoComplete={nameField === 'name' ? 'given-name' : 'family-name'}
              placeholder={nameField === 'name' ? 'Enter your name' : 'Enter your last name'}
              maxLength={200}
              required
              aria-invalid={Boolean(errors[nameField])}
              aria-describedby={errors[nameField] ? `${nameField}-error` : undefined}
            />
            {errors[nameField] && (
              <p
                id={`${nameField}-error`}
                className="field-error m-0 text-[13px] leading-[1.5] text-destructive"
                role="alert"
              >
                {errors[nameField]?.message}
              </p>
            )}
          </div>
        ))}
      <div className="form-field flex flex-col gap-2 min-w-0 [&_label]:text-[14px] [&_label]:font-medium [&_label]:leading-[20px] email-field order-[1]">
        <label htmlFor="email">Email</label>
        <Input
          id="email"
          {...field('email')}
          autoComplete="email"
          type="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Enter your email"
          maxLength={254}
          required
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <p
            id="email-error"
            className="field-error m-0 text-[13px] leading-[1.5] text-destructive"
            role="alert"
          >
            {errors.email?.message}
          </p>
        )}
      </div>
      <div className="form-field flex flex-col gap-2 min-w-0 [&_label]:text-[14px] [&_label]:font-medium [&_label]:leading-[20px] password-field order-[2]">
        <label htmlFor="password">Password</label>
        <div className="password-input relative [&_input]:pr-12">
          <Input
            id="password"
            {...field('password')}
            type={visible ? 'text' : 'password'}
            autoComplete={registering ? 'new-password' : 'current-password'}
            placeholder="Enter your password"
            required
            aria-invalid={Boolean(errors.password)}
            aria-describedby={
              errors.password ? 'password-error' : registering ? 'password-help' : undefined
            }
          />
          <button
            type="button"
            className="password-toggle absolute [inset:0_0_0_auto] w-11 flex justify-center items-center text-muted-foreground rounded-[8px] cursor-pointer [&:hover]:text-foreground [&:focus-visible]:[outline:2px_solid_var(--ring)] [&:focus-visible]:[outline-offset:2px]"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            onClick={togglePassword}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {errors.password && (
          <p
            id="password-error"
            className="field-error m-0 text-[13px] leading-[1.5] text-destructive"
            role="alert"
          >
            {errors.password?.message}
          </p>
        )}
        {registering && (
          <p
            id="password-help"
            className="field-hint m-0 text-muted-foreground text-[12px] leading-[1.5]"
          >
            At least 5 characters.
          </p>
        )}
      </div>
      {registering && (
        <div className="form-field flex flex-col gap-2 min-w-0 [&_label]:text-[14px] [&_label]:font-medium [&_label]:leading-[20px] confirmation-field order-[3]">
          <label htmlFor="confirmation">Confirm password</label>
          <Input
            id="confirmation"
            {...field('confirmation')}
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Enter your password again"
            required
            aria-invalid={Boolean(errors.confirmation)}
            aria-describedby={errors.confirmation ? 'confirmation-error' : undefined}
          />
          {errors.confirmation && (
            <p
              id="confirmation-error"
              className="field-error m-0 text-[13px] leading-[1.5] text-destructive"
              role="alert"
            >
              {errors.confirmation?.message}
            </p>
          )}
        </div>
      )}

    </>
  );
}
