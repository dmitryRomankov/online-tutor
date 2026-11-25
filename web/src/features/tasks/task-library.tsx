'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useAuth } from '@/features/auth/auth-provider';
import { taskErrorMessage, tasksApi } from './api';
import { useTaskSession } from './use-task-session';

export function TaskLibrary() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const tasks = useQuery({
    queryKey: ['tasks', user?.id],
    queryFn: ({ signal }) => tasksApi.list(signal),
    enabled: user?.role === 'TUTOR',
    retry: false,
  });
  useTaskSession(tasks.error);
  const matching = tasks.data?.filter((task) =>
    task.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 phone:flex-col">
        <div>
          <h1 className="m-0 text-3xl font-semibold tracking-tight phone:text-2xl">Task library</h1>
          <p className="mt-2 text-sm text-muted-foreground">Reusable tasks for your lessons</p>
        </div>
        <Button className="min-h-11 phone:w-full" asChild>
          <Link href="/tutor/tasks/new">Create task</Link>
        </Button>
      </div>
      <Field className="max-w-sm phone:max-w-none">
        <FieldLabel htmlFor="search-tasks">Search tasks</FieldLabel>
        <Input
          id="search-tasks"
          className="min-h-11 bg-card"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <section
        className="rounded-2xl border border-border bg-card p-5"
        aria-labelledby="your-tasks"
      >
        <h2 className="m-0 text-base font-semibold" id="your-tasks">
          Your tasks
        </h2>
        {tasks.isPending && (
          <p className="mt-3 text-sm" role="status">
            Loading tasks…
          </p>
        )}
        {tasks.isError && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-destructive" role="alert">
              {taskErrorMessage(tasks.error)}
            </p>
            <Button variant="outline" onClick={() => void tasks.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {tasks.isSuccess && matching?.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {tasks.data.length
              ? 'No tasks match your search.'
              : 'Create your first single-choice task.'}
          </p>
        )}
        {tasks.isSuccess && !!matching?.length && (
          <ul className="mt-2 divide-y">
            {matching.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 phone:block"
              >
                <div className="min-w-0 wrap-anywhere">
                  <h3 className="font-medium">{task.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    Single choice · Task v{task.version}
                  </p>
                </div>
                <Button variant="link" className="min-h-11 px-0" asChild>
                  <Link href={`/tutor/tasks/${task.id}`} aria-label={`Edit task: ${task.title}`}>
                    Edit task
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
