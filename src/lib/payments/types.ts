/** Gateway-neutral contract. Razorpay is the first implementation; Cashfree/PayU can be added behind the same interface. */
export type NormalisedEventType =
  | 'subscription.authenticated' | 'subscription.charged' | 'subscription.pending' | 'subscription.halted'
  | 'subscription.cancelled' | 'subscription.completed' | 'payment.failed' | 'refund.processed' | 'ignored';

export type NormalisedEvent = {
  provider: string;
  id: string;                       // gateway's unique event id: the idempotency key
  type: NormalisedEventType;
  rawType: string;
  subscriptionId?: string;
  periodStart?: Date;
  periodEnd?: Date;
  payment?: { id: string; amountPaise: number; method?: string; refundedPaise?: number };
  raw: unknown;
};

export type ProviderSubscription = { id: string; status: string; paidCount: number; periodStart?: Date; periodEnd?: Date };

export interface PaymentProvider {
  readonly name: string;
  readonly publicKey: string;
  createPlan(input: { name: string; amountPaise: number; currency: string }): Promise<{ id: string }>;
  createSubscription(input: { planId: string; notes: Record<string, string> }): Promise<{ id: string }>;
  fetchSubscription(id: string): Promise<ProviderSubscription>;
  cancelSubscription(id: string, atPeriodEnd: boolean): Promise<void>;
  refund(paymentId: string, amountPaise?: number): Promise<void>;
  verifyCheckoutSignature(input: { paymentId: string; subscriptionId: string; signature: string }): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  parseWebhook(rawBody: string, eventIdHeader: string | null): NormalisedEvent;
}

export function gstSplit(chargedPaise: number, gstRate: number): { basePaise: number; taxPaise: number } {
  const taxPaise = Math.round((chargedPaise * gstRate) / (100 + gstRate));
  return { basePaise: chargedPaise - taxPaise, taxPaise };
}
/** Amount actually charged for a plan, given whether the listed price already includes GST. */
export function chargeAmount(plan: { amount_paise: number; gst_mode: string; gst_rate: number | string }): number {
  return plan.gst_mode === 'exclusive' ? Math.round(plan.amount_paise * (1 + Number(plan.gst_rate) / 100)) : plan.amount_paise;
}
