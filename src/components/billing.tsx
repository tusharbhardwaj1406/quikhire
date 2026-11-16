import { SubmitButton } from '@/components/forms';
import { Alert, Badge, Card, type Tone } from '@/components/ui';
import { dateIN, inr } from '@/lib/brand';
import { getBilling, getLaunch, getPlans, getSettings } from '@/lib/data';
import { paymentProvider } from '@/lib/payments';
import { chargeAmount } from '@/lib/payments/types';
import { CheckoutButton } from './checkout-button';

const STATUS: Record<string, [Tone, string]> = {
  created: ['neutral', 'Checkout not completed'], authenticated: ['info', 'Mandate approved, awaiting first payment'], active: ['good', 'Active'],
  pending: ['warn', 'Renewal payment retrying'], halted: ['bad', 'Paused: renewal failed'], cancelled: ['neutral', 'Cancelled'], completed: ['neutral', 'Completed'], expired: ['neutral', 'Expired'],
};

/** Subscription status, checkout, cancellation and invoices. Shared by the candidate and employer portals. */
export async function BillingPanel({ audience, target, email, name, blockedReason }: {
  audience: 'candidate' | 'employer'; target: { userId?: string; employerId?: string }; email: string; name: string; blockedReason?: string;
}) {
  const [plans, billing, launch, settings] = await Promise.all([getPlans(), getBilling(target), getLaunch(), getSettings()]);
  const launchFree = launch.free && (audience === 'candidate' || settings.launch_free_employers === true);
  const plan = plans.find((p) => p.audience === audience);
  const provider = paymentProvider();
  const { sub, payments, live } = billing;
  if (!plan) return <Alert tone="warn" title="No plan is available right now" />;
  const charge = chargeAmount(plan);
  const gstNote = plan.gst_mode === 'exclusive' ? `${inr(plan.amount_paise)} + ${Number(plan.gst_rate)}% GST = ${inr(charge)} per month` : `${inr(charge)} per month, inclusive of ${Number(plan.gst_rate)}% GST`;
  const ending = sub && (sub.cancel_at_period_end || sub.status === 'cancelled');
  return (
    <div className="space-y-6">
      <Card title={plan.name} action={sub && <Badge tone={live && ending ? 'warn' : STATUS[sub.status]?.[0] ?? 'neutral'}>{live && ending ? 'Ends at period end' : STATUS[sub.status]?.[1] ?? sub.status}</Badge>}>
        <p className="font-display text-3xl font-extrabold text-navy-900">{inr(charge)}<span className="text-base font-medium text-slate-500"> / month</span></p>
        <p className="mt-1 text-sm text-slate-600">{gstNote}. No setup fee or hidden charges.</p>
        {live ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-slate-700">{ending ? 'Your access continues until' : sub.provider === 'manual' ? 'Complimentary access until' : 'Next renewal on'} <strong>{dateIN(sub.current_period_end ?? sub.access_until)}</strong>.</p>
            {!ending && sub.provider !== 'manual' && (
              <form action="/api/billing/cancel" method="post"><SubmitButton variant="danger" small confirm="Cancel auto-renewal? You keep access until the end of the period you have paid for.">Cancel subscription</SubmitButton></form>
            )}
          </div>
        ) : launchFree && !blockedReason ? (
          <div className="mt-5"><Alert tone="good" title="Free during our launch">You do not need to pay anything {launch.endsAt ? <>until <strong>{dateIN(launch.endsAt)}</strong></> : <>for the first {launch.days} days after we launch</>}. We will remind you before the free period ends; nothing is charged unless you choose to subscribe then.</Alert></div>
        ) : blockedReason ? <div className="mt-5"><Alert tone="info">{blockedReason}</Alert></div>
          : provider ? (
            <div className="mt-5">
              <CheckoutButton label={`Subscribe for ${inr(charge)}/month`} email={email} name={name}
                consentText={`I authorise QuikHire to collect ${inr(charge)} every month through an auto-pay mandate (UPI AutoPay or card) until I cancel. My bank will notify me before each debit and I can cancel at any time from this page.`} />
            </div>
          ) : (
            <div className="mt-5"><Alert tone="warn" title="Online payments are being set up">Checkout will open here as soon as our payment gateway is connected. Nothing has been charged.</Alert></div>
          )}
      </Card>
      <Card title="Payment history">
        {payments.length === 0 ? <p className="text-sm text-slate-500">No payments yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500 uppercase"><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Invoice</th><th className="py-2 pr-4">Amount</th><th className="py-2 pr-4">GST included</th><th className="py-2 pr-4">Method</th><th className="py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{payments.map((p, i) => (
              <tr key={i}><td className="py-2 pr-4">{dateIN(p.paid_at ?? p.created_at)}</td><td className="py-2 pr-4">{p.invoice_number ? <a className="text-accent-700 hover:underline" href={`/api/billing/invoice/${p.invoice_number}`}>{p.invoice_number}</a> : '—'}</td>
                <td className="py-2 pr-4">{inr(p.amount_paise)}</td><td className="py-2 pr-4">{inr(p.tax_paise)}</td><td className="py-2 pr-4 uppercase">{p.method ?? '—'}</td>
                <td className="py-2"><Badge tone={p.status === 'captured' ? 'good' : p.status === 'failed' ? 'bad' : 'neutral'}>{p.status}{p.refunded_paise > 0 ? ` (${inr(p.refunded_paise)} refunded)` : ''}</Badge></td></tr>))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
