import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { SingleChoiceTask } from './api';
import { useSaveTask } from './useSaveTask';

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

const defaults = (task?: SingleChoiceTask): EditorValues => ({
  title: task?.title ?? '',
  prompt: task?.prompt ?? '',
  choices: (task?.choices ?? ['', '']).map((label) => ({ label })),
  correctChoiceIndex: task?.correctChoiceIndex ?? -1,
});

export function useTaskEditor(task?: SingleChoiceTask) {
  const [preview, setPreview] = useState(false);
  const form = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: defaults(task),
  });
  const choices = useFieldArray({ control: form.control, name: 'choices' });
  const correct = useWatch({ control: form.control, name: 'correctChoiceIndex' });
  const errors = form.formState.errors;
  const save = useSaveTask(task, (saved) => {
    if (saved.type === 'single_choice') form.reset(defaults(saved));
  });

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
    subtitle: save.subtitle,
    onSubmit: form.handleSubmit((input) =>
      save.submit({
        ...input,
        type: 'single_choice',
        choices: input.choices.map(({ label }) => label),
      })
    ),
    busy: save.busy || isSubmitting,
    createComplete: save.createComplete,
    showSaved: save.showSaved && !isDirty,
    saveError: save.error,
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
