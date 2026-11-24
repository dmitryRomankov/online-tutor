import { Button } from '@/components/ui/button';
import type { Connection } from './api';
import { connectionError } from './api';

export function ConnectionList({
  rows,
  loading,
  error,
  retry,
  tutor,
}: {
  rows: Connection[] | undefined;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  tutor: boolean;
}) {
  if (loading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading connections…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="space-y-3 text-sm text-destructive">
        <p>{connectionError(error)}</p>
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  if (!rows?.length)
    return (
      <p className="text-sm text-muted-foreground">
        {tutor
          ? 'No students connected yet. Share an invitation to get started.'
          : 'No tutor connected yet. Ask your tutor for an invitation link.'}
      </p>
    );
  return (
    <ul
      className="divide-y divide-border"
      aria-label={tutor ? 'Connected students' : 'Connected tutor'}
    >
      {rows.map((row) => (
        <li key={row.id} className="flex min-w-0 items-center justify-between gap-3 py-4">
          <span className="break-words font-medium">
            {row.person.name} {row.person.lastname}
          </span>
          <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
            Connected
          </span>
        </li>
      ))}
    </ul>
  );
}
