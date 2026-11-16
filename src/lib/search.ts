import { z } from 'zod';

const num = z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(0).max(100000000).optional());
const text = z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().replace(/[%_\\]/g, '').slice(0, 80) : undefined), z.string().optional());
const list = (allowed?: readonly string[]) => z.preprocess(
  (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(',')).map((s: string) => String(s).trim()).filter(Boolean),
  z.array(allowed ? z.enum(allowed as [string, ...string[]]) : z.string().max(60)).max(15));

/** Validated employer search filters. Everything is optional; the database applies them together (AND). */
export const filterSchema = z.object({
  q: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined), z.string().optional()),
  industry_id: num, domain_id: num,
  specialisation_ids: list(), specialisations_mode: z.enum(['any', 'all']).optional(),
  skills: list(), skills_mode: z.enum(['any', 'all']).optional(),
  exp_min: num, exp_max: num, relevant_exp_min: num,
  region: z.preprocess((v) => (typeof v === 'string' && /^[a-z-]{2,30}$/.test(v) ? v : undefined), z.string().optional()),
  city: text, preferred_city: text, state: text, country: text,
  designation: text, previous_employer: text, qualification: text, certification: text,
  expected_ctc_min: num, expected_ctc_max: num, last_ctc_max: num,
  availability: list(['immediate', 'within_7_days', 'within_15_days', 'within_30_days']),
  employment_types: list(['full_time', 'contract', 'freelance']),
  work_modes: list(['remote', 'hybrid', 'onsite']),
  updated_within_days: num,
  verification: z.enum(['self_declared', 'verified']).optional(),
  sort: z.enum(['relevance', 'experience', 'availability', 'updated']).optional(),
});
export type Filters = z.infer<typeof filterSchema>;

/** Drops empty values so saved searches and the SQL function only see what was actually chosen. */
export function compact(f: Filters): Record<string, unknown> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)));
}

export function parseFilters(input: Record<string, string | string[] | undefined>): Record<string, unknown> {
  const parsed = filterSchema.safeParse(input);
  return parsed.success ? compact(parsed.data) : {};
}

/** City names a recruiter might type → launch region slug. Other cities fall back to a plain city filter. */
const REGION_ALIASES: Record<string, [string, string]> = {
  'delhi ncr': ['delhi-ncr', 'Delhi NCR'], ncr: ['delhi-ncr', 'Delhi NCR'], 'new delhi': ['delhi-ncr', 'Delhi NCR'], delhi: ['delhi-ncr', 'Delhi NCR'],
  gurgaon: ['delhi-ncr', 'Delhi NCR'], gurugram: ['delhi-ncr', 'Delhi NCR'], noida: ['delhi-ncr', 'Delhi NCR'], ghaziabad: ['delhi-ncr', 'Delhi NCR'], faridabad: ['delhi-ncr', 'Delhi NCR'],
  bangalore: ['bengaluru', 'Bengaluru'], bengaluru: ['bengaluru', 'Bengaluru'], 'navi mumbai': ['mumbai', 'Mumbai'], thane: ['mumbai', 'Mumbai'], mumbai: ['mumbai', 'Mumbai'], bombay: ['mumbai', 'Mumbai'],
  pune: ['pune', 'Pune'], hyderabad: ['hyderabad', 'Hyderabad'], secunderabad: ['hyderabad', 'Hyderabad'], chennai: ['chennai', 'Chennai'], madras: ['chennai', 'Chennai'],
  kolkata: ['kolkata', 'Kolkata'], calcutta: ['kolkata', 'Kolkata'],
};
const CITY_ALIASES: Record<string, string> = { ahmedabad: 'Ahmedabad', jaipur: 'Jaipur', lucknow: 'Lucknow', kochi: 'Kochi', chandigarh: 'Chandigarh',
  indore: 'Indore', coimbatore: 'Coimbatore', nagpur: 'Nagpur', bhubaneswar: 'Bhubaneswar' };

/**
 * Rule-based natural-language query → structured filters (no AI service required, fully explainable).
 * "Find 15 immediately available bridge engineers in Delhi NCR with 8–12 years of experience and Midas Civil expertise"
 * The recruiter always sees and can correct the resulting filters. Nothing here ranks or rejects people.
 */
export function parseNaturalQuery(input: string, knownSkills: string[] = []): { filters: Record<string, unknown>; explanation: string[] } {
  let rest = ` ${input.toLowerCase().replace(/[,.;]/g, ' ')} `;
  const filters: Record<string, unknown> = {};
  const explanation: string[] = [];
  const take = (re: RegExp) => { const m = rest.match(re); if (m) rest = rest.replace(m[0], ' '); return m; };

  let m = take(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?/);
  if (m) { filters.exp_min = Number(m[1]); filters.exp_max = Number(m[2]); explanation.push(`Experience ${m[1]}–${m[2]} years`); }
  else if ((m = take(/(?:at least|minimum|min|over|more than)?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+experience)?/))) {
    filters.exp_min = Number(m[1]); explanation.push(`Experience ${m[1]}+ years`);
  }
  if (take(/\b(immediately available|immediate joiners?|available immediately|join immediately|immediate)\b/)) {
    filters.availability = ['immediate']; explanation.push('Available immediately');
  } else if ((m = take(/within\s+(7|15|30)\s+days/))) {
    const all = ['immediate', 'within_7_days', 'within_15_days', 'within_30_days'];
    filters.availability = all.slice(0, all.indexOf(`within_${m[1]}_days`) + 1); explanation.push(`Can join within ${m[1]} days`);
  }
  for (const mode of ['remote', 'hybrid']) if (take(new RegExp(`\\b${mode}\\b`))) { filters.work_modes = [mode]; explanation.push(`Work mode: ${mode}`); }
  if (take(/\bon-?site\b/)) { filters.work_modes = ['onsite']; explanation.push('Work mode: on-site'); }

  let placed = false;
  for (const alias of Object.keys(REGION_ALIASES).sort((a, b) => b.length - a.length)) {
    if (take(new RegExp(`\\b(?:in|at|from|near|based in)?\\s*${alias}\\b`))) { filters.region = REGION_ALIASES[alias][0]; explanation.push(`Region: ${REGION_ALIASES[alias][1]}`); placed = true; break; }
  }
  if (!placed) for (const alias of Object.keys(CITY_ALIASES)) {
    if (take(new RegExp(`\\b(?:in|at|from|near|based in)?\\s*${alias}\\b`))) { filters.city = CITY_ALIASES[alias]; explanation.push(`Location: ${CITY_ALIASES[alias]}`); break; }
  }
  const skills: string[] = [];
  for (const s of [...knownSkills].sort((a, b) => b.length - a.length)) {
    const esc = s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (take(new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`))) skills.push(s);
  }
  if (skills.length) { filters.skills = skills; filters.skills_mode = 'all'; explanation.push(`Skills: ${skills.join(', ')}`); }

  const STOP = new Set(['find', 'show', 'me', 'get', 'need', 'looking', 'for', 'with', 'and', 'or', 'of', 'in', 'the', 'a', 'an', 'who', 'can', 'are', 'is',
    'available', 'candidates', 'candidate', 'professionals', 'people', 'experience', 'expertise', 'skills', 'having', 'have', 'has', 'to', 'join', 'at', 'least', 'years']);
  const words = rest.split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
  if (words.length) { filters.q = words.join(' '); explanation.push(`Keywords: ${filters.q}`); }
  return { filters, explanation };
}

/** Filters → URL query string (arrays become comma lists), for links, pagination and saved searches. */
export function toQuery(filters: Record<string, unknown>, extra: Record<string, string | number> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) {
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return sp.toString();
}
