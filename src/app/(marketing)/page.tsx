import Link from 'next/link';
import { LinkButton } from '@/components/ui';
import { brand, inr } from '@/lib/brand';
import { getIndustries, getPlans, getPublicStats, type Industry, type Plan } from '@/lib/data';

export const revalidate = 600;

const FAQ: [string, string][] = [
  ['Who is ZeroNotice for?', 'Professionals who can start a new role now or within 30 days — whatever the reason — and employers who need to hire without waiting out a notice period.'],
  ['Do I have to say why I am available?', 'No. The reason is optional and is never shown to employers unless you choose to share it. We never label anyone as laid off or terminated.'],
  ['Who can see my details?', 'Only verified employers with an active subscription can search the directory. Your name, email, phone, salary and resume stay hidden until you switch them on, or until you accept an employer’s enquiry.'],
  ['How do you keep availability reliable?', 'Every profile shows when availability was last confirmed and whether it is self-declared or verified. If you do not reconfirm in time, your profile is paused from search until you do. It takes one click.'],
  ['How are employers verified?', 'Each company submits registration details (such as GSTIN or CIN) and is reviewed by our team before it can see any candidate.'],
  ['How does billing work?', 'Plans are monthly. If you choose auto-renewal you approve a mandate with your bank or UPI app, you are notified before each debit, and you can cancel at any time from your dashboard. No hidden charges.'],
];

function price(plans: Plan[], audience: string, fallback: number) {
  const p = plans.find((x) => x.audience === audience);
  return { amount: inr(p?.amount_paise ?? fallback), gst: p?.gst_mode === 'exclusive' ? 'plus GST' : 'including GST' };
}

export default async function Home() {
  const [stats, industries, plans] = await Promise.all([
    getPublicStats(), getIndustries().catch(() => [] as Industry[]), getPlans().catch(() => [] as Plan[])]);
  const cand = price(plans, 'candidate', 14900), emp = price(plans, 'employer', 149900);
  // Numbers are shown only when they are real and large enough to be meaningful.
  const showNumbers = stats && stats.listed_candidates >= 100;

  return (
    <>
      <section className="bg-navy-900 text-white">
        <div className="container-page grid gap-10 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-accent-100">India&rsquo;s immediate-joiner marketplace</p>
            <h1 className="mt-5 text-4xl leading-tight font-extrabold !text-white sm:text-5xl">Looking for a job? Available immediately? <span className="text-accent-500">Get discovered.</span></h1>
            <p className="mt-5 max-w-xl text-lg text-navy-100">{brand.tagline} A dedicated directory where professionals who can join now meet verified employers who cannot wait 90 days.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/signup/candidate" variant="accent">I&rsquo;m available — create my profile</LinkButton>
              <LinkButton href="/signup/employer" variant="outline">I&rsquo;m hiring — register my company</LinkButton>
            </div>
            <p className="mt-4 text-sm text-navy-100/80">Candidates {cand.amount}/month · Employers {emp.amount}/month · Cancel anytime</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            {showNumbers ? (
              <dl className="grid grid-cols-2 gap-6">
                <div><dt className="text-sm text-navy-100">Professionals available now</dt><dd className="font-display text-3xl font-bold">{stats.listed_candidates.toLocaleString('en-IN')}</dd></div>
                <div><dt className="text-sm text-navy-100">Verified employers</dt><dd className="font-display text-3xl font-bold">{stats.verified_employers.toLocaleString('en-IN')}</dd></div>
                <div><dt className="text-sm text-navy-100">Industries covered</dt><dd className="font-display text-3xl font-bold">{stats.industries}</dd></div>
              </dl>
            ) : (
              <div>
                <p className="font-display text-xl font-bold">We are just getting started.</p>
                <p className="mt-2 text-sm text-navy-100">ZeroNotice is new, and we would rather tell you that than show invented numbers. Founding members shape the platform — and are first in line when employers start searching.</p>
                <ul className="mt-4 space-y-2 text-sm text-navy-100">
                  <li>✓ {industries.length || 30} industries and hundreds of specialisations ready</li>
                  <li>✓ Every employer manually verified</li>
                  <li>✓ You control what recruiters can see</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="container-page py-16">
        <h2 className="text-center text-3xl font-bold">How {brand.name} works</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          {[
            { who: 'For candidates', cta: ['Create my profile', '/signup/candidate'], steps: [
              ['Tell us what you do', 'Pick your industry and specialisations, add skills, experience and a resume.'],
              ['State when you can join', 'Immediately, or within 7, 15 or 30 days. Reconfirm with one click to stay visible.'],
              ['Choose what employers see', 'Name, contact details, salary and resume are private until you decide otherwise.'],
              ['Hear from verified employers', 'Enquiries and interview requests arrive in your dashboard. Accept only the ones you want.']] },
            { who: 'For employers', cta: ['Register my company', '/signup/employer'], steps: [
              ['Register and get verified', 'Submit your company details. Our team reviews every employer before granting access.'],
              ['Search precisely', 'Filter by industry, specialisation, skills, experience, location, salary and joining date.'],
              ['See availability you can trust', 'Each profile shows when availability was confirmed, and whether it is verified.'],
              ['Shortlist and reach out', 'Track candidates from shortlist to hire in a lightweight hiring workspace.']] },
          ].map((b) => (
            <div key={b.who} className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h3 className="text-lg font-bold">{b.who}</h3>
              <ol className="mt-5 space-y-4">
                {b.steps.map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-50 font-display font-bold text-accent-700">{i + 1}</span>
                    <div><p className="font-semibold text-navy-900">{t}</p><p className="text-sm text-slate-600">{d}</p></div>
                  </li>
                ))}
              </ol>
              <LinkButton href={b.cta[1]} className="mt-6">{b.cta[0]}</LinkButton>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container-page grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">Why candidates choose us</h2>
            <ul className="mt-5 space-y-3 text-slate-700">
              {['Your availability is a strength here, not a question mark.', 'Visibility with employers who are specifically looking for people who can start now.',
                'Full control: pause your profile, hide details, export or delete your data at any time.', 'See who viewed your profile and which companies showed interest.',
                `One simple plan: ${cand.amount} a month, ${cand.gst}.`].map((t) => <li key={t} className="flex gap-3"><span className="text-accent-600">✓</span>{t}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Why employers choose us</h2>
            <ul className="mt-5 space-y-3 text-slate-700">
              {['Every profile in the directory can join within 30 days — most immediately.', 'Availability is reconfirmed regularly, so you are not chasing stale profiles.',
                'Structured taxonomy: find a bridge engineer with MIDAS Civil, not just “engineer”.', 'A built-in workspace to shortlist, contact and track candidates.',
                `One simple plan: ${emp.amount} a month, ${emp.gst}.`].map((t) => <li key={t} className="flex gap-3"><span className="text-accent-600">✓</span>{t}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section id="industries" className="container-page py-16">
        <h2 className="text-center text-3xl font-bold">Industries</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">Every candidate is classified by industry, functional domain, specialisation and skills.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((i) => (
            <Link key={i.id} href={`/immediate-joiners/${i.slug}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-navy-900 hover:border-accent-500">
              {i.name}
              {showNumbers && (stats.by_industry[i.slug] ?? 0) > 0 && <span className="text-xs text-slate-500">{stats.by_industry[i.slug]} available</span>}
            </Link>
          ))}
        </div>
      </section>

      <section id="faq" className="bg-white py-16">
        <div className="container-page max-w-3xl">
          <h2 className="text-center text-3xl font-bold">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold text-navy-900 marker:hidden">{q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }) }} />
    </>
  );
}
