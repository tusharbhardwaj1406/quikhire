import type { Metadata } from 'next';
import Link from 'next/link';
import { WalkinCard, WalkinSafetyNote } from '@/components/walkins';
import { getRegions, getWalkins } from '@/lib/data';

export const revalidate = 900;
export const metadata: Metadata = { title: 'Walk-in interviews this week', alternates: { canonical: '/walk-ins' },
  description: 'Walk-in interviews over the next 7 days in Mumbai, Pune, Delhi NCR, Bengaluru, Kolkata, Chennai and Hyderabad, with date, venue and eligibility.' };

export default async function WalkinsIndex() {
  const [regions, walkins] = await Promise.all([getRegions().catch(() => []), getWalkins().catch(() => [])]);
  return (
    <div className="container-page py-14">
      <h1 className="text-4xl font-extrabold">Walk-in interviews: next 7 days</h1>
      <p className="mt-3 max-w-2xl text-slate-600">Choose your city for full details: dates, timing, venue, eligibility and how to attend.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{regions.map((r) => {
        const n = walkins.filter((w) => w.region_slug === r.slug).length;
        return (<Link key={r.id} href={`/in/${r.slug}#walk-ins`} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-accent-500">
          <p className="font-display text-lg font-bold text-navy-900">{r.name}</p><p className="mt-1 text-sm text-slate-600">{n === 0 ? 'None listed yet' : `${n} walk-in${n === 1 ? '' : 's'} this week`}</p></Link>);
      })}</div>
      <div className="mt-8"><WalkinSafetyNote /></div>
      {regions.filter((r) => walkins.some((w) => w.region_slug === r.slug)).map((r) => (
        <section key={r.id} className="mt-10">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold">{r.name}</h2><Link href={`/in/${r.slug}#walk-ins`} className="text-sm font-medium text-accent-700 hover:underline">See all in {r.name}</Link></div>
          <div className="space-y-4">{walkins.filter((w) => w.region_slug === r.slug).slice(0, 3).map((w) => <WalkinCard key={w.id} w={w} />)}</div>
        </section>))}
    </div>
  );
}
