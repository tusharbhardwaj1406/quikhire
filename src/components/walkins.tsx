import type { ReactNode } from 'react';
import type { Walkin } from '@/lib/data';
import { Badge, Field, Select } from './ui';

const fmt = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** Full details of one walk-in. Always shows where the information came from and whether we have verified it. */
export function WalkinCard({ w, actions }: { w: Walkin; actions?: ReactNode }) {
  const line = (label: string, value?: string | number | null) => value ? (<div><dt className="text-xs text-slate-500 uppercase">{label}</dt><dd className="mt-0.5 text-sm font-medium text-navy-900">{value}</dd></div>) : null;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-display text-lg font-bold">{w.role_title}</h3><p className="text-sm text-slate-600">{w.company_name}{w.industry ? ` · ${w.industry}` : ''}</p></div>
        {w.verified ? <Badge tone="good">Verified{w.source_type === 'employer' ? ' employer' : ''}</Badge> : <Badge tone="warn">From the web · not verified</Badge>}
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {line('When', `${fmt(w.start_date)}${w.end_date !== w.start_date ? ` – ${fmt(w.end_date)}` : ''}${w.time_text ? `, ${w.time_text}` : ''}`)}
        {line('Venue', [w.venue, w.address].filter(Boolean).join(', ') || `${w.region_name} (see source for address)`)}
        {line('Experience', w.experience_text)}{line('Qualification', w.qualification_text)}{line('Salary', w.salary_text)}{line('Openings', w.openings)}
      </dl>
      {w.summary && <p className="mt-4 text-sm leading-relaxed text-slate-700">{w.summary}</p>}
      {w.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{w.skills.map((s) => <Badge key={s} tone="info">{s}</Badge>)}</div>}
      {w.how_to_attend && <p className="mt-3 rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-800"><strong>How to attend:</strong> {w.how_to_attend}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        {w.source_url ? <a href={w.source_url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-accent-700 hover:underline">{w.source_type === 'web' ? `Original listing${w.source_name ? ` on ${w.source_name}` : ''} ↗` : 'More details ↗'}</a>
          : <span className="text-slate-500">{w.source_type === 'employer' ? 'Posted directly by the employer' : 'Added by our team'}</span>}
        {actions}
      </div>
    </article>
  );
}

export function WalkinSafetyNote() {
  return <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200"><strong>Stay safe:</strong> a genuine employer never asks for money for an interview, a job or “registration”. Confirm the date and venue with the company before you travel, especially for listings marked “not verified”.</p>;
}

export function WalkinFields({ regions, source, company }: { regions: { id: number; name: string }[]; source?: boolean; company?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Region"><Select name="region" required placeholder="Select" options={regions.map((r) => ({ value: r.id, label: r.name }))} /></Field>
      <Field label="Company"><input name="company_name" required className="input" maxLength={160} defaultValue={company} readOnly={Boolean(company)} /></Field>
      <Field label="Role / position" className="sm:col-span-2"><input name="role_title" required className="input" maxLength={200} /></Field>
      <Field label="First day"><input name="start_date" type="date" required className="input" /></Field>
      <Field label="Last day" hint="Leave blank for a one-day drive."><input name="end_date" type="date" className="input" /></Field>
      <Field label="Timing"><input name="time_text" className="input" placeholder="10:00 am – 2:00 pm" /></Field>
      <Field label="Openings"><input name="openings" type="number" min={1} className="input" /></Field>
      <Field label="Venue name"><input name="venue" className="input" /></Field>
      <Field label="Address"><input name="address" className="input" /></Field>
      <Field label="Experience"><input name="experience_text" className="input" placeholder="2–5 years" /></Field>
      <Field label="Qualification"><input name="qualification_text" className="input" /></Field>
      <Field label="Salary"><input name="salary_text" className="input" placeholder="As stated by the employer" /></Field>
      <Field label="Key skills" hint="Comma separated."><input name="skills" className="input" /></Field>
      <Field label="About the role" className="sm:col-span-2"><textarea name="summary" rows={3} maxLength={1500} className="input" /></Field>
      <Field label="How to attend" hint="Documents to carry, who to ask for, registration steps." className="sm:col-span-2"><textarea name="how_to_attend" rows={2} maxLength={800} className="input" /></Field>
      {source && (<>
        <Field label="Source name" hint="e.g. the company careers page"><input name="source_name" className="input" /></Field>
        <Field label="Source link" hint="Required for anything taken from the web."><input name="source_url" type="url" className="input" placeholder="https://" /></Field>
      </>)}
    </div>
  );
}
