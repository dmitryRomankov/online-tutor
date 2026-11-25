import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { FillBlanksTask } from './api';
import { useSaveTask } from './useSaveTask';

function blankNumbers(passage: string) {
  const markers = [...passage.matchAll(/\[(\d+)\]/g)];
  if (markers.length > 50 || !markers.every((match, index) => match[1] === String(index + 1))) {
    return [];
  }
  return markers.map((_, index) => index + 1);
}

const answerKey = (number: number) => `blank${number}`;

const editorSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a task title.').max(200),
    prompt: z.string().trim().min(1, 'Enter a prompt.').max(5000),
    passage: z.string().trim().min(1, 'Enter text with blanks.').max(5000),
    answers: z.record(z.string(), z.array(z.string())),
  })
  .superRefine(({ passage, answers }, context) => {
    const numbers = blankNumbers(passage);
    if (!numbers.length) {
      context.addIssue({
        code: 'custom',
        path: ['passage'],
        message: 'Use up to 50 markers in order, starting with [1].',
      });
    }
    for (const number of numbers) {
      const key = answerKey(number);
      const values = answers[key]?.map((answer) => answer.trim()) ?? [];
      let message: string | undefined;

      const isRowInvalid =
        !values.length ||
        values.some((answer) => !answer || answer.length > 500) ||
        values.length > 20;

      const isDuplicate =
        new Set(values.map((answer) => answer.toLowerCase())).size !== values.length;
      if (isRowInvalid) {
        message = 'Enter a non-empty answer in each row, or remove the empty row.';
      } else if (isDuplicate) {
        message = 'Remove duplicate answers. Matching already ignores case.';
      }
      if (message) context.addIssue({ code: 'custom', path: ['answers', key], message });
    }
  });

type EditorValues = z.infer<typeof editorSchema>;

function defaults(task?: FillBlanksTask): EditorValues {
  return {
    title: task?.title ?? '',
    prompt: task?.prompt ?? '',
    passage: task?.passage ?? '',
    answers: Object.fromEntries(
      (task?.blanks ?? []).map((answers, index) => [answerKey(index + 1), answers])
    ),
  };
}

export function useFillBlanksEditor(task?: FillBlanksTask) {
  const [preview, setPreview] = useState(false);
  const form = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: defaults(task),
  });
  const passage = useWatch({ control: form.control, name: 'passage' });
  const numbers = blankNumbers(passage);
  const save = useSaveTask(task, (saved) => {
    if (saved.type === 'fill_blanks') form.reset(defaults(saved));
  });
  const { isSubmitting, isDirty, errors } = form.formState;

  function openPreview() {
    if (numbers.length) setPreview(true);
    else void form.trigger('passage', { shouldFocus: true });
  }

  return {
    control: form.control,
    register: form.register,
    errors,
    blankFields: numbers.map((number) => ({
      number,
      name: `answers.${answerKey(number)}` as const,
    })),
    subtitle: save.subtitle,
    onSubmit: form.handleSubmit(({ title, prompt, passage, answers }) =>
      save.submit({
        type: 'fill_blanks',
        title,
        prompt,
        passage,
        blanks: blankNumbers(passage).map((number) =>
          answers[answerKey(number)].map((answer) => answer.trim())
        ),
      })
    ),
    busy: save.busy || isSubmitting,
    createComplete: save.createComplete,
    showSaved: save.showSaved && !isDirty,
    saveError: save.error,
    preview,
    previewPrompt: form.getValues('prompt').trim() || 'Complete the blanks.',
    previewParts: preview ? passage.split(/\[(\d+)\]/g) : [],
    openPreview,
    closePreview: () => setPreview(false),
  };
}
