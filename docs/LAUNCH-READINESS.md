# Launch readiness — India

Research date: 16 Nov 2026. Fees and rules change; re-confirm with each provider before signing. This is not legal, tax or financial advice — use a CA/CS and a lawyer for the decisions marked ⚖.

## 1. ⚠ Brand name conflict (decide before spending on domain, trademark or design)
A recruitment founder (Vamsi Mootkur, on Topmate) already describes a platform called **“ZeroNotice”** as India's recruitment platform exclusively for candidates who can join in 0–15 days. Same name, same concept, same country.
- ⚖ Run a trademark search (IP India public search, classes 35 and 42; also 9 and 41) and have a trademark attorney assess passing-off risk.
- Check `zeronotice.in`, `.com`, `.co.in` at a registrar — availability was **not** verified from the build environment.
- The name is defined once in `src/lib/brand.ts`; a rename is a small code change today and expensive after launch.

## 2. Payment gateway comparison
| | Razorpay | Cashfree | PayU |
|---|---|---|---|
| Public pricing | Yes: 2% + GST per transaction; no setup/annual fee | Yes: ~1.95%; subscriptions priced per mandate/debit | No public rate card; negotiated |
| Subscriptions product | Mature, self-serve; cards + UPI AutoPay + e-NACH | Yes; UPI AutoPay activation is **not** self-serve (account manager) | Yes; enterprise-oriented |
| Subscription fee | Reported ~0.9–0.99% on top of the 2% (cards); UPI AutoPay rate not published — ask for a quote | Published earlier: ₹7.5 mandate + ₹5 per debit under ₹1,000, ₹15 per debit ₹1,000+ | Quote |
| Webhooks / refunds / docs | Strong | Strong | Adequate |
| Fit for a new startup | Fastest to integrate and go live | Potentially cheaper on the ₹1,499 plan | Better once volumes justify negotiation |

**Decision: Razorpay first** (self-serve subscriptions, UPI AutoPay, best tooling), behind an interface so Cashfree can be added.
**Worth a call to Cashfree**: on the ₹1,499 plan a flat ~₹15 per debit would be far below a ~3% Razorpay take (~₹45). Get both quotes in writing.

Indicative cost per successful charge (to be confirmed): candidate ₹149 → roughly ₹4–5 + GST on either gateway; employer ₹1,499 → roughly ₹45 + GST (Razorpay) vs ~₹15 + GST (Cashfree's published per-debit rate).

### Recurring-payment rules that shaped the build
- RBI's e-mandate framework: after a mandate is registered with additional authentication, recurring debits up to ₹15,000 need no OTP. Both plans are well inside this.
- Issuers send a pre-debit notification at least 24 hours before each charge, and customers can cancel/opt out — the app captures explicit auto-pay consent, explains renewal on the pricing and billing pages, and offers one-click cancel.

## 3. Running costs (monthly, indicative)
| Item | Pilot (0–1k users) | Growth (10k–100k users) |
|---|---|---|
| Vercel | Pro, ~US$20 per seat (commercial use needs Pro) | US$20 + usage |
| Supabase | Free for staging; Pro ~US$25 for production (backups, no pausing) | US$25 + compute/storage add-ons (est. US$60–250) |
| Resend | Free tier (limits apply) | ~US$20–90 |
| Domain | ~₹700–1,500 / year | same |
| Sentry / uptime | Free tiers | ~US$26+ |
| SMS OTP (optional, DLT) | not enabled | per-SMS, est. ₹0.15–0.25 |
| Gateway | per transaction only | per transaction only |
| **Fixed total** | **≈ ₹4,000–5,000 / month** | **≈ ₹12,000–35,000 / month** |
Break-even on fixed costs is roughly 35–40 paying candidates or 4 paying employers. Verify current list prices on each provider's pricing page.

## 4. Business structure ⚖
| | Proprietorship | LLP | Private Limited |
|---|---|---|---|
| Set-up effort/cost | Lowest | Medium | Highest |
| Liability | Unlimited, personal | Limited | Limited |
| Raising equity / ESOPs | No | Awkward | Yes |
| Compliance | Light | Moderate | Heaviest (audit, ROC filings) |
| Gateway onboarding | Possible | Straightforward | Straightforward |
Working view: start as **Private Limited** if outside investment or co-founders are likely, **LLP** if it will stay closely held. Avoid a proprietorship: the platform holds personal data and carries unlimited personal liability.
Points to raise with a CA/CS:
- A private company needs at least two directors, one of whom is resident in India (182+ days). If you are abroad for most of the year you will need a resident co-director; foreign-resident ownership also brings FEMA reporting.
- GST: registration becomes mandatory above the service turnover threshold (₹20 lakh in most states); many gateways and B2B customers expect a GSTIN earlier. Invoices already carry a GST split; seller legal name/GSTIN are placeholders.
- Whether candidate subscriptions (B2C) and employer subscriptions (B2B) need different invoice treatment.

## 5. Data protection ⚖
- The DPDP Rules, 2025 were notified on 13 Nov 2025. Board provisions applied immediately; consent-manager provisions from 13 Nov 2026; the main obligations (notice, consent, security safeguards, breach reporting, retention, rights) from **13 May 2027**. Build to them now.
- Already in the product: purpose-specific consent records with versions, granular visibility controls defaulting to private, data export, deletion request + erasure, grievance page, audit log, private storage.
- Still needed: lawyer-reviewed notice and policies; breach-response runbook (72-hour reporting); retention schedule; processor agreements with Supabase, Vercel, Razorpay, Resend; decision on data location (Mumbai region is selected).

## 6. Policies and operations checklist
- [ ] Terms, Privacy, Refunds & Cancellation, Employer Verification, Grievance — drafts exist at `/legal/*`, **must be reviewed by counsel**
- [ ] Named grievance contact + support mailbox (placeholders in `src/lib/brand.ts`)
- [ ] Employer verification SOP (GST portal / MCA lookup, email-domain match, turnaround target)
- [ ] Accounting: books, GST returns, payment reconciliation (Admin → Payments is the source)
- [ ] Support process and response-time targets
- [ ] Trademark application once the name is settled
