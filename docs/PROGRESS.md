# QuikHire — progress tracker

Last updated: 16 Nov 2026 · Build v0.2.0 · **Not deployed. No real users or payments.**
(Renamed from ZeroNotice on 16 Nov 2026.)

## Phase status
| Phase | Status |
|---|---|
| 1. Discovery and architecture | Done (`docs/ARCHITECTURE.md`, `docs/LAUNCH-READINESS.md`) |
| 2. UI/UX | Done for v0.2: three portals, public site, seven city hubs, walk-ins, mobile layouts |
| 3. Backend and database | Done for v0.2: schema, RLS, taxonomy, regions, profiles, resumes, search, walk-ins |
| 4. Payments and subscriptions | Code complete and unit-tested; **not yet run against Razorpay** |
| 5. Advanced functionality | Partly done (see below) |
| 6. Security and testing | 31 database/unit + 8 browser tests passing; staging tests and security review outstanding |
| 7. Production deployment | Not started — blocked on owner accounts |

## Added in v0.2 (16 Nov 2026)
- **Name**: QuikHire throughout (site, emails, invoices `QH-YYYY-000001`, candidate codes `QH-XXXXXXX`).
- **Seven regions**: Mumbai, Pune, Delhi NCR, Bengaluru, Kolkata, Chennai, Hyderabad. Each has a public hub at `/in/<city>`. Candidates choose a region at sign-up (or it is derived from their city, e.g. Gurugram → Delhi NCR). Employers can filter search by region, and "Delhi NCR" in a plain-English search maps to the region. More regions can be added in the database.
- **Free launch period**: candidate listing is free until an admin starts the launch clock, and for 60 days after that (Admin → Pricing & settings → Launch offer). After day 60 a nightly job removes unpaid listings. Employers still pay; a switch extends the offer to verified employers if wanted.
- **Walk-ins**: every city hub shows walk-in interviews for the next 7 days with role, company, dates, timing, venue, eligibility, salary, what to carry and a link to the source. `/walk-ins` gives the all-city view. Three ways in:
  1. verified employers post their own (free, badged "Verified employer");
  2. admin adds one by hand;
  3. admin imports a researched JSON batch (must cite a source link; shown as "From the web · not verified" until confirmed; duplicates skipped).
- **First researched batch**: `supabase/seed/walkins-2026-11-16.json`, 12 walk-ins for 16–23 Nov 2026 (Chennai 4, Delhi NCR 3, Hyderabad 2, Pune 1, Bengaluru 1, Kolkata 1, Mumbai 0).

## Completed and tested (v0.1 + v0.2)
- Public site, sign-up/login, candidate portal, availability engine, employer portal, admin portal, billing core, notifications, CI — as listed in `docs/TESTING.md`.

## Built but not yet verified against the real service
| Item | What is needed |
|---|---|
| Email confirmation, email OTP login, password reset | A Supabase project (staging) |
| Google / Facebook / LinkedIn / Yahoo sign-in | Developer apps for each + Supabase provider config |
| Razorpay checkout, renewals, cancel, refund, webhooks | Razorpay Test Mode keys |
| Supabase Storage signed URLs | Supabase project |
| Email sending | Resend account + verified domain |
| Daily cron | Vercel deployment |

## Walk-ins: what is and is not automated
- The site does **not** crawl job boards. Naukri, Indeed and similar sites prohibit automated copying in their terms, and listings copied blindly would include scams and stale drives.
- The first batch was researched by hand from three public pages; details that the sources contradicted are flagged in the listing text, and one airline listing was dropped because the official page did not confirm the dates.
- The batch goes stale after 23 Nov 2026. Keeping the section fresh needs one of: (a) a daily research-and-import routine (can be scheduled once the site is deployed), (b) a licensed jobs feed, or (c) employers posting directly — which is the only source the site can mark as verified.

## Not built yet (priority order)
1. Staging deployment and the checks in the table above
2. Daily walk-in refresh job; report button on walk-ins; automatic clean-up of expired walk-ins
3. Resume parsing and automatic skill extraction
4. Saved-search alerts; reminders before availability, subscription or free-launch expiry
5. Interview scheduling, message threads, blocking an employer
6. Mobile OTP, CAPTCHA, stricter rate limits, Content-Security-Policy, malware scanning
7. Admin: region editor, editable homepage/FAQ, email templates, feature flags, multiple admin roles
8. AI matching with explanations, duplicate detection
9. Analytics, error monitoring, load test, accessibility audit, penetration test
10. Multi-recruiter teams; PDF invoices; placement confirmation flow

## Known issues and caveats
- Browser tests use a test-only stand-in for Supabase Auth; see `docs/TESTING.md`.
- Resume uploads are capped at 4 MB.
- The launch clock must be started by an admin on go-live day; until then listing stays free.
- `src/lib/brand.ts` holds placeholder support/grievance emails; invoices show a placeholder for seller legal name and GSTIN.
- Legal pages are drafts and say so on the page.
- "QuikHire" sits close to existing recruitment brands (QuikHiring, QuickHire, QuikrJobs, QwikHire). See `docs/LAUNCH-READINESS.md` §1.

## Owner's pending actions
| # | Action | Why |
|---|---|---|
| 1 | Trademark and domain check for "QuikHire" | Several similar recruitment names exist in India |
| 2 | Create a Supabase project (Mumbai) for staging; add keys as environment variables | Unblocks real auth, storage and staging tests |
| 3 | Create a Vercel account/team and import the GitHub repo | Hosting |
| 4 | Choose the business structure with a CA/CS; register; PAN/bank/GST | Required for Razorpay KYC and invoices |
| 5 | Start Razorpay onboarding (Subscriptions + UPI AutoPay); ask Cashfree for a quote on the ₹1,499 plan | Payments |
| 6 | Create OAuth developer apps (Google first) | Social sign-in |
| 7 | Engage a lawyer for Terms, Privacy, Refund, Verification and Grievance documents | Must not launch on drafts |
| 8 | Decide whether employers are also free for the 60 days (currently: no) | One switch in Admin |
| 9 | Decide how walk-ins stay fresh after 23 Nov (daily research routine, licensed feed, or employer-posted only) | Section empties otherwise |
| 10 | Provide support and grievance email addresses | Shown on site and in policies |
