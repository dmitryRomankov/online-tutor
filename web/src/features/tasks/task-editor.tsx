'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { useAuth } from '@/features/auth/auth-provider';
import { taskErrorMessage, tasksApi } from './api';
import type { SingleChoiceTask } from './api';
import { WrittenResponseEditor } from './written-response-editor';
import { FillBlanksEditor } from './fill-blanks-editor';
import { useTaskSession } from './useTaskSession';
import { useTaskEditor } from './useTaskEditor';

export function ExistingTask({ id }: { id: string }) {
  const { user } = useAuth();
  const task = useQuery({
    queryKey: ['tasks', user?.id, id],
    queryFn: ({ signal }) => tasksApi.get(id, signal),
    enabled: user?.role === 'TUTOR',
    retry: false,
  });

  useTaskSession(task.error);

  if (task.data?.type === 'written_response') {
    return <WrittenResponseEditor key={id} task={task.data} />;
  }
  if (task.data) {
    return task.data.type === 'fill_blanks' ? (
      <FillBlanksEditor key={id} task={task.data} />
    ) : (
      <TaskEditor key={id} task={task.data} />
    );
  }
  if (task.isPending) return <p role="status">Loading task…</p>;

  return (
    <div className="space-y-3">
      <p role="alert" className="text-destructive">
        {taskErrorMessage(task.error)}
      </p>
      <Button onClick={() => void task.refetch()} variant="outline">
        Try again
      </Button>{' '}
      <Button asChild variant="link">
        <Link href="/tutor/tasks">Back to task library</Link>
      </Button>
    </div>
  );
}

export function TaskEditor({ task }: { task?: SingleChoiceTask }) {
  const {
    register,
    errors,
    choiceFields,
    correctChoiceIndex,
    canRemoveChoice,
    canAddChoice,
    addChoice,
    removeChoice,
    selectCorrectChoice,
    subtitle,
    onSubmit,
    busy,
    createComplete,
    showSaved,
    saveError,
    preview,
    previewPrompt,
    previewChoices,
    openPreview,
    closePreview,
  } = useTaskEditor(task);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="link" className="min-h-11 px-0">
        <Link href="/tutor/tasks">Back to task library</Link>
      </Button>
      <div>
        <h1 className="m-0 text-3xl font-semibold tracking-tight phone:text-2xl">
          Single choice editor
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <form hidden={preview} noValidate onSubmit={onSubmit}>
        <fieldset disabled={busy} className="min-w-0 space-y-5">
          <Field data-invalid={!!errors.title}>
            <FieldLabel htmlFor="task-title">Task title</FieldLabel>
            <Input
              id="task-title"
              className="min-h-11 bg-card"
              maxLength={200}
              {...register('title')}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'task-title-error' : undefined}
            />
            <FieldError id="task-title-error" errors={[errors.title]} />
          </Field>
          <Field data-invalid={!!errors.prompt}>
            <FieldLabel htmlFor="task-prompt">Prompt</FieldLabel>
            <textarea
              id="task-prompt"
              rows={4}
              maxLength={5000}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
              {...register('prompt')}
              aria-invalid={!!errors.prompt}
              aria-describedby={errors.prompt ? 'task-prompt-error' : undefined}
            />
            <FieldError id="task-prompt-error" errors={[errors.prompt]} />
          </Field>
          <section
            className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
            aria-labelledby="task-choices"
          >
            <h2 id="task-choices" className="m-0 text-base font-semibold">
              Choices
            </h2>
            {choiceFields.map((choice, index) => {
              const error = errors.choices?.[index]?.label;
              const id = `choice-${choice.id}`;
              return (
                <Field key={choice.id} data-invalid={!!error}>
                  <FieldLabel htmlFor={id}>Choice {index + 1}</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      className="min-h-11 min-w-0"
                      maxLength={500}
                      {...register(`choices.${index}.label`)}
                      aria-invalid={!!error}
                      aria-describedby={error ? `${id}-error` : undefined}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      aria-label={`Remove choice ${index + 1}`}
                      disabled={!canRemoveChoice}
                      onClick={() => removeChoice(index)}
                    >
                      Remove
                    </Button>
                  </div>
                  <FieldError id={`${id}-error`} errors={[error]} />
                </Field>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 phone:w-full"
              disabled={!canAddChoice}
              onClick={addChoice}
            >
              Add choice
            </Button>
            <FieldError errors={[errors.choices?.root]} />
          </section>
          <fieldset
            className="min-w-0 space-y-2"
            aria-describedby={errors.correctChoiceIndex ? 'correct-answer-error' : undefined}
          >
            <legend className="text-sm font-medium">Correct answer</legend>
            <div className="flex flex-wrap gap-2">
              {choiceFields.map((choice, index) => (
                <label
                  key={choice.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm has-checked:border-foreground has-checked:bg-secondary"
                >
                  <input
                    type="radio"
                    name="correctChoice"
                    className="accent-foreground"
                    checked={correctChoiceIndex === index}
                    onChange={() => selectCorrectChoice(index)}
                  />
                  Choice {index + 1}
                </label>
              ))}
            </div>
            <FieldError id="correct-answer-error" errors={[errors.correctChoiceIndex]} />
          </fieldset>
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}
          {showSaved && <p role="status">Task saved.</p>}
          <div className="flex flex-wrap gap-3 phone:flex-col">
            <Button className="min-h-11" type="submit" disabled={createComplete}>
              {busy ? 'Saving…' : 'Save task'}
            </Button>
            <Button className="min-h-11" type="button" variant="outline" onClick={openPreview}>
              Preview as student
            </Button>
          </div>
        </fieldset>
      </form>
      {preview && (
        <section
          className="space-y-4 rounded-2xl border border-border bg-card p-5"
          aria-labelledby="preview-heading"
        >
          <h2 id="preview-heading" className="text-lg font-semibold">
            Student preview
          </h2>
          <fieldset className="space-y-2">
            <legend className="break-words">{previewPrompt}</legend>
            {previewChoices.map(({ id, label }) => (
              <label
                key={id}
                className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <input type="radio" name="previewChoice" className="accent-foreground" />
                <span className="min-w-0 wrap-anywhere">{label}</span>
              </label>
            ))}
          </fieldset>
          <Button type="button" variant="outline" className="min-h-11" onClick={closePreview}>
            Back to editor
          </Button>
        </section>
      )}
    </div>
  );
}
