import { ApiStatus } from '@/components/api-status';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="workspace max-w-280 m-auto [padding:36px_40px_24px] max-[700.01px]:p-6">
      <header>
        <span className="brand text-[20px] font-bold tracking-[-0.5px]">Lesson Workspace</span>
        <nav className="home-auth-links flex gap-5 text-[14px]" aria-label="Account">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/register">Create account</Link>
        </nav>
      </header>
      <section className="intro [padding:92px_0_64px] max-[700.01px]:[padding:64px_0_40px]">
        <p className="eyebrow text-[12px] font-bold tracking-[2px] [text-transform:uppercase] text-[color:var(--accent)]">
          One-to-one learning
        </p>
        <h1>
          Online lessons,
          <br />
          in one place.
        </h1>
        <p className="description max-w-142.5 text-[19px] text-[color:var(--muted)]">
          A shared space for tutors to prepare lessons and for students to learn together in real
          time.
        </p>
      </section>
      <section
        className="setup grid [grid-template-columns:1.5fr_1fr] gap-10 items-center bg-[#fff] [border:1px_solid_#dfe6dc] rounded-[20px] p-8 [&_p:not(.eyebrow)]:text-[color:var(--muted)] max-[700.01px]:[grid-template-columns:1fr] max-[700.01px]:gap-5 max-[700.01px]:p-6"
        aria-labelledby="setup-title"
      >
        <div>
          <p className="eyebrow text-[12px] font-bold tracking-[2px] [text-transform:uppercase] text-[color:var(--accent)]">
            Development setup
          </p>
          <h2 id="setup-title">Your workspace is ready to build.</h2>
          <p>
            The frontend and backend are initialized. Lesson creation and the live classroom are the
            next steps.
          </p>
        </div>
        <ApiStatus />
      </section>
      <footer>Prepare. Teach. Practise.</footer>
    </main>
  );
}
