import { ActionForm } from '@/components/forms';
import { Badge, Card, EmptyState, PageHeader, Select } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { AVAILABILITY, dateIN } from '@/lib/brand';
import { db } from '@/lib/db';
import { userAction } from '../actions';

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  await requireRole('admin');
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 80).replace(/[%_\\]/g, '');
  const sql = db();
  const where = sp.filter === 'deletion' ? sql`p.status = 'deletion_requested'` : sp.filter === 'suspended' ? sql`p.status = 'suspended'`
    : sp.filter === 'pending_availability' ? sql`c.availability_status = 'confirmation_pending'` : sp.filter === 'duplicates'
      ? sql`p.phone is not null and p.phone in (select phone from profiles where phone is not null group by phone having count(*) > 1)`
      : q ? sql`(p.email::text ilike ${'%' + q + '%'} or p.full_name ilike ${'%' + q + '%'} or p.phone ilike ${'%' + q + '%'} or c.public_code ilike ${q + '%'})` : sql`true`;
  const rows = await sql`select p.id, p.role, p.full_name, p.email, p.phone, p.status, p.created_at, c.public_code, c.listed, c.availability, c.availability_status, c.availability_verification,
      c.availability_confirmed_at, c.profile_completeness, c.current_designation, e.name employer_name,
      exists (select 1 from subscriptions s where (s.owner_user_id = p.id or s.employer_id = m.employer_id) and s.access_until > now()) subscribed
    from profiles p left join candidates c on c.user_id = p.id left join employer_members m on m.user_id = p.id left join employers e on e.id = m.employer_id
    where ${where} order by p.created_at desc limit 50`;
  return (
    <>
      <PageHeader title="Users" sub="Candidates, recruiters and admins. Every change here is written to the audit log." />
      <Card className="mb-5">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_16rem_auto]">
          <input name="q" defaultValue={q} className="input" placeholder="Search by name, email, phone or candidate code" aria-label="Search users" />
          <Select name="filter" defaultValue={sp.filter ?? ''} aria-label="Filter" placeholder="All users" options={[{ value: 'deletion', label: 'Deletion requests' }, { value: 'suspended', label: 'Suspended' }, { value: 'pending_availability', label: 'Availability pending' }, { value: 'duplicates', label: 'Possible duplicates (same phone)' }]} />
          <button className="rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white">Search</button>
        </form>
      </Card>
      {rows.length === 0 ? <EmptyState title="No users found" /> : (
        <div className="space-y-3">{rows.map((u) => (
          <Card key={u.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-navy-900">{u.full_name || '(no name)'} <Badge tone="info">{u.role ?? 'no role'}</Badge> {u.status !== 'active' && <Badge tone="bad">{u.status.replace('_', ' ')}</Badge>} {u.subscribed && <Badge tone="good">Subscribed</Badge>}</p>
                <p className="text-sm text-slate-600">{u.email} · {u.phone ?? 'no phone'} · joined {dateIN(u.created_at)}</p>
                {u.role === 'candidate' && <p className="mt-1 text-sm text-slate-600">{u.public_code} · {u.current_designation ?? 'no designation'} · {u.profile_completeness}% · {u.listed ? 'listed' : 'not listed'} · {AVAILABILITY[u.availability] ?? 'no availability'} ({u.availability_verification?.replace('_', '-')}, {u.availability_status?.replace('_', ' ')}, confirmed {dateIN(u.availability_confirmed_at)})</p>}
                {u.role === 'employer' && <p className="mt-1 text-sm text-slate-600">Company: {u.employer_name ?? 'not registered'}</p>}
              </div>
              {u.role !== 'admin' && (
                <ActionForm action={userAction} submit="Apply" variant="outline" className="flex flex-wrap items-center gap-2 space-y-0">
                  <input type="hidden" name="id" value={u.id} />
                  <Select name="op" aria-label="Action" className="w-56 py-2" options={[
                    u.status === 'suspended' ? { value: 'reinstate', label: 'Reinstate account' } : { value: 'suspend', label: 'Suspend account' },
                    ...(u.role === 'candidate' ? [u.availability_verification === 'verified' ? { value: 'unverify_availability', label: 'Mark availability self-declared' } : { value: 'verify_availability', label: 'Mark availability verified' }] : []),
                    { value: 'grant_access', label: 'Grant complimentary access' },
                    ...(u.status === 'deletion_requested' ? [{ value: 'delete', label: 'Erase account permanently' }] : [])]} />
                  <input name="days" type="number" min={1} max={366} defaultValue={30} className="input w-20 py-2" aria-label="Days of access" title="Days (for complimentary access)" />
                </ActionForm>
              )}
            </div>
          </Card>))}</div>)}
    </>
  );
}
