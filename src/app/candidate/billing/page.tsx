import { BillingPanel } from '@/components/billing';
import { PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';

export default async function CandidateBilling() {
  const user = await requireRole('candidate');
  return (<><PageHeader title="Subscription" sub="One simple monthly plan. Cancel whenever you like." /><BillingPanel audience="candidate" target={{ userId: user.id }} email={user.email} name={user.fullName} /></>);
}
