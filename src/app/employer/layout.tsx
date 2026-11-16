import type { ReactNode } from 'react';
import { PortalShell } from '@/components/brand';
import { Alert, LinkButton } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getBilling } from '@/lib/data';
import { getEmployerContext } from '@/lib/employer';

export const metadata = { title: 'Employer', robots: { index: false, follow: false } };
const NAV = [
  { href: '/employer', label: 'Dashboard' }, { href: '/employer/search', label: 'Search candidates' }, { href: '/employer/pipeline', label: 'Pipeline' },
  { href: '/employer/company', label: 'Company' }, { href: '/employer/billing', label: 'Subscription' },
];

export default async function EmployerLayout({ children }: { children: ReactNode }) {
  const user = await requireRole('employer');
  const ctx = await getEmployerContext(user.id);
  const live = ctx.employer ? (await getBilling({ employerId: ctx.employer.id })).live : false;
  const v = ctx.employer?.verification_status;
  const banner = !ctx.employer ? <Alert tone="warn" title="Register your company to get started" action={<LinkButton href="/employer/company" small>Add company details</LinkButton>}>We verify every employer before granting access to candidates.</Alert>
    : v === 'pending' ? <Alert tone="info" title="Verification in progress">Our team is reviewing {ctx.employer.name}. You will be notified as soon as it is complete.</Alert>
    : v === 'rejected' ? <Alert tone="bad" title="We could not verify your company" action={<LinkButton href="/employer/company" small variant="outline">Update details</LinkButton>}>{ctx.employer.verification_notes ?? 'Please check your registration details and resubmit.'}</Alert>
    : v === 'suspended' ? <Alert tone="bad" title="This employer account is suspended">{ctx.employer.verification_notes ?? 'Please contact support.'}</Alert>
    : !live ? <Alert tone="warn" title="Subscribe to search the directory" action={<LinkButton href="/employer/billing" small variant="accent">View plan</LinkButton>}>Your company is verified. An active subscription unlocks candidate search and enquiries.</Alert>
    : null;
  return <PortalShell nav={NAV} userName={ctx.employer?.name ?? (user.fullName || user.email)} badge={v === 'verified' ? 'Verified employer' : 'Employer'} banner={banner}>{children}</PortalShell>;
}
