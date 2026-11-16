import postgres from 'postgres';
import { env } from './env';

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __znSql?: Sql };

/**
 * Trusted server connection (bypasses RLS). Use ONLY for: verified payment webhooks,
 * scheduled jobs, and admin mutations after `requireRole('admin')`.
 */
export function db(): Sql {
  if (!g.__znSql) {
    g.__znSql = postgres(env.databaseUrl, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
  }
  return g.__znSql;
}

export type Tx = postgres.TransactionSql;

/**
 * Run queries as a signed-in user. The transaction switches to the `authenticated`
 * role with the user's id in the JWT claims, so row-level security applies exactly
 * as it would through the Supabase Data API. This is the default for all user requests.
 */
export function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

/** Run queries as an anonymous visitor (public reference data and aggregate stats only). */
export function asAnon<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true)`;   // never inherit claims from a pooled connection
    await tx`set local role anon`;
    return fn(tx);
  }) as Promise<T>;
}

/** Turns a Postgres error into a message that is safe to show to the user. */
export function dbMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === 'P0001' || err?.code === '42501') return err.message ?? fallback;   // raised deliberately by our functions
  if (err?.code === '23505') return 'That already exists.';
  if (err?.code === '23514') return 'Some of the values entered are outside the allowed range.';
  console.error('[db]', err);
  return fallback;
}

export async function audit(actorId: string | null, action: string, targetType?: string, targetId?: string, meta: Record<string, unknown> = {}) {
  await db()`insert into audit_log (actor_id, action, target_type, target_id, meta)
             values (${actorId}, ${action}, ${targetType ?? null}, ${targetId ?? null}, ${db().json(meta as never)})`;
}
