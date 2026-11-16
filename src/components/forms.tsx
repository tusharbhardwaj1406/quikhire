'use client';
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { btn, cx, type Variant } from './ui';

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;
export type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Form wired to a server action: shows pending state, the server's error, or a success note. */
export function ActionForm({ action, children, submit = 'Save', variant, className, resetOnSuccess, footer }: {
  action: FormAction; children: ReactNode; submit?: string; variant?: Variant; className?: string; resetOnSuccess?: boolean; footer?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={cx('space-y-4', className)}>
      {children}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && state.message && <p role="status" className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{state.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={btn(variant)}>{pending ? 'Please wait…' : submit}</button>
        {footer}
      </div>
    </form>
  );
}

export function SubmitButton({ children, variant, small, confirm }: { children: ReactNode; variant?: Variant; small?: boolean; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btn(variant, small)}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {pending ? 'Please wait…' : children}
    </button>
  );
}

type Spec = { id: number; name: string; domain: string | null };

/** Industry → specialisation picker backed by the live taxonomy. `multiple` renders grouped checkboxes. */
export function TaxonomyPicker({ industries, industryId, selected = [], multiple, industryName = 'industry_id', specName = 'specialisation_ids', required }: {
  industries: { id: number; name: string }[]; industryId?: number | null; selected?: number[]; multiple?: boolean;
  industryName?: string; specName?: string; required?: boolean;
}) {
  const [industry, setIndustry] = useState(industryId ? String(industryId) : '');
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    if (!industry) { setSpecs([]); return; }
    let live = true;
    fetch(`/api/taxonomy?industry_id=${industry}`).then((r) => r.json()).then((d) => { if (live) setSpecs(d.specialisations ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [industry]);
  const shown = specs.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));
  const groups = [...new Set(shown.map((s) => s.domain ?? 'General'))];
  return (
    <div className="space-y-3">
      <label className="block"><span className="label">Industry</span>
        <select name={industryName} className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} required={required}>
          <option value="">Select an industry</option>
          {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </label>
      {!multiple ? (
        <label className="block"><span className="label">Specialisation</span>
          <select name={specName} className="input" defaultValue={selected[0] ?? ''} disabled={!industry} key={`${industry}-${specs.length}`}>
            <option value="">{industry ? 'Select a specialisation' : 'Choose an industry first'}</option>
            {specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      ) : industry && (
        <fieldset>
          <legend className="label">Specialisations <span className="font-normal text-slate-500">(select all that apply)</span></legend>
          {specs.length > 10 && <input className="input mb-2" placeholder="Filter specialisations" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter specialisations" />}
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {groups.map((g) => (
              <div key={g}>
                <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{g}</p>
                <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {shown.filter((s) => (s.domain ?? 'General') === g).map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="check" name={specName} value={s.id} defaultChecked={selected.includes(s.id)} />{s.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {specs.length === 0 && <p className="text-sm text-slate-500">Loading…</p>}
          </div>
        </fieldset>
      )}
    </div>
  );
}

/** Type-ahead tag input. Suggestions come from the skills taxonomy; new skills can be added by pressing Enter. */
export function TagInput({ name, label, initial = [], placeholder, hint, max = 30 }: { name: string; label: string; initial?: string[]; placeholder?: string; hint?: string; max?: number }) {
  const [tags, setTags] = useState<string[]>(initial);
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/taxonomy?skills=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then((d) => setSuggestions(d.skills ?? [])).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  const add = (v: string) => {
    const s = v.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (s && tags.length < max && !tags.some((t) => t.toLowerCase() === s.toLowerCase())) setTags([...tags, s]);
    setQ(''); setSuggestions([]);
  };
  return (
    <div>
      <label className="label" htmlFor={`${name}-input`}>{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2.5 py-1 text-sm text-navy-800">
            {t}<input type="hidden" name={name} value={t} />
            <button type="button" aria-label={`Remove ${t}`} className="text-slate-500 hover:text-red-600" onClick={() => setTags(tags.filter((x) => x !== t))}>×</button>
          </span>
        ))}
      </div>
      <div className="relative mt-2">
        <input id={`${name}-input`} className="input" value={q} placeholder={placeholder} autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(q); } }} />
        {suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {suggestions.map((s) => (
              <li key={s}><button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-navy-50" onClick={() => add(s)}>{s}</button></li>
            ))}
          </ul>
        )}
      </div>
      <p className="hint">{hint ?? 'Type to search, press Enter to add.'}</p>
    </div>
  );
}
