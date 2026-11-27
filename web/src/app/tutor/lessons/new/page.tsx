import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { LessonEditor } from '@/features/lessons/lesson-editor';

export const metadata: Metadata = { title: 'Create lesson | Online Tutor' };

export default function NewLessonPage() {
  return (
    <AccountHome role="TUTOR" view="lessons">
      <LessonEditor />
    </AccountHome>
  );
}
