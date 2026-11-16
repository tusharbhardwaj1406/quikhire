'use client';
import { useState } from 'react';
import { btn } from './ui';

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void } } }
function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** Starts a gateway checkout. Access is granted only after the server verifies the gateway's signed event. */
export function CheckoutButton({ label, consentText, email, name }: { label: string; consentText: string; email: string; name: string }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  async function start() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout.');
      if (!(await loadScript())) throw new Error('Could not load the payment window. Check your connection and try again.');
      new window.Razorpay!({
        key: data.keyId, subscription_id: data.subscriptionId, name: data.brand, description: data.description, prefill: { email, name }, theme: { color: '#0b1f3a' },
        handler: async (r: Record<string, string>) => {
          const v = await fetch('/api/billing/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) });
          setMsg(v.ok ? { tone: 'ok', text: 'Payment received. Your subscription activates as soon as the bank confirms, usually within a minute. This page will refresh.' }
            : { tone: 'error', text: 'We could not verify that payment. If money was debited it will be reconciled automatically; please contact support if access does not appear.' });
          if (v.ok) setTimeout(() => window.location.reload(), 6000);
        },
      }).open();
    } catch (e) { setMsg({ tone: 'error', text: (e as Error).message }); }
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="check mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{consentText}</span></label>
      <button type="button" disabled={!consent || busy} onClick={start} className={btn('accent')}>{busy ? 'Opening secure checkout…' : label}</button>
      {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${msg.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-accent-50 text-accent-700'}`}>{msg.text}</p>}
    </div>
  );
}
