import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/features/auth/auth-provider';
import { taskErrorMessage, tasksApi } from './api';
import type { Task } from './api';
import { useTaskSession } from './use-task-session';

const editorSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a task title.').max(200),
    prompt: z.string().trim().min(1, 'Enter a prompt.').max(5000),
    choices: z
      .array(
        z.object({
          label: z.string().trim().min(1, 'Enter a choice.').max(500),
        })
      )
      .min(2, 'Add at least two choices.')
      .max(50),
    correctChoiceIndex: z.number().int(),
  })
  .refine(
    ({ choices, correctChoiceIndex }) =>
      correctChoiceIndex >= 0 && correctChoiceIndex < choices.length,
    { path: ['correctChoiceIndex'], message: 'Select one correct answer.' }
  );

type EditorValues = z.infer<typeof editorSchema>;

const defaults = (task?: Task): EditorValues => ({
  title: task?.title ?? '',
  prompt: task?.prompt ?? '',
  choices: (task?.choices ?? ['', '']).map((label) => ({ label })),
  correctChoiceIndex: task?.correctChoiceIndex ?? -1,
});

export function useTaskEditor(task?: Task) {
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const [previous, setPrevious] = useState(task);
  const [preview, setPreview] = useState(false);
  const form = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: defaults(task),
  });
  const choices = useFieldArray({ control: form.control, name: 'choices' });
  const correct = useWatch({ control: form.control, name: 'correctChoiceIndex' });
  const errors = form.formState.errors;
  const save = useMutation({
    mutationFn: (values: EditorValues) =>
      tasksApi.save({ ...values, choices: values.choices.map((choice) => choice.label) }, previous),
    retry: false,
    onSuccess: (saved) => {
      client.setQueryData(['tasks', user?.id, saved.id], saved);
      void client.invalidateQueries({ queryKey: ['tasks', user?.id], exact: true });
      if (!previous) {
        router.push('/tutor/tasks');
        return;
      }
      setPrevious(saved);
      form.reset(defaults(saved));
    },
  });

  useTaskSession(save.error);

  function removeChoice(index: number) {
    choices.remove(index);
    form.setValue(
      'correctChoiceIndex',
      correct === index ? -1 : correct > index ? correct - 1 : correct,
      { shouldDirty: true }
    );
  }

  function selectCorrectChoice(index: number) {
    form.setValue('correctChoiceIndex', index, { shouldDirty: true, shouldValidate: true });
  }

  const { isSubmitting, isDirty } = form.formState;
  const values = form.getValues();
  return {
    register: form.register,
    errors,
    choiceFields: choices.fields,
    correctChoiceIndex: correct,
    canRemoveChoice: choices.fields.length > 2,
    canAddChoice: choices.fields.length < 50,
    addChoice: () => choices.append({ label: '' }),
    removeChoice,
    selectCorrectChoice,
    subtitle: previous
      ? `Task library · Task v${previous.version}`
      : 'Task library · Tutor authoring',
    onSubmit: form.handleSubmit((input) => save.mutateAsync(input).catch(() => {})),
    busy: save.isPending || isSubmitting,
    createComplete: save.isSuccess && !previous,
    showSaved: save.isSuccess && Boolean(previous) && !isDirty,
    saveError: save.error ? taskErrorMessage(save.error) : null,
    preview,
    previewPrompt: values.prompt.trim() || 'Task prompt',
    previewChoices: choices.fields.map(({ id }, index) => ({
      id,
      label: values.choices[index]?.label.trim() || `Choice ${index + 1}`,
    })),
    openPreview: () => setPreview(true),
    closePreview: () => setPreview(false),
  };
}
