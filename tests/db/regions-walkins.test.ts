import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, db } from '@/lib/db';
import { resolveRegion, walkinRow, walkinSchema } from '@/lib/walkins';
import { completeCandidate, createEmployer, createUser, endLaunch, isListed, listedCandidate, resetLaunch, search } from './helpers';

afterAll(async () => { await endLaunch(); await db().end(); });

describe('free launch period', () => {
  it('lists complete candidates without payment until 60 days after the clock starts, then requires a subscription', async () => {
    await resetLaunch();                                             // clock not started → free
    const u = await createUser('candidate');
    await completeCandidate(u.id);
    expect(await isListed(u.id)).toBe(true);
    await db()`update platform_settings set value = to_jsonb((now() - interval '59 days')::text) where key = 'launch_started_at'`;
    await db()`select refresh_all_listings()`;
    expect(await isListed(u.id)).toBe(true);                         // day 59: still free
    await db()`update platform_settings set value = to_jsonb((now() - interval '61 days')::text) where key = 'launch_started_at'`;
    const [{ r }] = await db()`select run_maintenance() r`;          // nightly job drops unpaid listings once the period ends
    expect(r.listings_lapsed).toBeGreaterThanOrEqual(1);
    expect(await isListed(u.id)).toBe(false);
  });
  it('keeps employers paid unless the admin extends the offer to them', async () => {
    await resetLaunch();
    await listedCandidate();
    const e = await createEmployer({ verified: true });
    await expect(search(e.id)).rejects.toThrow(/verified employer/);
    await db()`update platform_settings set value = 'true' where key = 'launch_free_employers'`;
    expect((await search(e.id)).length).toBeGreaterThan(0);
    const unverified = await createEmployer();
    await expect(search(unverified.id)).rejects.toThrow(/verified employer/);   // free never bypasses verification
    await db()`update platform_settings set value = 'false' where key = 'launch_free_employers'`;
    await endLaunch();
  });
});

describe('regions', () => {
  it('derives the region from the city and filters search by region', async () => {
    const a = await listedCandidate({ city: 'Gurugram' }); const b = await listedCandidate({ city: 'Hinjewadi' }); const c = await listedCandidate({ city: 'Jaipur' });
    const region = async (id: string) => (await db()`select r.slug from candidates c left join regions r on r.id = c.region_id where c.user_id = ${id}`)[0].slug;
    expect([await region(a.id), await region(b.id), await region(c.id)]).toEqual(['delhi-ncr', 'pune', null]);
    const e = await createEmployer({ verified: true, subscribed: true });
    const ids = (await search(e.id, { region: 'delhi-ncr' })).map((r) => r.candidate_id);
    expect(ids).toContain(a.id); expect(ids).not.toContain(b.id); expect(ids).not.toContain(c.id);
    expect((await asAnon((tx) => tx`select count(*)::int n from regions`))[0].n).toBe(7);
  });
});

describe('walk-ins', () => {
  const row = (regionId: number, over = {}) => ({ region_id: regionId, company_name: 'Acme ' + Math.random().toString(36).slice(2), role_title: 'Site Engineer',
    start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), ...over });
  it('lets only verified employers publish, as themselves, and shows published walk-ins to everyone', async () => {
    const [{ id: pune }] = await db()`select id from regions where slug = 'pune'`;
    const ok = await createEmployer({ verified: true }); const pending = await createEmployer(); const cand = await createUser('candidate');
    const mine = { source_type: 'employer', verified: true };
    await asUser(ok.id, (tx) => tx`insert into walkins ${tx({ ...row(pune), ...mine, employer_id: ok.employerId, created_by: ok.id } as never)}`);
    await expect(asUser(pending.id, (tx) => tx`insert into walkins ${tx({ ...row(pune), ...mine, employer_id: pending.employerId, created_by: pending.id } as never)}`)).rejects.toThrow(/row-level security/);
    await expect(asUser(cand.id, (tx) => tx`insert into walkins ${tx({ ...row(pune), source_type: 'admin', verified: true, created_by: cand.id } as never)}`)).rejects.toThrow(/row-level security/);
    await expect(asUser(ok.id, (tx) => tx`insert into walkins ${tx({ ...row(pune), ...mine, employer_id: pending.employerId, created_by: ok.id } as never)}`)).rejects.toThrow(/row-level security/);
    await expect(db()`insert into walkins ${db()({ ...row(pune), source_type: 'web' } as never)}`).rejects.toThrow(/check/);          // web listings must cite a source
    expect((await asAnon((tx) => tx`select count(*)::int n from walkins where employer_id = ${ok.employerId}`))[0].n).toBe(1);
    await db()`update walkins set status = 'hidden' where employer_id = ${ok.employerId}`;
    expect((await asAnon((tx) => tx`select count(*)::int n from walkins where employer_id = ${ok.employerId}`))[0].n).toBe(0);
  });
  it('accepts the researched dataset: every entry validates, resolves to a region and cites its source', async () => {
    const items = JSON.parse(readFileSync('supabase/seed/walkins-2026-11-16.json', 'utf8')) as unknown[];
    const regions = (await db()`select id, slug, name, city_aliases from regions`) as never;
    for (const raw of items) {
      const w = walkinSchema.parse(raw);
      const regionId = resolveRegion(w.region, regions);
      expect(regionId).not.toBeNull(); expect(w.source_url).toMatch(/^https:\/\//);
      expect(walkinRow(w, regionId!).end_date >= w.start_date).toBe(true);
    }
    expect(items.length).toBe(12);
  });
});
