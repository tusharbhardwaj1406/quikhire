import Link from 'next/link';
import { ActionForm } from '@/components/forms';
import { Badge, Card, Field, PageHeader, Select, cx } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { taxonomyAction } from '../actions';

export default async function AdminTaxonomy({ searchParams }: { searchParams: Promise<{ industry?: string }> }) {
  await requireRole('admin');
  const sql = db();
  const industries = await sql`select i.*, (select count(*)::int from specialisations s where s.industry_id = i.id) specs, (select count(*)::int from candidates c where c.industry_id = i.id) candidates from industries i order by sort_order, name`;
  const wanted = (await searchParams).industry;
  const current = industries.find((i) => String(i.id) === wanted) ?? industries[0];
  const specs = current ? await sql`select s.*, d.name domain, (select count(*)::int from candidate_specialisations c where c.specialisation_id = s.id) candidates
    from specialisations s left join functional_domains d on d.id = s.domain_id where s.industry_id = ${current.id} order by d.name nulls last, s.name` : [];
  const newSkills = await sql`select s.id, s.name::text as name, s.is_active, (select count(*)::int from candidate_skills c where c.skill_id = s.id) candidates from skills s where s.created_by is not null order by s.id desc limit 30`;
  const Mini = ({ op, id, label, variant = 'outline' as const, children }: { op: string; id: number; label: string; variant?: 'outline' | 'danger'; children?: React.ReactNode }) => (
    <ActionForm action={taxonomyAction} submit={label} variant={variant} className="flex flex-wrap items-center gap-2 space-y-0"><input type="hidden" name="op" value={op} /><input type="hidden" name="id" value={id} />{children}</ActionForm>);
  return (
    <>
      <PageHeader title="Taxonomy" sub="Industry → functional domain → specialisation → skills. Changes are live immediately for sign-up, profiles and search." />
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-6">
          <Card title="Industries">
            <ul className="max-h-[28rem] space-y-0.5 overflow-y-auto text-sm">{industries.map((i) => (
              <li key={i.id}><Link href={`/admin/taxonomy?industry=${i.id}`} className={cx('flex items-center justify-between rounded-lg px-2.5 py-1.5', i.id === current?.id ? 'bg-navy-900 text-white' : 'hover:bg-navy-50', !i.is_active && 'opacity-50')}>
                <span>{i.name}</span><span className="text-xs opacity-70">{i.specs}</span></Link></li>))}</ul>
          </Card>
          <Card title="Add an industry">
            <ActionForm action={taxonomyAction} submit="Add industry" resetOnSuccess><input type="hidden" name="op" value="add_industry" /><Field label="Name"><input name="name" required className="input" /></Field></ActionForm>
          </Card>
        </div>
        <div className="space-y-6">
          {current && (
            <Card title={<>{current.name} {!current.is_active && <Badge tone="warn">Hidden</Badge>} <span className="text-sm font-normal text-slate-500">· {current.candidates} candidate(s)</span></>}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Mini op="rename_industry" id={current.id} label="Rename"><input name="name" defaultValue={current.name} required className="input w-56 py-2" aria-label="Industry name" /></Mini>
                <Mini op="toggle_industry" id={current.id} label={current.is_active ? 'Hide from pickers' : 'Show in pickers'} />
                <Mini op="merge_industry" id={current.id} label="Merge into" variant="danger"><Select name="into_id" className="w-56 py-2" aria-label="Merge into" placeholder="Choose industry" options={industries.filter((i) => i.id !== current.id).map((i) => ({ value: i.id, label: i.name }))} /></Mini>
                <Mini op="delete_industry" id={current.id} label="Delete (only if unused)" variant="danger" />
              </div>
              <h3 className="mt-6 mb-2 text-sm font-semibold">Specialisations ({specs.length})</h3>
              <ul className="divide-y divide-slate-100 text-sm">{specs.map((s) => (
                <li key={s.id} className={cx('flex flex-wrap items-center justify-between gap-2 py-2', !s.is_active && 'opacity-50')}>
                  <span><span className="font-medium text-navy-900">{s.name}</span> <span className="text-xs text-slate-500">{s.domain ?? 'No domain'} · {s.candidates} candidate(s)</span></span>
                  <span className="flex flex-wrap gap-2">
                    <Mini op="toggle_specialisation" id={s.id} label={s.is_active ? 'Hide' : 'Show'} />
                    <Mini op="merge_specialisation" id={s.id} label="Merge into" variant="danger"><Select name="into_id" className="w-44 py-1.5" aria-label="Merge into" placeholder="Choose" options={specs.filter((x) => x.id !== s.id).map((x) => ({ value: x.id, label: x.name }))} /></Mini>
                  </span>
                </li>))}</ul>
              <ActionForm action={taxonomyAction} submit="Add specialisation" variant="outline" className="mt-5 border-t border-slate-100 pt-5" resetOnSuccess>
                <input type="hidden" name="op" value="add_specialisation" /><input type="hidden" name="industry_id" value={current.id} />
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Specialisation"><input name="name" required className="input" /></Field><Field label="Functional domain" hint="Existing or new."><input name="domain" className="input" list="domains" /></Field></div>
                <datalist id="domains">{[...new Set(specs.map((s) => s.domain).filter(Boolean))].map((d) => <option key={d} value={d} />)}</datalist>
              </ActionForm>
            </Card>
          )}
          <Card title="Skills added by candidates (latest 30)">
            {newSkills.length === 0 ? <p className="text-sm text-slate-500">None yet. Skills typed by candidates appear here for review.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">{newSkills.map((s) => (
                <li key={s.id} className={cx('flex items-center justify-between gap-2 py-2', !s.is_active && 'opacity-50')}><span>{s.name} <span className="text-xs text-slate-500">· {s.candidates} candidate(s)</span></span><Mini op="toggle_skill" id={s.id} label={s.is_active ? 'Hide' : 'Show'} /></li>))}</ul>)}
          </Card>
        </div>
      </div>
    </>
  );
}
