import { Card, LinkButton, PageHeader, Stat } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { inr } from '@/lib/brand';
import { asUser } from '@/lib/db';

export default async function AdminOverview() {
  const admin = await requireRole('admin');
  const [{ m }] = await asUser(admin.id, (tx) => tx`select admin_metrics() as m`);
  const churn = m.active_candidate_subs + m.active_employer_subs + m.cancelled_30d > 0
    ? `${((m.cancelled_30d / (m.active_candidate_subs + m.active_employer_subs + m.cancelled_30d)) * 100).toFixed(1)}%` : '—';
  return (
    <>
      <PageHeader title="Platform overview" sub="Live figures from the database." action={m.employers_pending > 0 && <LinkButton href="/admin/employers" variant="accent" small>{m.employers_pending} employer{m.employers_pending === 1 ? '' : 's'} awaiting verification</LinkButton>} />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Monthly recurring revenue" value={inr(m.mrr_paise)} hint="Active, renewing subscriptions" /><Stat label="Revenue, last 30 days" value={inr(m.revenue_30d_paise)} hint={`${m.failed_payments_30d} failed payments`} />
          <Stat label="Active subscriptions" value={m.active_candidate_subs + m.active_employer_subs} hint={`${m.active_candidate_subs} candidate · ${m.active_employer_subs} employer`} /><Stat label="Cancellations, 30 days" value={m.cancelled_30d} hint={`Churn ${churn}`} />
          <Stat label="Candidates" value={m.candidates_total} hint={`${m.candidates_listed} live in directory`} /><Stat label="Verified availability" value={m.candidates_verified_availability} hint={`${m.candidates_pending_confirmation} awaiting reconfirmation`} />
          <Stat label="Employers" value={m.employers_total} hint={`${m.employers_verified} verified · ${m.employers_pending} pending`} /><Stat label="Enquiries, 30 days" value={m.enquiries_30d} hint={`${m.enquiries_accepted_30d} accepted · ${m.hires_reported} hires reported`} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Candidates by industry">
            <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500 uppercase"><tr><th className="py-1.5">Industry</th><th>Total</th><th>Listed</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{m.by_industry.filter((r: { total: number }) => r.total > 0).map((r: { name: string; total: number; listed: number }) => <tr key={r.name}><td className="py-1.5">{r.name}</td><td>{r.total}</td><td>{r.listed}</td></tr>)}</tbody></table>
            {m.candidates_total === 0 && <p className="text-sm text-slate-500">No candidates yet.</p>}
          </Card>
          <Card title="Candidates by city">
            {m.by_city.length === 0 ? <p className="text-sm text-slate-500">No data yet.</p> : <ul className="divide-y divide-slate-100 text-sm">{m.by_city.map((r: { city: string; total: number }) => <li key={r.city} className="flex justify-between py-1.5"><span>{r.city}</span><span className="font-medium">{r.total}</span></li>)}</ul>}
          </Card>
        </div>
      </div>
    </>
  );
}
