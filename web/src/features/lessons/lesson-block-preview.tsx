import Image from 'next/image';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import { taskFormatLabels } from '@/features/tasks/api';
import { lessonErrorMessage, lessonImageUrl, lessonsApi } from './api';
import type { LessonItem } from './api';
import { useLessonSession } from './useLessonSession';

export function LessonImage({ assetId }: { assetId: string }) {
  const [error, setError] = useState(false);

  if (error)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">
          Image could not be loaded.
        </p>
        <Button type="button" variant="outline" onClick={() => setError(false)}>
          Retry image
        </Button>
      </div>
    );

  return (
    <Image
      src={lessonImageUrl(assetId)}
      crossOrigin="use-credentials"
      unoptimized
      width={640}
      height={360}
      className="h-auto max-h-96 w-auto max-w-full rounded-lg object-contain"
      alt="Lesson image"
      onError={() => setError(true)}
    />
  );
}

export function LessonTask({
  versionId,
  compact = false,
}: {
  versionId: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const answerGroup = useId();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ['lessons', user?.id, 'task', versionId],
    queryFn: ({ signal }) => lessonsApi.taskPreview(versionId, signal),
    enabled: user?.role === 'TUTOR',
    retry: false,
  });

  useLessonSession(error);

  if (error)
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-destructive">
          {lessonErrorMessage(error)}
        </p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Retry task
        </Button>
      </div>
    );
  if (isPending || !data)
    return (
      <p role="status" className="text-sm">
        Loading attached task…
      </p>
    );
  const format = Object.entries(taskFormatLabels).find(([key]) => key === data.type)?.[1] ?? 'Task';

  return (
    <div className="space-y-3 wrap-anywhere">
      <div>
        <h3 className="font-medium">{data.title}</h3>
        <p className="text-sm text-muted-foreground">
          {format} · Task v{data.version}
        </p>
      </div>
      {!compact && (
        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-2 whitespace-pre-wrap">{data.prompt}</legend>
          {data.type === 'single_choice' &&
            data.choices.map((choice, index) => (
              <label key={index} className="flex min-h-11 items-center gap-2">
                <input type="radio" name={answerGroup} />
                {choice}
              </label>
            ))}
          {data.type === 'fill_blanks' && data.passage && (
            <div className="whitespace-pre-wrap leading-10">
              {data.passage
                .split(/\[(\d+)\]/g)
                .map((part, index) =>
                  index % 2 ? (
                    <Input
                      key={index}
                      aria-label={`Blank ${part}`}
                      className="mx-1 inline-block min-h-11 w-28"
                    />
                  ) : (
                    <span key={index}>{part}</span>
                  )
                )}
            </div>
          )}
          {data.type === 'written_response' && (
            <textarea
              rows={4}
              aria-label="Your answer"
              className="w-full rounded-md border border-input px-3 py-2"
            />
          )}
        </fieldset>
      )}
    </div>
  );
}

export function LessonBlockPreview({ item }: { item: LessonItem }) {
  switch (item.kind) {
    case 'text':
      return <p className="whitespace-pre-wrap wrap-anywhere">{item.text}</p>;
    case 'image':
      return <LessonImage key={item.assetId} assetId={item.assetId} />;
    case 'link':
      return (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="wrap-anywhere text-info underline"
        >
          {item.url}
        </a>
      );
    case 'task':
      return <LessonTask versionId={item.taskVersionId} />;
  }
}
