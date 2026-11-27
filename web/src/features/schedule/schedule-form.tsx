'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { scheduleErrorMessage } from './api';
import { useScheduleForm } from './useScheduleForm';

export function ScheduleForm() {
  const { form, students, lessons, create, submit, zone, occurrences } = useScheduleForm();
  const { errors, isSubmitting } = form.formState;

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <Button asChild variant="link" className="min-h-11 px-0">
        <Link href="/tutor">Back to dashboard</Link>
      </Button>
      <h1 className="text-3xl font-semibold tracking-tight phone:text-2xl">Schedule lesson</h1>
      <form
        noValidate
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-6"
      >
        <fieldset disabled={isSubmitting || create.isSuccess} className="min-w-0 space-y-4">
          <Field data-invalid={!!errors.connectionId}>
            <FieldLabel htmlFor="booking-student">Student</FieldLabel>
            <NativeSelect
              id="booking-student"
              className="min-h-11"
              aria-invalid={!!errors.connectionId}
              aria-describedby={errors.connectionId && 'booking-student-error'}
              {...form.register('connectionId')}
            >
              <NativeSelectOption value="">
                {students.isPending ? 'Loading students…' : 'Choose a student'}
              </NativeSelectOption>
              {students.data?.map(({ id, person }) => (
                <NativeSelectOption key={id} value={id}>
                  {person.name} {person.lastname}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError id="booking-student-error" errors={[errors.connectionId]} />
            {students.data?.length === 0 && (
              <Link className="text-info underline" href="/tutor/students">
                Invite a student
              </Link>
            )}
          </Field>
          <Field data-invalid={!!errors.lessonId}>
            <FieldLabel htmlFor="booking-lesson">Lesson</FieldLabel>
            <NativeSelect
              id="booking-lesson"
              className="min-h-11"
              aria-invalid={!!errors.lessonId}
              aria-describedby={errors.lessonId && 'booking-lesson-error'}
              {...form.register('lessonId')}
            >
              <NativeSelectOption value="">
                {lessons.isPending ? 'Loading lessons…' : 'Choose a lesson'}
              </NativeSelectOption>
              {lessons.data?.map(({ id, title }) => (
                <NativeSelectOption key={id} value={id}>
                  {title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError id="booking-lesson-error" errors={[errors.lessonId]} />
            {lessons.data?.length === 0 && (
              <Link className="text-info underline" href="/tutor/lessons/new">
                Create a lesson
              </Link>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['date', 'time', 'duration'] as const).map((field) => (
              <Field key={field} data-invalid={!!errors[field]}>
                <FieldLabel htmlFor={`booking-${field}`}>
                  {{ date: 'Date', time: 'Start time', duration: 'Duration (minutes)' }[field]}
                </FieldLabel>
                <Input
                  id={`booking-${field}`}
                  className="min-h-11"
                  type={field === 'duration' ? 'number' : field}
                  min={field === 'duration' ? 1 : undefined}
                  aria-invalid={!!errors[field]}
                  aria-describedby={errors[field] && `booking-${field}-error`}
                  {...form.register(field)}
                />
                <FieldError id={`booking-${field}-error`} errors={[errors[field]]} />
              </Field>
            ))}
          </div>
          {occurrences.length > 1 && (
            <Field data-invalid={!!errors.occurrence}>
              <FieldLabel htmlFor="booking-occurrence">This start time occurs twice</FieldLabel>
              <NativeSelect
                id="booking-occurrence"
                className="min-h-11"
                aria-invalid={!!errors.occurrence}
                aria-describedby={errors.occurrence && 'booking-occurrence-error'}
                {...form.register('occurrence')}
              >
                <NativeSelectOption value="">Choose an occurrence</NativeSelectOption>
                {occurrences.map((instant, index) => (
                  <NativeSelectOption key={instant} value={instant}>
                    {index === 0 ? 'First' : 'Second'} occurrence (
                    {new Intl.DateTimeFormat(undefined, {
                      timeZone: zone,
                      hour: 'numeric',
                      timeZoneName: 'shortOffset',
                    }).format(new Date(instant))}
                    )
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError id="booking-occurrence-error" errors={[errors.occurrence]} />
            </Field>
          )}
          <p className="text-sm text-muted-foreground">{zone} · Displayed in your local time.</p>
          {(students.error || lessons.error) && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                Could not load booking options.
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  void students.refetch();
                  void lessons.refetch();
                }}
              >
                Retry options
              </Button>
            </div>
          )}
          {create.error && (
            <p role="alert" className="text-sm text-destructive">
              {scheduleErrorMessage(create.error)}
            </p>
          )}
          <Button
            type="submit"
            className="min-h-11 phone:w-full"
            disabled={!students.data?.length || !lessons.data?.length}
          >
            {isSubmitting ? 'Creating…' : 'Create scheduled lesson'}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}
