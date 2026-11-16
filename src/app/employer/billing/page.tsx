import { BillingPanel } from '@/components/billing';
import { PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getEmployerContext } from '@/lib/employer';

export default async function EmployerBilling() {
  const user = await requireRole('employer');
  const { employer } = await getEmployerContext(user.id);
  const blocked = !employer ? 'Register your company first.' : employer.verification_status !== 'verified' ? 'You can subscribe as soon as your company is verified, so you never pay for access you cannot use.' : undefined;
  return (<><PageHeader title="Subscription" sub="One plan for your company. Cancel whenever you like." />
    <BillingPanel audience="employer" target={{ employerId: employer?.id ?? '00000000-0000-0000-0000-000000000000' }} email={user.email} name={employer?.name ?? user.fullName} blockedReason={blocked} /></>);
}
