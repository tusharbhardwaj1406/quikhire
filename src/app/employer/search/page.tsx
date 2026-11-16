import Link from 'next/link';
import { ActionForm, SubmitButton, TaxonomyPicker } from '@/components/forms';
import { AvailabilityBadge, Badge, Card, Check, EmptyState, Field, LinkButton, PageHeader, Select, btn } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { AVAILABILITY, EMPLOYMENT_TYPES, STAGES, WORK_MODES, daysAgo, lakhs, years } from '@/lib/brand';
import { getIndustries, getRegions } from '@/lib/data';
import { asUser } from '@/lib/db';
import { getEmployerContext } from '@/lib/employer';
import { parseFilters, toQuery } from '@/lib/search';
import { nlSearch, quickSave, saveSearch } from '../actions';

const PAGE = 20;
type SP = Record<string, string | string[] | undefined>;

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireRole('employer');
  const sp = await searchParams;
  const [ctx, industries, regions] = await Promise.all([getEmployerContext(user.id), getIndustries(), getRegions()]);
  const filters = parseFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const f = (k: string) => (filters[k] as string | number | undefined) ?? '';
  const arr = (k: string) => (filters[k] as string[] | undefined) ?? [];
  const rows = ctx.canSearch ? await asUser(user.id, (tx) => tx`select * from search_candidates(${tx.json(filters as never)}, ${PAGE}, ${(page - 1) * PAGE})`) : [];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.ceil(total / PAGE);

  return (
    <>
      <PageHeader title="Search immediate joiners" sub="Every profile here can join within 30 days and has recently confirmed it." />
      <Card className="mb-6">
        <form action={nlSearch} className="flex flex-col gap-3 sm:flex-row">
          <input name="text" defaultValue={typeof sp.nl === 'string' ? sp.nl : ''} className="input" aria-label="Describe who you are looking for"
            placeholder="Describe who you need, e.g. “bridge engineers in Delhi NCR with 8–12 years and MIDAS Civil, available immediately”" />
          <SubmitButton variant="accent">Find</SubmitButton>
        </form>
        <p className="hint">Your description is converted into the filters below, which you can review and adjust. It never ranks or excludes people automatically.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <aside>
          <Card title="Filters" action={<Link href="/employer/search" className="text-sm text-accent-700 hover:underline">Clear all</Link>}>
            <form method="get" className="space-y-4">
              <Field label="Keywords" hint='Supports quotes, OR and -exclude, e.g. "site engineer" OR supervisor -intern'><input name="q" defaultValue={f('q')} className="input" /></Field>
              <TaxonomyPicker industries={industries} industryId={Number(f('industry_id')) || null} selected={arr('specialisation_ids').map(Number)} multiple />
              <Field label="Skills" hint="Comma separated."><input name="skills" defaultValue={arr('skills').join(', ')} className="input" placeholder="MIDAS Civil, AASHTO" /></Field>
              <Field label="Match skills"><Select name="skills_mode" defaultValue={f('skills_mode') || 'all'} options={[{ value: 'all', label: 'All of these (AND)' }, { value: 'any', label: 'Any of these (OR)' }]} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min exp (yrs)"><input name="exp_min" type="number" min={0} max={60} step={0.5} defaultValue={f('exp_min')} className="input" /></Field>
                <Field label="Max exp (yrs)"><input name="exp_max" type="number" min={0} max={60} step={0.5} defaultValue={f('exp_max')} className="input" /></Field>
              </div>
              <Field label="Region"><Select name="region" defaultValue={f('region')} placeholder="All regions" options={regions.map((r) => ({ value: r.slug, label: r.name }))} /></Field>
              <Field label="City or locality"><input name="city" defaultValue={f('city')} className="input" /></Field>
              <fieldset><legend className="label">Can join</legend><div className="space-y-1.5">
                {Object.entries(AVAILABILITY).map(([v, l]) => <Check key={v} name="availability" value={v} defaultChecked={arr('availability').includes(v)} label={l} />)}</div></fieldset>
              <details className="rounded-lg border border-slate-200 p-3" open={['designation', 'previous_employer', 'qualification', 'certification', 'preferred_city', 'state', 'expected_ctc_max', 'relevant_exp_min', 'updated_within_days', 'verification'].some((k) => k in filters) || arr('work_modes').length + arr('employment_types').length > 0}>
                <summary className="cursor-pointer text-sm font-semibold text-navy-900">More filters</summary>
                <div className="mt-3 space-y-4">
                  <Field label="Designation"><input name="designation" defaultValue={f('designation')} className="input" /></Field>
                  <Field label="Previous employer"><input name="previous_employer" defaultValue={f('previous_employer')} className="input" /></Field>
                  <Field label="Education"><input name="qualification" defaultValue={f('qualification')} className="input" placeholder="Degree or institute" /></Field>
                  <Field label="Certification"><input name="certification" defaultValue={f('certification')} className="input" /></Field>
                  <Field label="Preferred city"><input name="preferred_city" defaultValue={f('preferred_city')} className="input" /></Field>
                  <Field label="State"><input name="state" defaultValue={f('state')} className="input" /></Field>
                  <Field label="Min relevant exp (yrs)"><input name="relevant_exp_min" type="number" min={0} step={0.5} defaultValue={f('relevant_exp_min')} className="input" /></Field>
                  <Field label="Max expected CTC (₹/year)" hint="Matches only candidates who share salary."><input name="expected_ctc_max" type="number" min={0} step={50000} defaultValue={f('expected_ctc_max')} className="input" /></Field>
                  <fieldset><legend className="label">Employment type</legend><div className="space-y-1.5">{Object.entries(EMPLOYMENT_TYPES).map(([v, l]) => <Check key={v} name="employment_types" value={v} defaultChecked={arr('employment_types').includes(v)} label={l} />)}</div></fieldset>
                  <fieldset><legend className="label">Work mode</legend><div className="space-y-1.5">{Object.entries(WORK_MODES).map(([v, l]) => <Check key={v} name="work_modes" value={v} defaultChecked={arr('work_modes').includes(v)} label={l} />)}</div></fieldset>
                  <Field label="Profile updated"><Select name="updated_within_days" defaultValue={f('updated_within_days')} placeholder="Any time" options={[{ value: 7, label: 'Last 7 days' }, { value: 30, label: 'Last 30 days' }, { value: 90, label: 'Last 90 days' }]} /></Field>
                  <Field label="Availability status"><Select name="verification" defaultValue={f('verification')} placeholder="Any" options={[{ value: 'verified', label: 'Verified only' }, { value: 'self_declared', label: 'Self-declared' }]} /></Field>
                </div>
              </details>
              <Field label="Sort by"><Select name="sort" defaultValue={f('sort') || 'relevance'} options={[{ value: 'relevance', label: 'Relevance' }, { value: 'availability', label: 'Soonest to join' }, { value: 'experience', label: 'Most experienced' }, { value: 'updated', label: 'Recently updated' }]} /></Field>
              <button className={btn('primary') + ' w-full'}>Apply filters</button>
            </form>
          </Card>
        </aside>

        <section aria-label="Results">
          {!ctx.canSearch ? (
            <EmptyState title="Search unlocks once your company is verified and subscribed" action={<LinkButton href={ctx.employer ? '/employer/billing' : '/employer/company'}>Continue setup</LinkButton>}>
              This protects candidates: only verified, accountable employers can see profiles.</EmptyState>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600"><strong className="text-navy-900">{total.toLocaleString('en-IN')}</strong> {total === 1 ? 'candidate matches' : 'candidates match'}</p>
                {Object.keys(filters).length > 0 && (
                  <ActionForm action={saveSearch} submit="Save search" variant="outline" className="flex flex-wrap items-center gap-2 space-y-0">
                    <input type="hidden" name="filters" value={JSON.stringify(filters)} />
                    <input name="name" required placeholder="Name this search" className="input w-48 py-2" aria-label="Search name" />
                  </ActionForm>
                )}
              </div>
              {rows.length === 0 ? <EmptyState title="No candidates match these filters yet">Try widening experience or location, or save this search to revisit it as new candidates join.</EmptyState> : (
                <ul className="space-y-4">
                  {rows.map((r) => (
                    <li key={r.candidate_id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link href={`/employer/candidates/${r.candidate_id}`} className="font-display text-lg font-bold text-navy-900 hover:underline">{r.current_designation ?? 'Professional'}</Link>
                          <p className="text-sm text-slate-600">{r.display_name} · {r.industry ?? '—'} · {[r.city, r.state].filter(Boolean).join(', ') || '—'}</p>
                        </div>
                        <AvailabilityBadge availability={r.availability} verification={r.availability_verification} confirmedAt={r.availability_confirmed_at} />
                      </div>
                      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">
                        <div><dt className="inline text-slate-500">Experience </dt><dd className="inline font-medium">{years(r.total_exp_years)}</dd></div>
                        <div><dt className="inline text-slate-500">Expected CTC </dt><dd className="inline font-medium">{r.expected_ctc ? lakhs(r.expected_ctc) : 'Not shared'}</dd></div>
                        <div><dt className="inline text-slate-500">Resume </dt><dd className="inline font-medium">{r.resume_updated_at ? `updated ${daysAgo(r.resume_updated_at)}` : 'not uploaded'}</dd></div>
                        <div><dt className="inline text-slate-500">Profile </dt><dd className="inline font-medium">{r.profile_completeness}% complete</dd></div>
                      </dl>
                      {r.specialisations?.length > 0 && <p className="mt-2 text-sm text-slate-600">{r.specialisations.slice(0, 4).join(' · ')}</p>}
                      <div className="mt-3 flex flex-wrap gap-1.5">{(r.top_skills ?? []).map((s: string) => <Badge key={s} tone="info">{s}</Badge>)}</div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <LinkButton href={`/employer/candidates/${r.candidate_id}`} small>View profile</LinkButton>
                        {r.pipeline_stage ? <Badge tone="good">{STAGES[r.pipeline_stage]}</Badge> : (
                          <>
                            <form action={quickSave}><input type="hidden" name="candidate_id" value={r.candidate_id} /><input type="hidden" name="stage" value="shortlisted" /><SubmitButton variant="outline" small>Shortlist</SubmitButton></form>
                            <form action={quickSave}><input type="hidden" name="candidate_id" value={r.candidate_id} /><input type="hidden" name="stage" value="saved" /><SubmitButton variant="ghost" small>Save</SubmitButton></form>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {pages > 1 && (
                <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
                  {page > 1 ? <Link className={btn('outline', true)} href={`/employer/search?${toQuery(filters, { page: page - 1 })}`}>← Previous</Link> : <span />}
                  <span className="text-slate-600">Page {page} of {pages}</span>
                  {page < pages ? <Link className={btn('outline', true)} href={`/employer/search?${toQuery(filters, { page: page + 1 })}`}>Next →</Link> : <span />}
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
