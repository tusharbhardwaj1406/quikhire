import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/forms';
import { Badge, Card, Field, LinkButton, PageHeader, Stat } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { STAGES, dateIN, daysAgo } from '@/lib/brand';
import { asUser } from '@/lib/db';
import { getEmployerContext } from '@/lib/employer';
import { toQuery } from '@/lib/search';
import { addRequirement, closeRequirement, deleteSavedSearch, nlSearch } from './actions';

export default async function EmployerDashboard() {
  const user = await requireRole('employer');
  const ctx = await getEmployerContext(user.id);
  const d = await asUser(user.id, async (tx) => ({
    stages: await tx`select stage, count(*)::int n from pipeline_entries group by stage`,
    enq: (await tx`select count(*)::int total, count(*) filter (where status = 'sent')::int waiting, count(*) filter (where status = 'accepted')::int accepted from enquiries where employer_id = public.my_employer_id()`)[0],
    searches: await tx`select id, name, filters, created_at from saved_searches order by created_at desc limit 10`,
    reqs: await tx`select id, title, description, status, created_at from requirements order by status, created_at desc limit 20`,
    activity: await tx`select id, title, body, link, created_at from notifications where user_id = ${user.id} order by created_at desc limit 8`,
  }));
  const n = (s: string) => d.stages.find((x) => x.stage === s)?.n ?? 0;
  return (
    <>
      <PageHeader title={ctx.employer?.name ?? 'Employer dashboard'} sub="Your hiring workspace." action={ctx.canSearch && <LinkButton href="/employer/search" variant="accent" small>Search candidates</LinkButton>} />
      <div className="space-y-6">
        {ctx.canSearch && (
          <Card>
            <form action={nlSearch} className="flex flex-col gap-3 sm:flex-row">
              <input name="text" className="input" aria-label="Describe who you need" placeholder="Who do you need? e.g. “Java developers in Pune, 5+ years, available immediately”" />
              <SubmitButton variant="accent">Find candidates</SubmitButton>
            </form>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Shortlisted" value={n('shortlisted') + n('saved')} /><Stat label="Contacted" value={n('contacted')} hint={`${d.enq.waiting} awaiting reply`} />
          <Stat label="Enquiries accepted" value={d.enq.accepted} hint={`of ${d.enq.total} sent`} /><Stat label="Interview" value={n('interview')} /><Stat label="Hired" value={n('hired')} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Hiring requirements">
            {d.reqs.length > 0 && (
              <ul className="mb-5 divide-y divide-slate-100">{d.reqs.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div><p className="font-semibold text-navy-900">{r.title} {r.status === 'closed' && <Badge>Closed</Badge>}</p>{r.description && <p className="text-slate-600">{r.description}</p>}<p className="text-xs text-slate-400">{dateIN(r.created_at)}</p></div>
                  {r.status === 'open' && <form action={closeRequirement}><input type="hidden" name="id" value={r.id} /><SubmitButton variant="ghost" small>Close</SubmitButton></form>}
                </li>))}</ul>)}
            {ctx.canSearch ? (
              <ActionForm action={addRequirement} submit="Add requirement" variant="outline" resetOnSuccess>
                <Field label="Role title"><input name="title" required maxLength={150} className="input" placeholder="e.g. Senior Structural Engineer, Delhi" /></Field>
                <Field label="Notes"><textarea name="description" rows={2} maxLength={2000} className="input" /></Field>
              </ActionForm>
            ) : <p className="text-sm text-slate-500">Available once your account is verified and subscribed.</p>}
          </Card>
          <div className="space-y-6">
            <Card title="Saved searches">
              {d.searches.length === 0 ? <p className="text-sm text-slate-500">Save a search from the results page to rerun it in one click.</p> : (
                <ul className="divide-y divide-slate-100">{d.searches.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/employer/search?${toQuery(s.filters)}`} className="font-medium text-accent-700 hover:underline">{s.name}</Link>
                    <form action={deleteSavedSearch}><input type="hidden" name="id" value={s.id} /><SubmitButton variant="ghost" small>Remove</SubmitButton></form>
                  </li>))}</ul>)}
            </Card>
            <Card title="Recent activity" action={<Link href="/employer/pipeline" className="text-sm font-medium text-accent-700 hover:underline">Open pipeline</Link>}>
              {d.activity.length === 0 ? <p className="text-sm text-slate-500">Candidate replies and account updates will appear here.</p> : (
                <ul className="divide-y divide-slate-100">{d.activity.map((a) => (
                  <li key={a.id} className="py-2.5 text-sm"><Link href={a.link ?? '/employer'} className="flex justify-between gap-3"><span><span className="font-medium text-navy-900">{a.title}</span>{a.body && <span className="block text-slate-500">{a.body}</span>}</span><span className="shrink-0 text-xs text-slate-400">{daysAgo(a.created_at)}</span></Link></li>))}</ul>)}
            </Card>
          </div>
        </div>
        <p className="text-xs text-slate-500">Stage names: {Object.values(STAGES).join(' → ')}. Candidate information may be used only for genuine hiring.</p>
      </div>
    </>
  );
}
