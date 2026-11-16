import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, db } from '@/lib/db';
import { completeCandidate, createEmployer, createUser, grantSubscription, isListed, listedCandidate, search, endLaunch } from './helpers';

beforeAll(async () => { await endLaunch(); });
afterAll(() => db().end());

describe('identity', () => {
  it('creates a profile and candidate row on sign-up, and records consent', async () => {
    const u = await createUser('candidate', { terms_version: 'v1', city: 'Pune', total_exp_years: '7.5', availability: 'within_7_days' });
    const [p] = await db()`select role from profiles where id = ${u.id}`;
    const [c] = await db()`select city, total_exp_years, availability from candidates where user_id = ${u.id}`;
    expect(p.role).toBe('candidate');
    expect(c).toMatchObject({ city: 'Pune', total_exp_years: '7.5', availability: 'within_7_days' });
    expect((await db()`select count(*)::int n from consents where user_id = ${u.id}`)[0].n).toBe(2);
  });
  it('never lets sign-up metadata or a profile update grant admin', async () => {
    const u = await createUser('admin');
    expect((await db()`select role from profiles where id = ${u.id}`)[0].role).toBeNull();
    await asUser(u.id, (tx) => tx`update profiles set role = 'admin', status = 'active' where id = ${u.id}`);
    expect((await db()`select role from profiles where id = ${u.id}`)[0].role).toBeNull();
    await expect(asUser(u.id, (tx) => tx`select set_my_role('admin')`)).rejects.toThrow();
    await asUser(u.id, (tx) => tx`select set_my_role('employer')`);
    await expect(asUser(u.id, (tx) => tx`select set_my_role('candidate')`)).rejects.toThrow(/already set/);
  });
  it('survives malformed sign-up hints', async () => {
    const u = await createUser('candidate', { total_exp_years: 'abc', availability: 'whenever' });
    expect((await db()`select count(*)::int n from candidates where user_id = ${u.id}`)[0].n).toBe(1);
  });
});

describe('candidate privacy (row-level security)', () => {
  it('hides candidates from each other and from anonymous visitors', async () => {
    const a = await listedCandidate(); const b = await listedCandidate();
    const rows = await asUser(a.id, (tx) => tx`select user_id from candidates`);
    expect(rows.map((r) => r.user_id)).toEqual([a.id]);
    expect(await asUser(a.id, (tx) => tx`select id from profiles where id = ${b.id}`)).toHaveLength(0);
    await expect(asAnon((tx) => tx`select * from candidates`)).rejects.toThrow(/permission denied/);
    await expect(asAnon((tx) => tx`select * from profiles`)).rejects.toThrow(/permission denied/);
    expect((await asAnon((tx) => tx`select count(*)::int n from industries`))[0].n).toBe(30);
  });
  it('stops a candidate from marking their own availability as verified', async () => {
    const a = await listedCandidate();
    await asUser(a.id, (tx) => tx`update candidates set availability_verification = 'verified', listed = true where user_id = ${a.id}`);
    expect((await db()`select availability_verification v from candidates where user_id = ${a.id}`)[0].v).toBe('self_declared');
  });
  it('gives employers no direct access to candidate tables', async () => {
    await listedCandidate();
    const e = await createEmployer({ verified: true, subscribed: true });
    for (const t of ['candidates', 'experiences', 'resumes', 'candidate_skills']) {
      expect(await asUser(e.id, (tx) => tx`select * from ${tx(t)}`)).toHaveLength(0);
    }
    expect(await asUser(e.id, (tx) => tx`select id from profiles where role = 'candidate'`)).toHaveLength(0);
  });
});

describe('directory eligibility', () => {
  it('lists only complete, subscribed, visible, confirmed candidates', async () => {
    const u = await createUser('candidate');
    expect(await isListed(u.id)).toBe(false);
    await completeCandidate(u.id);
    expect(await isListed(u.id)).toBe(false);                       // no subscription yet
    await grantSubscription({ userId: u.id });
    expect(await isListed(u.id)).toBe(true);
    await asUser(u.id, (tx) => tx`update candidates set visibility = 'paused' where user_id = ${u.id}`);
    expect(await isListed(u.id)).toBe(false);
    await asUser(u.id, (tx) => tx`update candidates set visibility = 'visible' where user_id = ${u.id}`);
    expect(await isListed(u.id)).toBe(true);
  });
  it('hides stale availability until the candidate reconfirms with one call', async () => {
    const u = await listedCandidate();
    await db()`update candidates set availability_confirmed_at = now() - interval '31 days' where user_id = ${u.id}`;
    const [{ r }] = await db()`select run_maintenance() r`;
    expect(r.availability_marked_pending).toBeGreaterThanOrEqual(1);
    const [c] = await db()`select availability_status s, listed from candidates where user_id = ${u.id}`;
    expect(c).toMatchObject({ s: 'confirmation_pending', listed: false });
    await asUser(u.id, (tx) => tx`select reconfirm_availability()`);
    expect(await isListed(u.id)).toBe(true);
  });
  it('drops the listing when the subscription lapses and when the account is suspended', async () => {
    const u = await listedCandidate();
    await db()`update subscriptions set access_until = now() - interval '1 hour' where owner_user_id = ${u.id}`;
    expect(await isListed(u.id)).toBe(false);
    const v = await listedCandidate();
    await db()`update profiles set status = 'suspended' where id = ${v.id}`;
    expect(await isListed(v.id)).toBe(false);
  });
});

describe('employer access', () => {
  it('requires verification AND an active subscription to search', async () => {
    await listedCandidate();
    const unverified = await createEmployer({ subscribed: true });
    const unpaid = await createEmployer({ verified: true });
    const ok = await createEmployer({ verified: true, subscribed: true });
    await expect(search(unverified.id)).rejects.toThrow(/verified employer/);
    await expect(search(unpaid.id)).rejects.toThrow(/verified employer/);
    expect((await search(ok.id)).length).toBeGreaterThan(0);
  });
  it('cannot verify itself', async () => {
    const e = await createEmployer();
    await asUser(e.id, (tx) => tx`update employers set verification_status = 'verified', verified_at = now() where id = ${e.employerId}`);
    expect((await db()`select verification_status s from employers where id = ${e.employerId}`)[0].s).toBe('pending');
    await expect(asUser(e.id, (tx) => tx`insert into employers (name, created_by, verification_status) values ('X', ${e.id}, 'verified')`)).rejects.toThrow(/row-level security/);
  });
  it('cannot join another company', async () => {
    const a = await createEmployer(); const b = await createUser('employer');
    await expect(asUser(b.id, (tx) => tx`insert into employer_members (user_id, employer_id) values (${b.id}, ${a.employerId})`)).rejects.toThrow(/row-level security/);
  });
});

describe('search + consent masking', () => {
  it('masks name and salary by default and honours filters', async () => {
    const c = await listedCandidate({ city: 'Gurugram', total_exp_years: 11 });
    const junior = await listedCandidate({ city: 'Chennai', total_exp_years: 3, current_designation: 'Graduate Engineer' });
    const e = await createEmployer({ verified: true, subscribed: true });
    const rows = await search(e.id, { q: 'structural engineer', city: 'Gurugram', exp_min: 10, exp_max: 15, skills: ['midas civil', 'aashto'], availability: ['immediate'] });
    const hit = rows.find((r) => r.candidate_id === c.id)!;
    expect(hit).toBeTruthy();
    expect(rows.find((r) => r.candidate_id === junior.id)).toBeUndefined();
    expect(hit.display_name).toMatch(/^Candidate QH-/);
    expect(hit.expected_ctc).toBeNull();
    expect(hit.top_skills).toContain('MIDAS Civil');
    // salary filters must not reveal hidden salaries by inference
    expect((await search(e.id, { expected_ctc_max: 99999999 })).find((r) => r.candidate_id === c.id)).toBeUndefined();
    await asUser(c.id, (tx) => tx`update candidates set show_salary = true, show_full_name = true where user_id = ${c.id}`);
    const again = (await search(e.id, { expected_ctc_max: 99999999 })).find((r) => r.candidate_id === c.id)!;
    expect(Number(again.expected_ctc)).toBe(3000000);
    expect(again.display_name).not.toMatch(/^Candidate QH-/);
  });
  it('releases contact details only after the candidate accepts an enquiry, and logs views', async () => {
    const c = await listedCandidate();
    const e = await createEmployer({ verified: true, subscribed: true });
    const view = async () => (await asUser(e.id, (tx) => tx`select get_candidate_profile(${c.id}) p`))[0].p;
    let p = await view();
    expect(p.email).toBeNull(); expect(p.phone).toBeNull(); expect(p.name_hidden).toBe(true); expect(p.salary).toBeNull(); expect(p.resumes).toBeNull();
    await view();
    expect((await db()`select count(*)::int n from profile_views where candidate_id = ${c.id}`)[0].n).toBe(1);   // once per employer per day
    expect((await db()`select count(*)::int n from notifications where user_id = ${c.id} and type = 'profile.viewed'`)[0].n).toBe(1);

    const [{ id }] = await asUser(e.id, (tx) => tx`select send_enquiry(${c.id}, 'Senior Bridge Engineer role', 'We have an immediate opening in Delhi.') id`);
    await expect(asUser(e.id, (tx) => tx`select send_enquiry(${c.id}, 'Second message', 'Following up on my earlier note.')`)).rejects.toThrow(/awaiting/);
    const other = await listedCandidate();
    await expect(asUser(other.id, (tx) => tx`select respond_enquiry(${id}, true, null)`)).rejects.toThrow(/not found/);
    await asUser(c.id, (tx) => tx`select respond_enquiry(${id}, true, 'Happy to talk.')`);
    p = await view();
    expect(p.email).toBe(c.email); expect(p.name_hidden).toBe(false);
    expect(p.pipeline.stage).toBe('contacted');
  });
  it('blocks enquiries and resume downloads the candidate has not allowed', async () => {
    const c = await listedCandidate({ allow_contact: false });
    const e = await createEmployer({ verified: true, subscribed: true });
    await expect(asUser(e.id, (tx) => tx`select send_enquiry(${c.id}, 'Hello there', 'A message of sufficient length.')`)).rejects.toThrow(/not accepting/);
    const [r] = await asUser(c.id, (tx) => tx`insert into resumes (candidate_id, storage_path, file_name, mime_type, size_bytes)
      values (${c.id}, ${c.id + '/cv.pdf'}, 'cv.pdf', 'application/pdf', 1000) returning id`);
    expect((await asUser(e.id, (tx) => tx`select authorize_resume_download(${r.id}) p`))[0].p).toBeNull();
    await asUser(c.id, (tx) => tx`update candidates set allow_resume_download = true where user_id = ${c.id}`);
    expect((await asUser(e.id, (tx) => tx`select authorize_resume_download(${r.id}) p`))[0].p).toBe(c.id + '/cv.pdf');
    expect((await db()`select count(*)::int n from resume_downloads where candidate_id = ${c.id}`)[0].n).toBe(1);
  });
  it('keeps one employer’s pipeline and notes invisible to another employer and to the candidate', async () => {
    const c = await listedCandidate();
    const a = await createEmployer({ verified: true, subscribed: true }); const b = await createEmployer({ verified: true, subscribed: true });
    await asUser(a.id, (tx) => tx`insert into pipeline_entries (employer_id, candidate_id, stage, notes) values (${a.employerId}, ${c.id}, 'shortlisted', 'strong')`);
    expect(await asUser(b.id, (tx) => tx`select * from pipeline_entries`)).toHaveLength(0);
    expect(await asUser(c.id, (tx) => tx`select * from pipeline_entries`)).toHaveLength(0);
    await expect(asUser(b.id, (tx) => tx`insert into pipeline_entries (employer_id, candidate_id) values (${a.employerId}, ${c.id})`)).rejects.toThrow(/row-level security/);
  });
});

describe('admin', () => {
  it('restricts metrics and settings to admins', async () => {
    const u = await createUser('candidate');
    await expect(asUser(u.id, (tx) => tx`select admin_metrics()`)).rejects.toThrow(/admin only/);
    expect(await asUser(u.id, (tx) => tx`select * from platform_settings`)).toHaveLength(0);
    await expect(asUser(u.id, (tx) => tx`update plans set amount_paise = 1`)).rejects.toThrow(/permission denied/);
    await db()`update profiles set role = 'admin' where id = ${u.id}`;
    const [{ m }] = await asUser(u.id, (tx) => tx`select admin_metrics() m`);
    expect(m.candidates_total).toBeGreaterThan(0);
  });
});
