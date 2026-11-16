import { cache } from 'react';
import { asAnon, db } from './db';

export type Industry = { id: number; slug: string; name: string };
export type Plan = { id: number; code: string; audience: 'candidate' | 'employer'; name: string; amount_paise: number; gst_mode: string; gst_rate: string; provider_plan_id: string | null };

export const getIndustries = cache(async (): Promise<Industry[]> =>
  asAnon(async (tx) => (await tx`select id, slug, name from industries where is_active order by sort_order, name`) as unknown as Industry[]));

export const getPlans = cache(async (): Promise<Plan[]> =>
  asAnon(async (tx) => (await tx`select id, code, audience, name, amount_paise, gst_mode, gst_rate, provider_plan_id from plans where is_active order by amount_paise`) as unknown as Plan[]));

export type PublicStats = { listed_candidates: number; verified_employers: number; industries: number; by_industry: Record<string, number> };
/** Real aggregate counts only. Returns null if the database is unreachable (e.g. during a build). */
export async function getPublicStats(): Promise<PublicStats | null> {
  try { return await asAnon(async (tx) => (await tx`select public_stats() s`)[0].s as PublicStats); } catch { return null; }
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const rows = await db()`select key, value from platform_settings`;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Shared billing snapshot for a candidate (userId) or an employer (employerId). */
export async function getBilling(target: { userId?: string; employerId?: string }) {
  const sql = db();
  const [sub] = target.userId
    ? await sql`select s.*, p.name plan_name, p.amount_paise from subscriptions s join plans p on p.id = s.plan_id where s.owner_user_id = ${target.userId} order by (s.access_until > now()) desc nulls last, s.created_at desc limit 1`
    : await sql`select s.*, p.name plan_name, p.amount_paise from subscriptions s join plans p on p.id = s.plan_id where s.employer_id = ${target.employerId ?? null} order by (s.access_until > now()) desc nulls last, s.created_at desc limit 1`;
  const payments = sub ? await sql`select invoice_number, amount_paise, tax_paise, status, method, paid_at, created_at, refunded_paise
    from payments where subscription_id in (select id from subscriptions where ${target.userId ? sql`owner_user_id = ${target.userId}` : sql`employer_id = ${target.employerId ?? null}`})
    order by created_at desc limit 24` : [];
  const live = Boolean(sub?.access_until && new Date(sub.access_until) > new Date());
  return { sub, payments, live };
}
