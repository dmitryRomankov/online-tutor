import { AlertTriangle } from 'lucide-react';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import styles from './auth.module.css';
import type { useAuthForm } from './useAuthForm';

export function DesktopProfileField({
  role,
  errors,
  selectRole,
}: Pick<ReturnType<typeof useAuthForm>, 'role' | 'errors' | 'selectRole'>) {
  return (
    <div className="order-0 phone:hidden">
      <fieldset
        className={styles.roleOptions}
        aria-describedby={
          errors.role ? 'role-error-desktop role-help-desktop' : 'role-help-desktop'
        }
        aria-invalid={Boolean(errors.role)}
      >
        <legend className={styles.fieldLabel}>Profile type</legend>
        {(['TUTOR', 'STUDENT'] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="profile"
              value={value}
              checked={role === value}
              onChange={() => selectRole(value)}
            />
            {value === 'TUTOR' ? 'Tutor' : 'Student'}
          </label>
        ))}
      </fieldset>
      {errors.role && (
        <FieldError
          id="role-error-desktop"
          className="text-[13px] leading-[1.5]"
          errors={[errors.role]}
        />
      )}
      <ProfileTypeHelp id="role-help-desktop" />
    </div>
  );
}

export function MobileProfileField({
  role,
  errors,
  onRoleChange,
}: Pick<ReturnType<typeof useAuthForm>, 'role' | 'errors' | 'onRoleChange'>) {
  return (
    <div className="hidden phone:order-4 phone:block">
      <Field className="gap-2" data-invalid={Boolean(errors.role)}>
        <FieldLabel htmlFor="role" className="leading-5 text-foreground">
          Profile type
        </FieldLabel>
        <NativeSelect
          id="role"
          className="h-11 rounded-lg bg-card px-3 pr-9 text-[14px] text-foreground shadow-none"
          value={role}
          onChange={onRoleChange}
          aria-describedby={errors.role ? 'role-error-mobile role-help-mobile' : 'role-help-mobile'}
          aria-invalid={Boolean(errors.role)}
        >
          <NativeSelectOption value="STUDENT">Student</NativeSelectOption>
          <NativeSelectOption value="TUTOR">Tutor</NativeSelectOption>
        </NativeSelect>
      </Field>
      {errors.role && (
        <FieldError
          id="role-error-mobile"
          className="text-[13px] leading-[1.5]"
          errors={[errors.role]}
        />
      )}
      <ProfileTypeHelp id="role-help-mobile" />
    </div>
  );
}

function ProfileTypeHelp({ id }: { id: string }) {
  return (
    <p
      id={id}
      className="profile-help m-0 mt-2 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-surface p-3 text-[12px] leading-[1.5] text-warning phone:mt-4 phone:text-[14px]"
      role="note"
    >
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.25 shrink-0" />
      Your profile type cannot be changed later.
    </p>
  );
}
