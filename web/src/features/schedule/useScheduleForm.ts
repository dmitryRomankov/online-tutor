'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/features/auth/auth-provider';
import { connectionsApi } from '@/features/connections/api';
import { useConnectionSession } from '@/features/connections/useConnectionSession';
import { lessonsApi } from '@/features/lessons/api';
import { useLessonSession } from '@/features/lessons/useLessonSession';
import { scheduleApi } from './api';
import type { BookingInput } from './api';
import { scheduleKey, useScheduleAuth } from './schedule-queries';
import { localStartOptions, viewerZone } from './time';

const fields = z.object({
  connectionId: z.uuid('Choose a student.'),
  lessonId: z.uuid('Choose a lesson.'),
  date: z.string().min(1, 'Choose a date.'),
  time: z.string().min(1, 'Choose a start time.'),
  duration: z
    .string()
    .regex(/^\d+$/, 'Enter a positive whole number of minutes.')
    .refine(
      (duration) => Number(duration) > 0 && Number(duration) <= 2_147_483_647,
      'Enter a valid positive duration.'
    ),
  occurrence: z.string(),
});

export function useScheduleForm() {
  const { user } = useAuth();
  const router = useRouter();
  const cache = useQueryClient();
  const [submission, setSubmission] = useState<{ key: string; id: string }>();
  const form = useForm({
    resolver: zodResolver(fields),
    defaultValues: {
      connectionId: '',
      lessonId: '',
      date: '',
      time: '',
      duration: '45',
      occurrence: '',
    },
  });
  const [date, time] = useWatch({ control: form.control, name: ['date', 'time'] });
  const zone = viewerZone();
  const occurrences = localStartOptions(date, time, zone);

  const students = useQuery({
    queryKey: ['connections', user?.id],
    queryFn: ({ signal }) => connectionsApi.list(signal),
    enabled: Boolean(user),
    retry: false,
  });

  const lessons = useQuery({
    queryKey: ['lessons', user?.id],
    queryFn: ({ signal }) => lessonsApi.list(signal),
    enabled: Boolean(user),
    retry: false,
  });

  const create = useMutation({
    mutationFn: (input: BookingInput) => scheduleApi.create(input),
    retry: false,
    onSuccess: (booking) => {
      cache.setQueryData([...scheduleKey(user?.id), 'tutor', booking.id], booking);
      void cache.invalidateQueries({ queryKey: scheduleKey(user?.id), exact: true });
      router.push(`/tutor/sessions/${booking.id}/booking`);
    },
  });

  useConnectionSession([students.error]);
  useLessonSession(lessons.error);
  useScheduleAuth(create.error);

  const submit = form.handleSubmit(async (values) => {
    const possibleStarts = localStartOptions(values.date, values.time, zone);

    if (!possibleStarts.length) {
      form.setError(
        'time',
        { message: 'This local time is invalid. Choose a different start time.' },
        { shouldFocus: true }
      );
      return;
    }

    const scheduledStart = possibleStarts.length === 1 ? possibleStarts[0] : values.occurrence;

    if (!possibleStarts.includes(scheduledStart)) {
      form.setError(
        'occurrence',
        { message: 'Choose which occurrence of this time to use.' },
        { shouldFocus: true }
      );
      return;
    }

    const input = {
      connectionId: values.connectionId,
      lessonId: values.lessonId,
      scheduledStart,
      durationMinutes: Number(values.duration),
    };
    const key = JSON.stringify(input);
    const attempt = submission?.key === key ? submission : { key, id: crypto.randomUUID() };
    setSubmission(attempt);
    await create.mutateAsync({ ...input, id: attempt.id }).catch(() => {});
  });

  return { form, students, lessons, create, submit, zone, occurrences };
}
