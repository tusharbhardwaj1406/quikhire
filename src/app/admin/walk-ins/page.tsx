import { ActionForm, SubmitButton } from '@/components/forms';
import { Badge, Card, Check, EmptyState, PageHeader } from '@/components/ui';
import { WalkinCard, WalkinFields } from '@/components/walkins';
import { requireRole } from '@/lib/auth';
import { getRegions, todayIST, type Walkin } from '@/lib/data';
import { db } from '@/lib/db';
import { addWalkin, importWalkins, walkinStatus } from '../actions';

const EXAMPLE = `[{"region":"pune","company_name":"Example Ltd","role_title":"Customer Support Associate","start_date":"2026-11-18","end_date":"2026-11-20",
  "time_text":"10:00 am – 1:00 pm","venue":"Example Tower","address":"Hinjewadi Phase 1, Pune","experience_text":"0–2 years",
  "qualification_text":"Any graduate","salary_text":"Not disclosed","skills":["English communication"],"summary":"In our own words…",
  "how_to_attend":"Carry resume and ID proof","source_name":"Company careers page","source_url":"https://…"}]`;

export default async function AdminWalkins() {
  await requireRole('admin');
  const regions = await getRegions();
  const rows = (await db()`select w.*, w.start_date::text, w.end_date::text, r.slug region_slug, r.name region_name, i.name industry
    from walkins w join regions r on r.id = w.region_id left join industries i on i.id = w.industry_id
    where w.end_date >= ${todayIST()}::date - 1 order by w.start_date, r.sort_order limit 200`) as unknown as (Walkin & { status: string })[];
  return (
    <>
      <PageHeader title="Walk-ins" sub={`${rows.length} current or upcoming. Imported listings must link to their source and are labelled “not verified” until you confirm them with the employer.`} />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Import from research (JSON)">
            <ActionForm action={importWalkins} submit="Import">
              <textarea name="json" rows={10} required className="input font-mono text-xs" placeholder={EXAMPLE} aria-label="Walk-ins JSON" />
              <p className="hint">Fields: region (slug, name or city), company_name, role_title, start_date, end_date, time_text, venue, address, experience_text, qualification_text, salary_text, skills[], openings, summary (write it in your own words), how_to_attend, source_name, source_url (required). Duplicates (same city, company, role, start date) are skipped.</p>
            </ActionForm>
          </Card>
          <Card title="Add one manually">
            <ActionForm action={addWalkin} submit="Publish" resetOnSuccess>
              <WalkinFields regions={regions} source />
              <Check name="verified" label="I have confirmed this walk-in with the employer" />
            </ActionForm>
          </Card>
        </div>
        {rows.length === 0 ? <EmptyState title="No walk-ins yet" /> : regions.map((r) => {
          const list = rows.filter((w) => w.region_slug === r.slug);
          if (!list.length) return null;
          return (
            <section key={r.id}><h2 className="mb-3 text-base font-semibold">{r.name} ({list.length})</h2>
              <div className="space-y-4">{list.map((w) => (
                <WalkinCard key={w.id} w={w} actions={
                  <span className="flex flex-wrap items-center gap-2">
                    {w.status === 'hidden' && <Badge tone="bad">Hidden</Badge>}
                    {!w.verified && <form action={walkinStatus}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="op" value="verify" /><SubmitButton variant="outline" small>Mark verified</SubmitButton></form>}
                    <form action={walkinStatus}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="op" value={w.status === 'hidden' ? 'publish' : 'hide'} /><SubmitButton variant="ghost" small>{w.status === 'hidden' ? 'Publish' : 'Hide'}</SubmitButton></form>
                    <form action={walkinStatus}><input type="hidden" name="id" value={w.id} /><input type="hidden" name="op" value="delete" /><SubmitButton variant="danger" small confirm="Delete this walk-in?">Delete</SubmitButton></form>
                  </span>} />))}</div>
            </section>);
        })}
      </div>
    </>
  );
}
