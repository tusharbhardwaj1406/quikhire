import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { flushNotificationEmails } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/** Daily job (Vercel Cron): availability re-confirmation sweep, lapsed listings, pending notification emails. */
export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get('authorization') !== `Bearer ${env.cronSecret}`) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const sql = db();
  const [{ result }] = await sql`select run_maintenance() as result`;
  const pending = await sql`select distinct user_id from notifications where emailed_at is null and created_at > now() - interval '2 days' limit 2000`;
  const emailed = await flushNotificationEmails(pending.map((p) => p.user_id));
  return NextResponse.json({ ok: true, ...result, emailed });
}
