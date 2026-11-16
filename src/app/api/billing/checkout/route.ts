import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { brand } from '@/lib/brand';
import { audit, db } from '@/lib/db';
import { paymentProvider } from '@/lib/payments';
import { chargeAmount } from '@/lib/payments/types';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Creates a gateway subscription for the signed-in candidate or employer. Grants nothing by itself. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.status !== 'active' || (user.role !== 'candidate' && user.role !== 'employer')) return fail('Please log in again.', 401);
  const body = await request.json().catch(() => ({}));
  if (body?.consent !== true) return fail('Please tick the auto-pay consent box to continue.', 400);
  const provider = paymentProvider();
  if (!provider) return fail('Online payments are not available yet.', 503);
  const sql = db();

  let employerId: string | null = null;
  if (user.role === 'employer') {
    const [m] = await sql`select e.id, e.verification_status from employer_members m join employers e on e.id = m.employer_id where m.user_id = ${user.id}`;
    if (!m) return fail('Register your company first.', 400);
    if (m.verification_status !== 'verified') return fail('Your company must be verified before you can subscribe.', 400);
    employerId = m.id;
  }
  const [live] = user.role === 'candidate'
    ? await sql`select 1 from subscriptions where owner_user_id = ${user.id} and access_until > now() and status in ('active', 'pending')`
    : await sql`select 1 from subscriptions where employer_id = ${employerId} and access_until > now() and status in ('active', 'pending')`;
  if (live) return fail('You already have an active subscription.', 409);

  const [plan] = await sql`select * from plans where audience = ${user.role} and is_active order by id limit 1`;
  if (!plan) return fail('No plan is available.', 400);
  try {
    let providerPlanId: string | null = plan.provider === provider.name ? plan.provider_plan_id : null;
    if (!providerPlanId) {   // first checkout after a price change creates the matching plan at the gateway
      providerPlanId = (await provider.createPlan({ name: plan.name, amountPaise: chargeAmount(plan as never), currency: plan.currency })).id;
      await sql`update plans set provider = ${provider.name}, provider_plan_id = ${providerPlanId} where id = ${plan.id}`;
    }
    const created = await provider.createSubscription({ planId: providerPlanId, notes: { zn_user: user.id, zn_employer: employerId ?? '', zn_plan: plan.code } });
    await sql.begin(async (tx) => {
      await tx`insert into subscriptions (plan_id, owner_user_id, employer_id, status, provider, provider_subscription_id, autopay_consent_at, created_by)
        values (${plan.id}, ${user.role === 'candidate' ? user.id : null}, ${employerId}, 'created', ${provider.name}, ${created.id}, now(), ${user.id})`;
      await tx`insert into consents (user_id, purpose, version, granted) values (${user.id}, 'recurring_payment', ${`${plan.code}:${chargeAmount(plan as never)}`}, true)`;
    });
    await audit(user.id, 'billing.checkout_started', 'subscription', created.id, { plan: plan.code });
    return NextResponse.json({ subscriptionId: created.id, keyId: provider.publicKey, brand: brand.name, description: plan.name });
  } catch (e) {
    console.error('[checkout]', e);
    return fail('We could not start the checkout. Please try again shortly.', 502);
  }
}
