import { redirect } from 'next/navigation';
import { homeFor, requireUser } from '@/lib/auth';

export default async function Dashboard() {
  const user = await requireUser();
  redirect(user.status === 'suspended' ? '/account-suspended' : homeFor(user.role));
}
