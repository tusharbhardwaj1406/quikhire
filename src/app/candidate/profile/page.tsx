import { ActionForm, SubmitButton, TagInput, TaxonomyPicker } from '@/components/forms';
import { Card, Check, Field, PageHeader, Select } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { AVAILABILITY, EMPLOYMENT_STATUS, EMPLOYMENT_TYPES, WORK_MODES, dateIN } from '@/lib/brand';
import { getIndustries, getRegions } from '@/lib/data';
import { asUser } from '@/lib/db';
import { addCertification, addExperience, deleteItem, saveAvailability, saveBasics, saveExpertise, saveSalary } from '../actions';

const d = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : '');

export default async function ProfilePage() {
  const user = await requireRole('candidate');
  const [industries, regions] = await Promise.all([getIndustries(), getRegions()]);
  const { c, p, specs, skills, exps, certs } = await asUser(user.id, async (tx) => ({
    c: (await tx`select * from candidates where user_id = ${user.id}`)[0],
    p: (await tx`select full_name, phone, email from profiles where id = ${user.id}`)[0],
    specs: await tx`select specialisation_id from candidate_specialisations where candidate_id = ${user.id}`,
    skills: await tx`select s.name::text as name, k.kind from candidate_skills k join skills s on s.id = k.skill_id where k.candidate_id = ${user.id} order by s.name`,
    exps: await tx`select * from experiences where candidate_id = ${user.id} order by start_date desc`,
    certs: await tx`select * from certifications where candidate_id = ${user.id} order by year desc nulls last`,
  }));
  return (
    <>
      <PageHeader title="Your profile" sub={`Completeness ${c.profile_completeness}%. Each section saves on its own.`} />
      <div className="space-y-6">
        <Card title="Basics" id="basics">
          <ActionForm action={saveBasics}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><input name="full_name" defaultValue={p.full_name} required className="input" /></Field>
              <Field label="Mobile number" hint={`Email: ${p.email}`}><input name="phone" type="tel" defaultValue={p.phone ?? ''} className="input" /></Field>
              <Field label="Current or most recent designation"><input name="current_designation" defaultValue={c.current_designation ?? ''} className="input" placeholder="e.g. Senior Structural Engineer" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Total experience (yrs)"><input name="total_exp_years" type="number" step={0.5} min={0} max={60} defaultValue={c.total_exp_years ?? ''} className="input" /></Field>
                <Field label="Relevant (yrs)"><input name="relevant_exp_years" type="number" step={0.5} min={0} max={60} defaultValue={c.relevant_exp_years ?? ''} className="input" /></Field>
              </div>
              <Field label="Region"><Select name="region_id" defaultValue={c.region_id ?? ''} placeholder="Elsewhere in India" options={regions.map((r) => ({ value: r.id, label: r.name }))} /></Field>
              <Field label="City or locality"><input name="city" defaultValue={c.city ?? ''} className="input" /></Field>
              <Field label="State"><input name="state" defaultValue={c.state ?? ''} className="input" /></Field>
              <Field label="Preferred work locations" hint="Separate with commas." className="sm:col-span-2"><input name="preferred_locations" defaultValue={(c.preferred_locations ?? []).join(', ')} className="input" placeholder="Delhi NCR, Pune, Remote" /></Field>
              <Field label="Professional summary" hint="A few lines on what you do best (80+ characters)." className="sm:col-span-2"><textarea name="summary" rows={4} defaultValue={c.summary ?? ''} className="input" maxLength={2000} /></Field>
              <Field label="Highest qualification"><input name="highest_qualification" defaultValue={c.highest_qualification ?? ''} className="input" placeholder="B.Tech Civil Engineering" /></Field>
              <div className="grid grid-cols-[1fr_7rem] gap-4">
                <Field label="University / institute"><input name="university" defaultValue={c.university ?? ''} className="input" /></Field>
                <Field label="Year"><input name="graduation_year" type="number" min={1950} max={2100} defaultValue={c.graduation_year ?? ''} className="input" /></Field>
              </div>
              <Field label="LinkedIn profile"><input name="linkedin_url" type="url" defaultValue={c.linkedin_url ?? ''} className="input" placeholder="https://www.linkedin.com/in/…" /></Field>
              <Field label="Portfolio"><input name="portfolio_url" type="url" defaultValue={c.portfolio_url ?? ''} className="input" placeholder="https://" /></Field>
            </div>
          </ActionForm>
        </Card>

        <Card title="Industry, specialisations and skills" id="expertise">
          <ActionForm action={saveExpertise}>
            <TaxonomyPicker industries={industries} industryId={c.industry_id} selected={specs.map((s) => s.specialisation_id)} multiple required />
            <TagInput name="skills" label="Technical skills" initial={skills.filter((s) => s.kind === 'skill').map((s) => s.name)} placeholder="e.g. Prestressed concrete design, AASHTO, Java" />
            <TagInput name="software" label="Software and tools" initial={skills.filter((s) => s.kind === 'software').map((s) => s.name)} placeholder="e.g. MIDAS Civil, Primavera P6, AWS" />
          </ActionForm>
        </Card>

        <Card title="Availability and preferences" id="availability">
          <ActionForm action={saveAvailability} submit="Save and confirm availability" variant="accent">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="When can you join?"><Select name="availability" required defaultValue={c.availability ?? ''} placeholder="Select" options={Object.entries(AVAILABILITY).map(([value, label]) => ({ value, label }))} /></Field>
              <Field label="Earliest joining date"><input name="earliest_joining_date" type="date" defaultValue={d(c.earliest_joining_date)} className="input" /></Field>
              <Field label="Last working date" hint="If applicable."><input name="last_working_date" type="date" defaultValue={d(c.last_working_date)} className="input" /></Field>
              <Field label="Current situation" hint="Optional."><Select name="employment_status" defaultValue={c.employment_status ?? ''} options={EMPLOYMENT_STATUS} placeholder="Prefer not to say" /></Field>
              <Field label="Anything you would like to add" hint="Optional. Not shown to employers." className="sm:col-span-2"><input name="availability_reason" defaultValue={c.availability_reason ?? ''} className="input" maxLength={300} /></Field>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Check name="currently_employed" defaultChecked={c.currently_employed} label="I am currently employed" />
              <Check name="serving_notice" defaultChecked={c.serving_notice} label="I am serving a notice period" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset><legend className="label">Employment type</legend><div className="flex flex-wrap gap-x-6 gap-y-2">
                {Object.entries(EMPLOYMENT_TYPES).map(([v, l]) => <Check key={v} name="employment_types" value={v} defaultChecked={c.employment_types.includes(v)} label={l} />)}</div></fieldset>
              <fieldset><legend className="label">Work mode</legend><div className="flex flex-wrap gap-x-6 gap-y-2">
                {Object.entries(WORK_MODES).map(([v, l]) => <Check key={v} name="work_modes" value={v} defaultChecked={c.work_modes.includes(v)} label={l} />)}</div></fieldset>
            </div>
          </ActionForm>
        </Card>

        <Card title="Salary" id="salary">
          <p className="mb-4 text-sm text-slate-600">Annual CTC in rupees. Hidden from employers unless you switch on “Show salary” in Privacy &amp; settings. Your minimum acceptable figure is never shown to anyone.</p>
          <ActionForm action={saveSalary}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Last drawn CTC (₹/year)"><input name="last_ctc" type="number" min={0} step={1000} defaultValue={c.last_ctc ?? ''} className="input" /></Field>
              <Field label="Expected CTC (₹/year)"><input name="expected_ctc" type="number" min={0} step={1000} defaultValue={c.expected_ctc ?? ''} className="input" /></Field>
              <Field label="Minimum acceptable (optional)"><input name="min_ctc" type="number" min={0} step={1000} defaultValue={c.min_ctc ?? ''} className="input" /></Field>
            </div>
            <Check name="ctc_negotiable" defaultChecked={c.ctc_negotiable} label="Negotiable" />
          </ActionForm>
        </Card>

        <Card title="Employment history" id="experience">
          {exps.length > 0 && (
            <ul className="mb-6 divide-y divide-slate-100">
              {exps.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-4 py-3">
                  <div><p className="font-semibold text-navy-900">{e.designation} · {e.employer_name}</p>
                    <p className="text-sm text-slate-500">{dateIN(e.start_date)} – {e.end_date ? dateIN(e.end_date) : 'Present'}</p>
                    {e.projects && <p className="mt-1 text-sm text-slate-600">{e.projects}</p>}</div>
                  <form action={deleteItem}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="kind" value="experience" /><SubmitButton variant="danger" small confirm="Remove this entry?">Remove</SubmitButton></form>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addExperience} submit="Add experience" variant="outline" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Employer"><input name="employer_name" required className="input" /></Field>
              <Field label="Designation"><input name="designation" required className="input" /></Field>
              <Field label="Start"><input name="start_date" type="month" required className="input" /></Field>
              <Field label="End" hint="Leave blank if this is your current role."><input name="end_date" type="month" className="input" /></Field>
              <Field label="Responsibilities" className="sm:col-span-2"><textarea name="responsibilities" rows={2} className="input" /></Field>
              <Field label="Major projects"><textarea name="projects" rows={2} className="input" /></Field>
              <Field label="Achievements"><textarea name="achievements" rows={2} className="input" /></Field>
              <Field label="Reason for leaving" hint="Optional and private: never shown to employers." className="sm:col-span-2"><input name="reason_for_leaving" className="input" /></Field>
            </div>
          </ActionForm>
        </Card>

        <Card title="Certifications" id="certifications">
          {certs.length > 0 && (
            <ul className="mb-6 divide-y divide-slate-100">
              {certs.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span><span className="font-medium text-navy-900">{x.name}</span>{x.issuer && ` · ${x.issuer}`}{x.year && ` · ${x.year}`}</span>
                  <form action={deleteItem}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="kind" value="certification" /><SubmitButton variant="danger" small>Remove</SubmitButton></form>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addCertification} submit="Add certification" variant="outline" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
              <Field label="Certification"><input name="name" required className="input" placeholder="e.g. CPEng, PMP, AWS Solutions Architect" /></Field>
              <Field label="Issuer"><input name="issuer" className="input" /></Field>
              <Field label="Year"><input name="year" type="number" min={1950} max={2100} className="input" /></Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
