import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { TaskLibrary } from '@/features/tasks/task-library';

export const metadata: Metadata = { title: 'Task library | Online Tutor' };

export default function TasksPage() {
  return (
    <AccountHome role="TUTOR" view="tasks">
      <TaskLibrary />
    </AccountHome>
  );
}
