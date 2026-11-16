import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm, TaxonomyPicker } from '@/components/forms';
import { Card, Check, Field, Select } from '@/components/ui';
import { AVAILABILITY, EMPLOYMENT_STATUS } from '@/lib/brand';
import { getIndustries, getRegions } from '@/lib/data';
import { SocialButtons } from '@/components/social';
import { signupCandidateAction } from '../../actions';

export const metadata: Metadata = { title: 'Create your candidate profile', description: 'Available to join immediately? Create your profile and get discovered by verified employers.', alternates: { canonical: '/signup/candidate' } };

export const revalidate = 600;

export default async function SignupCandidate() {
  const [industries, regions] = await Promise.all([getIndustries().catch(() => []), getRegions().catch(() => [])]);
  return (
    <Card className="w-full max-w-2xl">
      <h1 className="text-2xl font-bold">Get discovered by employers who need you now</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">Two minutes to start. You can complete the rest of your profile afterwards.</p>
      <ActionForm action={signupCandidateAction} submit="Create my account" variant="accent">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input name="full_name" autoComplete="name" required className="input" /></Field>
          <Field label="Mobile number" hint="Hidden from employers unless you choose to share it."><input name="phone" type="tel" autoComplete="tel" required className="input" placeholder="98XXXXXXXX" /></Field>
          <Field label="Email"><input name="email" type="email" autoComplete="email" required className="input" /></Field>
          <Field label="Password" hint="At least 10 characters."><input name="password" type="password" autoComplete="new-password" minLength={10} required className="input" /></Field>
          <Field label="Region"><Select name="region_id" required placeholder="Select your region" options={[...regions.map((r) => ({ value: r.id, label: r.name })), { value: 'other', label: 'Elsewhere in India' }]} /></Field>
          <Field label="City or locality"><input name="city" autoComplete="address-level2" required className="input" /></Field>
          <Field label="Total experience (years)"><input name="total_exp_years" type="number" min={0} max={60} step={0.5} required className="input" /></Field>
        </div>
        <TaxonomyPicker industries={industries} required />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current situation" hint="Optional. Never shown without your consent."><Select name="employment_status" options={EMPLOYMENT_STATUS} placeholder="Prefer not to say" /></Field>
          <Field label="When can you join?"><Select name="availability" required options={Object.entries(AVAILABILITY).map(([value, label]) => ({ value, label }))} placeholder="Select" /></Field>
          <Field label="Earliest joining date"><input name="earliest_joining_date" type="date" className="input" /></Field>
        </div>
        <Check name="terms" required label={<>I agree to the <Link href="/legal/terms" className="text-accent-700 underline" target="_blank">Terms of Service</Link> and <Link href="/legal/privacy" className="text-accent-700 underline" target="_blank">Privacy Policy</Link>.</>}
          hint="Your profile is shown only to verified employers, and you control which details they can see." />
      </ActionForm>
      <SocialButtons />
      <p className="mt-6 text-center text-sm text-slate-600">Already registered? <Link href="/login" className="font-medium text-accent-700 hover:underline">Log in</Link></p>
    </Card>
  );
}
