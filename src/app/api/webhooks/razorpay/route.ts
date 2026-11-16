import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { flushNotificationEmails } from '@/lib/notify';
import { paymentProvider, processPaymentEvent } from '@/lib/payments';

export const dynamic = 'force-dynamic';

/** Razorpay → ZeroNotice. The signature is checked against the exact raw body before anything is parsed or stored. */
export async function POST(request: NextRequest) {
  const provider = paymentProvider();
  if (!provider) return NextResponse.json({ error: 'payments not configured' }, { status: 503 });
  const raw = await request.text();
  if (!provider.verifyWebhookSignature(raw, request.headers.get('x-razorpay-signature') ?? '')) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }
  try {
    const event = provider.parseWebhook(raw, request.headers.get('x-razorpay-event-id'));
    const result = await processPaymentEvent(event);
    if (result === 'processed' && event.subscriptionId) {
      const rows = await db()`select coalesce(owner_user_id, created_by) uid from subscriptions where provider_subscription_id = ${event.subscriptionId}`;
      await flushNotificationEmails(rows.map((r) => r.uid).filter(Boolean)).catch(() => 0);
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('[webhook]', e);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });   // non-2xx makes the gateway retry
  }
}
