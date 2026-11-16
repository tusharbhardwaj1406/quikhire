import type { ReactNode } from 'react';
import { PortalShell } from '@/components/brand';
import { requireRole } from '@/lib/auth';

export const metadata = { title: 'Admin', robots: { index: false, follow: false } };
const NAV = [
  { href: '/admin', label: 'Overview' }, { href: '/admin/employers', label: 'Employers' }, { href: '/admin/users', label: 'Users' }, { href: '/admin/taxonomy', label: 'Taxonomy' },
  { href: '/admin/payments', label: 'Payments' }, { href: '/admin/settings', label: 'Pricing & settings' }, { href: '/admin/trust', label: 'Reports & audit' },
];
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole('admin');
  return <PortalShell nav={NAV} userName={user.fullName || user.email} badge="Super admin">{children}</PortalShell>;
}
