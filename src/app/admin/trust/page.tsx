import { SubmitButton } from '@/components/forms';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { dateIN } from '@/lib/brand';
import { db } from '@/lib/db';
import { resolveReport } from '../actions';

export default async function AdminTrust() {
  await requireRole('admin');
  const sql = db();
  const [reports, log] = await Promise.all([
    sql`select r.*, p.email reporter, q.subject enquiry_subject, coalesce(e.name, e2.name) employer_name, coalesce(e.id, e2.id) employer_id
        from reports r join profiles p on p.id = r.reporter_id left join enquiries q on r.target_type = 'enquiry' and q.id = r.target_id
        left join employers e on e.id = q.employer_id left join employers e2 on r.target_type = 'employer' and e2.id = r.target_id
        order by (r.status = 'open') desc, r.created_at desc limit 50`,
    sql`select a.*, p.email actor from audit_log a left join profiles p on p.id = a.actor_id order by a.id desc limit 100`,
  ]);
  return (
    <>
      <PageHeader title="Reports & audit" sub="Complaints from users, and a tamper-evident trail of administrative and billing actions." />
      <div className="space-y-6">
        <Card title="Reports">
          {reports.length === 0 ? <EmptyState title="No reports">Reports of fraudulent employers, fake offers or data misuse appear here.</EmptyState> : (
            <ul className="divide-y divide-slate-100 text-sm">{reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div><p className="font-medium text-navy-900">{r.reason} <Badge tone={r.status === 'open' ? 'bad' : 'neutral'}>{r.status}</Badge></p>
                  <p className="text-slate-600">Against {r.employer_name ?? r.target_type}{r.enquiry_subject && ` · enquiry “${r.enquiry_subject}”`} · by {r.reporter} · {dateIN(r.created_at)}</p>{r.details && <p className="text-slate-500">{r.details}</p>}</div>
                {r.status === 'open' && <span className="flex gap-2">
                  <form action={resolveReport}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="resolved" /><SubmitButton variant="outline" small>Mark resolved</SubmitButton></form>
                  <form action={resolveReport}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value="dismissed" /><SubmitButton variant="ghost" small>Dismiss</SubmitButton></form></span>}
              </li>))}</ul>)}
          <p className="mt-3 text-xs text-slate-500">To act on an employer, open Employers and suspend the company with a note.</p>
        </Card>
        <Card title="Audit log (latest 100)">
          {log.length === 0 ? <p className="text-sm text-slate-500">No entries yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500 uppercase"><tr><th className="py-2 pr-3">When</th><th className="pr-3">Who</th><th className="pr-3">Action</th><th className="pr-3">Target</th><th>Details</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{log.map((a) => (<tr key={a.id}><td className="py-1.5 pr-3 whitespace-nowrap">{new Date(a.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</td><td className="pr-3">{a.actor ?? 'system'}</td><td className="pr-3 font-mono text-xs">{a.action}</td><td className="pr-3 text-xs">{a.target_type} {a.target_id?.slice(0, 8)}</td><td className="text-xs text-slate-500">{JSON.stringify(a.meta) === '{}' ? '' : JSON.stringify(a.meta)}</td></tr>))}</tbody></table></div>)}
        </Card>
      </div>
    </>
  );
}
