'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/forms';
import { asUser, dbMessage } from '@/lib/db';
import { brand } from '@/lib/brand';
import { env, oauthProviders } from '@/lib/env';
import { getSessionUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const password = z.string().min(10, 'Use at least 10 characters for your password.').max(72);
const phone = z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number.');
const name = z.string().trim().min(2, 'Enter your full name.').max(100);
const firstError = (e: z.ZodError) => e.issues[0]?.message ?? 'Please check the form.';
const safeNext = (v: unknown) => (typeof v === 'string' && /^\/(?!\/)[\w\-/?=&%.]*$/.test(v) ? v : '/dashboard');

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ email, password: z.string().min(1).max(72) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Enter your email and password.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.code === 'email_not_confirmed' ? 'Please confirm your email first. Check your inbox for the link.' : 'Incorrect email or password.' };
  redirect(safeNext(fd.get('next')));
}

export async function otpRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = email.safeParse(fd.get('email'));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const supabase = await supabaseServer();
  await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: false } });
  // Same answer whether or not the account exists, so the form cannot be used to probe for members.
  return { ok: true, message: 'If that email has an account, a 6-digit code is on its way. Enter it below.' };
}

export async function otpVerifyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ email, token: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.') }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: 'email' });
  if (error) return { error: 'That code is incorrect or has expired.' };
  redirect('/dashboard');
}

async function signUp(data: { email: string; password: string }, meta: Record<string, unknown>): Promise<ActionState> {
  const supabase = await supabaseServer();
  const { data: res, error } = await supabase.auth.signUp({
    ...data, options: { data: { ...meta, terms_version: brand.legalVersion }, emailRedirectTo: `${env.siteUrl}/auth/confirm` },
  });
  if (error) return { error: error.code === 'weak_password' ? 'Please choose a stronger password.' : error.code === 'over_email_send_rate_limit' ? 'Too many attempts. Please try again in a few minutes.' : 'We could not create your account. Please try again.' };
  if (res.session) redirect('/dashboard');
  // Supabase returns an obfuscated user for an already-registered email; the message stays the same on purpose.
  return { ok: true, message: 'Almost there. We have emailed you a confirmation link. Open it to activate your account.' };
}

const terms = z.literal('on', { error: 'Please accept the Terms of Service and Privacy Policy to continue.' });

export async function signupCandidateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({
    full_name: name, email, password, phone, terms,
    city: z.string().trim().min(2, 'Enter your current city.').max(80),
    region_id: z.string().max(10).optional(),
    industry_id: z.coerce.number().int().positive('Select your industry.'),
    specialisation_ids: z.string().optional(),
    total_exp_years: z.coerce.number().min(0).max(60),
    employment_status: z.string().max(80).optional(),
    availability: z.enum(['immediate', 'within_7_days', 'within_15_days', 'within_30_days'], { error: 'Tell us when you can join.' }),
    earliest_joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  return signUp({ email: d.email, password: d.password }, {
    role: 'candidate', full_name: d.full_name, phone: d.phone, city: d.city, region_id: /^\d+$/.test(d.region_id ?? '') ? d.region_id : '', industry_id: String(d.industry_id),
    specialisation_id: d.specialisation_ids ?? '', total_exp_years: String(d.total_exp_years), employment_status: d.employment_status ?? '',
    availability: d.availability, earliest_joining_date: d.earliest_joining_date ?? '',
  });
}

export async function signupEmployerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ full_name: name, email, password, phone, terms }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  return signUp({ email: d.email, password: d.password }, { role: 'employer', full_name: d.full_name, phone: d.phone });
}

export async function oauthAction(fd: FormData): Promise<void> {
  const provider = String(fd.get('provider') ?? '');
  if (!oauthProviders().some((p) => p.id === provider)) redirect('/login?error=provider');
  const supabase = await supabaseServer();
  // Identity scopes only (openid/profile/email). We never request contacts, posts or profile-data APIs.
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: provider as never, options: { redirectTo: `${env.siteUrl}/auth/callback` } });
  if (error || !data.url) redirect('/login?error=provider');
  redirect(data.url);
}

export async function forgotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = email.safeParse(fd.get('email'));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const supabase = await supabaseServer();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${env.siteUrl}/auth/confirm?next=/reset-password` });
  return { ok: true, message: 'If that email has an account, a password reset link is on its way.' };
}

export async function resetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = password.safeParse(fd.get('password'));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: 'Your reset link has expired. Please request a new one.' };
  redirect('/dashboard');
}

export async function chooseRoleAction(fd: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const role = fd.get('role') === 'employer' ? 'employer' : 'candidate';
  try {
    await asUser(user.id, async (tx) => {
      await tx`select set_my_role(${role})`;
      await tx`insert into consents (user_id, purpose, version, granted) values (${user.id}, 'terms', ${brand.legalVersion}, true), (${user.id}, 'privacy', ${brand.legalVersion}, true)`;
    });
  } catch (e) { console.error(dbMessage(e)); }
  redirect('/dashboard');
}
