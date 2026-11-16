import Link from 'next/link';
import { SubmitButton } from '@/components/forms';
import { Alert, AvailabilityBadge, Badge, Card, LinkButton, PageHeader, Stat } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { dateIN, daysAgo } from '@/lib/brand';
import { getBilling, getLaunch, getSettings, getWalkins } from '@/lib/data';
import { asUser } from '@/lib/db';
import { markRead, reconfirmAvailability } from './actions';

export default async function CandidateDashboard() {
  const user = await requireRole('candidate');
  const [data, billing, settings] = await Promise.all([
    asUser(user.id, async (tx) => {
      const [c] = await tx`select * from candidates where user_id = ${user.id}`;
      const [n] = await tx`select
        (select count(*)::int from profile_views where candidate_id = ${user.id}) as views,
        (select count(*)::int from profile_views where candidate_id = ${user.id} and created_at > now() - interval '30 days') as views_30d,
        (select count(*)::int from enquiries where candidate_id = ${user.id}) as enquiries,
        (select count(*)::int from enquiries where candidate_id = ${user.id} and status = 'sent') as enquiries_open,
        (select count(*)::int from enquiries where candidate_id = ${user.id} and kind = 'interview_request') as interviews,
        (select count(*)::int from resume_downloads where candidate_id = ${user.id}) as downloads,
        (select count(*)::int from resumes where candidate_id = ${user.id}) as resumes`;
      const activity = await tx`select id, title, body, link, read_at, created_at from notifications where user_id = ${user.id} order by created_at desc limit 10`;
      return { c, n, activity };
    }),
    getBilling({ userId: user.id }), getSettings(),
  ]);
  const launch = await getLaunch();
  const [region] = data.c.region_id ? await asUser(user.id, (tx) => tx`select slug, name from regions where id = ${data.c.region_id}`) : [];
  const walkins = data.c.region_id ? await getWalkins(data.c.region_id) : [];
  const { c, n, activity } = data;
  const needsSub = settings.require_candidate_subscription === true && !launch.free;
  const reconfirmDays = Number(settings.availability_reconfirm_days ?? 30);
  const dueIn = c.availability_confirmed_at ? reconfirmDays - Math.floor((Date.now() - new Date(c.availability_confirmed_at).getTime()) / 86400000) : null;
  const checklist: [boolean, string, string][] = [
    [c.onboarding_complete, 'Complete the essentials of your profile', '/candidate/profile'],
    [!needsSub || billing.live, 'Activate your subscription', '/candidate/billing'],
    [c.availability_status === 'active' && Boolean(c.availability), 'Confirm your availability', '/candidate'],
    [c.visibility === 'visible', 'Profile visibility is switched on', '/candidate/settings'],
    [n.resumes > 0, 'Upload a resume (recommended)', '/candidate/resumes'],
  ];
  return (
    <>
      <PageHeader title={`Welcome${user.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}`} sub="Here is how employers are seeing you right now."
        action={<LinkButton href="/candidate/profile" variant="outline" small>Edit profile</LinkButton>} />
      <div className="space-y-6">
        {c.listed
          ? <Alert tone="good" title="You are visible to verified employers">Your profile is live in the immediate-joiner directory as “{c.show_full_name ? user.fullName : `Candidate ${c.public_code}`}”.</Alert>
          : <Alert tone="warn" title="Your profile is not in employer search yet">Finish the steps below to go live.</Alert>}
        {c.availability_status === 'confirmation_pending' && (
          <Alert tone="bad" title="Availability confirmation pending" action={<form action={reconfirmAvailability}><SubmitButton variant="accent" small>Yes, I&rsquo;m still available</SubmitButton></form>}>
            Your profile is paused from search until you confirm you can still join as stated.
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Profile completeness" value={`${c.profile_completeness}%`} hint={c.profile_completeness < 80 ? 'Fuller profiles are found more often' : 'Looking strong'} />
          <Stat label="Profile views" value={n.views} hint={`${n.views_30d} in the last 30 days`} />
          <Stat label="Recruiter enquiries" value={n.enquiries} hint={n.enquiries_open ? `${n.enquiries_open} awaiting your reply` : `${n.interviews} interview requests`} />
          <Stat label="Resume downloads" value={n.downloads} hint={c.allow_resume_download ? 'Downloads allowed' : 'Downloads switched off'} />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Availability" className="lg:col-span-2" action={c.availability && <form action={reconfirmAvailability}><SubmitButton variant="outline" small>Reconfirm now</SubmitButton></form>}>
            <AvailabilityBadge availability={c.availability} verification={c.availability_verification} confirmedAt={c.availability_confirmed_at} />
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-slate-500">Earliest joining date</dt><dd className="font-medium">{dateIN(c.earliest_joining_date)}</dd></div>
              <div><dt className="text-slate-500">Last confirmed</dt><dd className="font-medium">{dateIN(c.availability_confirmed_at)}</dd></div>
              <div><dt className="text-slate-500">Next confirmation due</dt><dd className="font-medium">{dueIn == null ? '—' : dueIn <= 0 ? 'Now' : `in ${dueIn} day${dueIn === 1 ? '' : 's'}`}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">Employers see when you last confirmed. We ask every {reconfirmDays} days so the directory stays trustworthy.</p>
          </Card>
          <Card title="Subscription" action={<Link href="/candidate/billing" className="text-sm font-medium text-accent-700 hover:underline">Manage</Link>}>
            {billing.live ? (<><Badge tone="good">Active</Badge><p className="mt-3 text-sm text-slate-600">{billing.sub.cancel_at_period_end || billing.sub.status === 'cancelled' ? 'Ends' : 'Renews'} on <strong>{dateIN(billing.sub.current_period_end ?? billing.sub.access_until)}</strong></p></>)
              : (<><Badge tone={needsSub ? 'warn' : 'good'}>{needsSub ? 'Not active' : 'Free launch period'}</Badge><p className="mt-3 text-sm text-slate-600">{needsSub ? 'A subscription is needed to appear in employer search.' : launch.endsAt ? `Listing is free until ${dateIN(launch.endsAt)}.` : `Listing is free for the first ${launch.days} days after launch.`}</p></>)}
          </Card>
        </div>
        {region && (
          <Card title={`Walk-ins in ${region.name} this week`} action={<Link href={`/in/${region.slug}#walk-ins`} className="text-sm font-medium text-accent-700 hover:underline">See all</Link>}>
            {walkins.length === 0 ? <p className="text-sm text-slate-500">None listed for the next 7 days yet.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">{walkins.slice(0, 4).map((w) => (
                <li key={w.id} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-medium text-navy-900">{w.role_title}</span> · {w.company_name}</span><span className="text-slate-500">{dateIN(w.start_date)}{w.time_text ? `, ${w.time_text}` : ''}</span></li>))}</ul>)}
          </Card>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Go-live checklist">
            <ul className="space-y-2.5 text-sm">
              {checklist.map(([done, label, href]) => (
                <li key={label} className="flex items-center gap-3">
                  <span className={done ? 'text-accent-600' : 'text-slate-300'} aria-hidden="true">{done ? '●' : '○'}</span>
                  {done ? <span className="text-slate-500 line-through">{label}</span> : <Link href={href} className="font-medium text-navy-900 hover:underline">{label}</Link>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Activity" action={activity.some((a) => !a.read_at) && <form action={markRead}><button className="text-sm font-medium text-accent-700 hover:underline">Mark all read</button></form>}>
            {activity.length === 0 ? <p className="text-sm text-slate-500">Nothing yet. Views and enquiries from employers will appear here.</p> : (
              <ul className="divide-y divide-slate-100">
                {activity.map((a) => (
                  <li key={a.id} className="py-2.5 text-sm">
                    <Link href={a.link ?? '/candidate'} className="flex items-start justify-between gap-3">
                      <span><span className={a.read_at ? 'text-slate-700' : 'font-semibold text-navy-900'}>{a.title}</span>{a.body && <span className="block text-slate-500">{a.body}</span>}</span>
                      <span className="shrink-0 text-xs text-slate-400">{daysAgo(a.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
