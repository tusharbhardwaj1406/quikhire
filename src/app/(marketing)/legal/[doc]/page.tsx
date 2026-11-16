import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { brand } from '@/lib/brand';

// IMPORTANT: these are working drafts that describe how the product actually behaves.
// They are NOT legal advice and must be reviewed by a qualified Indian lawyer before launch.
const DOCS: Record<string, { title: string; body: [string, string][] }> = {
  terms: { title: 'Terms of Service', body: [
    ['What ZeroNotice is', 'A subscription directory that connects professionals who are available to join within 30 days with verified employers and recruitment agencies. We are not an employer, a recruitment agent or a party to any employment contract.'],
    ['Accounts', 'You must give accurate information and keep your login secure. Candidates state their own availability and must keep it current. Employers must be genuine businesses and pass verification.'],
    ['Acceptable use', 'Employers may use candidate information only to evaluate and contact candidates about genuine job opportunities. Scraping, resale, unrelated marketing, discriminatory conduct, fake job offers and charging candidates for jobs are prohibited and lead to suspension.'],
    ['Subscriptions', 'Plans are billed monthly in INR. Prices and whether GST is included are shown before you pay. See the Refunds & Cancellation policy.'],
    ['No guarantee of employment', 'We provide visibility and tools. We do not guarantee interviews, offers or hires.']] },
  privacy: { title: 'Privacy Policy', body: [
    ['What we collect', 'Account details, professional profile information, resumes you upload, availability and salary information you choose to provide, and usage records such as profile views and enquiries.'],
    ['Why we use it', 'To operate the directory, show your profile to verified employers according to your settings, process payments, send service notifications and prevent misuse.'],
    ['What employers can see', 'By default: your designation, experience, skills, industry, city and availability. Your name, email, phone, salary and resume are hidden unless you turn them on or accept an employer’s enquiry. Contact details are never public and are never exposed to search engines.'],
    ['Your choices', 'You can pause your profile, change every visibility setting, withdraw consent, download your data and request deletion from Settings at any time.'],
    ['Retention and security', 'Resumes are stored in private storage and served through short-lived links. We keep data only as long as your account is active or as the law requires.'],
    ['Data protection law', 'We are building for compliance with India’s Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025.']] },
  refunds: { title: 'Refunds & Cancellation', body: [
    ['Cancelling', 'You can cancel from the Billing page at any time. Your subscription will not renew and you keep access until the end of the period already paid for.'],
    ['Auto-renewal', 'Renewal happens only under a mandate you approve at checkout. Your bank or UPI app notifies you before each debit, and you can also revoke the mandate from your UPI or banking app.'],
    ['Refunds', 'If you were charged in error or could not use the service because of a fault on our side, write to us within 7 days of the charge and we will refund it to the original payment method.']] },
  'employer-verification': { title: 'Employer Verification Policy', body: [
    ['Why we verify', 'Candidates trust us with personal information. Only genuine employers and recruitment agencies should be able to see it.'],
    ['What we check', 'Company name, website, an official business email, and a registration identifier such as GSTIN, CIN, LLPIN or Udyam number, checked against public records.'],
    ['Outcomes', 'Pending, Verified, Rejected or Suspended. Changing a company’s legal name or registration number sends it back for review. Reports of misuse are investigated and can lead to suspension.']] },
  grievance: { title: 'Grievance Redressal', body: [
    ['How to raise a concern', `Email ${brand.grievanceEmail} with your registered email address and a description of the issue. You can also use “Report” on any employer or enquiry.`],
    ['What happens next', 'We acknowledge complaints promptly and aim to resolve them within the timelines required by applicable law.'],
    ['Reporting misuse', 'Report fraudulent employers, fake job offers, requests for payment, discrimination or misuse of your data. We investigate every report.']] },
};

type Props = { params: Promise<{ doc: string }> };
export function generateStaticParams() { return Object.keys(DOCS).map((doc) => ({ doc })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = DOCS[(await params).doc];
  return d ? { title: d.title, alternates: { canonical: `/legal/${(await params).doc}` } } : {};
}

export default async function LegalDoc({ params }: Props) {
  const d = DOCS[(await params).doc];
  if (!d) notFound();
  return (
    <article className="container-page max-w-3xl py-14">
      <h1 className="text-3xl font-extrabold">{d.title}</h1>
      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">Draft {brand.legalVersion}. Pending review by legal counsel — not yet final.</p>
      {d.body.map(([h, t]) => (<section key={h} className="mt-8"><h2 className="text-lg font-bold">{h}</h2><p className="mt-2 leading-relaxed text-slate-700">{t}</p></section>))}
      <p className="mt-10 text-sm text-slate-500">Questions: {brand.supportEmail}</p>
    </article>
  );
}
