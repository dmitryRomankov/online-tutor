'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutDashboard, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authErrorMessage, dashboardPath } from './api';
import type { ProfileRole } from './api';
import { ConnectionsPanel } from '@/features/connections/connections-panel';
import { useAuth } from './auth-provider';
import { AuthErrorNotice } from './auth-feedback';
import authStyles from './auth.module.css';
import styles from './dashboard-shell.module.css';

export function AccountHome({
  role,
  view = 'dashboard',
  children,
}: {
  role: ProfileRole;
  view?: 'dashboard' | 'students' | 'tasks';
  children?: React.ReactNode;
}) {
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
      <main className="auth-shell p-12 min-h-[100svh] phone:p-4 phone:bg-card">
        <section className={authStyles.card}>
          <h1 className={authStyles.heading}>Could not verify your session</h1>
          <p className="mt-3 mb-5 text-[14px]">{authErrorMessage(auth.error)}</p>
          <Button className="mr-3" onClick={auth.refresh}>
            Try again
          </Button>
          <Button variant="outline" className="mr-3" asChild>
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
        <Spinner className="size-5" aria-hidden="true" />
      </main>
    );

  const isTutor = role === 'TUTOR';
  const profile = isTutor ? 'Tutor' : 'Student';
  const viewTitle = { dashboard: 'Dashboard', students: 'Students', tasks: 'Task library' }[view];
  return (
    <main
      className={`${styles.sheet} flex overflow-hidden ${view === 'tasks' ? 'bg-background' : 'bg-card'}`}
    >
      <aside className={`account-sidebar ${styles.sidebar} flex flex-col phone:hidden`}>
        <Link className={`${authStyles.brand} px-2`} href={dashboardPath(role)}>
          Online Tutor
        </Link>
        <p className="sidebar-caption [margin:8px_8px_28px] text-[12px] text-muted-foreground">
          {profile} workspace
        </p>
        <nav aria-label="Main navigation">
          <Link
            className="nav-current flex items-center gap-2.5 [padding:10px_12px] rounded-[8px] text-foreground aria-[current=page]:bg-info-surface aria-[current=page]:text-info text-[14px] no-underline"
            aria-current={view === 'dashboard' ? 'page' : undefined}
            href={dashboardPath(role)}
          >
            <LayoutDashboard size={17} />
            Dashboard
          </Link>
          {isTutor && (
            <Link
              href="/tutor/students"
              aria-current={view === 'students' ? 'page' : undefined}
              className="mt-2 flex min-h-11 items-center rounded-lg px-3 text-sm text-foreground hover:bg-blue-50 aria-[current=page]:bg-blue-50 aria-[current=page]:text-blue-700"
            >
              Students
            </Link>
          )}
          {isTutor && (
            <Link
              href="/tutor/tasks"
              aria-current={view === 'tasks' ? 'page' : undefined}
              className="mt-2 flex min-h-11 items-center rounded-lg px-3 text-sm text-foreground hover:bg-info-surface aria-[current=page]:bg-info-surface aria-[current=page]:text-info"
            >
              Tasks
            </Link>
          )}
        </nav>
        <div className="mt-auto mb-2 flex min-w-0 items-center gap-2.5 px-2 pt-6 pb-2">
          <span
            className="account-initial w-8 h-8 rounded-[8px] bg-[#dbeafe] text-info flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            {auth.user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className={styles.sidebarIdentity}>
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
        <header
          className={`${styles.topbar} min-h-12 px-6 py-2 text-[12px] text-muted-foreground phone:min-h-19 phone:p-4`}
        >
          <span className="desktop-context phone:hidden">
            {profile} workspace / {viewTitle}
          </span>
          <Link className={`${authStyles.brand} hidden phone:block`} href={dashboardPath(role)}>
            Online Tutor
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={leaving}
                className="account-menu-trigger max-w-60 h-8.5 text-[12px] phone:min-h-11 phone:max-w-45"
                aria-label="Account menu"
              >
                <span className="truncate">
                  {view === 'tasks' ? 'Menu' : `${auth.user.name} ${auth.user.lastname}`}
                </span>
                <ChevronDown size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="px-3 py-2 text-[12px] font-normal text-muted-foreground">
                {profile} · profile type is fixed
              </DropdownMenuLabel>
              {isTutor && (
                <DropdownMenuItem asChild>
                  <Link href="/tutor/tasks">Task library</Link>
                </DropdownMenuItem>
              )}
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
        <section className="p-6 phone:p-4">
          {view !== 'tasks' && (
            <>
              <h1 className={authStyles.heading}>{viewTitle}</h1>
              <p className={authStyles.description}>{profile} workspace</p>
            </>
          )}
          {failure && (
            <AuthErrorNotice title="Could not sign out">
              <p>{failure}</p>
              <p>Please try signing out again.</p>
            </AuthErrorNotice>
          )}
          {view === 'dashboard' && (
            <div className={styles.welcome}>
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
          )}
          {view === 'tasks' ? (
            children
          ) : (
            <ConnectionsPanel key={`${auth.user.id}:${view}`} manage={view === 'students'} />
          )}
        </section>
      </div>
    </main>
  );
}
