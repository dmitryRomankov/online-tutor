import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function AuthHeader() {
  return (
    <header className="auth-header w-130 max-w-full mb-3 max-[640.01px]:w-full max-[640.01px]:min-h-11 max-[640.01px]:mb-4">
      <Link
        href="/"
        className="auth-brand text-foreground text-[16px] no-underline tracking-[0] [&:focus-visible]:[outline:2px_solid_var(--ring)] [&:focus-visible]:[outline-offset:4px] [&:focus-visible]:rounded-[4px]"
      >
        <ArrowLeft className="inline-block mr-2" />
        Back to home page
      </Link>
      <div className="auth-mobile-menu hidden max-[640.01px]:block max-[640.01px]:[&_[data-slot='button']]:min-w-[80px] max-[640.01px]:[&_[data-slot='button']]:min-h-11">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Menu</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href="/sign-in">Sign in</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/register">Create account</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

  );
}

export function AuthSwitch({ registering }: { registering: boolean }) {
  return (
    <>
      <p className="auth-switch [margin:20px_0_0] text-[14px] text-muted-foreground [&_a]:text-foreground [&_a]:underline max-[640.01px]:hidden">
        {registering ? 'Already registered?' : 'New here?'}{' '}
        <Link href={registering ? '/sign-in' : '/register'}>
          {registering ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
      <Button
        className="auth-switch-mobile hidden text-foreground no-underline max-[640.01px]:w-full max-[640.01px]:min-h-11 max-[640.01px]:flex max-[640.01px]:mt-4"
        variant="outline"
        asChild
      >
        <Link href={registering ? '/sign-in' : '/register'}>
          {registering ? 'Sign in' : 'Create account'}
        </Link>
      </Button>

    </>
  );
}
