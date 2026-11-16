import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center"><Link href="/"><Logo /></Link></header>
      <main className="container-page flex flex-1 items-start justify-center py-6 sm:py-10">{children}</main>
    </div>
  );
}
