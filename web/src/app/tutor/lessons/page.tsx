import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { LessonLibrary } from '@/features/lessons/lesson-library';

export const metadata: Metadata = { title: 'Lesson library | Online Tutor' };

export default function LessonsPage() {
  return (
    <AccountHome role="TUTOR" view="lessons">
      <LessonLibrary />
    </AccountHome>
  );
}
