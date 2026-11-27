import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { BookingScreen } from '@/features/schedule/schedule-views';

export const metadata: Metadata = { title: 'Session status | Online Tutor' };

export default async function StudentSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AccountHome role="STUDENT" view="session">
      <BookingScreen id={id} audience="student" />
    </AccountHome>
  );
}
