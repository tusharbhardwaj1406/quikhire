import { db } from '../db';
import { env } from '../env';
import { RazorpayProvider } from './razorpay';
import { gstSplit, type NormalisedEvent, type PaymentProvider } from './types';

/** The configured gateway, or null when merchant credentials have not been added yet. */
export function paymentProvider(): PaymentProvider | null {
  if (!env.razorpay.configured) return null;
  return new RazorpayProvider(env.razorpay.keyId, env.razorpay.keySecret, env.razorpay.webhookSecret);
}

export type ProcessResult = 'processed' | 'duplicate' | 'ignored' | 'unknown_subscription';

/**
 * Applies one verified gateway event. This is the ONLY code path that grants paid access.
 * Idempotent: the (provider, event id) pair is recorded first, and a repeat delivery is a no-op.
 */
export async function processPaymentEvent(ev: NormalisedEvent): Promise<ProcessResult> {
  const sql = db();
  return (await sql.begin(async (tx) => {
    const [fresh] = await tx`insert into webhook_events (provider, event_id, event_type, payload)
      values (${ev.provider}, ${ev.id}, ${ev.rawType}, ${tx.json(ev.raw as never)})
      on conflict (provider, event_id) do nothing returning id`;
    if (!fresh) return 'duplicate';
    const done = async (result: ProcessResult, error?: string) => {
      await tx`update webhook_events set processed_at = now(), error = ${error ?? null} where id = ${fresh.id}`;
      return result;
    };
    if (ev.type === 'ignored') return done('ignored');

    if (ev.type === 'refund.processed' || (ev.type === 'payment.failed' && !ev.subscriptionId)) {
      if (ev.type === 'refund.processed' && ev.payment) {
        await tx`update payments set refunded_paise = least(amount_paise, refunded_paise + ${ev.payment.refundedPaise ?? 0}), status = 'refunded'
                 where provider = ${ev.provider} and provider_payment_id = ${ev.payment.id}`;
      }
      return done('processed');
    }

    const [sub] = await tx`select s.*, p.gst_rate, coalesce(s.owner_user_id, s.created_by) as notify_user
      from subscriptions s join plans p on p.id = s.plan_id
      where s.provider = ${ev.provider} and s.provider_subscription_id = ${ev.subscriptionId ?? ''} for update of s`;
    if (!sub) return done('unknown_subscription', 'no matching subscription');
    const [{ grace }] = await tx`select (public.setting('subscription_grace_days'))::int as grace`;
    const notify = (type: string, title: string, body: string) => sub.notify_user
      ? tx`insert into notifications (user_id, type, title, body, link) values (${sub.notify_user}, ${type}, ${title}, ${body}, ${sub.employer_id ? '/employer/billing' : '/candidate/billing'})`
      : Promise.resolve();

    switch (ev.type) {
      case 'subscription.authenticated':
        await tx`update subscriptions set status = 'authenticated', updated_at = now() where id = ${sub.id} and status = 'created'`;
        break;
      case 'subscription.charged': {
        if (!ev.payment || !ev.periodEnd) return done('ignored', 'charged event without payment/period');
        const { taxPaise } = gstSplit(ev.payment.amountPaise, Number(sub.gst_rate));
        const [inserted] = await tx`insert into payments (subscription_id, provider, provider_payment_id, amount_paise, tax_paise, status, method, paid_at, invoice_number)
          values (${sub.id}, ${ev.provider}, ${ev.payment.id}, ${ev.payment.amountPaise}, ${taxPaise}, 'captured', ${ev.payment.method ?? null}, now(),
                  'QH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0'))
          on conflict (provider, provider_payment_id) do nothing returning invoice_number`;
        await tx`update subscriptions set status = 'active', current_period_start = ${ev.periodStart ?? new Date()}, current_period_end = ${ev.periodEnd},
                   access_until = ${ev.periodEnd}::timestamptz + make_interval(days => ${grace}), updated_at = now() where id = ${sub.id}`;
        if (inserted) await notify('payment.received', 'Payment received', `Thank you. Your subscription is active. Invoice ${inserted.invoice_number}.`);
        break;
      }
      case 'subscription.pending':
        await tx`update subscriptions set status = 'pending', updated_at = now() where id = ${sub.id}`;
        await notify('payment.retrying', 'We could not collect your renewal', 'Your bank declined the renewal. It will be retried automatically; please check your payment method.');
        break;
      case 'subscription.halted':
        await tx`update subscriptions set status = 'halted', access_until = least(access_until, now()), updated_at = now() where id = ${sub.id}`;
        await notify('subscription.halted', 'Subscription paused', 'Renewal attempts were unsuccessful, so your subscription has been paused. You can subscribe again at any time.');
        break;
      case 'subscription.cancelled':   // access continues to the end of the period already paid for
        await tx`update subscriptions set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
                   access_until = least(access_until, current_period_end), updated_at = now() where id = ${sub.id}`;
        await notify('subscription.cancelled', 'Subscription cancelled', 'Your subscription will not renew. Access continues until the end of the period you have paid for.');
        break;
      case 'subscription.completed':
        await tx`update subscriptions set status = 'completed', updated_at = now() where id = ${sub.id}`;
        break;
      case 'payment.failed':
        if (ev.payment) await tx`insert into payments (subscription_id, provider, provider_payment_id, amount_paise, status, method)
          values (${sub.id}, ${ev.provider}, ${ev.payment.id}, ${ev.payment.amountPaise}, 'failed', ${ev.payment.method ?? null})
          on conflict (provider, provider_payment_id) do nothing`;
        break;
    }
    return done('processed');
  })) as ProcessResult;
}
