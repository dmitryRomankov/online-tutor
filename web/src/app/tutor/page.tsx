import { ScheduleDashboard } from '@/features/schedule/schedule-views';
import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';

export const metadata: Metadata = { title: 'Tutor dashboard | Online Tutor' };
export default function TutorPage() {
  return (
    <AccountHome role="TUTOR">
      <ScheduleDashboard role="TUTOR" />
    </AccountHome>
  );
}
