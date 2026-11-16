import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NormalisedEvent, NormalisedEventType, PaymentProvider, ProviderSubscription } from './types';

const API = 'https://api.razorpay.com/v1';
const BILLING_CYCLES = 60; // 5 years of monthly cycles; the customer can cancel at any time

function hmac(secret: string, data: string) { return createHmac('sha256', secret).update(data).digest('hex'); }
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const ts = (s?: number | null) => (s ? new Date(s * 1000) : undefined);

const EVENT_MAP: Record<string, NormalisedEventType> = {
  'subscription.authenticated': 'subscription.authenticated',
  'subscription.charged': 'subscription.charged',
  'subscription.pending': 'subscription.pending',
  'subscription.halted': 'subscription.halted',
  'subscription.cancelled': 'subscription.cancelled',
  'subscription.completed': 'subscription.completed',
  'payment.failed': 'payment.failed',
  'refund.processed': 'refund.processed',
};

/**
 * Razorpay Subscriptions (cards + UPI AutoPay). Written against Razorpay's documented REST API;
 * must be exercised end-to-end in Razorpay TEST mode before live keys are configured.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  constructor(private keyId: string, private keySecret: string, private webhookSecret: string) {}
  get publicKey() { return this.keyId; }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
    if (!res.ok) throw new Error(`Razorpay ${method} ${path} failed (${res.status}): ${json?.error?.description ?? 'unknown error'}`);
    return json as T;
  }

  async createPlan(input: { name: string; amountPaise: number; currency: string }) {
    const plan = await this.call<{ id: string }>('POST', '/plans', {
      period: 'monthly', interval: 1, item: { name: input.name, amount: input.amountPaise, currency: input.currency },
    });
    return { id: plan.id };
  }
  async createSubscription(input: { planId: string; notes: Record<string, string> }) {
    const sub = await this.call<{ id: string }>('POST', '/subscriptions', {
      plan_id: input.planId, total_count: BILLING_CYCLES, customer_notify: 1, notes: input.notes,
    });
    return { id: sub.id };
  }
  async fetchSubscription(id: string): Promise<ProviderSubscription> {
    const s = await this.call<{ id: string; status: string; paid_count: number; current_start?: number; current_end?: number }>('GET', `/subscriptions/${encodeURIComponent(id)}`);
    return { id: s.id, status: s.status, paidCount: s.paid_count ?? 0, periodStart: ts(s.current_start), periodEnd: ts(s.current_end) };
  }
  async cancelSubscription(id: string, atPeriodEnd: boolean) {
    await this.call('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atPeriodEnd ? 1 : 0 });
  }
  async refund(paymentId: string, amountPaise?: number) {
    await this.call('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, amountPaise ? { amount: amountPaise } : {});
  }

  verifyCheckoutSignature(i: { paymentId: string; subscriptionId: string; signature: string }) {
    return safeEqual(hmac(this.keySecret, `${i.paymentId}|${i.subscriptionId}`), i.signature);
  }
  verifyWebhookSignature(rawBody: string, signature: string) {
    return Boolean(signature) && safeEqual(hmac(this.webhookSecret, rawBody), signature);
  }
  parseWebhook(rawBody: string, eventIdHeader: string | null): NormalisedEvent {
    const body = JSON.parse(rawBody) as { event: string; created_at?: number; payload?: Record<string, { entity: Record<string, unknown> }> };
    const sub = body.payload?.subscription?.entity as { id?: string; current_start?: number; current_end?: number } | undefined;
    const pay = body.payload?.payment?.entity as { id?: string; amount?: number; method?: string; amount_refunded?: number } | undefined;
    const refund = body.payload?.refund?.entity as { payment_id?: string; amount?: number } | undefined;
    return {
      provider: this.name,
      id: eventIdHeader ?? `${body.event}:${sub?.id ?? pay?.id ?? refund?.payment_id}:${body.created_at}`,
      type: EVENT_MAP[body.event] ?? 'ignored',
      rawType: body.event,
      subscriptionId: sub?.id,
      periodStart: ts(sub?.current_start), periodEnd: ts(sub?.current_end),
      payment: pay?.id ? { id: pay.id, amountPaise: pay.amount ?? 0, method: pay.method, refundedPaise: pay.amount_refunded }
        : refund?.payment_id ? { id: refund.payment_id, amountPaise: 0, refundedPaise: refund.amount } : undefined,
      raw: body,
    };
  }
}
