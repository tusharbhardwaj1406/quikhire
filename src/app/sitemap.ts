import type { MetadataRoute } from 'next';
import { getIndustries } from '@/lib/data';
import { env } from '@/lib/env';

export const revalidate = 3600;
/** Public pages only. Candidate profiles are never listed or indexable. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const industries = await getIndustries().catch(() => []);
  const fixed = ['', '/pricing', '/signup/candidate', '/signup/employer', '/legal/terms', '/legal/privacy', '/legal/refunds', '/legal/employer-verification', '/legal/grievance'];
  return [
    ...fixed.map((p) => ({ url: `${env.siteUrl}${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.6 })),
    ...industries.map((i) => ({ url: `${env.siteUrl}/immediate-joiners/${i.slug}`, changeFrequency: 'daily' as const, priority: 0.8 })),
  ];
}
