'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/forms';
import { requireRole } from '@/lib/auth';
import { audit, db, dbMessage } from '@/lib/db';
import { flushNotificationEmails } from '@/lib/notify';
import { paymentProvider } from '@/lib/payments';
import { removeObject } from '@/lib/storage';
import { supabaseAdmin } from '@/lib/supabase/server';

// Every action: (1) re-checks the admin role server-side, (2) uses the trusted connection, (3) writes an audit entry.
const uuid = z.string().uuid();
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fail = (e: unknown): ActionState => ({ error: e instanceof z.ZodError ? e.issues[0]?.message ?? 'Please check the form.' : dbMessage(e) });

export async function verifyEmployer(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole('admin');
  try {
    const d = z.object({ id: uuid, decision: z.enum(['verified', 'rejected', 'suspended', 'pending']), notes: z.string().trim().max(500).optional() }).parse(Object.fromEntries(fd));
    if (d.decision !== 'verified' && !d.notes) return { error: 'Add a short note explaining the decision; the employer will see it.' };
    const sql = db();
    await sql`update employers set verification_status = ${d.decision}, verification_notes = ${d.notes || null},
      verified_at = ${d.decision === 'verified' ? sql`now()` : null}, verified_by = ${admin.id} where id = ${d.id}`;
    const members = await sql`insert into notifications (user_id, type, title, body, link)
      select user_id, 'employer.verification', ${d.decision === 'verified' ? 'Your company is verified' : `Verification update: ${d.decision}`},
        ${d.decision === 'verified' ? 'You can now subscribe and start searching for candidates.' : d.notes ?? ''}, '/employer'
      from employer_members where employer_id = ${d.id} returning user_id`;
    await audit(admin.id, `employer.${d.decision}`, 'employer', d.id, { notes: d.notes });
    await flushNotificationEmails(members.map((m) => m.user_id)).catch(() => 0);
  } catch (e) { return fail(e); }
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'Decision recorded and the employer notified.' };
}

export async function userAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole('admin');
  try {
    const d = z.object({ id: uuid, op: z.enum(['suspend', 'reinstate', 'verify_availability', 'unverify_availability', 'grant_access', 'delete']), days: z.coerce.number().int().min(1).max(366).optional(), reason: z.string().trim().max(300).optional() }).parse(Object.fromEntries(fd));
    if (d.id === admin.id) return { error: 'You cannot change your own account here.' };
    const sql = db();
    const [target] = await sql`select p.id, p.role, p.status, m.employer_id from profiles p left join employer_members m on m.user_id = p.id where p.id = ${d.id}`;
    if (!target) return { error: 'User not found.' };
    switch (d.op) {
      case 'suspend': case 'reinstate':
        await sql`update profiles set status = ${d.op === 'suspend' ? 'suspended' : 'active'} where id = ${d.id}`; break;
      case 'verify_availability': case 'unverify_availability':
        await sql`update candidates set availability_verification = ${d.op === 'verify_availability' ? 'verified' : 'self_declared'} where user_id = ${d.id}`; break;
      case 'grant_access': {   // complimentary access (pilots, support cases). Recorded as provider = 'manual'; never touches the gateway.
        const days = d.days ?? 30;
        if (target.role === 'employer' && !target.employer_id) return { error: 'This recruiter has not registered a company yet.' };
        await sql`insert into subscriptions (plan_id, owner_user_id, employer_id, status, provider, provider_subscription_id, current_period_start, current_period_end, access_until, autopay_consent_at, created_by)
          select id, ${target.role === 'candidate' ? d.id : null}, ${target.role === 'employer' ? target.employer_id : null}, 'active', 'manual', ${'manual_' + crypto.randomUUID()},
            now(), now() + make_interval(days => ${days}), now() + make_interval(days => ${days}), now(), ${admin.id}
          from plans where audience = ${target.role} and is_active order by id limit 1`;
        break;
      }
      case 'delete': {         // permanent erasure: storage objects first, then the auth user (cascades to all profile data)
        if (target.status !== 'deletion_requested') return { error: 'Only accounts that have requested deletion can be erased here.' };
        const files = await sql`select storage_path from resumes where candidate_id = ${d.id}`;
        for (const f of files) await removeObject(f.storage_path).catch(() => {});
        const { error } = await supabaseAdmin().auth.admin.deleteUser(d.id);
        if (error) return { error: `Could not delete the login: ${error.message}` };
        break;
      }
    }
    await audit(admin.id, `user.${d.op}`, 'profile', d.id, { days: d.days, reason: d.reason });
  } catch (e) { return fail(e); }
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'Done.' };
}

export async function taxonomyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole('admin');
  try {
    const op = String(fd.get('op'));
    const name = String(fd.get('name') ?? '').trim().slice(0, 120);
    const id = Number(fd.get('id')) || 0, intoId = Number(fd.get('into_id')) || 0, industryId = Number(fd.get('industry_id')) || 0;
    const sql = db();
    if (op === 'add_industry') { if (name.length < 2) return { error: 'Enter a name.' };
      await sql`insert into industries (slug, name, sort_order) values (${slug(name)}, ${name}, (select coalesce(max(sort_order), 0) + 1 from industries))`; }
    else if (op === 'rename_industry') await sql`update industries set name = ${name} where id = ${id}`;
    else if (op === 'toggle_industry') await sql`update industries set is_active = not is_active where id = ${id}`;
    else if (op === 'merge_industry') { if (!id || !intoId || id === intoId) return { error: 'Choose two different industries.' };
      await sql.begin(async (tx) => {
        await tx`update candidates set industry_id = ${intoId} where industry_id = ${id}`;
        await tx`update employers set industry_id = ${intoId} where industry_id = ${id}`;
        await tx`update functional_domains d set industry_id = ${intoId} where industry_id = ${id} and not exists (select 1 from functional_domains x where x.industry_id = ${intoId} and x.slug = d.slug)`;
        await tx`update specialisations s set industry_id = ${intoId} where industry_id = ${id} and not exists (select 1 from specialisations x where x.industry_id = ${intoId} and x.slug = s.slug)`;
        await tx`delete from industries where id = ${id}`;
      }); }
    else if (op === 'delete_industry') { const [{ n }] = await sql`select count(*)::int n from candidates where industry_id = ${id}`;
      if (n > 0) return { error: `${n} candidate(s) use this industry. Merge it into another instead.` };
      await sql`delete from industries where id = ${id}`; }
    else if (op === 'add_specialisation') { if (name.length < 2 || !industryId) return { error: 'Choose an industry and enter a name.' };
      const domain = String(fd.get('domain') ?? '').trim().slice(0, 120);
      const [dom] = domain ? await sql`insert into functional_domains (industry_id, slug, name) values (${industryId}, ${slug(domain)}, ${domain})
        on conflict (industry_id, slug) do update set name = excluded.name returning id` : [null];
      await sql`insert into specialisations (industry_id, domain_id, slug, name) values (${industryId}, ${dom?.id ?? null}, ${slug(name)}, ${name})`; }
    else if (op === 'rename_specialisation') await sql`update specialisations set name = ${name} where id = ${id}`;
    else if (op === 'toggle_specialisation') await sql`update specialisations set is_active = not is_active where id = ${id}`;
    else if (op === 'merge_specialisation') { if (!id || !intoId || id === intoId) return { error: 'Choose two different specialisations.' };
      await sql.begin(async (tx) => {
        await tx`insert into candidate_specialisations (candidate_id, specialisation_id) select candidate_id, ${intoId} from candidate_specialisations where specialisation_id = ${id} on conflict do nothing`;
        await tx`delete from specialisations where id = ${id}`;
      }); }
    else if (op === 'toggle_skill') await sql`update skills set is_active = not is_active where id = ${id}`;
    else if (op === 'merge_skill') { if (!id || !intoId || id === intoId) return { error: 'Choose two different skills.' };
      await sql.begin(async (tx) => {
        await tx`insert into candidate_skills (candidate_id, skill_id, kind) select candidate_id, ${intoId}, kind from candidate_skills where skill_id = ${id} on conflict do nothing`;
        await tx`delete from skills where id = ${id}`;
      }); }
    else return { error: 'Unknown action.' };
    await audit(admin.id, `taxonomy.${op}`, 'taxonomy', String(id || industryId), { name, intoId });
  } catch (e) { return fail(e); }
  revalidatePath('/admin/taxonomy'); revalidatePath('/', 'layout');
  return { ok: true, message: 'Taxonomy updated.' };
}

export async function savePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole('admin');
  try {
    const d = z.object({ id: z.coerce.number().int(), amount: z.coerce.number().min(1, 'Enter a price.').max(1000000), gst_mode: z.enum(['inclusive', 'exclusive']), gst_rate: z.coerce.number().min(0).max(40) }).parse(Object.fromEntries(fd));
    // A new price needs a new plan at the gateway, so the stored gateway plan id is cleared. Existing subscribers keep their current mandate amount.
    await db()`update plans set amount_paise = ${Math.round(d.amount * 100)}, gst_mode = ${d.gst_mode}, gst_rate = ${d.gst_rate}, provider_plan_id = null, updated_at = now() where id = ${d.id}`;
    await audit(admin.id, 'plan.updated', 'plan', String(d.id), d);
  } catch (e) { return fail(e); }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Pricing saved. New checkouts use this price; existing subscribers are unaffected until they re-subscribe.' };
}

export async function saveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole('admin');
  try {
    const d = z.object({
      max_joining_window: z.enum(['immediate', 'within_7_days', 'within_15_days', 'within_30_days']),
      availability_reconfirm_days: z.coerce.number().int().min(7).max(60), subscription_grace_days: z.coerce.number().int().min(0).max(15),
      enquiries_per_day: z.coerce.number().int().min(1).max(500),
    }).parse(Object.fromEntries(fd));
    const values = { ...d, require_candidate_subscription: fd.get('require_candidate_subscription') === 'on' };
    const sql = db();
    for (const [k, v] of Object.entries(values)) await sql`insert into platform_settings (key, value) values (${k}, ${sql.json(v as never)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
    await sql`select refresh_all_listings()`;
    await audit(admin.id, 'settings.updated', 'settings', undefined, values);
  } catch (e) { return fail(e); }
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'Settings saved and listings refreshed.' };
}

export async function refundPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole('admin');
  try {
    const id = uuid.parse(fd.get('id'));
    const provider = paymentProvider();
    const [p] = await db()`select provider, provider_payment_id, amount_paise, status from payments where id = ${id}`;
    if (!p || p.status !== 'captured') return { error: 'Only captured payments can be refunded.' };
    if (!provider || provider.name !== p.provider) return { error: 'The payment gateway is not connected.' };
    await provider.refund(p.provider_payment_id);   // the refund.processed webhook records the result
    await audit(admin.id, 'payment.refund_requested', 'payment', id, { amount_paise: p.amount_paise });
  } catch (e) { return fail(e); }
  revalidatePath('/admin/payments');
  return { ok: true, message: 'Refund requested at the gateway. It will show here once confirmed.' };
}

export async function resolveReport(fd: FormData): Promise<void> {
  const admin = await requireRole('admin');
  const id = Number(fd.get('id')), status = fd.get('status') === 'dismissed' ? 'dismissed' : 'resolved';
  await db()`update reports set status = ${status} where id = ${id}`;
  await audit(admin.id, `report.${status}`, 'report', String(id));
  revalidatePath('/admin/trust');
}
