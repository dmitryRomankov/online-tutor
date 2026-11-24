import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

export function AuthErrorNotice({
  title,
  children,
  showIcon = false,
}: {
  title: string;
  children: ReactNode;
  showIcon?: boolean;
}) {
  return (
    <div
      className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive-border bg-destructive-surface px-4 py-3.5 text-[14px] leading-[1.5] text-destructive [overflow-wrap:anywhere]"
      role="alert"
    >
      {showIcon && <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0" />}
      <div className="[&>p]:mt-1">
        <strong className="font-medium">{title}</strong>
        {children}
      </div>
    </div>
  );
}
