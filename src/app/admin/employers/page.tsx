import Link from 'next/link';
import { ActionForm } from '@/components/forms';
import { Badge, Card, EmptyState, PageHeader, Select, cx } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { dateIN } from '@/lib/brand';
import { db } from '@/lib/db';
import { verifyEmployer } from '../actions';

const TABS = ['pending', 'verified', 'rejected', 'suspended'] as const;
export default async function AdminEmployers({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole('admin');
  const wanted = (await searchParams).status;
  const status = TABS.find((t) => t === wanted) ?? 'pending';
  const rows = await db()`select e.*, i.name industry, p.full_name recruiter, p.email recruiter_email, p.phone recruiter_phone, m.designation,
      (select count(*)::int from enquiries q where q.employer_id = e.id) enquiries, (select count(*)::int from reports r where r.target_type = 'employer' and r.target_id = e.id and r.status = 'open') open_reports,
      exists (select 1 from subscriptions s where s.employer_id = e.id and s.access_until > now()) subscribed
    from employers e left join industries i on i.id = e.industry_id left join employer_members m on m.employer_id = e.id and m.is_owner left join profiles p on p.id = m.user_id
    where e.verification_status = ${status} order by e.created_at ${status === 'pending' ? db()`asc` : db()`desc`} limit 100`;
  return (
    <>
      <PageHeader title="Employer verification" sub="Check the registration number against public records (GST portal, MCA) and the email domain against the website before verifying." />
      <nav className="mb-5 flex gap-2 text-sm">{TABS.map((t) => <Link key={t} href={`/admin/employers?status=${t}`} className={cx('rounded-full px-3 py-1.5 font-medium capitalize', t === status ? 'bg-navy-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>{t}</Link>)}</nav>
      {rows.length === 0 ? <EmptyState title={`No ${status} employers`} /> : (
        <div className="space-y-4">{rows.map((e) => (
          <Card key={e.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-display text-lg font-bold text-navy-900">{e.name} <Badge>{e.kind}</Badge> {e.subscribed && <Badge tone="good">Subscribed</Badge>} {e.open_reports > 0 && <Badge tone="bad">{e.open_reports} open report(s)</Badge>}</p>
                <p className="text-sm text-slate-600">{[e.industry, e.company_size && `${e.company_size} people`, [e.city, e.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p></div>
              <p className="text-xs text-slate-500">Registered {dateIN(e.created_at)}</p>
            </div>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500 uppercase">{e.registration_type ?? 'Registration'}</dt><dd className="font-mono font-medium">{e.registration_number ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500 uppercase">Website</dt><dd>{e.website ? <a className="text-accent-700 hover:underline" href={e.website} target="_blank" rel="noopener noreferrer nofollow">{e.website}</a> : '—'}</dd></div>
              <div><dt className="text-xs text-slate-500 uppercase">Recruiter</dt><dd>{e.recruiter} {e.designation && `(${e.designation})`}<br />{e.recruiter_email} · {e.recruiter_phone ?? 'no phone'}</dd></div>
            </dl>
            {e.verification_notes && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Last note: {e.verification_notes}</p>}
            <ActionForm action={verifyEmployer} submit="Record decision" className="mt-4 border-t border-slate-100 pt-4">
              <input type="hidden" name="id" value={e.id} />
              <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                <Select name="decision" defaultValue={status === 'pending' ? 'verified' : status} aria-label="Decision" options={[{ value: 'verified', label: 'Verify' }, { value: 'rejected', label: 'Reject' }, { value: 'suspended', label: 'Suspend' }, { value: 'pending', label: 'Back to pending' }]} />
                <input name="notes" className="input" placeholder="Note to the employer (required unless verifying)" maxLength={500} aria-label="Note" />
              </div>
            </ActionForm>
          </Card>))}</div>)}
    </>
  );
}
