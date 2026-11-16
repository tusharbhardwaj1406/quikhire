import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { env } from '../env';

/** Supabase client bound to the visitor's session cookies (auth only; data goes through src/lib/db.ts). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* called from a Server Component: the proxy refreshes cookies instead */ }
      },
    },
  });
}

/** Privileged client (storage, admin user operations). Server only. */
export function supabaseAdmin() {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
