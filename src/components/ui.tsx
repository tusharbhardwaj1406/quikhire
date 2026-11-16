import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { AVAILABILITY, daysAgo } from '@/lib/brand';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

const VARIANT = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800',
  accent: 'bg-accent-600 text-white hover:bg-accent-700',
  outline: 'border border-slate-300 bg-white text-navy-900 hover:bg-slate-50',
  ghost: 'text-navy-900 hover:bg-navy-50',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
};
export type Variant = keyof typeof VARIANT;
export const btn = (variant: Variant = 'primary', small = false) => cx(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
  small ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm', VARIANT[variant]);

export function Button({ variant, small, className, ...p }: ComponentProps<'button'> & { variant?: Variant; small?: boolean }) {
  return <button {...p} className={cx(btn(variant, small), className)} />;
}
export function LinkButton({ variant, small, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; small?: boolean }) {
  return <Link {...p} className={cx(btn(variant, small), className)} />;
}

export function Card({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx('rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONE = {
  neutral: 'bg-slate-100 text-slate-700', good: 'bg-accent-50 text-accent-700 ring-1 ring-accent-100',
  warn: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200', bad: 'bg-red-50 text-red-700 ring-1 ring-red-200', info: 'bg-navy-50 text-navy-700',
};
export type Tone = keyof typeof TONE;
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', TONE[tone])}>{children}</span>;
}
export function Alert({ tone = 'info', title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className={cx('flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm', TONE[tone])}>
      <div>{title && <p className="font-semibold">{title}</p>}{children && <div className="mt-0.5 opacity-90">{children}</div>}</div>
      {action}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={cx('block', className)}><span className="label">{label}</span>{children}{hint && <span className="hint block">{hint}</span>}</label>;
}
export function Check({ label, hint, ...p }: ComponentProps<'input'> & { label: ReactNode; hint?: string }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" {...p} className="check mt-0.5" />
      <span><span className="font-medium text-navy-900">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  );
}
export function Select({ options, placeholder, ...p }: ComponentProps<'select'> & { options: readonly (string | { value: string | number; label: string })[]; placeholder?: string }) {
  return (
    <select {...p} className={cx('input', p.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-navy-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-semibold text-navy-900">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Always states whether availability is self-declared or verified, and when it was last confirmed. */
export function AvailabilityBadge({ availability, verification, confirmedAt }: { availability?: string | null; verification?: string | null; confirmedAt?: string | Date | null }) {
  if (!availability) return <Badge tone="warn">Availability not set</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone="good">● {AVAILABILITY[availability] ?? availability}</Badge>
      <Badge tone={verification === 'verified' ? 'info' : 'neutral'}>{verification === 'verified' ? 'Verified' : 'Self-declared'}</Badge>
      {confirmedAt && <span className="text-xs text-slate-500">confirmed {daysAgo(confirmedAt)}</span>}
    </span>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{title}</h1>{sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}</div>
      {action}
    </div>
  );
}
