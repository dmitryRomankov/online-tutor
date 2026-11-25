import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import { taskErrorMessage, tasksApi } from './api';
import type { Task, TaskInput } from './api';
import { useTaskSession } from './useTaskSession';

export function useSaveTask(task: Task | undefined, onSaved: (saved: Task) => void) {
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const [previous, setPrevious] = useState(task);
  const save = useMutation({
    mutationFn: (input: TaskInput) => tasksApi.save(input, previous),
    retry: false,
    onSuccess: (saved) => {
      client.setQueryData(['tasks', user?.id, saved.id], saved);
      void client.invalidateQueries({ queryKey: ['tasks', user?.id], exact: true });
      if (!previous) {
        router.push('/tutor/tasks');
        return;
      }
      setPrevious(saved);
      onSaved(saved);
    },
  });

  useTaskSession(save.error);

  return {
    subtitle: previous
      ? `Task library · Task v${previous.version}`
      : 'Task library · Tutor authoring',
    submit: (input: TaskInput) => save.mutateAsync(input).catch(() => {}),
    busy: save.isPending,
    createComplete: save.isSuccess && !previous,
    showSaved: save.isSuccess && Boolean(previous),
    error: save.error ? taskErrorMessage(save.error) : null,
  };
}
