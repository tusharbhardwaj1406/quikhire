import { ActionForm } from '@/components/forms';
import { Badge, Card, Field, PageHeader, Select } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { COMPANY_SIZES } from '@/lib/brand';
import { getIndustries } from '@/lib/data';
import { getEmployerContext } from '@/lib/employer';
import { saveCompany } from '../actions';

export default async function CompanyPage() {
  const user = await requireRole('employer');
  const [{ employer: e, designation }, industries] = await Promise.all([getEmployerContext(user.id), getIndustries()]);
  const v = (k: string) => (e?.[k] as string | number | null | undefined) ?? '';
  return (
    <>
      <PageHeader title="Company details" sub="Used to verify that you are a genuine employer or recruitment agency." action={e && <Badge tone={e.verification_status === 'verified' ? 'good' : e.verification_status === 'pending' ? 'warn' : 'bad'}>{e.verification_status}</Badge>} />
      <Card>
        <ActionForm action={saveCompany} submit={e ? 'Save changes' : 'Submit for verification'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" hint={e?.verification_status === 'verified' ? 'Changing the legal name or registration number triggers re-verification.' : undefined}><input name="name" defaultValue={v('name')} required className="input" /></Field>
            <Field label="Type"><Select name="kind" defaultValue={v('kind') || 'employer'} options={[{ value: 'employer', label: 'Employer (hiring for ourselves)' }, { value: 'agency', label: 'Recruitment agency' }]} /></Field>
            <Field label="Official website"><input name="website" type="url" defaultValue={v('website')} placeholder="https://" className="input" /></Field>
            <Field label="Industry"><Select name="industry_id" defaultValue={v('industry_id')} placeholder="Select" options={industries.map((i) => ({ value: i.id, label: i.name }))} /></Field>
            <Field label="Company size"><Select name="company_size" defaultValue={v('company_size')} placeholder="Select" options={COMPANY_SIZES} /></Field>
            <Field label="Your designation"><input name="designation" defaultValue={designation ?? ''} className="input" placeholder="e.g. Talent Acquisition Lead" /></Field>
            <Field label="Office city"><input name="city" defaultValue={v('city')} required className="input" /></Field>
            <Field label="State"><input name="state" defaultValue={v('state')} className="input" /></Field>
            <Field label="Registration type"><Select name="registration_type" defaultValue={v('registration_type')} placeholder="Select" required
              options={[{ value: 'gstin', label: 'GSTIN' }, { value: 'cin', label: 'CIN (company)' }, { value: 'llpin', label: 'LLPIN' }, { value: 'udyam', label: 'Udyam (MSME)' }, { value: 'other', label: 'Other' }]} /></Field>
            <Field label="Registration number" hint="Checked against public records. Never shown to candidates."><input name="registration_number" defaultValue={v('registration_number')} required className="input uppercase" /></Field>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
