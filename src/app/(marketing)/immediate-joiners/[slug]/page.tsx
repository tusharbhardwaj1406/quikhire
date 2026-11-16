import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LinkButton } from '@/components/ui';
import { asAnon } from '@/lib/db';
import { getPublicStats } from '@/lib/data';

export const revalidate = 600;
type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return asAnon(async (tx) => {
    const [industry] = await tx`select id, name, slug from industries where slug = ${slug} and is_active`;
    if (!industry) return null;
    const specs = await tx`select s.name, d.name as domain from specialisations s left join functional_domains d on d.id = s.domain_id
      where s.industry_id = ${industry.id} and s.is_active order by d.name, s.name`;
    return { industry, specs };
  }).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).slug);
  if (!data) return {};
  const title = `Immediate Joiner ${data.industry.name} Professionals`;
  return { title, description: `Hire ${data.industry.name} professionals in India who can join immediately or within 30 days. Verified employers only.`,
    alternates: { canonical: `/immediate-joiners/${data.industry.slug}` } };
}

/** Public SEO landing page. Shows taxonomy and aggregate counts only — never any individual's data. */
export default async function IndustryLanding({ params }: Props) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const stats = await getPublicStats();
  const count = stats?.by_industry[data.industry.slug] ?? 0;
  const domains = [...new Set(data.specs.map((s) => s.domain ?? 'General'))];
  return (
    <div className="container-page py-14">
      <p className="text-sm font-semibold text-accent-700">Immediate joiners</p>
      <h1 className="mt-1 max-w-3xl text-4xl font-extrabold">{data.industry.name} professionals who can join now</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        {count >= 25 ? `${count.toLocaleString('en-IN')} professionals in this industry are currently listed as available within 30 days.`
          : 'We are onboarding professionals in this industry now. Create a profile to be among the first employers see.'}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <LinkButton href="/signup/candidate" variant="accent">I&rsquo;m available in this field</LinkButton>
        <LinkButton href="/signup/employer" variant="outline">I&rsquo;m hiring in this field</LinkButton>
      </div>
      <h2 className="mt-12 text-2xl font-bold">Specialisations</h2>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        {domains.map((d) => (
          <div key={d} className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="font-semibold">{d}</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {data.specs.filter((s) => (s.domain ?? 'General') === d).map((s) => <li key={s.name} className="rounded-full bg-navy-50 px-3 py-1 text-sm text-navy-800">{s.name}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
