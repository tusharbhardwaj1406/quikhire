import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { audit, db } from '@/lib/db';
import { paymentProvider } from '@/lib/payments';

/** Cancels auto-renewal at the gateway. Access continues to the end of the paid period. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  const back = new URL(user.role === 'employer' ? '/employer/billing' : '/candidate/billing', request.url);
  const sql = db();
  const [sub] = user.role === 'candidate'
    ? await sql`select * from subscriptions where owner_user_id = ${user.id} and status in ('active', 'pending', 'authenticated') and provider <> 'manual' order by created_at desc limit 1`
    : await sql`select s.* from subscriptions s join employer_members m on m.employer_id = s.employer_id where m.user_id = ${user.id} and s.status in ('active', 'pending', 'authenticated') and s.provider <> 'manual' order by s.created_at desc limit 1`;
  const provider = paymentProvider();
  if (sub && provider && sub.provider === provider.name) {
    try {
      await provider.cancelSubscription(sub.provider_subscription_id, true);
      await sql`update subscriptions set cancel_at_period_end = true, cancelled_at = now(), updated_at = now() where id = ${sub.id}`;
      await audit(user.id, 'billing.cancel_requested', 'subscription', sub.id);
    } catch (e) { console.error('[cancel]', e); back.searchParams.set('error', 'cancel'); }
  }
  return NextResponse.redirect(back, { status: 303 });
}
