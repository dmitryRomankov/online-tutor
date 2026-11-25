'use client';

import Link from 'next/link';
import { Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import type { FillBlanksTask } from './api';
import { useFillBlanksEditor } from './useFillBlanksEditor';

const textareaStyles =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive';

export function FillBlanksEditor({ task }: { task?: FillBlanksTask }) {
  const editor = useFillBlanksEditor(task);
  const { errors } = editor;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="link" className="min-h-11 px-0">
        <Link href="/tutor/tasks">Back to task library</Link>
      </Button>
      <div>
        <h1 className="m-0 text-3xl font-semibold tracking-tight phone:text-2xl">
          Fill blanks editor
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
              rows={3}
              maxLength={5000}
              {...editor.register('prompt')}
              aria-invalid={!!errors.prompt}
              aria-describedby={errors.prompt ? 'task-prompt-error' : undefined}
            />
            <FieldError id="task-prompt-error" errors={[errors.prompt]} />
          </Field>
          <Field data-invalid={!!errors.passage}>
            <FieldLabel htmlFor="task-passage">Text with blanks</FieldLabel>
            <textarea
              id="task-passage"
              className={textareaStyles}
              rows={4}
              maxLength={5000}
              {...editor.register('passage')}
              aria-invalid={!!errors.passage}
              aria-describedby={errors.passage ? 'passage-help task-passage-error' : 'passage-help'}
            />
            <p id="passage-help" className="text-sm text-muted-foreground">
              Mark blanks in order with [1], [2], and so on.
            </p>
            <FieldError id="task-passage-error" errors={[errors.passage]} />
          </Field>
          {editor.blankFields.length > 0 && (
            <section
              className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
              aria-labelledby="accepted-answers"
            >
              <h2 id="accepted-answers" className="m-0 text-base font-semibold">
                Accepted answers
              </h2>
              {editor.blankFields.map(({ name, number }) => (
                <Controller
                  key={name}
                  name={name}
                  control={editor.control}
                  defaultValue={['']}
                  render={({ field, fieldState }) => (
                    <BlankAnswers
                      number={number}
                      answers={field.value}
                      onChange={field.onChange}
                      inputRef={field.ref}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              ))}
              <p className="text-sm text-muted-foreground">
                Checking ignores case and surrounding whitespace.
              </p>
            </section>
          )}
          <p className="text-sm">Required inputs: {editor.blankFields.length}</p>
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
          aria-labelledby="blanks-preview"
        >
          <h2 id="blanks-preview" className="m-0 text-lg font-semibold">
            Student preview
          </h2>
          <p className="wrap-anywhere">{editor.previewPrompt}</p>
          <p className="whitespace-pre-wrap wrap-anywhere leading-9">
            {editor.previewParts.map((part, index) =>
              index % 2 === 0 ? (
                <span key={index}>{part}</span>
              ) : (
                <Input
                  key={index}
                  aria-label={`Blank ${part}`}
                  className="mx-1 inline-block min-h-11 w-32 align-middle"
                />
              )
            )}
          </p>
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

function BlankAnswers({
  number,
  answers,
  onChange,
  inputRef,
  onBlur,
  error,
}: {
  number: number;
  answers: string[];
  onChange: (answers: string[]) => void;
  inputRef: (element: HTMLInputElement | null) => void;
  onBlur: () => void;
  error?: string;
}) {
  const errorId = `blank-${number}-error`;
  return (
    <fieldset className="min-w-0 space-y-2" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium">Blank {number}</legend>
      {answers.map((answer, index) => (
        <div key={index} className="flex gap-2">
          <Input
            ref={index === 0 ? inputRef : undefined}
            onBlur={onBlur}
            className="min-h-11 min-w-0"
            value={answer}
            maxLength={500}
            aria-label={`Blank ${number} answer ${index + 1}`}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) =>
              onChange(
                answers.map((value, position) => (position === index ? event.target.value : value))
              )
            }
          />
          {answers.length > 1 && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              aria-label={`Remove answer ${index + 1} for blank ${number}`}
              onClick={() => onChange(answers.filter((_, position) => position !== index))}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={answers.length >= 20}
        aria-label={`Add answer for blank ${number}`}
        onClick={() => onChange([...answers, ''])}
      >
        Add answer
      </Button>
      <FieldError id={errorId}>{error}</FieldError>
    </fieldset>
  );
}
