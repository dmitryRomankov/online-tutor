import { authHref } from './invitation-links';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import styles from './auth.module.css';

export function AuthHeader({ invitation = null }: { invitation?: string | null }) {
  return (
    <header className="auth-header w-130 max-w-full mb-3 phone:w-full phone:min-h-11 phone:mb-4">
      <Link href="/" className={styles.brand}>
        <ArrowLeft className="inline-block mr-2" />
        Back to home page
      </Link>
      <div className="auth-mobile-menu hidden phone:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-h-11 min-w-20">
              Menu
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={authHref('login', invitation)}>Sign in</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={authHref('register', invitation)}>Create account</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function AuthSwitch({
  registering,
  invitation = null,
}: {
  registering: boolean;
  invitation?: string | null;
}) {
  return (
    <>
      <p className="auth-switch [margin:20px_0_0] text-[14px] text-muted-foreground [&_a]:text-foreground [&_a]:underline phone:hidden">
        {registering ? 'Already registered?' : 'New here?'}{' '}
        <Link href={authHref(registering ? 'login' : 'register', invitation)}>
          {registering ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
      <Button
        className="auth-switch-mobile hidden text-foreground no-underline phone:w-full phone:min-h-11 phone:flex phone:mt-4"
        variant="outline"
        asChild
      >
        <Link href={authHref(registering ? 'login' : 'register', invitation)}>
          {registering ? 'Sign in' : 'Create account'}
        </Link>
      </Button>
    </>
  );
}
