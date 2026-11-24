import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InvitationScreen } from '@/features/connections/invitation-screen';

export const metadata: Metadata = {
  title: 'Tutor invitation | Online Tutor',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};
export default function InvitePage() {
  return (
    <Suspense>
      <InvitationScreen />
    </Suspense>
  );
}
