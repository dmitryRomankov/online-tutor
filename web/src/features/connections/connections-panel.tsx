'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/auth-provider';
import { useConnections } from './useConnections';
import { connectionError } from './api';
import { ConnectionList } from './connection-list';

export function ConnectionsPanel({ manage = false }: { manage?: boolean }) {
  const { user } = useAuth();
  const state = useConnections(manage);
  const tutor = user?.role === 'TUTOR';
  return (
    <section
      className="mt-6 max-w-3xl space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6 [&_button]:min-h-11 [&_input]:min-h-11"
      aria-labelledby="connections-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="connections-title" className="text-lg font-semibold">
          {tutor ? 'Your students' : 'Your tutor'}
        </h2>
        {tutor && !manage && (
          <Button asChild variant="outline">
            <Link href="/tutor/students">Manage students</Link>
          </Button>
        )}
      </div>
      <ConnectionList
        rows={state.connections.data}
        loading={state.connections.isPending}
        error={state.connections.error}
        retry={() => {
          void state.connections.refetch();
        }}
        tutor={tutor}
      />
      {tutor && manage && (
        <>
          <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <h3 className="font-medium">Invite a student</h3>
            <p className="text-sm text-muted-foreground">
              Each link connects one student and expires after seven days. Send it using your
              preferred messenger.
            </p>
            <Button disabled={state.create.isPending} onClick={() => state.create.mutate()}>
              {state.create.isPending ? 'Creating invitation…' : 'Create invitation link'}
            </Button>
            {state.create.error && (
              <p role="alert" className="text-sm text-destructive">
                {connectionError(state.create.error)}
              </p>
            )}
            {state.link && (
              <div className="space-y-2">
                <label htmlFor="invitation-link" className="text-sm font-medium">
                  Invitation link
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="invitation-link"
                    className="w-full min-w-0 flex-1"
                    value={state.link}
                    readOnly
                    onFocus={(event) => event.target.select()}
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      void state.copy();
                    }}
                  >
                    Copy invitation link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Copy this link now. For privacy, it cannot be retrieved after leaving this page.
                </p>
                {state.copied && (
                  <p role="status" className="text-sm text-emerald-800">
                    Invitation link copied.
                  </p>
                )}
                {state.copyFailed && (
                  <p role="alert" className="text-sm text-destructive">
                    Could not copy automatically. Select and copy the link above.
                  </p>
                )}
              </div>
            )}
          </div>
          <section aria-labelledby="invitations-title" className="space-y-3">
            <h3 id="invitations-title" className="font-medium">
              Invitations
            </h3>
            {state.invitations.isPending && <p role="status">Loading invitations…</p>}
            {state.invitations.error && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{connectionError(state.invitations.error)}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    void state.invitations.refetch();
                  }}
                >
                  Retry invitations
                </Button>
              </div>
            )}
            {state.invitations.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">No invitations yet.</p>
            )}
            <ul className="divide-y divide-border">
              {state.invitations.data?.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="space-y-1 text-sm">
                    <p className="font-medium capitalize">{invitation.status}</p>
                    <p className="text-muted-foreground">
                      Expires {new Date(invitation.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  {invitation.status === 'pending' && (
                    <Button
                      variant="outline"
                      disabled={state.revoke.isPending}
                      aria-label={`Revoke invitation expiring ${new Date(invitation.expiresAt).toLocaleString()}`}
                      onClick={() => state.revoke.mutate(invitation.id)}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {state.revoke.error && (
              <p role="alert" className="text-sm text-destructive">
                {connectionError(state.revoke.error)}
              </p>
            )}
            {state.revoke.isSuccess && (
              <p role="status" className="text-sm text-emerald-800">
                Invitation revoked.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
