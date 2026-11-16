/** Central access to environment configuration. Secrets are only ever read on the server. */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  get siteUrl() { return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''); },
  get supabaseUrl() { return req('NEXT_PUBLIC_SUPABASE_URL'); },
  get supabaseKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? req('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  },
  get supabaseSecretKey() { return process.env.SUPABASE_SECRET_KEY ?? req('SUPABASE_SECRET_KEY'); },
  get databaseUrl() { return req('DATABASE_URL'); },
  get cronSecret() { return process.env.CRON_SECRET ?? ''; },
  get storageDriver() { return (process.env.STORAGE_DRIVER ?? 'supabase') as 'supabase' | 'local'; },
  razorpay: {
    get keyId() { return process.env.RAZORPAY_KEY_ID ?? ''; },
    get keySecret() { return process.env.RAZORPAY_KEY_SECRET ?? ''; },
    get webhookSecret() { return process.env.RAZORPAY_WEBHOOK_SECRET ?? ''; },
    get configured() { return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET); },
  },
  email: {
    get apiKey() { return process.env.RESEND_API_KEY ?? ''; },
    get from() { return process.env.EMAIL_FROM ?? ''; },
  },
};

/** Social providers to render. Each must also be enabled in Supabase Auth. */
export function oauthProviders(): { id: string; label: string }[] {
  const labels: Record<string, string> = { google: 'Google', facebook: 'Facebook', linkedin_oidc: 'LinkedIn', 'custom:yahoo': 'Yahoo' };
  return (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? '').split(',').map((s) => s.trim()).filter((s) => s in labels)
    .map((id) => ({ id, label: labels[id] }));
}
