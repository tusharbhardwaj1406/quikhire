import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/forms';
import { SocialButtons } from '@/components/social';
import { Card, Field } from '@/components/ui';
import { loginAction, otpRequestAction, otpVerifyAction } from '../actions';

export const metadata: Metadata = { title: 'Log in', robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; mode?: string }> }) {
  const sp = await searchParams;
  const otp = sp.mode === 'code';
  return (
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">Log in to your QuikHire account.</p>
      {sp.error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">We could not sign you in. Please try again.</p>}
      {!otp ? (
        <ActionForm action={loginAction} submit="Log in">
          <input type="hidden" name="next" value={sp.next ?? ''} />
          <Field label="Email"><input name="email" type="email" autoComplete="email" required className="input" /></Field>
          <Field label="Password"><input name="password" type="password" autoComplete="current-password" required className="input" /></Field>
        </ActionForm>
      ) : (
        <div className="space-y-6">
          <ActionForm action={otpRequestAction} submit="Email me a code" variant="outline">
            <Field label="Email"><input name="email" type="email" autoComplete="email" required className="input" /></Field>
          </ActionForm>
          <ActionForm action={otpVerifyAction} submit="Verify and log in">
            <Field label="Email"><input name="email" type="email" autoComplete="email" required className="input" /></Field>
            <Field label="6-digit code"><input name="token" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required className="input tracking-widest" /></Field>
          </ActionForm>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <Link href={otp ? '/login' : '/login?mode=code'} className="font-medium text-accent-700 hover:underline">{otp ? 'Use password instead' : 'Log in with an email code'}</Link>
        <Link href="/forgot-password" className="text-slate-600 hover:underline">Forgot password?</Link>
      </div>
      <SocialButtons />
      <p className="mt-6 text-center text-sm text-slate-600">New here? <Link href="/signup/candidate" className="font-medium text-accent-700 hover:underline">I&rsquo;m a candidate</Link> · <Link href="/signup/employer" className="font-medium text-accent-700 hover:underline">I&rsquo;m hiring</Link></p>
    </Card>
  );
}
