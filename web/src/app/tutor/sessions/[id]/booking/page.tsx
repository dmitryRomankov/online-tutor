import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { BookingScreen } from '@/features/schedule/schedule-views';

export const metadata: Metadata = { title: 'Scheduled session | Online Tutor' };

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AccountHome role="TUTOR" view="schedule">
      <BookingScreen id={id} audience="tutor" />
    </AccountHome>
  );
}
