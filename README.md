# QuikHire

**Talent Without Waiting.** A subscription marketplace for India that connects professionals who can join immediately (or within 30 days) with verified employers and recruitment agencies.

> Status: **pre-launch build, not deployed.** See [`docs/PROGRESS.md`](docs/PROGRESS.md) for exactly what works, what is pending and what needs the owner's action.

## Stack

| Layer | Choice |
|---|---|
| Web app | Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4 |
| Database | PostgreSQL (Supabase) — relational schema, row-level security, full-text search |
| Auth | Supabase Auth — email + password, email OTP, Google / Facebook / LinkedIn (OIDC) / Yahoo (custom OIDC) |
| Files | Supabase Storage, private bucket, 60-second signed links |
| Payments | Razorpay Subscriptions behind a gateway-neutral interface (`src/lib/payments`) |
| Email | Resend (optional; in-app notifications work without it) |
| Hosting | Vercel (+ daily Vercel Cron) |

## Run it locally

```bash
pnpm install
cp .env.example .env.local        # fill in your Supabase project values
# apply supabase/migrations/*.sql to your Supabase project (SQL editor or `supabase db push`)
pnpm dev
```

Create the first administrator (once): sign up normally, then run in the Supabase SQL editor
`update public.profiles set role = 'admin' where email = 'you@example.com';`

## Tests

```bash
pnpm db:reset:local   # fresh local Postgres 16 on :54322 with all migrations
pnpm test             # 31 database-security, billing, regions/walk-ins and unit tests
./scripts/e2e-local.sh  # production build + 8 browser journeys
```
Details and the latest results: [`docs/TESTING.md`](docs/TESTING.md).

## Layout

```
supabase/migrations/   schema, RLS policies, functions, taxonomy seed (source of truth for the database)
src/app/(marketing)/   home, pricing, city hubs (/in/<city>), walk-ins, industry pages, legal drafts
src/app/(auth)/        sign-up, login, OTP, password reset, role selection
src/app/candidate/     candidate portal        src/app/employer/   employer portal
src/app/admin/         super-admin portal      src/app/api/        webhooks, billing, cron, downloads, export
src/lib/               db (RLS-aware access), auth, payments, storage, search, notifications
tests/                 db (RLS + billing), unit, e2e (Playwright)
docs/                  ARCHITECTURE · DEPLOYMENT · TESTING · LAUNCH-READINESS · PROGRESS
```

## Ground rules baked into the code

- Employers never read candidate tables. They call database functions that check verification + subscription and apply each candidate's consent settings.
- Paid access is granted only by a signature-verified, idempotent gateway webhook — never by the browser.
- No invented statistics, testimonials or seed users. The homepage shows real counts only once they are meaningful.
- Secrets live in environment variables. Nothing sensitive is committed.
