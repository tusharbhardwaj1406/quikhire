# ZeroNotice — progress tracker

Last updated: 16 Nov 2026 · Build v0.1.0 · **Not deployed. No real users, payments or data.**

## Phase status
| Phase | Status |
|---|---|
| 1. Discovery and architecture | Done (`docs/ARCHITECTURE.md`, `docs/LAUNCH-READINESS.md`) |
| 2. UI/UX | Done for v0.1: all three portals, public site, design system, mobile layouts |
| 3. Backend and database | Done for v0.1: schema, RLS, taxonomy, profiles, resumes, search, permissions |
| 4. Payments and subscriptions | Code complete and unit-tested; **not yet run against Razorpay** |
| 5. Advanced functionality | Partly done (see below) |
| 6. Security and testing | 26 database/unit + 8 browser tests passing; staging tests and security review outstanding |
| 7. Production deployment | Not started — blocked on owner accounts |

## Completed and tested
- Public site: homepage with real (or honestly absent) statistics, pricing from the database, 30 industry landing pages, FAQ with structured data, sitemap, robots, legal drafts
- Auth: candidate and employer sign-up, password login, role-based routing, sign-out, role isolation, signed-out redirects
- Candidate portal: dashboard (completeness, views, enquiries, downloads, checklist, activity), profile editor (basics, industry/specialisations, skills type-ahead, availability, salary, history, certifications), resume upload/list/primary/delete, enquiry inbox with accept/decline/report, privacy controls, pause, data export, deletion request
- Availability engine: joining window, one-click reconfirm, automatic "confirmation pending" after N days, self-declared vs verified badge
- Employer portal: company registration, verification states, search with 20+ filters, AND/OR skill matching, keyword operators, sort, pagination, saved searches, natural-language query → editable filters, masked candidate cards and profiles, shortlist/pipeline with private notes, enquiries and interview requests, hiring requirements
- Admin portal: live metrics (MRR, churn, by industry/city), employer verification queue, user search/suspend/reinstate, availability verification, duplicate-phone finder, deletion processing, complimentary access, taxonomy add/rename/hide/merge, pricing and GST mode, platform rules, payments/subscriptions/webhook log, refunds, reports, audit log
- Billing core: gateway-neutral interface, Razorpay implementation, signature checks, idempotent webhook processing, invoices with GST split, grace period, cancel-at-period-end
- Notifications: in-app for all key events; email delivery via Resend when configured
- CI workflow, migrations, documentation

## Built but not yet verified against the real service
| Item | What is needed |
|---|---|
| Email confirmation, email OTP login, password reset | A Supabase project (staging) |
| Google / Facebook / LinkedIn / Yahoo sign-in | Developer apps for each + Supabase provider config |
| Razorpay checkout, renewals, cancel, refund, webhooks | Razorpay Test Mode keys |
| Supabase Storage signed URLs | Supabase project |
| Email sending | Resend account + verified domain |
| Daily cron | Vercel deployment |

## Not built yet (next sessions, in priority order)
1. Staging deployment and the checks in the table above
2. Resume parsing and automatic skill extraction (with user correction)
3. Saved-search alerts ("matching candidate registered") and pre-expiry availability/subscription reminders
4. Interview scheduling, message threads beyond enquiry + reply, blocking an employer
5. Mobile OTP (needs a DLT-registered SMS provider), CAPTCHA (Turnstile), stricter rate limits, Content-Security-Policy, malware scanning of uploads
6. Optional supporting documents for availability verification; recruiter feedback on availability
7. Admin: editable homepage/FAQ content, email templates, SEO settings, feature flags, multiple admin roles
8. AI features beyond rule-based search: resume-to-requirement matching with explanations, duplicate detection
9. Analytics (privacy-friendly), error monitoring (Sentry), load test, accessibility audit, penetration test
10. Multi-recruiter teams per company; PDF invoices; placement confirmation flow

## Known issues and caveats
- Browser tests use a test-only stand-in for Supabase Auth (`tests/support/auth-stub.mjs`); see `docs/TESTING.md`.
- Resume uploads are capped at 4 MB because they pass through a serverless function. Larger files need direct-to-storage signed uploads.
- Saving skills recomputes the search index once per skill; fine now, batch it before very large imports.
- After an admin verifies an employer the card leaves the Pending tab without a confirmation banner.
- A price change applies to new checkouts only; existing mandates keep their amount (gateway behaviour).
- `src/lib/brand.ts` holds placeholder support/grievance emails; invoices show a placeholder for seller legal name and GSTIN.
- Legal pages are drafts and say so on the page.

## Deployment status
Local only. Source is committed to a local git repository on `main` and exported as an archive. **Not yet on GitHub**: this session's GitHub token could list repositories (only `tush_SSE` exists) but could not create one.

## Owner's pending actions
| # | Action | Why |
|---|---|---|
| 1 | **Decide on the name.** An existing Indian platform already uses "ZeroNotice" for the same idea (see `docs/LAUNCH-READINESS.md` §1). | Legal/brand risk; affects domain, trademark, design |
| 2 | Create an empty private GitHub repo `zeronotice` and grant this workspace access to it | So the code can be pushed and CI can run |
| 3 | Create a Supabase project (Mumbai) for staging; share URL + keys through environment variables, not chat | Unblocks real auth, storage and staging tests |
| 4 | Create a Vercel account/team and import the repo | Hosting |
| 5 | Choose the business structure with a CA/CS; register; get PAN/bank/GST as advised | Required for Razorpay KYC and invoices |
| 6 | Start Razorpay onboarding; request Subscriptions + UPI AutoPay; ask Cashfree for a quote on the ₹1,499 plan | Payments |
| 7 | Create OAuth developer apps (Google first; Facebook, LinkedIn, Yahoo as wanted) | Social sign-in |
| 8 | Engage a lawyer for Terms, Privacy, Refund, Verification and Grievance documents | Must not launch on drafts |
| 9 | Decide: should candidate listing be free during the launch period? (Admin → Pricing & settings) | Business model; a two-sided marketplace needs candidates before employers will pay |
| 10 | Provide support and grievance email addresses | Shown on site and in policies |
