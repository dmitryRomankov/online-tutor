import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAuth } from '@/features/auth/auth-provider';
import { taskFormatLabels, taskErrorMessage, tasksApi } from '@/features/tasks/api';
import { useTaskSession } from '@/features/tasks/useTaskSession';
import type { useLessonEditor } from './useLessonEditor';
import { LessonImage, LessonTask } from './lesson-block-preview';

type Editor = ReturnType<typeof useLessonEditor>;
type LessonBlockEditorType = { editor: Editor; index: number };

export const lessonBlockLabels = {
  text: 'Text',
  image: 'Image',
  link: 'Link',
  task: 'Task',
} as const;

export function LessonBlockEditor({ editor, index }: LessonBlockEditorType) {
  const item = editor.items[index];
  const number = index + 1;
  if (!item) return null;

  switch (item.kind) {
    case 'text': {
      const error = editor.fieldError(`items.${index}.text`);
      return (
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`activity-text-${number}`}>Activity text</FieldLabel>
          <textarea
            id={`activity-text-${number}`}
            rows={4}
            maxLength={5000}
            aria-invalid={!!error}
            aria-describedby={error ? `activity-error-${number}` : undefined}
            className="w-full rounded-md border border-input px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"
            {...editor.register(`items.${index}.text`)}
          />
          <FieldError id={`activity-error-${number}`} errors={[error]} />
        </Field>
      );
    }
    case 'link': {
      const error = editor.fieldError(`items.${index}.url`);
      return (
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`activity-link-${number}`}>HTTPS link</FieldLabel>
          <Input
            id={`activity-link-${number}`}
            type="url"
            className="min-h-11"
            maxLength={2048}
            aria-invalid={!!error}
            aria-describedby={error ? `activity-error-${number}` : undefined}
            {...editor.register(`items.${index}.url`)}
          />
          <FieldError id={`activity-error-${number}`} errors={[error]} />
        </Field>
      );
    }
    case 'image': {
      const error = editor.fieldError(`items.${index}.assetId`)?.message;
      return <ImageBlock editor={editor} index={index} assetId={item.assetId} error={error} />;
    }
    case 'task': {
      const error = editor.fieldError(`items.${index}.taskVersionId`)?.message;
      return (
        <TaskPicker
          editor={editor}
          index={index}
          versionId={item.taskVersionId}
          retained={!!item.retainedItemId}
          error={error}
        />
      );
    }
  }
}

function ImageBlock({
  editor,
  index,
  assetId,
  error,
}: {
  editor: Editor;
  index: number;
  assetId: string;
  error?: string;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const id = `activity-image-${index + 1}`;
  const errorMessage = (editor.uploadIndex === index && editor.uploadError) || error;
  return (
    <Field data-invalid={!!errorMessage}>
      <FieldLabel htmlFor={id}>{assetId ? 'Replace image' : 'Choose image'}</FieldLabel>
      <Input
        id={id}
        ref={field}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="min-h-11"
        aria-invalid={!!errorMessage}
        aria-describedby={`${id}-help${errorMessage ? ` ${id}-error` : ''}`}
        onChange={(event) => {
          editor.resetUpload();
          setFile(event.target.files?.[0] ?? null);
        }}
      />
      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        PNG, JPEG or WebP. Up to 2 MB.
      </p>
      <FieldError id={`${id}-error`}>{errorMessage}</FieldError>
      <Button
        type="button"
        variant="outline"
        disabled={!file || editor.uploading}
        className="min-h-11 justify-self-start"
        onClick={async () => {
          if (!file || !(await editor.upload(file, index))) return;
          if (field.current) field.current.value = '';
          setFile(null);
        }}
      >
        {editor.uploadIndex === index && editor.uploading ? 'Uploading…' : 'Upload image'}
      </Button>
      {assetId && <LessonImage key={assetId} assetId={assetId} />}
    </Field>
  );
}

function TaskPicker({
  editor,
  index,
  versionId,
  retained,
  error,
}: {
  editor: Editor;
  index: number;
  versionId: string;
  retained: boolean;
  error?: string;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const tasks = useQuery({
    queryKey: ['tasks', user?.id],
    queryFn: ({ signal }) => tasksApi.list(signal),
    enabled: user?.role === 'TUTOR',
    retry: false,
  });
  useTaskSession(tasks.error);
  const options =
    tasks.data?.filter(
      (task) =>
        task.versionId === versionId ||
        task.title.toLowerCase().includes(search.trim().toLowerCase())
    ) ?? [];
  const id = `activity-task-${index + 1}`;

  return (
    <div className="space-y-3">
      <Field>
        <FieldLabel htmlFor={`${id}-search`}>Search tasks</FieldLabel>
        <Input
          id={`${id}-search`}
          type="search"
          className="min-h-11"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <Field className="[&_[data-slot=native-select-wrapper]]:w-full" data-invalid={!!error}>
        <FieldLabel htmlFor={id}>Library task</FieldLabel>
        <NativeSelect
          id={id}
          className="min-h-11"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          value={versionId}
          {...editor.register(`items.${index}.taskVersionId`)}
          onChange={(event) => editor.chooseTask(index, event.target.value)}
        >
          <NativeSelectOption value="">
            {tasks.isPending ? 'Loading tasks…' : 'Choose a task'}
          </NativeSelectOption>
          {versionId && !options.some((task) => task.versionId === versionId) && (
            <NativeSelectOption value={versionId}>Attached task version</NativeSelectOption>
          )}
          {options.map((task) => (
            <NativeSelectOption key={task.versionId} value={task.versionId}>
              {task.title} · {taskFormatLabels[task.type]} · v{task.version}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError id={`${id}-error`}>{error}</FieldError>
      </Field>
      {tasks.isSuccess && !options.length && (
        <p className="text-sm text-muted-foreground">No tasks match.</p>
      )}
      {tasks.error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {taskErrorMessage(tasks.error)}
          </p>
          <Button type="button" variant="outline" onClick={() => void tasks.refetch()}>
            Retry task library
          </Button>
        </div>
      )}
      {versionId && (
        <LessonTask
          key={versionId}
          versionId={versionId}
          compact
          attachment={{ retained, onReplace: (latestId) => editor.chooseTask(index, latestId) }}
        />
      )}
    </div>
  );
}
