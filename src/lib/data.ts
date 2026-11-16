import { cache } from 'react';
import { asAnon, db } from './db';

export type Industry = { id: number; slug: string; name: string };
export type Plan = { id: number; code: string; audience: 'candidate' | 'employer'; name: string; amount_paise: number; gst_mode: string; gst_rate: string; provider_plan_id: string | null };

export const getIndustries = cache(async (): Promise<Industry[]> =>
  asAnon(async (tx) => (await tx`select id, slug, name from industries where is_active order by sort_order, name`) as unknown as Industry[]));

export const getPlans = cache(async (): Promise<Plan[]> =>
  asAnon(async (tx) => (await tx`select id, code, audience, name, amount_paise, gst_mode, gst_rate, provider_plan_id from plans where is_active order by amount_paise`) as unknown as Plan[]));

export type PublicStats = { listed_candidates: number; verified_employers: number; industries: number; by_industry: Record<string, number>; by_region?: Record<string, number>; walkins_by_region?: Record<string, number> };
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

export type Region = { id: number; slug: string; name: string };
export const getRegions = cache(async (): Promise<Region[]> =>
  asAnon(async (tx) => (await tx`select id, slug, name from regions where is_active order by sort_order`) as unknown as Region[]));

/** Today's calendar date in India, as YYYY-MM-DD. */
export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export type Walkin = {
  id: string; region_slug: string; region_name: string; company_name: string; role_title: string; summary: string | null; industry: string | null;
  experience_text: string | null; qualification_text: string | null; salary_text: string | null; skills: string[]; openings: number | null;
  start_date: string; end_date: string; time_text: string | null; venue: string | null; address: string | null; how_to_attend: string | null;
  source_type: 'employer' | 'admin' | 'web'; source_name: string | null; source_url: string | null; verified: boolean;
};
/** Published walk-ins happening from today (IST) through the next `days` days, optionally for one region. */
export async function getWalkins(regionId?: number, days = 7): Promise<Walkin[]> {
  const today = todayIST();
  return asAnon(async (tx) => (await tx`
    select w.id, r.slug region_slug, r.name region_name, w.company_name, w.role_title, w.summary, i.name industry, w.experience_text, w.qualification_text,
      w.salary_text, w.skills, w.openings, w.start_date::text, w.end_date::text, w.time_text, w.venue, w.address, w.how_to_attend,
      w.source_type, w.source_name, w.source_url, w.verified
    from walkins w join regions r on r.id = w.region_id left join industries i on i.id = w.industry_id
    where w.status = 'published' and w.end_date >= ${today}::date and w.start_date <= ${today}::date + ${days}::int
      ${regionId ? tx`and w.region_id = ${regionId}` : tx``}
    order by greatest(w.start_date, ${today}::date), w.verified desc, w.company_name limit 300`) as unknown as Walkin[]);
}

/** Launch offer: candidate listing is free before launch and for `days` days after the admin starts the clock. */
export async function getLaunch(): Promise<{ free: boolean; started: Date | null; endsAt: Date | null; days: number }> {
  const s = await getSettings();
  const days = Number(s.launch_free_days ?? 60);
  const started = typeof s.launch_started_at === 'string' ? new Date(s.launch_started_at) : null;
  const endsAt = started ? new Date(started.getTime() + days * 86400000) : null;
  return { free: !endsAt || endsAt > new Date(), started, endsAt, days };
}
