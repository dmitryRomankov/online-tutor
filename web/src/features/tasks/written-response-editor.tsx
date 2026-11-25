'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import type { WrittenResponseTask } from './api';
import { useWrittenResponseEditor } from './useWrittenResponseEditor';

const textareaStyles =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive';

export function WrittenResponseEditor({ task }: { task?: WrittenResponseTask }) {
  const editor = useWrittenResponseEditor(task);
  const { errors } = editor;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="link" className="min-h-11 px-0">
        <Link href="/tutor/tasks">Back to task library</Link>
      </Button>
      <div>
        <h1 className="m-0 text-3xl font-semibold tracking-tight phone:text-2xl">
          Written response editor
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{editor.subtitle}</p>
      </div>
      <form hidden={editor.preview} noValidate onSubmit={editor.onSubmit}>
        <fieldset disabled={editor.busy} className="min-w-0 space-y-5">
          <Field data-invalid={!!errors.title}>
            <FieldLabel htmlFor="task-title">Task title</FieldLabel>
            <Input
              id="task-title"
              className="min-h-11 bg-card"
              maxLength={200}
              {...editor.register('title')}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'task-title-error' : undefined}
            />
            <FieldError id="task-title-error" errors={[errors.title]} />
          </Field>
          <Field data-invalid={!!errors.prompt}>
            <FieldLabel htmlFor="task-prompt">Prompt</FieldLabel>
            <textarea
              id="task-prompt"
              className={textareaStyles}
              rows={4}
              maxLength={5000}
              {...editor.register('prompt')}
              aria-invalid={!!errors.prompt}
              aria-describedby={errors.prompt ? 'task-prompt-error' : undefined}
            />
            <FieldError id="task-prompt-error" errors={[errors.prompt]} />
          </Field>
          <section
            className="space-y-1 rounded-xl bg-secondary p-4 text-sm"
            aria-labelledby="manual-review"
          >
            <h2 id="manual-review" className="m-0 text-base font-medium">
              Manual review
            </h2>
            <p className="text-muted-foreground">Tutors review written responses manually.</p>
          </section>
          <p className="text-sm">Required inputs: 1</p>
          {editor.saveError && (
            <p role="alert" className="text-sm text-destructive">
              {editor.saveError}
            </p>
          )}
          {editor.showSaved && <p role="status">Task saved.</p>}
          <div className="flex flex-wrap gap-3 phone:flex-col">
            <Button className="min-h-11" type="submit" disabled={editor.createComplete}>
              {editor.busy ? 'Saving…' : 'Save task'}
            </Button>
            <Button
              className="min-h-11"
              type="button"
              variant="outline"
              onClick={editor.openPreview}
            >
              Preview as student
            </Button>
          </div>
        </fieldset>
      </form>
      {editor.preview && (
        <section
          className="space-y-4 rounded-2xl border border-border bg-card p-5"
          aria-labelledby="written-preview"
        >
          <h2 id="written-preview" className="m-0 text-lg font-semibold">
            Student preview
          </h2>
          <p className="whitespace-pre-wrap wrap-anywhere">{editor.previewPrompt}</p>
          <Field>
            <FieldLabel htmlFor="written-preview-answer">Your answer</FieldLabel>
            <textarea id="written-preview-answer" className={textareaStyles} rows={5} />
          </Field>
          <Button
            type="button"
            className="min-h-11"
            variant="outline"
            onClick={editor.closePreview}
          >
            Back to editor
          </Button>
        </section>
      )}
    </div>
  );
}
