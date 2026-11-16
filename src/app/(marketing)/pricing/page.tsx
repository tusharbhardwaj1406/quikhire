import type { Metadata } from 'next';
import { LinkButton } from '@/components/ui';
import { inr } from '@/lib/brand';
import { getPlans, type Plan } from '@/lib/data';

export const revalidate = 600;
export const metadata: Metadata = { title: 'Pricing', description: 'Two simple monthly plans. No hidden charges. Cancel anytime.', alternates: { canonical: '/pricing' } };

const FEATURES = {
  candidate: ['Detailed professional profile with multiple resume versions', 'Listing in the immediate-joiner directory', 'Industry, specialisation and skills classification',
    'Profile views and recruiter enquiry tracking', 'Enquiry and interview notifications', 'Full privacy controls, pause anytime'],
  employer: ['Search and filter the immediate-joiner directory', 'Detailed candidate profiles', 'Resume downloads where the candidate allows it',
    'Contact candidates through enquiries', 'Shortlists, saved searches and a hiring pipeline', 'Alerts when matching candidates join'],
};

export default async function Pricing() {
  const plans = await getPlans().catch(() => [] as Plan[]);
  const card = (audience: 'candidate' | 'employer', title: string, fallback: number, href: string) => {
    const p = plans.find((x) => x.audience === audience);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-4"><span className="font-display text-4xl font-extrabold text-navy-900">{inr(p?.amount_paise ?? fallback)}</span><span className="text-slate-600"> / month</span></p>
        <p className="text-sm text-slate-500">{p?.gst_mode === 'exclusive' ? `plus ${Number(p.gst_rate)}% GST` : 'inclusive of GST'}</p>
        <ul className="mt-6 space-y-2.5 text-sm text-slate-700">{FEATURES[audience].map((f) => <li key={f} className="flex gap-2"><span className="text-accent-600">✓</span>{f}</li>)}</ul>
        <LinkButton href={href} className="mt-8 w-full" variant={audience === 'candidate' ? 'accent' : 'primary'}>Get started</LinkButton>
      </div>
    );
  };
  return (
    <div className="container-page py-16">
      <h1 className="text-center text-4xl font-extrabold">Simple, honest pricing</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">Two plans. No setup fees, no hidden charges, cancel whenever you like.</p>
      <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
        {card('candidate', 'Candidates', 14900, '/signup/candidate')}
        {card('employer', 'Employers & recruiters', 149900, '/signup/employer')}
      </div>
      <div className="mx-auto mt-10 max-w-3xl rounded-xl bg-navy-50 p-5 text-sm text-navy-800">
        <p className="font-semibold">How renewal works</p>
        <p className="mt-1">Subscriptions renew monthly only if you approve an auto-pay mandate (UPI AutoPay or card) at checkout. Your bank notifies you before every debit. You can cancel from your dashboard at any time and keep access until the end of the period you have paid for.</p>
      </div>
    </div>
  );
}
