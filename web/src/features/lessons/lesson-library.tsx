'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { lessonErrorMessage, lessonsApi } from './api';
import { useLessonSession } from './useLessonSession';

export function LessonLibrary() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const lessons = useQuery({
    queryKey: ['lessons', user?.id],
    queryFn: ({ signal }) => lessonsApi.list(signal),
    enabled: user?.role === 'TUTOR',
    retry: false,
  });

  useLessonSession(lessons.error);

  const matching = lessons.data?.filter((item) =>
    item.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 phone:flex-col">
        <div>
          <h1 className="m-0 text-3xl font-semibold tracking-tight phone:text-2xl">
            Lesson library
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Reusable lesson plans</p>
        </div>
        <Button className="min-h-11 phone:w-full" asChild>
          <Link href="/tutor/lessons/new">Create lesson</Link>
        </Button>
      </div>
      <Field className="max-w-sm phone:max-w-none">
        <FieldLabel htmlFor="search-lessons">Search lessons</FieldLabel>
        <Input
          type="search"
          id="search-lessons"
          className="min-h-11 bg-card"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <section
        className="rounded-2xl border border-border bg-card p-5"
        aria-labelledby="your-lessons"
      >
        <h2 id="your-lessons" className="m-0 text-base font-semibold">
          Your lessons
        </h2>
        {lessons.isPending && <p role="status">Loading lessons…</p>}
        {lessons.isError && (
          <div className="mt-3 space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {lessonErrorMessage(lessons.error)}
            </p>
            <Button variant="outline" onClick={() => void lessons.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {lessons.isSuccess && !matching?.length && (
          <p className="mt-3 text-sm text-muted-foreground">
            {lessons.data.length ? 'No lessons match your search.' : 'Create your first lesson.'}
          </p>
        )}
        {!!matching?.length && (
          <ul className="mt-2 divide-y divide-border">
            {matching.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-x-4 py-3 phone:block"
              >
                <div className="min-w-0 wrap-anywhere">
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">Lesson v{item.version}</p>
                </div>
                <Button variant="link" className="min-h-11 px-0" asChild>
                  <Link
                    href={`/tutor/lessons/${item.id}`}
                    aria-label={`Edit lesson: ${item.title}`}
                  >
                    Edit lesson
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
