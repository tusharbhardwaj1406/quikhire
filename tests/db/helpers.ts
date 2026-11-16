import { asUser, db } from '@/lib/db';

let n = 0;
export async function createUser(role: 'candidate' | 'employer' | 'admin' | null, meta: Record<string, unknown> = {}) {
  const sql = db();
  const email = `u${Date.now()}_${n++}@test.local`;
  const m = { full_name: `Test ${n}`, ...(role && role !== 'admin' ? { role } : role === 'admin' ? { role: 'admin' } : {}), ...meta };
  const [u] = await sql`insert into auth.users (email, raw_user_meta_data) values (${email}, ${sql.json(m as never)}) returning id`;
  return { id: u.id as string, email };
}

/** Fills the minimum a candidate needs to be eligible for the directory (still needs a subscription). */
export async function completeCandidate(id: string, over: Record<string, unknown> = {}) {
  const sql = db();
  const [ind] = await sql`select id from industries where slug = 'civil-engineering-and-infrastructure'`;
  const [spec] = await sql`select id from specialisations where slug = 'bridge-engineering'`;
  await asUser(id, async (tx) => {
    await tx`update candidates set ${tx({ current_designation: 'Senior Structural Engineer', total_exp_years: 12, industry_id: ind.id,
      city: 'Delhi', availability: 'immediate', expected_ctc: 3000000, summary: 'Bridge design and checking.', ...over } as never)} where user_id = ${id}`;
    await tx`insert into candidate_specialisations (candidate_id, specialisation_id) values (${id}, ${spec.id}) on conflict do nothing`;
    const skills = await tx`select id from skills where name in ('MIDAS Civil', 'AASHTO', 'STAAD.Pro')`;
    for (const s of skills) await tx`insert into candidate_skills (candidate_id, skill_id) values (${id}, ${s.id}) on conflict do nothing`;
  });
}

export async function grantSubscription(target: { userId?: string; employerId?: string }, days = 30) {
  const sql = db();
  const code = target.userId ? 'candidate_monthly' : 'employer_monthly';
  const [s] = await sql`insert into subscriptions (plan_id, owner_user_id, employer_id, status, provider, provider_subscription_id,
      current_period_start, current_period_end, access_until, autopay_consent_at)
    select id, ${target.userId ?? null}, ${target.employerId ?? null}, 'active', 'test', ${'sub_' + Math.random().toString(36).slice(2)},
      now(), now() + make_interval(days => ${days}), now() + make_interval(days => ${days}), now() from plans where code = ${code} returning id`;
  return s.id as string;
}

export async function createEmployer(opts: { verified?: boolean; subscribed?: boolean } = {}) {
  const sql = db();
  const user = await createUser('employer');
  const employerId = await asUser(user.id, async (tx) => {
    const [e] = await tx`insert into employers (name, created_by, registration_type, registration_number)
      values (${'Acme Infra ' + user.id.slice(0, 4)}, ${user.id}, 'gstin', '07AAAAA0000A1Z5') returning id`;
    await tx`insert into employer_members (user_id, employer_id, is_owner) values (${user.id}, ${e.id}, true)`;
    return e.id as string;
  });
  if (opts.verified) await sql`update employers set verification_status = 'verified', verified_at = now() where id = ${employerId}`;
  if (opts.subscribed) await grantSubscription({ employerId });
  return { ...user, employerId };
}

export async function listedCandidate(over: Record<string, unknown> = {}) {
  const u = await createUser('candidate');
  await completeCandidate(u.id, over);
  await grantSubscription({ userId: u.id });
  return u;
}

export const isListed = async (id: string) => (await db()`select listed from candidates where user_id = ${id}`)[0].listed as boolean;
export const search = (userId: string, filters: Record<string, unknown> = {}) =>
  asUser(userId, (tx) => tx`select * from search_candidates(${tx.json(filters as never)}, 50, 0)`);
