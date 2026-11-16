import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { brand } from '@/lib/brand';
import { env } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  openGraph: { type: 'website', siteName: brand.name, title: `${brand.name} — ${brand.tagline}`, description: brand.description, locale: 'en_IN' },
  twitter: { card: 'summary_large_image', title: brand.name, description: brand.description },
  alternates: { canonical: '/' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b1f3a' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
