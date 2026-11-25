import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { TaskEditor } from '@/features/tasks/task-editor';

export const metadata: Metadata = { title: 'Create task | Online Tutor' };

export default function NewTaskPage() {
  return (
    <AccountHome role="TUTOR" view="tasks">
      <TaskEditor />
    </AccountHome>
  );
}
