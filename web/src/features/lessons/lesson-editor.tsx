'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { lessonErrorMessage, lessonsApi } from './api';
import type { Lesson, LessonItem } from './api';
import { LessonBlockEditor, lessonBlockLabels } from './lesson-block-editor';
import { LessonBlockPreview } from './lesson-block-preview';
import { useLessonEditor } from './useLessonEditor';
import { useLessonSession } from './useLessonSession';

const blockKinds: LessonItem['kind'][] = ['text', 'image', 'link', 'task'];

export function ExistingLesson({ id }: { id: string }) {
  const { user } = useAuth();
  const lesson = useQuery({
    queryKey: ['lessons', user?.id, id],
    queryFn: ({ signal }) => lessonsApi.get(id, signal),
    enabled: user?.role === 'TUTOR',
    retry: false,
  });

  useLessonSession(lesson.error);

  if (lesson.data) return <LessonEditor key={id} lesson={lesson.data} />;
  if (lesson.isPending) return <p role="status">Loading lesson…</p>;

  return (
    <div className="space-y-3">
      <p role="alert" className="text-destructive">
        {lessonErrorMessage(lesson.error)}
      </p>
      <Button variant="outline" onClick={() => void lesson.refetch()}>
        Try again
      </Button>{' '}
      <Button asChild variant="link">
        <Link href="/tutor/lessons">Back to lesson library</Link>
      </Button>
    </div>
  );
}

export function LessonEditor({ lesson }: { lesson?: Lesson }) {
  const editor = useLessonEditor(lesson);
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button asChild variant="link" className="min-h-11 px-0">
        <Link href="/tutor/lessons">Back to lesson library</Link>
      </Button>
      <div>
        <h1 className="m-0 text-3xl font-semibold tracking-tight phone:text-2xl">Lesson builder</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {editor.previousVersion
            ? `Lesson library · Lesson v${editor.previousVersion}`
            : 'Reusable lesson plan'}
        </p>
      </div>
      <form hidden={!!editor.preview} noValidate onSubmit={editor.onSubmit}>
        <fieldset disabled={editor.busy} className="min-w-0 space-y-5">
          <Field data-invalid={!!editor.errors.title}>
            <FieldLabel htmlFor="lesson-title">Lesson title</FieldLabel>
            <Input
              id="lesson-title"
              className="min-h-11 bg-card"
              maxLength={200}
              {...editor.register('title')}
              aria-invalid={!!editor.errors.title}
              aria-describedby={editor.errors.title ? 'lesson-title-error' : undefined}
            />
            <FieldError id="lesson-title-error" errors={[editor.errors.title]} />
          </Field>

          {!editor.fields.length && (
            <p className="text-sm text-muted-foreground">Add an activity to start your lesson.</p>
          )}
          <ol className="space-y-4">
            {editor.fields.map((block, index) => (
              <li
                key={block.id}
                className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
              >
                <h2 className="m-0 text-base font-semibold">
                  {index + 1}. {lessonBlockLabels[block.kind]}
                </h2>
                <LessonBlockEditor editor={editor} index={index} />
                <div className="flex flex-wrap gap-2 phone:grid phone:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={index === 0}
                    aria-label={`Move activity ${index + 1} up`}
                    onClick={() => editor.move(index, index - 1)}
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={index === editor.fields.length - 1}
                    aria-label={`Move activity ${index + 1} down`}
                    onClick={() => editor.move(index, index + 1)}
                  >
                    Move down
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 text-destructive phone:col-span-2"
                    aria-label={`Remove activity ${index + 1}`}
                    onClick={() => editor.remove(index)}
                  >
                    Remove activity
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <FieldError errors={[editor.errors.items?.root ?? editor.errors.items]} />
          {editor.saveError && (
            <p role="alert" className="text-sm text-destructive">
              {editor.saveError}
            </p>
          )}
          {editor.showSaved && <p role="status">Lesson saved.</p>}
          <div className="flex flex-wrap gap-3 phone:flex-col">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              aria-expanded={adding}
              disabled={editor.fields.length >= 50}
              onClick={() => setAdding(!adding)}
            >
              Add activity
            </Button>
            <Button type="submit" className="min-h-11" disabled={editor.createComplete}>
              {editor.busy && !editor.uploading ? 'Saving…' : 'Save lesson'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={editor.openPreview}
            >
              Preview lesson
            </Button>
          </div>
          {adding && (
            <div
              role="group"
              aria-label="Activity type"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {blockKinds.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    editor.add(kind);
                    setAdding(false);
                  }}
                >
                  {lessonBlockLabels[kind]}
                </Button>
              ))}
            </div>
          )}
        </fieldset>
      </form>
      {editor.preview && (
        <section className="space-y-4" aria-labelledby="lesson-preview">
          <h2 id="lesson-preview" className="m-0 text-xl font-semibold">
            Lesson preview
          </h2>
          <p className="wrap-anywhere">{editor.preview.title}</p>
          <ol className="space-y-3">
            {editor.preview.items.map((item, index) => (
              <li
                key={editor.fields[index].id}
                className="space-y-3 rounded-2xl border border-border bg-card p-4"
              >
                <h3 className="font-medium">
                  {index + 1}. {lessonBlockLabels[item.kind]}
                </h3>
                <LessonBlockPreview item={item} />
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={editor.closePreview}
          >
            Back to editor
          </Button>
        </section>
      )}
    </div>
  );
}
