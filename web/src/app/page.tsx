import { ApiStatus } from '@/components/api-status';

export default function HomePage() {
  return (
    <main className="workspace">
      <header>
        <span className="brand">Lesson Workspace</span>
        <span className="badge">Diploma project</span>
      </header>
      <section className="intro">
        <p className="eyebrow">One-to-one learning</p>
        <h1>
          Online lessons,
          <br />
          in one place.
        </h1>
        <p className="description">
          A shared space for tutors to prepare lessons and for students to learn together in real
          time.
        </p>
      </section>
      <section className="setup" aria-labelledby="setup-title">
        <div>
          <p className="eyebrow">Development setup</p>
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
