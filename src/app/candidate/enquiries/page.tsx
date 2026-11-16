import { ActionForm, SubmitButton } from '@/components/forms';
import { Badge, Card, EmptyState, PageHeader, type Tone } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { dateIN } from '@/lib/brand';
import { asUser, db } from '@/lib/db';
import { reportEnquiry, respondEnquiry } from '../actions';

const TONE: Record<string, Tone> = { sent: 'warn', accepted: 'good', declined: 'neutral', withdrawn: 'neutral' };
const LABEL: Record<string, string> = { sent: 'Awaiting your reply', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' };

export default async function EnquiriesPage() {
  const user = await requireRole('candidate');
  // Company names are looked up server-side, and only for employers that have actually written to this candidate.
  const rows = await asUser(user.id, (tx) => tx`select id, employer_id, kind, subject, message, status, response, created_at, responded_at from enquiries where candidate_id = ${user.id} order by created_at desc limit 100`);
  const ids = [...new Set(rows.map((r) => r.employer_id))];
  const employers = ids.length ? await db()`select id, name, website, city, kind from employers where id = any(${ids}::uuid[])` : [];
  const emp = (id: string) => employers.find((e) => e.id === id);
  return (
    <>
      <PageHeader title="Enquiries" sub="Messages and interview requests from verified employers. Accepting shares your name and contact details with that employer only." />
      {rows.length === 0 ? <EmptyState title="No enquiries yet">When a verified employer reaches out, it will appear here and you will be notified.</EmptyState> : (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-navy-900">{r.subject}</p>
                  <p className="text-sm text-slate-600">{emp(r.employer_id)?.name} <Badge tone="info">Verified {emp(r.employer_id)?.kind === 'agency' ? 'agency' : 'employer'}</Badge>
                    {emp(r.employer_id)?.website && <> · <a className="text-accent-700 hover:underline" href={emp(r.employer_id)!.website} target="_blank" rel="noopener noreferrer nofollow">website</a></>}</p>
                </div>
                <div className="text-right"><Badge tone={TONE[r.status]}>{r.kind === 'interview_request' ? 'Interview request · ' : ''}{LABEL[r.status]}</Badge><p className="mt-1 text-xs text-slate-500">{dateIN(r.created_at)}</p></div>
              </div>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-700">{r.message}</p>
              {r.status === 'sent' ? (
                <ActionForm action={respondEnquiry} submit="Send reply" className="mt-4 border-t border-slate-100 pt-4">
                  <input type="hidden" name="id" value={r.id} />
                  <textarea name="response" rows={2} className="input" placeholder="Optional message to the employer" maxLength={1000} />
                  <div className="flex flex-wrap gap-6 text-sm">
                    <label className="flex items-center gap-2"><input type="radio" name="decision" value="accept" required className="check" />Accept and share my contact details</label>
                    <label className="flex items-center gap-2"><input type="radio" name="decision" value="decline" className="check" />Decline</label>
                  </div>
                </ActionForm>
              ) : r.response && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Your reply: {r.response}</p>}
              <form action={reportEnquiry} className="mt-3 text-right"><input type="hidden" name="id" value={r.id} />
                <SubmitButton variant="ghost" small confirm="Report this enquiry as suspicious, fraudulent or inappropriate? Our team will review it.">Report</SubmitButton></form>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
