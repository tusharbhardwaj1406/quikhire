import { ActionForm, SubmitButton } from '@/components/forms';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { WalkinCard, WalkinFields } from '@/components/walkins';
import { requireRole } from '@/lib/auth';
import { getRegions, type Walkin } from '@/lib/data';
import { asUser } from '@/lib/db';
import { getEmployerContext } from '@/lib/employer';
import { deleteWalkin, postWalkin } from '../actions';

export default async function EmployerWalkins() {
  const user = await requireRole('employer');
  const [ctx, regions] = await Promise.all([getEmployerContext(user.id), getRegions()]);
  const mine = ctx.employer ? await asUser(user.id, (tx) => tx`select w.*, w.start_date::text, w.end_date::text, r.slug region_slug, r.name region_name, null as industry
    from walkins w join regions r on r.id = w.region_id where w.employer_id = ${ctx.employer!.id} order by w.start_date desc limit 50`) : [];
  const verified = ctx.employer?.verification_status === 'verified';
  return (
    <>
      <PageHeader title="Walk-in drives" sub="Post walk-in interviews free of charge. They appear on the city page with a “Verified employer” badge." />
      <div className="space-y-6">
        <Card title="Post a walk-in">
          {verified ? (
            <ActionForm action={postWalkin} submit="Publish walk-in" variant="accent" resetOnSuccess>
              <WalkinFields regions={regions} company={ctx.employer!.name} />
            </ActionForm>
          ) : <p className="text-sm text-slate-600">Available as soon as your company is verified.</p>}
        </Card>
        <section>
          <h2 className="mb-3 text-base font-semibold">Your walk-ins</h2>
          {mine.length === 0 ? <EmptyState title="Nothing posted yet" /> : (
            <div className="space-y-4">{(mine as unknown as Walkin[]).map((w) => (
              <WalkinCard key={w.id} w={w} actions={<form action={deleteWalkin}><input type="hidden" name="id" value={w.id} /><SubmitButton variant="danger" small confirm="Remove this walk-in?">Remove</SubmitButton></form>} />))}</div>)}
        </section>
      </div>
    </>
  );
}
