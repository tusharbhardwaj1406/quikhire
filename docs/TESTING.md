# Testing

## How to run
```bash
pnpm db:reset:local        # local Postgres 16 on 127.0.0.1:54322 (see scripts/db-reset-local.sh)
pnpm typecheck
pnpm test                  # vitest: tests/db + tests/unit
./scripts/e2e-local.sh     # builds for production, starts the app, runs Playwright (tests/e2e)
```
The same steps run in GitHub Actions (`.github/workflows/ci.yml`).

## Test report — 16 Nov 2026 (build v0.2.0)
| Suite | Result |
|---|---|
| TypeScript (`tsc --noEmit`, strict) | pass |
| Migrations apply to an empty Postgres 16 | pass (5 files) |
| Production build (`next build`) | pass |
| Database security + lifecycle (`tests/db/security.test.ts`) | 17 / 17 |
| Billing (`tests/db/payments.test.ts`) | 5 / 5 |
| Regions, launch offer, walk-ins (`tests/db/regions-walkins.test.ts`) | 5 / 5 |
| Unit (`tests/unit/search.test.ts`) | 4 / 4 |
| Browser end-to-end (`tests/e2e/marketplace.spec.ts`) | 8 / 8 |

### What the database tests prove
Sign-up creates profile + consent records · `admin` cannot be obtained via sign-up data or profile edits · malformed sign-up input never blocks registration · candidates cannot see each other; anonymous users cannot read profiles/candidates · a candidate cannot mark their own availability "verified" · employers have zero direct access to candidate tables · listing requires completeness + subscription + visibility + fresh confirmation · stale availability is hidden by the daily job and restored by one-click reconfirm · lapsed subscription or suspension removes the listing · search needs verification **and** subscription · employers cannot self-verify or join another company · name/salary masked by default; salary filters cannot infer hidden salaries · contact details released only after the candidate accepts · profile views logged once per employer per day · enquiry duplicates and unauthorised replies blocked · resume downloads require consent and are logged · pipelines/notes isolated between employers and hidden from candidates · admin metrics/settings/pricing locked to admins.

### What the billing tests prove
Webhook and checkout signatures (valid, tampered, empty) · GST maths for inclusive/exclusive pricing · a mandate alone grants nothing; a `charged` event grants access exactly once (duplicate delivery is a no-op) with an invoice number · cancellation keeps access to period end with no grace; `halted` removes it · refunds recorded · unknown subscriptions ignored safely.

### What the v0.2 tests add
Free listing before launch and through day 59, removed by the nightly job after day 60 · employers stay paid unless the admin extends the offer, and never bypass verification · city → region mapping and region search filter · only verified employers can publish walk-ins, only as themselves · web-sourced walk-ins must cite a source · hidden walk-ins disappear from public view · the researched batch validates entry by entry. Browser: seven cities on the homepage, launch offer shown, admin import (12 added, re-import skips 12), employer-posted walk-in badged verified, imported ones badged unverified with a source link, Mumbai honestly empty.

### What the browser tests prove (real UI, production build)
Honest pre-launch homepage, live pricing, robots rules, cron/webhook endpoints reject unsigned calls → portals redirect signed-out visitors → candidate sign-up with dependent industry/specialisation picker → profile sections save, skill type-ahead and new-skill creation → resume upload, disguised file rejected → no fake payment path → role isolation → employer sign-up, company registration, locked search → admin verifies, grants pilot access, audit log entries → natural-language query becomes editable filters → masked card (name, salary) → filters exclude correctly → enquiry sent → candidate accepts → employer now sees name + email → data export works → no horizontal overflow at 375 px.

## Honest limits of this report
- **Supabase Auth itself was not available in the build environment.** Browser tests run the real app against `tests/support/auth-stub.mjs`, a test-only stand-in for the Auth HTTP API. Password login, sign-up and session cookies are therefore exercised through our code, but **email confirmation links, email OTP, password reset and all OAuth providers have not been run against a real Supabase project.** They must be tested on staging.
- **Razorpay has not been called.** The integration is written to their documented API and unit-tested for signatures and state transitions; it needs a full pass in Razorpay Test Mode.
- **Supabase Storage** is exercised via the local driver in tests; signed URLs need a staging check.
- Not yet done: load testing, accessibility audit with assistive tech, penetration test.
