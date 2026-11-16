# QuikHire — product and technical architecture

## 1. Product in one page
- **Who**: candidates who can join within 30 days; verified employers / agencies; a super admin.
- **Core promise**: availability you can trust. Every listed profile states a joining window, shows when it was last confirmed, and says whether that is self-declared or verified. Unconfirmed profiles drop out of search automatically.
- **Money**: two monthly plans (candidate ₹149, employer ₹1,499; editable in Admin, GST inclusive or exclusive).
- **Non-negotiables**: candidate dignity (no "laid off" labels, reason optional and private), consent-based visibility, no fabricated numbers.

### Release scope
| In this build (v0.1) | Next | Later (designed for, not built) |
|---|---|---|
| Three portals, auth, taxonomy, profiles, resumes, availability engine, search + filters, rule-based natural-language search, enquiries, pipeline, saved searches, admin (verification, users, taxonomy, pricing, payments, audit), billing module, notifications (in-app + email), data export, deletion requests | Razorpay sandbox certification, resume parsing, saved-search alerts, interview scheduling, mobile OTP, CAPTCHA, malware scanning, placement reporting | Multi-currency/country pricing, languages, enterprise/bulk accounts, agency plans, referral programme, mobile apps, AI matching scores |

## 2. System design
A **modular monolith**: one Next.js app on Vercel, one Postgres on Supabase.

```
Browser ──► Next.js (Vercel)
             ├─ proxy.ts ............ refreshes session cookie, blocks signed-out access to portals
             ├─ Server Components ... read data
             ├─ Server Actions ...... validated writes (zod)
             └─ Route handlers ...... /api/webhooks/razorpay, /api/billing/*, /api/cron/daily, downloads, export
                    │
                    ├─► Supabase Auth ...... identity, password hashing, OAuth, OTP, email links
                    ├─► Postgres ........... all data, RLS, search (transaction pooler)
                    ├─► Supabase Storage ... private `resumes` bucket, signed URLs
                    ├─► Razorpay ........... subscriptions, mandates, refunds
                    └─► Resend ............. transactional email
```

### Data access model (the important part)
`src/lib/db.ts` exposes three ways to talk to Postgres:

| Function | Postgres role | Used for |
|---|---|---|
| `asUser(userId, fn)` | `authenticated` + the user's id in JWT claims | **every user request**; RLS applies exactly as through Supabase's own API |
| `asAnon(fn)` | `anon` | public reference data and aggregate stats |
| `db()` | trusted | verified webhooks, cron, admin mutations after `requireRole('admin')` (always audited) |

Because authorisation lives in the database, it holds even if someone calls Supabase's REST API directly with their own token.

### Service boundaries (folders today, services later if ever needed)
`auth` · `taxonomy` · `candidates` · `employers` · `search` · `hiring workspace` · `billing` (`src/lib/payments`) · `notifications` · `storage` · `admin`.

## 3. Data model
Migrations in `supabase/migrations` are the source of truth.

- **Identity**: `profiles` (role, status) ← `auth.users` via trigger. `admin` can never be self-assigned.
- **Taxonomy**: `industries` → `functional_domains` → `specialisations`; `skills` (type-ahead, candidate-extensible, admin-moderated). 30 industries, 71 domains, 288 specialisations seeded.
- **Candidates**: `candidates` (profile, availability, salary, consent flags, derived `listed`/`search_tsv`/`profile_completeness`), `candidate_specialisations`, `candidate_skills`, `experiences`, `certifications`, `resumes`.
- **Employers**: `employers` (verification state), `employer_members`.
- **Workspace**: `requirements`, `pipeline_entries` (saved → shortlisted → contacted → interview → rejected/hired, private notes), `saved_searches`, `enquiries`, `profile_views`, `resume_downloads`.
- **Billing**: `plans`, `subscriptions` (`access_until` is the single source of truth for paid access), `payments` (invoice numbers), `webhook_events` (idempotency).
- **Platform**: `notifications`, `consents`, `reports`, `audit_log`, `platform_settings`.

### Directory eligibility (`candidates.listed`)
Recomputed by triggers whenever anything relevant changes:
`essentials complete AND visibility = visible AND availability confirmed within N days AND joining window ≤ configured maximum AND account active AND (subscription live OR subscriptions not required)`.

### Consent model
| Data | Default | Released when |
|---|---|---|
| Designation, experience, industry, skills, city, availability | visible to verified+subscribed employers | — |
| Full name, LinkedIn/portfolio | hidden (shown as `Candidate QH-XXXXXXX`) | candidate setting, or candidate accepts that employer's enquiry |
| Email, phone | hidden | candidate setting, or accepted enquiry |
| Salary | hidden; salary filters cannot match hidden salaries | candidate setting |
| Resume | not downloadable | candidate setting; every download logged + notified |
| Reason for availability / for leaving, minimum CTC | never shown | never |

## 4. Search
`search_candidates(filters jsonb, limit, offset)`: weighted `tsvector` (designation/skills/specialisations = A, summary/industry = B, history/education/city = C) with `websearch_to_tsquery` (quotes, OR, -exclude), plus structured filters combined with AND; skills and specialisations support ANY/ALL. Partial GIN and B-tree indexes exist only over listed rows, so index size tracks the live directory. Server-side pagination (max 50/page); the browser never receives the directory.

Natural-language box → `parseNaturalQuery` (deterministic rules) → the same visible, editable filters. No model ranks or rejects anyone; protected characteristics are not stored at all.

**Scale path**: Postgres FTS is sufficient into the low hundreds of thousands of profiles. Triggers to revisit: p95 search > 300 ms, or a need for typo tolerance/synonyms → add Typesense or Meilisearch fed from `candidates` (the `listed` flag and consent masking stay in Postgres).

## 5. Payments
1. User ticks explicit auto-pay consent → `POST /api/billing/checkout` creates the gateway subscription (status `created`; consent recorded).
2. Razorpay Checkout collects the mandate + first payment.
3. `POST /api/billing/verify` checks the checkout signature (UI feedback only; marks `authenticated`).
4. **Webhook** `subscription.charged` (HMAC verified on the raw body, de-duplicated on event id) records the payment + invoice and sets `access_until = period end + grace`. Only this grants access.
5. `pending` (retrying) keeps access through grace; `halted` ends it; `cancelled` keeps access to the end of the paid period.
Adding Cashfree/PayU = one new class implementing `PaymentProvider`.

## 6. Security summary
RLS on every table with explicit grants · role gate on every page/action/route · zod validation · parameterised SQL only · passwords handled solely by Supabase Auth · private storage + signed URLs · upload type/size/magic-byte checks · security headers, `noindex` and `no-store` on portals · audit log for admin and billing actions · account-enumeration-safe auth messages · secrets only in env.

Known gaps before public launch are tracked in `docs/PROGRESS.md` (CAPTCHA, malware scanning, CSP, rate limits beyond Supabase's own, penetration test).
