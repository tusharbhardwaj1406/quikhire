import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LinkButton } from '@/components/ui';
import { WalkinCard, WalkinSafetyNote } from '@/components/walkins';
import { brand } from '@/lib/brand';
import { getIndustries, getPublicStats, getRegions, getWalkins } from '@/lib/data';

export const revalidate = 900;
type Props = { params: Promise<{ slug: string }> };
const find = async (slug: string) => (await getRegions().catch(() => [])).find((r) => r.slug === slug);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const region = await find((await params).slug);
  if (!region) return {};
  return { title: `Immediate joiners and walk-in interviews in ${region.name}`, alternates: { canonical: `/in/${region.slug}` },
    description: `Professionals in ${region.name} who can join immediately, and walk-in interviews happening in ${region.name} over the next 7 days.` };
}

/** Region hub: public, aggregate-only (no individual candidate data), plus this week's walk-ins in full. */
export default async function RegionPage({ params }: Props) {
  const region = await find((await params).slug);
  if (!region) notFound();
  const [walkins, stats, industries, regions] = await Promise.all([getWalkins(region.id), getPublicStats(), getIndustries().catch(() => []), getRegions()]);
  const listed = stats?.by_region?.[region.slug] ?? 0;
  const days = [...new Set(walkins.map((w) => w.start_date))];
  return (
    <>
      <section className="bg-navy-900 text-white">
        <div className="container-page py-14">
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Regions">{regions.map((r) => (
            <Link key={r.id} href={`/in/${r.slug}`} className={r.id === region.id ? 'rounded-full bg-accent-600 px-3 py-1 font-semibold' : 'rounded-full bg-white/10 px-3 py-1 hover:bg-white/20'}>{r.name}</Link>))}</nav>
          <h1 className="mt-6 text-4xl font-extrabold !text-white">{brand.name} {region.name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-navy-100">{listed >= 25 ? `${listed.toLocaleString('en-IN')} professionals in ${region.name} are listed as available to join within 30 days.`
            : `We are onboarding professionals and employers in ${region.name} now. Be among the first.`}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href="/signup/candidate" variant="accent">I&rsquo;m available in {region.name}</LinkButton>
            <LinkButton href="/signup/employer" variant="outline">I&rsquo;m hiring in {region.name}</LinkButton>
          </div>
        </div>
      </section>
      <section id="walk-ins" className="container-page py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-2xl font-bold">Walk-in interviews in {region.name}: next 7 days</h2>
            <p className="mt-1 text-sm text-slate-600">{walkins.length} listed. Verified employers post directly; other listings are gathered from public sources and link back to the original.</p></div>
          <LinkButton href="/walk-ins" variant="outline" small>All cities</LinkButton>
        </div>
        <div className="mt-5"><WalkinSafetyNote /></div>
        {walkins.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">No walk-ins are listed for {region.name} in the next 7 days yet. Employers: register to post yours free of charge.</p>
        ) : days.map((d) => (
          <div key={d} className="mt-8">
            <h3 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">{new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</h3>
            <div className="space-y-4">{walkins.filter((w) => w.start_date === d).map((w) => <WalkinCard key={w.id} w={w} />)}</div>
          </div>))}
      </section>
      <section className="container-page pb-12">
        <h2 className="text-2xl font-bold">Industries hiring in {region.name}</h2>
        <div className="mt-5 flex flex-wrap gap-2">{industries.map((i) => <Link key={i.id} href={`/immediate-joiners/${i.slug}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-navy-900 hover:border-accent-500">{i.name}</Link>)}</div>
      </section>
    </>
  );
}
