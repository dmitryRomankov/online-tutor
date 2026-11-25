'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { useAuth } from '@/features/auth/auth-provider';
import { taskErrorMessage, taskFormatLabels, tasksApi } from './api';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useTaskSession } from './useTaskSession';

export function TaskLibrary() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState('');

  const tasks = useQuery({
    queryKey: ['tasks', user?.id],
    queryFn: ({ signal }) => tasksApi.list(signal),
    enabled: user?.role === 'TUTOR',
    retry: false,
  });

  useTaskSession(tasks.error);

  const matching = tasks.data?.filter(
    (task) =>
      (!format || task.type === format) &&
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
      <div className="grid gap-4 sm:max-w-2xl sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="search-tasks">Search tasks</FieldLabel>
          <Input
            id="search-tasks"
            className="min-h-11 bg-card"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <Field className="[&_[data-slot=native-select-wrapper]]:w-full">
          <FieldLabel htmlFor="task-format">Format</FieldLabel>
          <NativeSelect
            id="task-format"
            className="min-h-11 bg-card"
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            <NativeSelectOption value="">All formats</NativeSelectOption>
            {Object.entries(taskFormatLabels).map(([code, label]) => (
              <NativeSelectOption key={code} value={code}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
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
            {tasks.data.length ? 'No tasks match your search.' : 'Create your first task.'}
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
                    {taskFormatLabels[task.type]} · Task v{task.version}
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
