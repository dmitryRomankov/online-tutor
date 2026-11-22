'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutDashboard, LogOut, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authErrorMessage, dashboardPath } from './api';
import type { ProfileRole } from './api';
import { useAuth } from './auth-provider';

export function AccountHome({ role }: { role: ProfileRole }) {
  const auth = useAuth();
  const router = useRouter();
  const hadSession = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (auth.user) {
      hadSession.current = true;
      if (auth.user.role !== role) router.replace(dashboardPath(auth.user.role));
    } else if (!auth.checking && !auth.error && !leaving) {
      router.replace(hadSession.current ? '/sign-in?reason=session-expired' : '/sign-in');
    }
  }, [auth.user, auth.checking, auth.error, role, router, leaving]);

  async function logout() {
    setLeaving(true);
    setFailure('');
    try {
      await auth.logout();
      router.replace('/sign-in?reason=signed-out');
    } catch (error) {
      setFailure(authErrorMessage(error));
      setLeaving(false);
    }
  }

  if (auth.error)
    return (
      <main className="auth-shell p-12 min-h-[100svh] max-[640.01px]:p-4 max-[640.01px]:bg-card">
        <section className="auth-card w-130 max-w-full p-6 [border:1px_solid_var(--border)] rounded-[16px] bg-card [&_h1]:m-0 [&_h1]:text-[22px] [&_h1]:leading-[1.3] [&_h1]:tracking-[-0.3px] [&_h1]:font-semibold max-[640.01px]:w-full max-[640.01px]:border-0 max-[640.01px]:rounded-[0] max-[640.01px]:p-0 max-[640.01px]:[&_h1]:text-[24px] session-fallback [&_h1]:m-0 [&_h1]:text-[22px] [&_h1]:leading-[1.3] [&_h1]:tracking-[-0.3px] [&_h1]:font-semibold [&_p]:[margin:12px_0_20px] [&_p]:text-[14px] [&_[data-slot='button']]:mr-3">
          <h1>Could not verify your session</h1>
          <p>{authErrorMessage(auth.error)}</p>
          <Button onClick={auth.refresh}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </section>
      </main>
    );
  if (!auth.user || auth.user.role !== role)
    return (
      <main
        className="session-loading min-h-[100svh] flex items-center justify-center gap-3 text-[14px]"
        role="status"
      >
        <LoaderCircle className="animate-spin" size={20} />
      </main>
    );

  const profile = role === 'TUTOR' ? 'Tutor' : 'Student';
  return (
    <main className="account-sheet min-h-[calc(100svh_-_16px)] [margin:8px] flex [border:1px_solid_var(--border)] rounded-[16px] overflow-hidden bg-[white] max-[640.01px]:m-0 max-[640.01px]:min-h-[100svh] max-[640.01px]:border-0 max-[640.01px]:rounded-[0]">
      <aside className="account-sidebar flex [flex:0_0_228px] flex-col [padding:24px_16px] bg-[#f8fafc] [border-right:1px_solid_var(--border)] [&_.auth-brand]:[padding:0_8px] max-[640.01px]:hidden">
        <Link
          className="auth-brand text-foreground text-[16px] no-underline tracking-[0] [&:focus-visible]:[outline:2px_solid_var(--ring)] [&:focus-visible]:[outline-offset:4px] [&:focus-visible]:rounded-[4px]"
          href={dashboardPath(role)}
        >
          Online Tutor
        </Link>
        <p className="sidebar-caption [margin:8px_8px_28px] text-[12px] text-muted-foreground">
          {profile} workspace
        </p>
        <nav aria-label="Main navigation">
          <Link
            className="nav-current flex items-center gap-2.5 [padding:10px_12px] rounded-[8px] bg-[#eff6ff] text-[#1d4ed8] text-[14px] no-underline"
            aria-current="page"
            href={dashboardPath(role)}
          >
            <LayoutDashboard size={17} />
            Dashboard
          </Link>
        </nav>
        <div className="sidebar-account flex items-center gap-2.5 [margin:auto_0_8px] [padding:24px_8px_8px] min-w-0 [&>div]:min-w-0 [&_strong]:block [&_strong]:[overflow-wrap:anywhere] [&_strong]:text-[12px] [&_strong]:font-medium [&_span:not(.account-initial)]:block [&_span:not(.account-initial)]:[overflow-wrap:anywhere] [&_span:not(.account-initial)]:text-[12px] [&_span:not(.account-initial)]:font-normal [&_span:not(.account-initial)]:text-muted-foreground">
          <span
            className="account-initial w-8 h-8 rounded-[8px] bg-[#dbeafe] text-[#1d4ed8] flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            {auth.user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>
              {auth.user.name} {auth.user.lastname}
            </strong>
            <span>{profile}</span>
          </div>
        </div>
        <Button variant="ghost" onClick={logout} disabled={leaving}>
          <LogOut size={16} />
          {leaving ? 'Signing out…' : 'Sign out'}
        </Button>
      </aside>
      <div className="account-main [flex:1] min-w-0">
        <header className="account-topbar min-h-12 [padding:8px_24px] [border-bottom:1px_solid_var(--border)] text-[12px] text-muted-foreground max-[640.01px]:min-h-19 max-[640.01px]:p-4">
          <span className="desktop-context max-[640.01px]:hidden">
            {profile} workspace / Dashboard
          </span>
          <Link
            className="auth-brand text-foreground text-[16px] no-underline tracking-[0] [&:focus-visible]:[outline:2px_solid_var(--ring)] [&:focus-visible]:[outline-offset:4px] [&:focus-visible]:rounded-[4px] mobile-brand hidden max-[640.01px]:block"
            href={dashboardPath(role)}
          >
            Online Tutor
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={leaving}
                className="account-menu-trigger max-w-60 h-8.5 text-[12px] max-[640.01px]:min-h-11 max-[640.01px]:max-w-45"
                aria-label="Account menu"
              >
                <span className="truncate">
                  {auth.user.name} {auth.user.lastname}
                </span>
                <ChevronDown size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="account-menu-label [padding:8px_12px] text-muted-foreground text-[12px]">
                {profile} · profile type is fixed
              </div>
              <DropdownMenuItem
                disabled={leaving}
                onSelect={() => {
                  void logout();
                }}
              >
                <LogOut size={16} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <section className="account-content [&_h1]:m-0 [&_h1]:text-[22px] [&_h1]:leading-[1.3] [&_h1]:tracking-[-0.3px] [&_h1]:font-semibold p-6 max-[640.01px]:p-4 max-[640.01px]:[&_h1]:text-[24px]">
          <h1>Dashboard</h1>
          <p className="auth-description [margin:8px_0_24px] text-muted-foreground text-[14px] leading-[1.5] max-[640.01px]:[margin:10px_0_24px]">
            {profile} workspace
          </p>
          {failure && (
            <div
              className="auth-error flex items-start gap-2.5 [padding:14px_16px] mb-4 [border:1px_solid_#f3b9b3] rounded-[8px] text-destructive bg-[#fef2f2] text-[14px] leading-[1.5] [overflow-wrap:anywhere] [&>svg]:shrink-0 [&>svg]:mt-0.5 [&_strong]:font-medium [&_p]:[margin:4px_0_0]"
              role="alert"
            >
              <div>
                <strong>Could not sign out</strong>
                <p>{failure}</p>
                <p>Please try signing out again.</p>
              </div>
            </div>
          )}
          <div className="account-welcome p-6 max-w-160 [border:1px_solid_var(--border)] rounded-[16px] [&_h2]:[margin:0_0_12px] [&_h2]:text-[16px] [&_h2]:font-medium [&_p]:text-[14px] [&_p]:text-muted-foreground [&_p]:[margin:6px_0] [&_p]:[overflow-wrap:anywhere] [&_strong]:text-foreground [&_strong]:font-medium max-[640.01px]:p-5">
            <h2>Your account is ready</h2>
            <p>
              Signed in as{' '}
              <strong>
                {auth.user.name} {auth.user.lastname}
              </strong>
              . <span>{auth.user.email}</span>
            </p>
            <p>
              Your profile type is <strong>{profile}</strong> and cannot be changed.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
