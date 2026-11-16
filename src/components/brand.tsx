import Link from 'next/link';
import type { ReactNode } from 'react';
import { brand } from '@/lib/brand';
import { LinkButton, cx } from './ui';

/** Mark: a ring with a forward tick: ready now, hired quickly. */
export function Logo({ light, className }: { light?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-display text-lg font-extrabold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={light ? '#ffffff' : '#0b1f3a'} />
        <circle cx="16" cy="16" r="8" fill="none" stroke="#14b8a6" strokeWidth="3.2" />
        <path d="M13 16.2l2.2 2.2 4-4.6" fill="none" stroke={light ? '#0b1f3a' : '#ffffff'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={light ? 'text-white' : 'text-navy-900'}>Quik<span className="text-accent-500">Hire</span></span>
    </span>
  );
}

export function SiteHeader({ signedInHref }: { signedInHref?: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Link href="/" aria-label={`${brand.name} home`}><Logo /></Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-700 md:flex" aria-label="Main">
          <Link href="/#how-it-works" className="hover:text-navy-900">How it works</Link>
          <Link href="/#cities" className="hover:text-navy-900">Cities</Link>
          <Link href="/walk-ins" className="hover:text-navy-900">Walk-ins</Link>
          <Link href="/#industries" className="hover:text-navy-900">Industries</Link>
          <Link href="/pricing" className="hover:text-navy-900">Pricing</Link>
          <Link href="/#faq" className="hover:text-navy-900">FAQ</Link>
        </nav>
        <div className="flex items-center gap-2">
          {signedInHref ? <LinkButton href={signedInHref} small>My dashboard</LinkButton> : (
            <>
              <LinkButton href="/login" variant="ghost" small>Log in</LinkButton>
              <LinkButton href="/signup/candidate" variant="accent" small className="hidden sm:inline-flex">Get discovered</LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const col = (title: string, links: [string, string][]) => (
    <div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-navy-100/80">{links.map(([l, h]) => <li key={h}><Link href={h} className="hover:text-white">{l}</Link></li>)}</ul>
    </div>
  );
  return (
    <footer className="mt-20 bg-navy-950">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div><Logo light /><p className="mt-3 max-w-xs text-sm text-navy-100/70">{brand.tagline} {brand.description}</p></div>
        {col('Candidates', [['Create your profile', '/signup/candidate'], ['Walk-ins this week', '/walk-ins'], ['Pricing', '/pricing'], ['Log in', '/login']])}
        {col('Employers', [['Register your company', '/signup/employer'], ['Pricing', '/pricing'], ['Employer verification', '/legal/employer-verification']])}
        {col('Legal', [['Terms of Service', '/legal/terms'], ['Privacy Policy', '/legal/privacy'], ['Refunds & cancellation', '/legal/refunds'], ['Grievance redressal', '/legal/grievance']])}
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-navy-100/60">© {new Date().getFullYear()} {brand.name}. Being immediately available does not make talent immediately replaceable.</div>
    </footer>
  );
}

export function PortalShell({ nav, userName, badge, children, banner }: {
  nav: { href: string; label: string }[]; userName: string; badge: string; children: ReactNode; banner?: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="container-page flex h-14 items-center justify-between gap-3">
          <Link href="/"><Logo /></Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{userName}</span>
            <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-700">{badge}</span>
            <form action="/auth/signout" method="post"><button className="font-medium text-slate-600 hover:text-navy-900">Sign out</button></form>
          </div>
        </div>
        <nav className="container-page -mb-px flex gap-1 overflow-x-auto text-sm font-medium" aria-label="Portal">
          {nav.map((n) => <Link key={n.href} href={n.href} className="shrink-0 border-b-2 border-transparent px-3 py-2.5 text-slate-600 hover:border-accent-500 hover:text-navy-900">{n.label}</Link>)}
        </nav>
      </header>
      <main className="container-page py-6 sm:py-8">{banner && <div className="mb-6 space-y-3">{banner}</div>}{children}</main>
    </div>
  );
}
