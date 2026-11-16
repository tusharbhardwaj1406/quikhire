import { Card } from '@/components/ui';
import { brand } from '@/lib/brand';

export const metadata = { title: 'Account suspended', robots: { index: false } };
export default function Suspended() {
  return (
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">This account is suspended</h1>
      <p className="mt-2 text-sm text-slate-600">If you believe this is a mistake, write to {brand.grievanceEmail} from your registered email address and we will review it.</p>
      <form action="/auth/signout" method="post" className="mt-4"><button className="text-sm font-medium text-accent-700 hover:underline">Sign out</button></form>
    </Card>
  );
}
