/** Single source of truth for naming. Change here if the brand changes before launch. */
export const brand = {
  name: 'QuikHire',
  tagline: 'Talent Without Waiting.',
  altTagline: 'Available Today. Valuable Tomorrow.',
  description: 'India’s marketplace for professionals who can join immediately, and the employers who need them now.',
  supportEmail: 'support@example.com',       // TODO(owner): set before launch
  grievanceEmail: 'grievance@example.com',   // TODO(owner): set before launch (DPDP grievance contact)
  legalVersion: '2026-11-draft',             // bump whenever Terms/Privacy text changes; stored with each consent
};

export const AVAILABILITY: Record<string, string> = {
  immediate: 'Available immediately',
  within_7_days: 'Within 7 days',
  within_15_days: 'Within 15 days',
  within_30_days: 'Within 30 days',
};
export const EMPLOYMENT_TYPES: Record<string, string> = { full_time: 'Full-time', contract: 'Contract', freelance: 'Freelance' };
export const WORK_MODES: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
export const EMPLOYMENT_STATUS = [
  'Between roles', 'Completed notice period', 'Contract or project ended', 'Returning from a career break',
  'Recent graduate', 'Currently employed, can join immediately', 'Prefer not to say',
];
export const STAGES: Record<string, string> = {
  saved: 'Saved', shortlisted: 'Shortlisted', contacted: 'Contacted', interview: 'Interview', rejected: 'Not progressing', hired: 'Hired',
};
export const COMPANY_SIZES = ['1–10', '11–50', '51–200', '201–1,000', '1,001–5,000', '5,000+'];

export function inr(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100);
}
export function lakhs(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)} LPA` : `₹${n.toLocaleString('en-IN')}`;
}
export function years(v: number | string | null | undefined): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)} yr${n === 1 ? '' : 's'}`;
}
export function dateIN(v: string | Date | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
export function daysAgo(v: string | Date | null | undefined): string {
  if (!v) return 'never';
  const d = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}
