import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { paymentProvider } from '@/lib/payments';

/**
 * Called by the browser after checkout. Confirms the gateway's signature so the UI can say "received",
 * and marks the mandate as authenticated. Paid access is granted ONLY by the signed webhook.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  const provider = paymentProvider();
  if (!user || !provider) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const paymentId = String(b.razorpay_payment_id ?? ''), subscriptionId = String(b.razorpay_subscription_id ?? ''), signature = String(b.razorpay_signature ?? '');
  if (!paymentId || !subscriptionId || !provider.verifyCheckoutSignature({ paymentId, subscriptionId, signature })) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }
  const rows = await db()`update subscriptions set status = 'authenticated', updated_at = now()
    where provider = ${provider.name} and provider_subscription_id = ${subscriptionId} and created_by = ${user.id} and status = 'created' returning id`;
  return NextResponse.json({ ok: true, updated: rows.length });
}
