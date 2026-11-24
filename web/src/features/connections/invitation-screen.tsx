'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { dashboardPath } from '@/features/auth/api';
import { useInvitation } from './use-invitation';
import { connectionError } from './api';

export function InvitationScreen() {
  const parameters = useSearchParams();
  const { user } = useAuth();
  return <InvitationContent key={`${user?.id}:${parameters.get('token')}`} />;
}

function InvitationContent() {
  const state = useInvitation();
  const { auth, preview, accept } = state;
  let content: React.ReactNode;
  if (!state.valid)
    content = (
      <p role="alert" className="text-destructive">
        This invitation link is invalid. Ask your tutor for a new link.
      </p>
    );
  else if (auth.checking) content = <p role="status">Checking your session…</p>;
  else if (auth.error)
    content = (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          Could not verify your session.
        </p>
        <Button onClick={auth.refresh}>Try again</Button>
      </div>
    );
  else if (!auth.user || state.expired)
    content = (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sign in as a student to review this invitation. Nothing is accepted until you confirm.
        </p>
        {state.expired && (
          <p role="alert" className="text-sm text-destructive">
            Your session ended. Sign in again.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={state.signInHref}>Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={state.registerHref}>Create student account</Link>
          </Button>
        </div>
      </div>
    );
  else if (auth.user.role !== 'STUDENT')
    content = (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          Only student accounts can accept invitations. Your tutor profile cannot be changed.
        </p>
        <Button asChild variant="outline">
          <Link href={dashboardPath(auth.user.role)}>Back to dashboard</Link>
        </Button>
      </div>
    );
  else if (accept.isSuccess || preview.data?.accepted)
    content = (
      <div className="space-y-4">
        <p role="status" className="text-emerald-800">
          You are connected to {accept.data?.person.name ?? preview.data?.tutor.name}{' '}
          {accept.data?.person.lastname ?? preview.data?.tutor.lastname}.
        </p>
        <Button asChild>
          <Link href="/student">Go to dashboard</Link>
        </Button>
      </div>
    );
  else if (preview.isPending) content = <p role="status">Loading invitation…</p>;
  else if (preview.error)
    content = (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">
          {connectionError(preview.error)}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void preview.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  else
    content = (
      <div className="space-y-5">
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="font-semibold">
            {preview.data?.tutor.name} {preview.data?.tutor.lastname}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Invites you to connect as their student.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Your tutor will be able to assign lessons and homework. You can have one active tutor.
        </p>
        <p className="text-xs text-muted-foreground">
          Expires {preview.data && new Date(preview.data.expiresAt).toLocaleString()}
        </p>
        {accept.error && (
          <p role="alert" className="text-sm text-destructive">
            {connectionError(accept.error)}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
            {accept.isPending ? 'Connecting…' : 'Accept invitation'}
          </Button>
          <Button asChild variant="outline">
            <Link href="/student">Not now</Link>
          </Button>
        </div>
      </div>
    );
  return (
    <main className="flex min-h-svh items-center justify-center p-4 sm:p-12">
      <section
        className="w-full max-w-lg space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6 [&_button]:min-h-11 [&_a]:min-h-11"
        aria-labelledby="invitation-title"
      >
        <Link href="/" className="text-sm font-medium text-foreground">
          Online Tutor
        </Link>
        <h1
          id="invitation-title"
          className="m-0 text-2xl leading-[1.3] font-semibold tracking-[-0.3px]"
        >
          Tutor invitation
        </h1>
        {content}
      </section>
    </main>
  );
}
