import { ActionForm } from '@/components/forms';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { dateIN, inr } from '@/lib/brand';
import { db } from '@/lib/db';
import { refundPayment } from '../actions';

export default async function AdminPayments() {
  await requireRole('admin');
  const sql = db();
  const [payments, subs, events] = await Promise.all([
    sql`select p.*, coalesce(pr.email::text, e.name) who, pl.name plan from payments p join subscriptions s on s.id = p.subscription_id join plans pl on pl.id = s.plan_id
        left join profiles pr on pr.id = s.owner_user_id left join employers e on e.id = s.employer_id order by p.created_at desc limit 100`,
    sql`select s.id, s.status, s.provider, s.provider_subscription_id, s.current_period_end, s.access_until, s.cancel_at_period_end, coalesce(pr.email::text, e.name) who, pl.name plan
        from subscriptions s join plans pl on pl.id = s.plan_id left join profiles pr on pr.id = s.owner_user_id left join employers e on e.id = s.employer_id order by s.updated_at desc limit 100`,
    sql`select id, provider, event_type, received_at, processed_at, error from webhook_events order by id desc limit 30`,
  ]);
  return (
    <>
      <PageHeader title="Payments" sub="Reconciliation view. Everything here was written from verified gateway events." />
      <div className="space-y-6">
        <Card title="Payments (latest 100)">
          {payments.length === 0 ? <EmptyState title="No payments yet" /> : (
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500 uppercase"><tr><th className="py-2 pr-3">Date</th><th className="pr-3">Customer</th><th className="pr-3">Plan</th><th className="pr-3">Amount</th><th className="pr-3">GST</th><th className="pr-3">Invoice</th><th className="pr-3">Gateway ref</th><th className="pr-3">Status</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">{payments.map((p) => (
                <tr key={p.id}><td className="py-2 pr-3">{dateIN(p.paid_at ?? p.created_at)}</td><td className="pr-3">{p.who}</td><td className="pr-3">{p.plan}</td><td className="pr-3">{inr(p.amount_paise)}</td><td className="pr-3">{inr(p.tax_paise)}</td><td className="pr-3">{p.invoice_number ?? '—'}</td><td className="pr-3 font-mono text-xs">{p.provider_payment_id}</td>
                  <td className="pr-3"><Badge tone={p.status === 'captured' ? 'good' : p.status === 'failed' ? 'bad' : 'neutral'}>{p.status}</Badge></td>
                  <td>{p.status === 'captured' && <ActionForm action={refundPayment} submit="Refund" variant="danger" className="space-y-0"><input type="hidden" name="id" value={p.id} /></ActionForm>}</td></tr>))}</tbody></table></div>)}
        </Card>
        <Card title="Subscriptions (latest 100)">
          {subs.length === 0 ? <EmptyState title="No subscriptions yet" /> : (
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500 uppercase"><tr><th className="py-2 pr-3">Customer</th><th className="pr-3">Plan</th><th className="pr-3">Status</th><th className="pr-3">Source</th><th className="pr-3">Period ends</th><th>Access until</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{subs.map((s) => (
                <tr key={s.id}><td className="py-2 pr-3">{s.who}</td><td className="pr-3">{s.plan}</td><td className="pr-3"><Badge tone={s.status === 'active' ? 'good' : ['pending', 'halted'].includes(s.status) ? 'warn' : 'neutral'}>{s.status}{s.cancel_at_period_end ? ' · ending' : ''}</Badge></td>
                  <td className="pr-3">{s.provider === 'manual' ? 'Complimentary' : s.provider}</td><td className="pr-3">{dateIN(s.current_period_end)}</td><td>{dateIN(s.access_until)}</td></tr>))}</tbody></table></div>)}
        </Card>
        <Card title="Gateway events (latest 30)">
          {events.length === 0 ? <p className="text-sm text-slate-500">No webhook events received yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">{events.map((e) => (<li key={e.id} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-mono text-xs">{e.event_type}</span><span className="text-slate-500">{dateIN(e.received_at)} · {e.error ? <span className="text-red-700">{e.error}</span> : e.processed_at ? 'processed' : 'pending'}</span></li>))}</ul>)}
        </Card>
      </div>
    </>
  );
}
