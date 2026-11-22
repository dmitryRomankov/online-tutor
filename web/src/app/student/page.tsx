import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';

export const metadata: Metadata = { title: 'Student dashboard | Online Tutor' };
export default function StudentPage() {
  return <AccountHome role="STUDENT" />;
}
