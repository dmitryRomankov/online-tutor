import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { ExistingTask } from '@/features/tasks/task-editor';

export const metadata: Metadata = { title: 'Edit task | Online Tutor' };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AccountHome role="TUTOR" view="tasks">
      <ExistingTask id={id} />
    </AccountHome>
  );
}
