import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import type { useAuthForm } from './useAuthForm';

const fieldErrorClass = 'text-[13px] leading-[1.5]';
const phoneInputClass = 'phone:min-h-11 phone:text-[16px]';

export function AuthFields({
  registering,
  field,
  errors,
  visible,
  togglePassword,
}: Pick<
  ReturnType<typeof useAuthForm>,
  'registering' | 'field' | 'errors' | 'visible' | 'togglePassword'
>) {
  return (
    <>
      {registering &&
        (['name', 'lastname'] as const).map((nameField) => (
          <Field
            className="order-1 min-w-0 gap-2"
            data-invalid={Boolean(errors[nameField])}
            key={nameField}
          >
            <FieldLabel className="leading-5 text-foreground" htmlFor={nameField}>
              {nameField === 'name' ? 'Name' : 'Last name'}
            </FieldLabel>
            <Input
              id={nameField}
              className={phoneInputClass}
              {...field(nameField)}
              autoComplete={nameField === 'name' ? 'given-name' : 'family-name'}
              placeholder={nameField === 'name' ? 'Enter your name' : 'Enter your last name'}
              maxLength={200}
              required
              aria-invalid={Boolean(errors[nameField])}
              aria-describedby={errors[nameField] ? `${nameField}-error` : undefined}
            />
            {errors[nameField] && (
              <FieldError
                id={`${nameField}-error`}
                className={fieldErrorClass}
                errors={[errors[nameField]]}
              />
            )}
          </Field>
        ))}
      <Field className="order-1 min-w-0 gap-2" data-invalid={Boolean(errors.email)}>
        <FieldLabel className="leading-5 text-foreground" htmlFor="email">
          Email
        </FieldLabel>
        <Input
          id="email"
          className={phoneInputClass}
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
          <FieldError id="email-error" className={fieldErrorClass} errors={[errors.email]} />
        )}
      </Field>
      <Field className="order-2 min-w-0 gap-2" data-invalid={Boolean(errors.password)}>
        <FieldLabel className="leading-5 text-foreground" htmlFor="password">
          Password
        </FieldLabel>
        <div className="relative">
          <Input
            id="password"
            className={`${phoneInputClass} pr-12`}
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute inset-y-0 right-0 h-auto w-11 cursor-pointer text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-[17px]"
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            onClick={togglePassword}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </Button>
        </div>
        {errors.password && (
          <FieldError id="password-error" className={fieldErrorClass} errors={[errors.password]} />
        )}
        {registering && (
          <FieldDescription
            id="password-help"
            className="field-hint m-0 text-muted-foreground text-[12px] leading-[1.5]"
          >
            At least 5 characters.
          </FieldDescription>
        )}
      </Field>
      {registering && (
        <Field className="order-3 min-w-0 gap-2" data-invalid={Boolean(errors.confirmation)}>
          <FieldLabel className="leading-5 text-foreground" htmlFor="confirmation">
            Confirm password
          </FieldLabel>
          <Input
            id="confirmation"
            className={phoneInputClass}
            {...field('confirmation')}
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Enter your password again"
            required
            aria-invalid={Boolean(errors.confirmation)}
            aria-describedby={errors.confirmation ? 'confirmation-error' : undefined}
          />
          {errors.confirmation && (
            <FieldError
              id="confirmation-error"
              className={fieldErrorClass}
              errors={[errors.confirmation]}
            />
          )}
        </Field>
      )}
    </>
  );
}
