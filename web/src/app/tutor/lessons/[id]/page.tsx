import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { ExistingLesson } from '@/features/lessons/lesson-editor';

export const metadata: Metadata = { title: 'Edit lesson | Online Tutor' };

export type EditLessonPageParams = { params: Promise<{ id: string }> };

export default async function EditLessonPage({ params }: EditLessonPageParams) {
  const { id } = await params;

  return (
    <AccountHome role="TUTOR" view="lessons">
      <ExistingLesson id={id} />
    </AccountHome>
  );
}
