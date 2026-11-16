import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/forms';
import { Card, Check, Field } from '@/components/ui';
import { signupEmployerAction } from '../../actions';

export const metadata: Metadata = { title: 'Register as an employer or recruiter', description: 'Hire professionals who can join immediately. Register your company for verification.', alternates: { canonical: '/signup/employer' } };

export default function SignupEmployer() {
  return (
    <Card className="w-full max-w-xl">
      <h1 className="text-2xl font-bold">Hire people who can start now</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">Step 1 of 2: your recruiter login. Next you will add your company details for verification.</p>
      <ActionForm action={signupEmployerAction} submit="Create recruiter account">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your full name"><input name="full_name" autoComplete="name" required className="input" /></Field>
          <Field label="Mobile number"><input name="phone" type="tel" autoComplete="tel" required className="input" placeholder="98XXXXXXXX" /></Field>
          <Field label="Official business email" hint="Use your company domain; it speeds up verification."><input name="email" type="email" autoComplete="email" required className="input" /></Field>
          <Field label="Password" hint="At least 10 characters."><input name="password" type="password" autoComplete="new-password" minLength={10} required className="input" /></Field>
        </div>
        <Check name="terms" required label={<>I agree to the <Link href="/legal/terms" className="text-accent-700 underline" target="_blank">Terms of Service</Link>, <Link href="/legal/privacy" className="text-accent-700 underline" target="_blank">Privacy Policy</Link> and <Link href="/legal/employer-verification" className="text-accent-700 underline" target="_blank">Employer Verification Policy</Link>.</>}
          hint="Candidate information may be used only for genuine hiring, never for unrelated marketing." />
      </ActionForm>
      <p className="mt-6 text-center text-sm text-slate-600">Already registered? <Link href="/login" className="font-medium text-accent-700 hover:underline">Log in</Link></p>
    </Card>
  );
}
