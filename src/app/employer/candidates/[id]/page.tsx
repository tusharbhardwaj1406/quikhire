import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/forms';
import { Alert, AvailabilityBadge, Badge, Card, Field, PageHeader, Select } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { EMPLOYMENT_TYPES, STAGES, WORK_MODES, dateIN, daysAgo, lakhs, years } from '@/lib/brand';
import { asUser } from '@/lib/db';
import { sendEnquiry, setStage } from '../../actions';

type Exp = { employer_name: string; designation: string; start_date: string; end_date: string | null; responsibilities: string | null; projects: string | null; achievements: string | null };

export default async function CandidateProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('employer');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let p: Record<string, any> | null = null;   // eslint-disable-line @typescript-eslint/no-explicit-any
  try { p = (await asUser(user.id, (tx) => tx`select get_candidate_profile(${id}) as p`))[0].p; } catch { p = null; }
  if (!p) return <Alert tone="warn" title="This profile is not available">The candidate may have paused their profile, or your account does not currently have search access.</Alert>;
  const row = (label: string, value: React.ReactNode) => (<div><dt className="text-xs text-slate-500 uppercase">{label}</dt><dd className="mt-0.5 font-medium text-navy-900">{value || '—'}</dd></div>);
  return (
    <>
      <p className="mb-3 text-sm"><Link href="/employer/search" className="text-accent-700 hover:underline">← Back to search</Link></p>
      <PageHeader title={p.current_designation ?? 'Professional'} sub={<>{p.display_name}{p.name_hidden && <span className="text-slate-400"> · name shared once the candidate accepts your enquiry</span>}</>}
        action={<AvailabilityBadge availability={p.availability} verification={p.availability_verification} confirmedAt={p.availability_confirmed_at} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card title="Overview">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {row('Total experience', years(p.total_exp_years))}{row('Relevant experience', years(p.relevant_exp_years))}{row('Industry', p.industry)}
              {row('Location', [p.city, p.state].filter(Boolean).join(', '))}{row('Preferred locations', (p.preferred_locations ?? []).join(', '))}{row('Earliest joining', dateIN(p.earliest_joining_date))}
              {row('Employment type', (p.employment_types ?? []).map((t: string) => EMPLOYMENT_TYPES[t]).join(', '))}{row('Work mode', (p.work_modes ?? []).map((t: string) => WORK_MODES[t]).join(', '))}
              {row('Education', [p.highest_qualification, p.university, p.graduation_year].filter(Boolean).join(' · '))}
              {row('Expected CTC', p.salary ? `${lakhs(p.salary.expected_ctc)}${p.salary.negotiable ? ' (negotiable)' : ''}` : 'Not shared')}{row('Last CTC', p.salary ? lakhs(p.salary.last_ctc) : 'Not shared')}{row('Profile updated', daysAgo(p.updated_at))}
            </dl>
            {p.summary && <p className="mt-5 leading-relaxed whitespace-pre-line text-slate-700">{p.summary}</p>}
          </Card>
          <Card title="Specialisations and skills">
            <div className="flex flex-wrap gap-1.5">{p.specialisations.map((s: string) => <Badge key={s} tone="good">{s}</Badge>)}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">{p.skills.map((s: { name: string }) => <Badge key={s.name} tone="info">{s.name}</Badge>)}</div>
            {p.certifications.length > 0 && <ul className="mt-4 list-inside list-disc text-sm text-slate-700">{p.certifications.map((c: { name: string; issuer?: string; year?: number }) => <li key={c.name}>{[c.name, c.issuer, c.year].filter(Boolean).join(' · ')}</li>)}</ul>}
          </Card>
          <Card title="Employment history">
            {p.experiences === null ? <p className="text-sm text-slate-500">This candidate has chosen not to share employment history at this stage.</p>
              : p.experiences.length === 0 ? <p className="text-sm text-slate-500">No entries added.</p> : (
                <ol className="space-y-5">{p.experiences.map((e: Exp, i: number) => (
                  <li key={i} className="border-l-2 border-accent-100 pl-4">
                    <p className="font-semibold text-navy-900">{e.designation} · {e.employer_name}</p>
                    <p className="text-sm text-slate-500">{dateIN(e.start_date)} – {e.end_date ? dateIN(e.end_date) : 'Present'}</p>
                    {[e.responsibilities, e.projects, e.achievements].filter(Boolean).map((t, j) => <p key={j} className="mt-1 text-sm whitespace-pre-line text-slate-700">{t}</p>)}
                  </li>))}</ol>)}
          </Card>
        </div>
        <aside className="space-y-6">
          <Card title="Contact">
            {p.email || p.phone ? (
              <dl className="space-y-2 text-sm">{p.email && row('Email', <a className="text-accent-700 hover:underline" href={`mailto:${p.email}`}>{p.email}</a>)}{p.phone && row('Phone', p.phone)}
                {p.linkedin_url && row('LinkedIn', <a className="text-accent-700 hover:underline" href={p.linkedin_url} target="_blank" rel="noopener noreferrer nofollow">View profile</a>)}</dl>
            ) : <p className="text-sm text-slate-600">Contact details are shared when the candidate accepts your enquiry.</p>}
            {p.enquiry && <p className="mt-3 text-sm">Latest enquiry: <Badge tone={p.enquiry.status === 'accepted' ? 'good' : p.enquiry.status === 'sent' ? 'warn' : 'neutral'}>{p.enquiry.status}</Badge> <span className="text-xs text-slate-500">{dateIN(p.enquiry.created_at)}</span></p>}
            {p.enquiry?.status === 'sent' && <div className="mt-3"><Alert tone="info">Enquiry sent. You will be notified when the candidate replies; their contact details unlock if they accept.</Alert></div>}
            {!p.allow_contact ? <p className="mt-3 text-sm text-slate-500">This candidate is not accepting enquiries right now.</p> : p.enquiry?.status !== 'sent' && (
              <ActionForm action={sendEnquiry} submit="Send to candidate" variant="accent" className="mt-4 border-t border-slate-100 pt-4" resetOnSuccess>
                <input type="hidden" name="candidate_id" value={id} />
                <Field label="Type"><Select name="kind" options={[{ value: 'enquiry', label: 'Enquiry about a role' }, { value: 'interview_request', label: 'Interview request' }]} /></Field>
                <Field label="Subject"><input name="subject" required maxLength={150} className="input" placeholder="Role title and location" /></Field>
                <Field label="Message" hint="Describe the role, location and, for interviews, proposed times."><textarea name="message" required rows={4} maxLength={4000} className="input" /></Field>
              </ActionForm>
            )}
          </Card>
          <Card title="Resume">
            {p.resumes === null ? <p className="text-sm text-slate-600">The candidate has not enabled resume downloads.</p> : p.resumes.length === 0 ? <p className="text-sm text-slate-500">No resume uploaded.</p> : (
              <ul className="space-y-2 text-sm">{p.resumes.map((r: { id: string; label: string; updated_at: string }) => (
                <li key={r.id}><a className="font-medium text-accent-700 hover:underline" href={`/api/resumes/${r.id}/download`}>Download “{r.label}”</a><span className="block text-xs text-slate-500">updated {dateIN(r.updated_at)} · the candidate is notified</span></li>))}</ul>)}
          </Card>
          <Card title="Your pipeline">
            <ActionForm action={setStage} submit="Save">
              <input type="hidden" name="candidate_id" value={id} />
              <Field label="Stage"><Select name="stage" defaultValue={p.pipeline?.stage ?? 'shortlisted'} options={Object.entries(STAGES).map(([value, label]) => ({ value, label }))} /></Field>
              <Field label="Internal notes" hint="Visible only to your company."><textarea name="notes" rows={3} defaultValue={p.pipeline?.notes ?? ''} className="input" maxLength={2000} /></Field>
            </ActionForm>
          </Card>
        </aside>
      </div>
    </>
  );
}
