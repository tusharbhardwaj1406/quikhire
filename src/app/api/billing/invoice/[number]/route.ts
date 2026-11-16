import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { brand, dateIN, inr } from '@/lib/brand';
import { asUser } from '@/lib/db';

/** Printable invoice (HTML). RLS guarantees a user can only open invoices for their own subscription. */
export async function GET(_: Request, { params }: { params: Promise<{ number: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse('Unauthorised', { status: 401 });
  const { number } = await params;
  const [p] = await asUser(user.id, (tx) => tx`select p.*, pl.name plan_name, pl.gst_rate from payments p
    join subscriptions s on s.id = p.subscription_id join plans pl on pl.id = s.plan_id where p.invoice_number = ${number}`);
  if (!p) return new NextResponse('Not found', { status: 404 });
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Invoice ${esc(p.invoice_number)}</title>
<style>body{font:15px system-ui,sans-serif;color:#0b1f3a;max-width:680px;margin:40px auto;padding:0 20px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}td:last-child,th:last-child{text-align:right}.muted{color:#64748b;font-size:13px}@media print{button{display:none}}</style>
<h1>${brand.name}</h1><p class="muted">Tax invoice · ${esc(p.invoice_number)} · ${dateIN(p.paid_at ?? p.created_at)}</p>
<p><strong>Billed to:</strong> ${esc(user.fullName || user.email)} &lt;${esc(user.email)}&gt;</p>
<table><tr><th>Description</th><th>Amount</th></tr>
<tr><td>${esc(p.plan_name)} (1 month)</td><td>${inr(p.amount_paise - p.tax_paise)}</td></tr>
<tr><td>GST @ ${Number(p.gst_rate)}%</td><td>${inr(p.tax_paise)}</td></tr>
<tr><th>Total paid (${esc((p.method ?? 'online').toUpperCase())})</th><th>${inr(p.amount_paise)}</th></tr></table>
<p class="muted">Seller legal name, address and GSTIN will appear here once the business is registered. Payment reference: ${esc(p.provider_payment_id)}.</p>
<button onclick="print()">Print / save as PDF</button></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
