import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { asUser } from '@/lib/db';

/** Data portability: everything we hold about the signed-in user, read under their own row-level permissions. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new NextResponse('Unauthorised', { status: 401 });
  const data = await asUser(user.id, async (tx) => ({
    exported_at: new Date().toISOString(),
    profile: await tx`select * from profiles where id = ${user.id}`,
    candidate: await tx`select * from candidates where user_id = ${user.id}`,
    specialisations: await tx`select s.name from candidate_specialisations c join specialisations s on s.id = c.specialisation_id where c.candidate_id = ${user.id}`,
    skills: await tx`select s.name, c.kind from candidate_skills c join skills s on s.id = c.skill_id where c.candidate_id = ${user.id}`,
    experiences: await tx`select * from experiences where candidate_id = ${user.id}`,
    certifications: await tx`select * from certifications where candidate_id = ${user.id}`,
    resumes: await tx`select id, file_name, label, size_bytes, is_primary, created_at from resumes where candidate_id = ${user.id}`,
    enquiries_received: await tx`select kind, subject, message, status, response, created_at, responded_at from enquiries where candidate_id = ${user.id}`,
    profile_views: await tx`select viewed_on from profile_views where candidate_id = ${user.id}`,
    resume_downloads: await tx`select created_at from resume_downloads where candidate_id = ${user.id}`,
    employer: await tx`select e.* from employers e join employer_members m on m.employer_id = e.id where m.user_id = ${user.id}`,
    subscriptions: await tx`select status, provider, current_period_start, current_period_end, access_until, created_at from subscriptions`,
    payments: await tx`select invoice_number, amount_paise, tax_paise, status, method, paid_at from payments`,
    consents: await tx`select purpose, version, granted, created_at from consents where user_id = ${user.id}`,
    notifications: await tx`select type, title, body, created_at, read_at from notifications where user_id = ${user.id}`,
  }));
  return new NextResponse(JSON.stringify(data, (k, v) => (k === 'search_tsv' ? undefined : v), 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="zeronotice-my-data.json"', 'Cache-Control': 'private, no-store' } });
}
