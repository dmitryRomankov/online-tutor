import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/features/auth/auth-provider';
import { LessonApiError, lessonErrorMessage, lessonInputSchema, lessonsApi } from './api';
import type { Lesson, LessonInput, LessonItem } from './api';
import { useLessonSession } from './useLessonSession';

const initialItem: Record<LessonItem['kind'], LessonItem> = {
  text: { kind: 'text', text: '' },
  image: { kind: 'image', assetId: '' },
  link: { kind: 'link', url: '' },
  task: { kind: 'task', taskVersionId: '' },
};

export function useLessonEditor(lesson?: Lesson) {
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const [previous, setPrevious] = useState(lesson);
  const [preview, setPreview] = useState<LessonInput | null>(null);
  const form = useForm<LessonInput>({
    resolver: zodResolver(lessonInputSchema),
    defaultValues: { title: lesson?.title ?? '', items: lesson?.items ?? [] },
  });
  const blocks = useFieldArray({ control: form.control, name: 'items' });
  const items = useWatch({ control: form.control, name: 'items' });
  const { errors, isDirty, isSubmitting } = form.formState;

  const save = useMutation({
    mutationFn: (input: LessonInput) => lessonsApi.save(input, previous),
    retry: false,
    onError: (error) => {
      if (error instanceof LessonApiError && error.code === 'task_version_conflict') {
        void client.invalidateQueries({ queryKey: ['tasks', user?.id] });
        void client.invalidateQueries({ queryKey: ['lessons', user?.id, 'task'] });
      }
    },
    onSuccess: (updated) => {
      client.setQueryData(['lessons', user?.id, updated.id], updated);
      void client.invalidateQueries({ queryKey: ['lessons', user?.id], exact: true });
      if (!previous) {
        router.push('/tutor/lessons');
        return;
      }
      setPrevious(updated);
      form.reset({ title: updated.title, items: updated.items });
    },
  });

  const upload = useMutation({
    mutationFn: ({ file }: { file: File; index: number }) => lessonsApi.upload(file),
    retry: false,
    onSuccess: (asset, { index }) => {
      form.setValue(`items.${index}.assetId`, asset.id, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
  });

  useLessonSession(save.error ?? upload.error);

  return {
    register: form.register,
    errors,
    fieldError: (name: FieldPath<LessonInput>) => form.getFieldState(name, form.formState).error,
    items,
    fields: blocks.fields,
    add: (kind: LessonItem['kind']) => blocks.append(initialItem[kind]),
    move: (from: number, to: number) => {
      upload.reset();
      blocks.move(from, to);
    },
    remove: (index: number) => {
      upload.reset();
      blocks.remove(index);
    },
    chooseTask: (index: number, versionId: string) => {
      form.setValue(`items.${index}.retainedItemId`, undefined, { shouldDirty: true });
      form.setValue(`items.${index}.taskVersionId`, versionId, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    previousVersion: previous?.version,
    onSubmit: form.handleSubmit((input) => save.mutateAsync(input).catch(() => {})),
    busy: save.isPending || upload.isPending || isSubmitting,
    createComplete: save.isSuccess && !previous,
    showSaved: save.isSuccess && Boolean(previous) && !isDirty,
    saveError: save.error ? lessonErrorMessage(save.error) : null,
    upload: (file: File, index: number) =>
      upload.mutateAsync({ file, index }).then(
        () => true,
        () => false
      ),
    uploading: upload.isPending,
    uploadError: upload.error ? lessonErrorMessage(upload.error) : null,
    uploadIndex: upload.variables?.index,
    resetUpload: upload.reset,
    preview,
    openPreview: () => {
      void form.handleSubmit(setPreview)();
    },
    closePreview: () => setPreview(null),
  };
}
