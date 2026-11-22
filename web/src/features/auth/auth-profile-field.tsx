import { AlertTriangle } from 'lucide-react';
import type { useAuthForm } from './useAuthForm';

export function DesktopProfileField({
  role,
  errors,
  selectRole,
}: Pick<ReturnType<typeof useAuthForm>, 'role' | 'errors' | 'selectRole'>) {
  return (
    <div className="profile-field [&_legend]:text-[14px] [&_legend]:font-medium [&_legend]:leading-[20px] order-[0] max-[640.01px]:order-[4] profile-desktop max-[640.01px]:hidden">
      <fieldset
        className="profile-radio p-3 [border:1px_solid_var(--border)] rounded-[8px] [&_legend]:[padding:0_4px] [&_label]:inline-flex [&_label]:items-center [&_label]:gap-2 [&_label]:mr-6 [&_label]:min-h-8 [&_label]:text-[14px] [&_label]:cursor-pointer [&_input]:w-4 [&_input]:h-4 [&_input]:[accent-color:var(--foreground)] [&_input:focus-visible]:[outline:2px_solid_var(--ring)] [&_input:focus-visible]:[outline-offset:3px]"
        aria-describedby={
          errors.role ? 'role-error-desktop role-help-desktop' : 'role-help-desktop'
        }
        aria-invalid={Boolean(errors.role)}
      >
        <legend>Profile type</legend>
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
        <p
          id="role-error-desktop"
          className="field-error m-0 text-[13px] leading-[1.5] text-destructive"
          role="alert"
        >
          {errors.role?.message}
        </p>
      )}
      <p
        id="role-help-desktop"
        className="profile-help m-0 text-[#92400e] text-[12px] leading-[1.5] flex items-start gap-2 mt-2 p-3 [border:1px_solid_#f3d18a] rounded-[8px] bg-[#fff4d6] [&_svg]:shrink-0 [&_svg]:mt-0.25 max-[640.01px]:text-[14px] max-[640.01px]:mt-4"
        role="note"
      >
        <AlertTriangle size={16} aria-hidden="true" />
        Your profile type cannot be changed later.
      </p>
    </div>
  );
}

export function MobileProfileField({
  role,
  errors,
  onRoleChange,
}: Pick<ReturnType<typeof useAuthForm>, 'role' | 'errors' | 'onRoleChange'>) {
  return (
    <div className="profile-field [&_legend]:text-[14px] [&_legend]:font-medium [&_legend]:leading-[20px] order-[0] max-[640.01px]:order-[4] profile-mobile hidden max-[640.01px]:block">
      <div className="profile-select [&_label]:text-[14px] [&_label]:font-medium [&_label]:leading-[20px] [&_select]:w-full [&_select]:min-h-11 [&_select]:[padding:8px_12px] [&_select]:[border:1px_solid_var(--input)] [&_select]:rounded-[8px] [&_select]:bg-card [&_select]:text-foreground [&_select]:text-[14px] [&_select:focus-visible]:[outline:2px_solid_var(--ring)] [&_select:focus-visible]:[outline-offset:2px] max-[640.01px]:flex max-[640.01px]:flex-col max-[640.01px]:gap-2">
        <label htmlFor="role">Profile type</label>
        <select
          id="role"
          value={role}
          onChange={onRoleChange}
          aria-describedby={
            errors.role ? 'role-error-mobile role-help-mobile' : 'role-help-mobile'
          }
          aria-invalid={Boolean(errors.role)}
        >
          <option value="STUDENT">Student</option>
          <option value="TUTOR">Tutor</option>
        </select>
      </div>
      {errors.role && (
        <p
          id="role-error-mobile"
          className="field-error m-0 text-[13px] leading-[1.5] text-destructive"
          role="alert"
        >
          {errors.role?.message}
        </p>
      )}
      <p
        id="role-help-mobile"
        className="profile-help m-0 text-[#92400e] text-[12px] leading-[1.5] flex items-start gap-2 mt-2 p-3 [border:1px_solid_#f3d18a] rounded-[8px] bg-[#fff4d6] [&_svg]:shrink-0 [&_svg]:mt-0.25 max-[640.01px]:text-[14px] max-[640.01px]:mt-4"
        role="note"
      >
        <AlertTriangle size={16} aria-hidden="true" />
        Your profile type cannot be changed later.
      </p>
    </div>
  );
}
