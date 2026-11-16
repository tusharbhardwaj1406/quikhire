import type { ReactNode } from 'react';
import { PortalShell } from '@/components/brand';
import { requireRole } from '@/lib/auth';

export const metadata = { title: 'Candidate', robots: { index: false, follow: false } };
const NAV = [
  { href: '/candidate', label: 'Dashboard' }, { href: '/candidate/profile', label: 'Profile' }, { href: '/candidate/resumes', label: 'Resumes' },
  { href: '/candidate/enquiries', label: 'Enquiries' }, { href: '/candidate/billing', label: 'Subscription' }, { href: '/candidate/settings', label: 'Privacy & settings' },
];
export default async function CandidateLayout({ children }: { children: ReactNode }) {
  const user = await requireRole('candidate');
  return <PortalShell nav={NAV} userName={user.fullName || user.email} badge="Candidate">{children}</PortalShell>;
}
