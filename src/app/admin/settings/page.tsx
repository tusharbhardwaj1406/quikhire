import { ActionForm } from '@/components/forms';
import { Alert, Card, Check, Field, PageHeader, Select } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { AVAILABILITY, inr } from '@/lib/brand';
import { getSettings } from '@/lib/data';
import { db } from '@/lib/db';
import { env, oauthProviders } from '@/lib/env';
import { chargeAmount } from '@/lib/payments/types';
import { savePlan, saveSettings } from '../actions';

export default async function AdminSettings() {
  await requireRole('admin');
  const [plans, s] = await Promise.all([db()`select * from plans order by amount_paise`, getSettings()]);
  const integrations: [string, boolean, string][] = [
    ['Razorpay payments', env.razorpay.configured, 'RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET'],
    ['Transactional email (Resend)', Boolean(env.email.apiKey && env.email.from), 'RESEND_API_KEY, EMAIL_FROM'],
    ['Scheduled jobs', Boolean(env.cronSecret), 'CRON_SECRET'],
    ['Social sign-in', oauthProviders().length > 0, 'NEXT_PUBLIC_OAUTH_PROVIDERS (plus each provider enabled in Supabase Auth)'],
  ];
  return (
    <>
      <PageHeader title="Pricing & settings" sub="No code changes needed. Secrets are configured as environment variables, never here." />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {plans.map((p) => (
            <Card key={p.id} title={p.name}>
              <ActionForm action={savePlan} submit="Save price">
                <input type="hidden" name="id" value={p.id} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Price (₹/month)"><input name="amount" type="number" min={1} step={1} defaultValue={p.amount_paise / 100} required className="input" /></Field>
                  <Field label="GST"><Select name="gst_mode" defaultValue={p.gst_mode} options={[{ value: 'inclusive', label: 'Price includes GST' }, { value: 'exclusive', label: 'GST added on top' }]} /></Field>
                  <Field label="GST rate (%)"><input name="gst_rate" type="number" min={0} max={40} step={0.01} defaultValue={Number(p.gst_rate)} required className="input" /></Field>
                </div>
                <p className="text-sm text-slate-600">Customers are charged <strong>{inr(chargeAmount(p as never))}</strong> per month. Gateway plan: {p.provider_plan_id ?? 'created automatically at the next checkout'}.</p>
              </ActionForm>
            </Card>))}
        </div>
        <Card title="Platform rules">
          <ActionForm action={saveSettings} submit="Save settings">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Maximum joining window" hint="Candidates beyond this are not listed."><Select name="max_joining_window" defaultValue={String(s.max_joining_window)} options={Object.entries(AVAILABILITY).map(([value, label]) => ({ value, label }))} /></Field>
              <Field label="Reconfirm availability every (days)"><input name="availability_reconfirm_days" type="number" min={7} max={60} defaultValue={Number(s.availability_reconfirm_days)} className="input" /></Field>
              <Field label="Payment grace period (days)"><input name="subscription_grace_days" type="number" min={0} max={15} defaultValue={Number(s.subscription_grace_days)} className="input" /></Field>
              <Field label="Enquiries per employer per day"><input name="enquiries_per_day" type="number" min={1} max={500} defaultValue={Number(s.enquiries_per_day)} className="input" /></Field>
            </div>
            <Check name="require_candidate_subscription" defaultChecked={s.require_candidate_subscription === true} label="Candidates need an active subscription to be listed"
              hint="Switch off to list candidates free of charge (for example during a launch period). This is a business decision; it takes effect immediately." />
          </ActionForm>
        </Card>
        <Card title="Integrations">
          <ul className="divide-y divide-slate-100 text-sm">{integrations.map(([name, ok, vars]) => (
            <li key={name} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><span className="font-medium text-navy-900">{name}</span><span className={ok ? 'text-accent-700' : 'text-amber-700'}>{ok ? 'Connected' : `Not connected: set ${vars}`}</span></li>))}</ul>
          {!env.razorpay.configured && <div className="mt-4"><Alert tone="warn">Until the payment gateway is connected, nobody can pay. Use “Grant complimentary access” on the Users page for pilot members.</Alert></div>}
        </Card>
      </div>
    </>
  );
}
