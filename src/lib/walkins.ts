import { z } from 'zod';

const opt = (max: number) => z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(max).nullable().optional());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD.');

/** One walk-in interview. Used by the employer form, the admin form and the admin JSON import. */
export const walkinSchema = z.object({
  region: z.string().trim().min(1, 'Choose a region.').max(40),          // region id, slug, name or a known city alias
  company_name: z.string().trim().min(2, 'Enter the company name.').max(160),
  role_title: z.string().trim().min(2, 'Enter the role.').max(200),
  summary: opt(1500), experience_text: opt(120), qualification_text: opt(200), salary_text: opt(120),
  skills: z.preprocess((v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 15), z.array(z.string().max(40))),
  openings: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().positive().max(100000).nullable().optional()),
  start_date: day,
  end_date: z.preprocess((v) => v || undefined, day.optional()),
  time_text: opt(80), venue: opt(200), address: opt(400), how_to_attend: opt(800),
  source_name: opt(120),
  source_url: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(500).regex(/^https?:\/\/\S+$/i, 'The source link must start with https://').nullable().optional()),
}).refine((w) => !w.end_date || w.end_date >= w.start_date, { message: 'The end date cannot be before the start date.' });
export type WalkinInput = z.infer<typeof walkinSchema>;

export function resolveRegion(input: string, regions: { id: number; slug: string; name: string; city_aliases: string[] }[]): number | null {
  const v = input.trim().toLowerCase();
  return regions.find((r) => String(r.id) === v || r.slug === v || r.name.toLowerCase() === v || r.city_aliases.includes(v))?.id ?? null;
}

export function walkinRow(w: WalkinInput, regionId: number) {
  const { region: _region, ...rest } = w;
  return { ...rest, region_id: regionId, end_date: w.end_date ?? w.start_date, summary: w.summary ?? null, experience_text: w.experience_text ?? null,
    qualification_text: w.qualification_text ?? null, salary_text: w.salary_text ?? null, openings: w.openings ?? null, time_text: w.time_text ?? null,
    venue: w.venue ?? null, address: w.address ?? null, how_to_attend: w.how_to_attend ?? null, source_name: w.source_name ?? null, source_url: w.source_url ?? null };
}
