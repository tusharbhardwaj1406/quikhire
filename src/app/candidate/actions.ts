'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { ActionState } from '@/components/forms';
import { requireRole } from '@/lib/auth';
import { asUser, dbMessage } from '@/lib/db';
import { flushNotificationEmails } from '@/lib/notify';
import { putObject, removeObject, validateResume } from '@/lib/storage';

const str = (max: number) => z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(max).nullable());
const num = (min: number, max: number) => z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(min).max(max).nullable());
const url = z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(300).regex(/^https?:\/\/\S+$/i, 'Links must start with https://').nullable());
const date = z.preprocess((v) => (v ? v : null), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const flag = z.preprocess((v) => v === 'on' || v === 'true', z.boolean());
const many = (fd: FormData, key: string) => fd.getAll(key).map(String).map((s) => s.trim()).filter(Boolean);
const AVAIL = ['immediate', 'within_7_days', 'within_15_days', 'within_30_days'] as const;

async function run(fn: (userId: string) => Promise<void>, message = 'Saved.', paths = ['/candidate', '/candidate/profile']): Promise<ActionState> {
  const user = await requireRole('candidate');
  try { await fn(user.id); } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? 'Please check the form.' };
    return { error: dbMessage(e) };
  }
  paths.forEach((p) => revalidatePath(p));
  return { ok: true, message };
}

export async function saveBasics(_: ActionState, fd: FormData) {
  return run(async (id) => {
    const d = z.object({
      full_name: z.string().trim().min(2, 'Enter your full name.').max(100),
      phone: str(20), current_designation: str(120), summary: str(2000),
      total_exp_years: num(0, 60), relevant_exp_years: num(0, 60),
      city: str(80), state: str(80), linkedin_url: url, portfolio_url: url, website_url: url,
      highest_qualification: str(120), university: str(160), graduation_year: num(1950, 2100),
    }).parse(Object.fromEntries(fd));
    const { full_name, phone, ...c } = d;
    const preferred_locations = String(fd.get('preferred_locations') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    await asUser(id, async (tx) => {
      await tx`update profiles set full_name = ${full_name}, phone = ${phone} where id = ${id}`;
      await tx`update candidates set ${tx({ ...c, preferred_locations } as never)} where user_id = ${id}`;
    });
  });
}

export async function saveExpertise(_: ActionState, fd: FormData) {
  return run(async (id) => {
    const industry_id = z.coerce.number().int().positive('Select your industry.').parse(fd.get('industry_id'));
    const specIds = many(fd, 'specialisation_ids').map(Number).filter(Number.isInteger).slice(0, 20);
    const skills = many(fd, 'skills').slice(0, 30), software = many(fd, 'software').slice(0, 20);
    await asUser(id, async (tx) => {
      // only specialisations that really belong to the chosen industry
      const valid = specIds.length ? await tx`select id, domain_id from specialisations where industry_id = ${industry_id} and id = any(${specIds}::int[])` : [];
      await tx`update candidates set industry_id = ${industry_id}, domain_id = ${valid[0]?.domain_id ?? null} where user_id = ${id}`;
      await tx`delete from candidate_specialisations where candidate_id = ${id}`;
      for (const s of valid) await tx`insert into candidate_specialisations (candidate_id, specialisation_id) values (${id}, ${s.id})`;
      await tx`delete from candidate_skills where candidate_id = ${id}`;
      for (const [kind, names] of [['skill', skills], ['software', software]] as const) {
        for (const name of names) {
          await tx`insert into skills (name, created_by) values (${name.slice(0, 40)}, ${id}) on conflict (name) do nothing`;
          await tx`insert into candidate_skills (candidate_id, skill_id, kind)
                   select ${id}, id, ${kind} from skills where lower(name::text) = ${name.slice(0, 40).toLowerCase()} on conflict do nothing`;
        }
      }
    });
  });
}

export async function saveAvailability(_: ActionState, fd: FormData) {
  return run(async (id) => {
    const d = z.object({
      availability: z.enum(AVAIL, { error: 'Tell us when you can join.' }),
      earliest_joining_date: date, last_working_date: date, currently_employed: flag, serving_notice: flag,
      employment_status: str(80), availability_reason: str(300),
    }).parse(Object.fromEntries(fd));
    const employment_types = many(fd, 'employment_types').filter((v) => ['full_time', 'contract', 'freelance'].includes(v));
    const work_modes = many(fd, 'work_modes').filter((v) => ['remote', 'hybrid', 'onsite'].includes(v));
    await asUser(id, (tx) => tx`update candidates set ${tx({ ...d, employment_types, work_modes } as never)} where user_id = ${id}`);
  }, 'Availability saved and confirmed.');
}

export async function saveSalary(_: ActionState, fd: FormData) {
  return run(async (id) => {
    const d = z.object({ last_ctc: num(0, 1e9), expected_ctc: num(0, 1e9), min_ctc: num(0, 1e9), ctc_negotiable: flag }).parse(Object.fromEntries(fd));
    await asUser(id, (tx) => tx`update candidates set ${tx(d as never)} where user_id = ${id}`);
  });
}

export async function addExperience(_: ActionState, fd: FormData) {
  return run(async (id) => {
    const d = z.object({
      employer_name: z.string().trim().min(2, 'Enter the employer name.').max(160), designation: z.string().trim().min(2, 'Enter your designation.').max(120),
      start_date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Enter a start date.'), end_date: z.preprocess((v) => v || null, z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable()),
      responsibilities: str(3000), projects: str(3000), achievements: str(2000), reason_for_leaving: str(300),
    }).parse(Object.fromEntries(fd));
    const full = (m: string | null) => (m && m.length === 7 ? `${m}-01` : m);
    await asUser(id, (tx) => tx`insert into experiences ${tx({ ...d, start_date: full(d.start_date), end_date: full(d.end_date), candidate_id: id } as never)}`);
  }, 'Experience added.');
}

export async function addCertification(_: ActionState, fd: FormData) {
  return run(async (id) => {
    const d = z.object({ name: z.string().trim().min(2, 'Enter the certification name.').max(160), issuer: str(160), year: num(1950, 2100) }).parse(Object.fromEntries(fd));
    await asUser(id, (tx) => tx`insert into certifications ${tx({ ...d, candidate_id: id } as never)}`);
  }, 'Certification added.');
}

export async function deleteItem(fd: FormData): Promise<void> {
  const user = await requireRole('candidate');
  const id = z.string().uuid().parse(fd.get('id'));
  const table = fd.get('kind') === 'certification' ? 'certifications' : 'experiences';
  await asUser(user.id, (tx) => tx`delete from ${tx(table)} where id = ${id} and candidate_id = ${user.id}`);
  revalidatePath('/candidate/profile');
}

export async function reconfirmAvailability(): Promise<void> {
  const user = await requireRole('candidate');
  await asUser(user.id, (tx) => tx`select reconfirm_availability()`).catch(() => {});
  revalidatePath('/candidate');
}

export async function savePrivacy(_: ActionState, fd: FormData) {
  return run(async (id) => {
    const d = z.object({ show_full_name: flag, show_email: flag, show_phone: flag, show_salary: flag, show_employment_history: flag,
      allow_resume_download: flag, allow_contact: flag, visibility: z.enum(['visible', 'paused']) }).parse({ ...Object.fromEntries(fd), visibility: fd.get('paused') === 'on' ? 'paused' : 'visible' });
    const notify_email = fd.get('notify_email') === 'on';
    await asUser(id, async (tx) => {
      await tx`update candidates set ${tx(d as never)} where user_id = ${id}`;
      await tx`update profiles set notify_email = ${notify_email} where id = ${id}`;
      await tx`insert into consents (user_id, purpose, version, granted) values (${id}, 'directory_visibility', ${JSON.stringify(d)}, true)`;
    });
  }, 'Privacy settings saved.', ['/candidate', '/candidate/settings']);
}

export async function uploadResume(_: ActionState, fd: FormData) {
  return run(async (id) => {
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new z.ZodError([{ code: 'custom', message: 'Choose a file to upload.', path: [], input: null }]);
    const bytes = Buffer.from(await file.arrayBuffer());
    const check = validateResume(file, bytes.subarray(0, 8));
    if ('error' in check) throw new z.ZodError([{ code: 'custom', message: check.error, path: [], input: null }]);
    const label = String(fd.get('label') ?? '').trim().slice(0, 60) || null;
    const path = `${id}/${crypto.randomUUID()}.${check.ext}`;
    const count = await asUser(id, async (tx) => (await tx`select count(*)::int n from resumes where candidate_id = ${id}`)[0].n as number);
    if (count >= 5) throw new z.ZodError([{ code: 'custom', message: 'You can keep up to 5 resume versions. Delete one first.', path: [], input: null }]);
    await putObject(path, bytes, file.type);
    try {
      await asUser(id, (tx) => tx`insert into resumes (candidate_id, storage_path, file_name, mime_type, size_bytes, label, is_primary)
        values (${id}, ${path}, ${file.name.replace(/[^\w.\- ]/g, '_').slice(0, 120)}, ${file.type}, ${file.size}, ${label}, ${count === 0})`);
    } catch (e) { await removeObject(path); throw e; }
  }, 'Resume uploaded.', ['/candidate', '/candidate/resumes']);
}

export async function resumeAction(fd: FormData): Promise<void> {
  const user = await requireRole('candidate');
  const id = z.string().uuid().parse(fd.get('id'));
  if (fd.get('op') === 'primary') {
    await asUser(user.id, async (tx) => {
      await tx`update resumes set is_primary = false where candidate_id = ${user.id} and is_primary`;
      await tx`update resumes set is_primary = true where id = ${id} and candidate_id = ${user.id}`;
    });
  } else {
    const [r] = await asUser(user.id, (tx) => tx`delete from resumes where id = ${id} and candidate_id = ${user.id} returning storage_path`);
    if (r) await removeObject(r.storage_path);
  }
  revalidatePath('/candidate/resumes');
}

export async function respondEnquiry(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('candidate');
  const parsed = z.object({ id: z.string().uuid(), decision: z.enum(['accept', 'decline']), response: str(1000) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Please check the form.' };
  try {
    const [e] = await asUser(user.id, async (tx) => {
      await tx`select respond_enquiry(${parsed.data.id}, ${parsed.data.decision === 'accept'}, ${parsed.data.response})`;
      return tx`select sender_id from enquiries where id = ${parsed.data.id}`;
    });
    if (e) await flushNotificationEmails([e.sender_id]);
  } catch (e) { return { error: dbMessage(e) }; }
  revalidatePath('/candidate/enquiries');
  return { ok: true, message: parsed.data.decision === 'accept' ? 'Accepted. The employer can now see your contact details.' : 'Declined. The employer has been told.' };
}

export async function reportEnquiry(fd: FormData): Promise<void> {
  const user = await requireRole('candidate');
  const id = z.string().uuid().parse(fd.get('id'));
  const reason = String(fd.get('reason') ?? 'Reported by candidate').slice(0, 200);
  await asUser(user.id, (tx) => tx`insert into reports (reporter_id, target_type, target_id, reason) values (${user.id}, 'enquiry', ${id}, ${reason})`);
  revalidatePath('/candidate/enquiries');
}

export async function markRead(): Promise<void> {
  const user = await requireRole('candidate');
  await asUser(user.id, (tx) => tx`update notifications set read_at = now() where user_id = ${user.id} and read_at is null`);
  revalidatePath('/candidate');
}

export async function requestDeletion(): Promise<void> {
  const user = await requireRole('candidate');
  await asUser(user.id, (tx) => tx`select request_account_deletion()`);
  redirect('/candidate/settings?deletion=requested');
}
