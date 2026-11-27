import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';
import { SessionPreparation } from '@/features/lessons/session-preparation';

export const metadata: Metadata = { title: 'Classroom preparation | Online Tutor' };

export default async function TutorSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AccountHome role="TUTOR" view="session">
      <SessionPreparation id={id} />
    </AccountHome>
  );
}
