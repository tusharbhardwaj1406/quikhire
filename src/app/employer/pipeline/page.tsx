import Link from 'next/link';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { AVAILABILITY, STAGES, daysAgo, years } from '@/lib/brand';
import { asUser } from '@/lib/db';

export default async function PipelinePage() {
  const user = await requireRole('employer');
  const rows = await asUser(user.id, (tx) => tx`select * from pipeline_candidates()`);
  return (
    <>
      <PageHeader title="Hiring pipeline" sub="Everyone you have saved, shortlisted or contacted, by stage." action={<LinkButton href="/employer/search" small>Find more candidates</LinkButton>} />
      {rows.length === 0 ? <EmptyState title="Your pipeline is empty" action={<LinkButton href="/employer/search">Search candidates</LinkButton>}>Shortlist candidates from search to track them here.</EmptyState> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(STAGES).map(([stage, label]) => {
            const items = rows.filter((r) => r.stage === stage);
            return (
              <Card key={stage} title={<>{label} <span className="font-normal text-slate-400">({items.length})</span></>}>
                {items.length === 0 ? <p className="text-sm text-slate-400">No one here yet.</p> : (
                  <ul className="divide-y divide-slate-100">{items.map((r) => (
                    <li key={r.candidate_id} className="py-2.5 text-sm">
                      <Link href={`/employer/candidates/${r.candidate_id}`} className="font-semibold text-navy-900 hover:underline">{r.current_designation ?? 'Professional'}</Link>
                      <p className="text-slate-600">{r.display_name} · {years(r.total_exp_years)} · {r.city ?? '—'}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5">
                        {r.still_listed ? <Badge tone="good">{AVAILABILITY[r.availability] ?? 'Available'}</Badge> : <Badge tone="neutral">No longer listed</Badge>}
                        {r.enquiry_status && <Badge tone={r.enquiry_status === 'accepted' ? 'good' : r.enquiry_status === 'sent' ? 'warn' : 'neutral'}>Enquiry {r.enquiry_status}</Badge>}
                        <span className="text-xs text-slate-400">{daysAgo(r.updated_at)}</span>
                      </p>
                      {r.notes && <p className="mt-1 text-xs text-slate-500 italic">{r.notes}</p>}
                    </li>))}</ul>)}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
