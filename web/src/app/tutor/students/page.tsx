import type { Metadata } from 'next';
import { AccountHome } from '@/features/auth/account-home';

export const metadata: Metadata = { title: 'Students | Online Tutor' };
export default function StudentsPage() {
  return <AccountHome role="TUTOR" view="students" />;
}
