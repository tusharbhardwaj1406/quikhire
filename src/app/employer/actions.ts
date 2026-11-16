'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/forms';
import { requireRole } from '@/lib/auth';
import { asUser, dbMessage } from '@/lib/db';
import { getEmployerContext } from '@/lib/employer';
import { flushNotificationEmails } from '@/lib/notify';
import { filterSchema, compact, parseNaturalQuery, toQuery } from '@/lib/search';

const str = (max: number) => z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(max).nullable());
const err = (e: unknown): ActionState => ({ error: e instanceof z.ZodError ? e.issues[0]?.message ?? 'Please check the form.' : dbMessage(e) });

export async function saveCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('employer');
  try {
    const d = z.object({
      name: z.string().trim().min(2, 'Enter the company name.').max(160),
      kind: z.enum(['employer', 'agency']),
      website: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(200).regex(/^https?:\/\/\S+\.\S+$/i, 'Enter the website including https://').nullable()),
      industry_id: z.preprocess((v) => (v ? Number(v) : null), z.number().int().positive().nullable()),
      company_size: str(20), city: z.string().trim().min(2, 'Enter the office city.').max(80), state: str(80),
      registration_type: z.enum(['gstin', 'cin', 'llpin', 'udyam', 'other'], { error: 'Choose a registration type.' }),
      registration_number: z.string().trim().min(5, 'Enter the registration number.').max(40).transform((v) => v.toUpperCase()),
    }).parse(Object.fromEntries(fd));
    const designation = String(fd.get('designation') ?? '').trim().slice(0, 100) || null;
    const ctx = await getEmployerContext(user.id);
    await asUser(user.id, async (tx) => {
      if (ctx.employer) {
        await tx`update employers set ${tx(d as never)} where id = ${ctx.employer.id}`;
      } else {
        const [e] = await tx`insert into employers ${tx({ ...d, created_by: user.id } as never)} returning id`;
        await tx`insert into employer_members (user_id, employer_id, designation, is_owner) values (${user.id}, ${e.id}, ${designation}, true)`;
      }
    });
  } catch (e) { return err(e); }
  revalidatePath('/employer', 'layout');
  return { ok: true, message: 'Company details saved. Verification is carried out by our team, usually within one business day.' };
}

export async function nlSearch(fd: FormData): Promise<void> {
  const user = await requireRole('employer');
  const text = String(fd.get('text') ?? '').trim().slice(0, 300);
  if (!text) redirect('/employer/search');
  const skills = await asUser(user.id, async (tx) => (await tx`select name::text as name from skills where is_active`).map((r) => r.name as string));
  const { filters } = parseNaturalQuery(text, skills);
  redirect(`/employer/search?${toQuery(filters, { nl: text })}`);
}

export async function saveSearch(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('employer');
  try {
    const name = z.string().trim().min(2, 'Give the search a name.').max(80).parse(fd.get('name'));
    const filters = compact(filterSchema.parse(JSON.parse(String(fd.get('filters') ?? '{}'))));
    const ctx = await getEmployerContext(user.id);
    await asUser(user.id, (tx) => tx`insert into saved_searches (employer_id, user_id, name, filters) values (${ctx.employer?.id ?? null}, ${user.id}, ${name}, ${tx.json(filters as never)})`);
  } catch (e) { return err(e); }
  revalidatePath('/employer');
  return { ok: true, message: 'Search saved to your dashboard.' };
}

export async function deleteSavedSearch(fd: FormData): Promise<void> {
  const user = await requireRole('employer');
  await asUser(user.id, (tx) => tx`delete from saved_searches where id = ${z.string().uuid().parse(fd.get('id'))} and user_id = ${user.id}`);
  revalidatePath('/employer');
}

export async function setStage(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('employer');
  try {
    const d = z.object({ candidate_id: z.string().uuid(), stage: z.enum(['saved', 'shortlisted', 'contacted', 'interview', 'rejected', 'hired']), notes: str(2000) }).parse(Object.fromEntries(fd));
    const ctx = await getEmployerContext(user.id);
    await asUser(user.id, (tx) => tx`insert into pipeline_entries (employer_id, candidate_id, stage, notes, updated_by)
      values (${ctx.employer?.id ?? null}, ${d.candidate_id}, ${d.stage}, ${d.notes}, ${user.id})
      on conflict (employer_id, candidate_id) do update set stage = excluded.stage, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now()`);
    revalidatePath(`/employer/candidates/${d.candidate_id}`);
  } catch (e) { return err(e); }
  revalidatePath('/employer/pipeline');
  return { ok: true, message: 'Saved to your pipeline.' };
}

export async function quickSave(fd: FormData): Promise<void> {
  const user = await requireRole('employer');
  const candidateId = z.string().uuid().parse(fd.get('candidate_id'));
  const stage = fd.get('stage') === 'shortlisted' ? 'shortlisted' : 'saved';
  const ctx = await getEmployerContext(user.id);
  await asUser(user.id, (tx) => tx`insert into pipeline_entries (employer_id, candidate_id, stage, updated_by) values (${ctx.employer?.id ?? null}, ${candidateId}, ${stage}, ${user.id})
    on conflict (employer_id, candidate_id) do update set stage = excluded.stage, updated_at = now() where pipeline_entries.stage in ('saved', 'shortlisted')`).catch(() => {});
  revalidatePath('/employer/search');
}

export async function sendEnquiry(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('employer');
  try {
    const d = z.object({
      candidate_id: z.string().uuid(), kind: z.enum(['enquiry', 'interview_request']),
      subject: z.string().trim().min(3, 'Add a subject.').max(150), message: z.string().trim().min(10, 'Write a short message (at least 10 characters).').max(4000),
    }).parse(Object.fromEntries(fd));
    await asUser(user.id, (tx) => tx`select send_enquiry(${d.candidate_id}, ${d.subject}, ${d.message}, ${d.kind})`);
    await flushNotificationEmails([d.candidate_id]).catch(() => 0);
    revalidatePath(`/employer/candidates/${d.candidate_id}`);
  } catch (e) { return err(e); }
  return { ok: true, message: 'Sent. You will be notified when the candidate replies; their contact details unlock if they accept.' };
}

export async function addRequirement(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('employer');
  try {
    const d = z.object({ title: z.string().trim().min(3, 'Give the requirement a title.').max(150), description: str(2000) }).parse(Object.fromEntries(fd));
    const ctx = await getEmployerContext(user.id);
    await asUser(user.id, (tx) => tx`insert into requirements (employer_id, title, description, created_by) values (${ctx.employer?.id ?? null}, ${d.title}, ${d.description}, ${user.id})`);
  } catch (e) { return err(e); }
  revalidatePath('/employer');
  return { ok: true, message: 'Requirement added.' };
}

export async function closeRequirement(fd: FormData): Promise<void> {
  const user = await requireRole('employer');
  await asUser(user.id, (tx) => tx`update requirements set status = 'closed' where id = ${z.string().uuid().parse(fd.get('id'))}`).catch(() => {});
  revalidatePath('/employer');
}

// ───────── walk-ins (verified employers post free of charge) ─────────
export async function postWalkin(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('employer');
  try {
    const { walkinSchema, resolveRegion, walkinRow } = await import('@/lib/walkins');
    const ctx = await getEmployerContext(user.id);
    if (ctx.employer?.verification_status !== 'verified') return { error: 'Only verified employers can post walk-ins.' };
    const w = walkinSchema.parse({ ...Object.fromEntries(fd), company_name: ctx.employer.name });   // always the verified company's own name
    const regions = await asUser(user.id, (tx) => tx`select id, slug, name, city_aliases from regions where is_active`);
    const regionId = resolveRegion(w.region, regions as never);
    if (!regionId) return { error: 'Choose a region.' };
    await asUser(user.id, (tx) => tx`insert into walkins ${tx({ ...walkinRow(w, regionId), source_type: 'employer', verified: true, employer_id: ctx.employer!.id, created_by: user.id } as never)}`);
  } catch (e) { return err(e); }
  revalidatePath('/employer/walk-ins'); revalidatePath('/walk-ins'); revalidatePath('/in/[slug]', 'page');
  return { ok: true, message: 'Published. It appears on the city page straight away.' };
}

export async function deleteWalkin(fd: FormData): Promise<void> {
  const user = await requireRole('employer');
  await asUser(user.id, (tx) => tx`delete from walkins where id = ${z.string().uuid().parse(fd.get('id'))}`);
  revalidatePath('/employer/walk-ins'); revalidatePath('/walk-ins');
}
