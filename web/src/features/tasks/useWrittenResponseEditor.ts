import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { WrittenResponseTask } from './api';
import { useSaveTask } from './useSaveTask';

const editorSchema = z.object({
  title: z.string().trim().min(1, 'Enter a task title.').max(200),
  prompt: z.string().trim().min(1, 'Enter a prompt.').max(5000),
});

const defaults = (task?: WrittenResponseTask) => ({
  title: task?.title ?? '',
  prompt: task?.prompt ?? '',
});

export function useWrittenResponseEditor(task?: WrittenResponseTask) {
  const [preview, setPreview] = useState(false);
  const form = useForm({
    resolver: zodResolver(editorSchema),
    defaultValues: defaults(task),
  });
  const save = useSaveTask(task, (saved) => {
    if (saved.type === 'written_response') form.reset(defaults(saved));
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  return {
    register: form.register,
    errors,
    subtitle: save.subtitle,
    onSubmit: form.handleSubmit((input) => save.submit({ ...input, type: 'written_response' })),
    busy: save.busy || isSubmitting,
    createComplete: save.createComplete,
    showSaved: save.showSaved && !isDirty,
    saveError: save.error,
    preview,
    previewPrompt: preview ? form.getValues('prompt').trim() || 'Task prompt' : '',
    openPreview: () => setPreview(true),
    closePreview: () => setPreview(false),
  };
}
