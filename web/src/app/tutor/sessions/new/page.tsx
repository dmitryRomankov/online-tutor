import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { ScheduleForm } from '@/features/schedule/schedule-form';

export const metadata: Metadata = { title: 'Schedule lesson | Online Tutor' };

export default function SchedulePage() {
  return (
    <AccountHome role="TUTOR" view="schedule">
      <ScheduleForm />
    </AccountHome>
  );
}
