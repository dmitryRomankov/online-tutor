import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AccountHome } from '@/features/auth/account-home';
import { FillBlanksEditor } from '@/features/tasks/fill-blanks-editor';
import { TaskEditor } from '@/features/tasks/task-editor';

export const metadata: Metadata = { title: 'Create task | Online Tutor' };

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format } = await searchParams;
  return (
    <AccountHome role="TUTOR" view="tasks">
      {format === 'single_choice' ? (
        <TaskEditor />
      ) : format === 'fill_blanks' ? (
        <FillBlanksEditor />
      ) : (
        <div className="mx-auto max-w-3xl space-y-5">
          <Button asChild variant="link" className="min-h-11 px-0">
            <Link href="/tutor/tasks">Back to task library</Link>
          </Button>
          <h1 className="m-0 text-3xl font-semibold tracking-tight phone:text-2xl">
            Choose task format
          </h1>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/tutor/tasks/new?format=single_choice">Single choice</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/tutor/tasks/new?format=fill_blanks">Fill in the blanks</Link>
            </Button>
          </div>
        </div>
      )}
    </AccountHome>
  );
}
