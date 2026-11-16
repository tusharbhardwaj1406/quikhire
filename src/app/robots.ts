import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/candidate', '/employer', '/admin', '/api', '/auth', '/onboarding', '/dashboard'] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
