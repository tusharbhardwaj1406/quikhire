import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';
import { db } from './db';

export type Role = 'candidate' | 'employer' | 'admin';
export type SessionUser = { id: string; email: string; role: Role | null; status: string; fullName: string };

/** The signed-in user, verified with Supabase Auth on every request (never trusted from the cookie alone). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const [p] = await db()`select role, status, full_name from profiles where id = ${data.user.id}`;
  if (!p) return null;
  return { id: data.user.id, email: data.user.email ?? '', role: p.role, status: p.status, fullName: p.full_name };
});

export function homeFor(role: Role | null): string {
  return role === 'candidate' ? '/candidate' : role === 'employer' ? '/employer' : role === 'admin' ? '/admin' : '/onboarding/role';
}

/** Gate for every portal page, server action and API route. */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.status === 'suspended') redirect('/account-suspended');
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}
