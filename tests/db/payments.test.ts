import { createHmac } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { processPaymentEvent } from '@/lib/payments';
import { RazorpayProvider } from '@/lib/payments/razorpay';
import { chargeAmount, gstSplit } from '@/lib/payments/types';
import { completeCandidate, createUser, isListed } from './helpers';

afterAll(() => db().end());
const rzp = new RazorpayProvider('rzp_test_key', 'key_secret', 'whsec');
const sign = (body: string) => createHmac('sha256', 'whsec').update(body).digest('hex');

async function pendingSubscription() {
  const u = await createUser('candidate');
  await completeCandidate(u.id);
  const subId = 'sub_' + Math.random().toString(36).slice(2);
  await db()`insert into subscriptions (plan_id, owner_user_id, status, provider, provider_subscription_id, autopay_consent_at, created_by)
    select id, ${u.id}, 'created', 'razorpay', ${subId}, now(), ${u.id} from plans where code = 'candidate_monthly'`;
  return { u, subId };
}
const charged = (subId: string, payId: string, endInDays = 30) => JSON.stringify({
  event: 'subscription.charged', created_at: 1,
  payload: { subscription: { entity: { id: subId, current_start: Math.floor(Date.now() / 1000), current_end: Math.floor(Date.now() / 1000) + endInDays * 86400 } },
             payment: { entity: { id: payId, amount: 14900, method: 'upi' } } } });

describe('razorpay signatures', () => {
  it('accepts only correctly signed webhooks and checkout callbacks', () => {
    const body = charged('sub_x', 'pay_x');
    expect(rzp.verifyWebhookSignature(body, sign(body))).toBe(true);
    expect(rzp.verifyWebhookSignature(body + ' ', sign(body))).toBe(false);
    expect(rzp.verifyWebhookSignature(body, '')).toBe(false);
    const good = createHmac('sha256', 'key_secret').update('pay_1|sub_1').digest('hex');
    expect(rzp.verifyCheckoutSignature({ paymentId: 'pay_1', subscriptionId: 'sub_1', signature: good })).toBe(true);
    expect(rzp.verifyCheckoutSignature({ paymentId: 'pay_2', subscriptionId: 'sub_1', signature: good })).toBe(false);
  });
  it('computes GST correctly for inclusive and exclusive pricing', () => {
    expect(gstSplit(14900, 18)).toEqual({ basePaise: 12627, taxPaise: 2273 });
    expect(chargeAmount({ amount_paise: 149900, gst_mode: 'inclusive', gst_rate: 18 })).toBe(149900);
    expect(chargeAmount({ amount_paise: 149900, gst_mode: 'exclusive', gst_rate: '18.00' })).toBe(176882);
  });
});

describe('subscription lifecycle from verified events', () => {
  it('grants access only on a charged event, once, and lists the candidate', async () => {
    const { u, subId } = await pendingSubscription();
    expect(await isListed(u.id)).toBe(false);
    await processPaymentEvent(rzp.parseWebhook(JSON.stringify({ event: 'subscription.authenticated', payload: { subscription: { entity: { id: subId } } } }), 'evt_a_' + subId));
    expect(await isListed(u.id)).toBe(false);                                   // mandate alone is not payment
    const ev = rzp.parseWebhook(charged(subId, 'pay_' + subId), 'evt_c_' + subId);
    expect(await processPaymentEvent(ev)).toBe('processed');
    expect(await processPaymentEvent(ev)).toBe('duplicate');                    // gateway retries are harmless
    const pays = await db()`select invoice_number, tax_paise from payments where provider_payment_id = ${'pay_' + subId}`;
    expect(pays).toHaveLength(1);
    expect(pays[0].invoice_number).toMatch(/^ZN-\d{4}-\d{6}$/);
    expect(pays[0].tax_paise).toBe(2273);
    expect(await isListed(u.id)).toBe(true);
    expect((await db()`select count(*)::int n from notifications where user_id = ${u.id} and type = 'payment.received'`)[0].n).toBe(1);
  });
  it('keeps access to period end on cancellation and removes it when halted', async () => {
    const a = await pendingSubscription();
    await processPaymentEvent(rzp.parseWebhook(charged(a.subId, 'pay_' + a.subId), 'e1' + a.subId));
    await processPaymentEvent(rzp.parseWebhook(JSON.stringify({ event: 'subscription.cancelled', payload: { subscription: { entity: { id: a.subId } } } }), 'e2' + a.subId));
    const [s] = await db()`select status, access_until > now() as live, access_until <= current_period_end as no_grace from subscriptions where provider_subscription_id = ${a.subId}`;
    expect(s).toMatchObject({ status: 'cancelled', live: true, no_grace: true });
    expect(await isListed(a.u.id)).toBe(true);

    const b = await pendingSubscription();
    await processPaymentEvent(rzp.parseWebhook(charged(b.subId, 'pay_' + b.subId), 'e1' + b.subId));
    await processPaymentEvent(rzp.parseWebhook(JSON.stringify({ event: 'subscription.halted', payload: { subscription: { entity: { id: b.subId } } } }), 'e2' + b.subId));
    expect(await isListed(b.u.id)).toBe(false);
  });
  it('records refunds and ignores events for unknown subscriptions', async () => {
    const a = await pendingSubscription();
    await processPaymentEvent(rzp.parseWebhook(charged(a.subId, 'pay_r' + a.subId), 'e1r' + a.subId));
    await processPaymentEvent(rzp.parseWebhook(JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_r' + a.subId, amount: 14900 } } } }), 'e2r' + a.subId));
    expect((await db()`select status, refunded_paise from payments where provider_payment_id = ${'pay_r' + a.subId}`)[0]).toMatchObject({ status: 'refunded', refunded_paise: 14900 });
    expect(await processPaymentEvent(rzp.parseWebhook(charged('sub_nope', 'pay_nope'), 'e_nope_' + Date.now()))).toBe('unknown_subscription');
  });
});
