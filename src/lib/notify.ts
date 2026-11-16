import { db } from './db';
import { env } from './env';
import { brand } from './brand';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Emails any in-app notifications that have not been emailed yet for the given users.
 * In-app notifications are written by the database functions; this is the email leg.
 * Without RESEND_API_KEY it does nothing (the in-app notification is still there).
 */
export async function flushNotificationEmails(userIds: string[]): Promise<number> {
  if (!env.email.apiKey || !env.email.from || userIds.length === 0) return 0;
  const sql = db();
  const rows = await sql`
    update notifications n set emailed_at = now()
    from profiles p
    where n.user_id = p.id and n.user_id = any(${userIds}::uuid[]) and n.emailed_at is null
      and n.created_at > now() - interval '2 days' and p.notify_email and p.status = 'active'
    returning n.id, n.title, n.body, n.link, p.email, p.full_name`;
  let sent = 0;
  for (const r of rows) {
    const url = `${env.siteUrl}${r.link ?? '/'}`;
    const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#0b1f3a">
      <h2 style="font-size:18px">${esc(r.title)}</h2><p style="color:#334155;line-height:1.5">${esc(r.body ?? '')}</p>
      <p><a href="${url}" style="background:#0b1f3a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open ${brand.name}</a></p>
      <p style="font-size:12px;color:#64748b">You can turn these emails off in Settings → Notifications.</p></div>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.email.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.email.from, to: [r.email], subject: r.title, html }),
    }).catch(() => null);
    if (res?.ok) sent++;
    else await sql`update notifications set emailed_at = null where id = ${r.id}`;   // retry on the next flush
  }
  return sent;
}
