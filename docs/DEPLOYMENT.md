# Deployment guide (staging first, then production)

Nothing below has been executed yet. Each step needs an account that only the owner can create or authorise.

## 0. Environments
| | Staging | Production |
|---|---|---|
| Supabase project | `quikhire-staging` | `quikhire-prod` (region: Mumbai `ap-south-1`) |
| Vercel | Preview deployments from `develop` | Production from `main` |
| Razorpay | Test Mode keys | Live keys (after KYC) |
| Domain | `staging.<domain>` | `www.<domain>` |

## 1. Supabase
1. Create the project (Mumbai). Save the database password in a password manager.
2. SQL editor → run `supabase/migrations/0001…0004` in order (or `supabase link` + `supabase db push`). **Do not run `tests/support/supabase-shim.sql`** — it is for local tests only.
3. Project Settings → API: copy URL, publishable key, secret key. Database → Connection string → **Transaction pooler** → `DATABASE_URL`.
4. Auth → URL configuration: Site URL = your domain; add `https://<domain>/auth/callback` and `/auth/confirm` to redirect URLs.
5. Auth → Email templates: point confirmation and recovery links at `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (and `type=recovery&next=/reset-password`). Set custom SMTP (Resend) — the built-in mailer is rate-limited and for testing only.
6. Auth → enable leaked-password protection and CAPTCHA (Turnstile) when keys are available.
7. Storage: the `resumes` bucket is created by the migration (private). Confirm it shows as private.
8. Enable Point-in-Time Recovery or daily backups (paid plan) before real users.
9. First admin: sign up through the site, then `update public.profiles set role='admin' where email='…';`

## 2. Social sign-in (identity scopes only: openid, profile, email)
| Provider | Where | Notes |
|---|---|---|
| Google | Google Cloud Console → OAuth client (Web) | Built in to Supabase. OAuth consent screen must be published. |
| Facebook | Meta for Developers → Facebook Login | Built in. Needs business verification + app review for `email` in production. |
| LinkedIn | LinkedIn Developers → add product **Sign In with LinkedIn using OpenID Connect** | Supabase provider id is `linkedin_oidc`. Gives name, email, picture only — not work history. |
| Yahoo | Yahoo Developer Network → app with **OpenID Connect** permissions (Email, Profile) | Not a built-in Supabase provider. Add it under Auth → Providers → **Custom OIDC** and name it `yahoo` (app uses `custom:yahoo`). Verify on staging before promising it. |
Then set `NEXT_PUBLIC_OAUTH_PROVIDERS=google,facebook,linkedin_oidc,custom:yahoo` (only the ones that are really enabled; buttons appear only for these).

## 3. Razorpay
1. Complete merchant KYC (business PAN, bank account, website with Terms/Privacy/Refund/Contact pages live).
2. Ask Razorpay to enable **Subscriptions** and **UPI AutoPay** on the account.
3. Test Mode: create API keys → `RAZORPAY_KEY_ID/SECRET`. Webhooks → URL `https://<domain>/api/webhooks/razorpay`, secret → `RAZORPAY_WEBHOOK_SECRET`, events: `subscription.authenticated, subscription.charged, subscription.pending, subscription.halted, subscription.cancelled, subscription.completed, payment.failed, refund.processed`.
4. Run the sandbox checklist in `docs/PROGRESS.md` (first charge, renewal, failure, cancel, refund, duplicate webhook).
5. Only then switch to Live keys in the Production environment.
The gateway plan is created automatically at the first checkout and re-created after any price change in Admin.

## 4. Vercel
1. Import the GitHub repo. Framework: Next.js. Package manager: pnpm.
2. Add every variable from `.env.example` for Preview and Production separately. `CRON_SECRET` = long random string (Vercel sends it to `/api/cron/daily`).
3. `vercel.json` schedules the daily job at 02:00 IST. Hobby plan allows daily crons; a commercial site requires the Pro plan under Vercel's terms.
4. Add the domain; set DNS at the registrar as Vercel instructs (SSL is automatic).

## 5. Email (Resend)
Verify the sending domain (SPF, DKIM, DMARC records at the registrar) → `RESEND_API_KEY`, `EMAIL_FROM`. Use the same SMTP credentials in Supabase Auth.

## 6. Go-live gate (all must be true)
- [ ] Staging: every auth method tested with real providers
- [ ] Razorpay sandbox checklist passed; live webhook receiving events
- [ ] Legal pages reviewed by counsel; brand/contact placeholders in `src/lib/brand.ts` replaced
- [ ] Backups on; error monitoring (Sentry) and uptime check configured
- [ ] No test users or test keys in production; admin account uses a strong unique password
- [ ] `pnpm test` and `./scripts/e2e-local.sh` green on the release commit

## Maintenance
- **Deploy**: merge to `main` → Vercel builds. Database changes go in a new numbered migration file; never edit an applied one.
- **Daily**: check Admin → Overview (pending verifications), Payments (webhook errors), Reports.
- **Monthly**: `pnpm outdated`, apply security updates, review Supabase advisors, test a backup restore quarterly.
- **Rotate** keys immediately if exposed: Supabase secret key, Razorpay secret + webhook secret, Resend key, `CRON_SECRET`.
