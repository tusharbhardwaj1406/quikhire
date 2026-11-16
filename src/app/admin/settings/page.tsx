import { ActionForm } from '@/components/forms';
import { Alert, Card, Check, Field, PageHeader, Select } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { AVAILABILITY, inr } from '@/lib/brand';
import { getLaunch, getSettings } from '@/lib/data';
import { SubmitButton } from '@/components/forms';
import { dateIN } from '@/lib/brand';
import { db } from '@/lib/db';
import { env, oauthProviders } from '@/lib/env';
import { chargeAmount } from '@/lib/payments/types';
import { launchAction, savePlan, saveSettings } from '../actions';

export default async function AdminSettings() {
  await requireRole('admin');
  const [plans, s, launch] = await Promise.all([db()`select * from plans order by amount_paise`, getSettings(), getLaunch()]);
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
        <Card title="Launch offer">
          <p className="text-sm text-slate-700">{!launch.started ? <>The launch clock has <strong>not started</strong>. Candidate listing is free now and stays free for {launch.days} days from the moment you start the clock. Start it on the day you open to the public.</>
            : launch.free ? <>Launch started {dateIN(launch.started)}. Candidate listing is free until <strong>{dateIN(launch.endsAt)}</strong>; after that a subscription is required.</>
            : <>The free launch period ended on {dateIN(launch.endsAt)}. Candidates now need a subscription to be listed.</>}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {!launch.started ? <form action={launchAction}><input type="hidden" name="op" value="start" /><SubmitButton variant="accent" confirm={`Start the ${launch.days}-day free launch period now?`}>Start the {launch.days}-day launch clock</SubmitButton></form>
              : <form action={launchAction}><input type="hidden" name="op" value="reset" /><SubmitButton variant="outline" confirm="Reset the launch clock? Listing becomes free again until you restart it.">Reset launch clock</SubmitButton></form>}
          </div>
        </Card>
        <Card title="Platform rules">
          <ActionForm action={saveSettings} submit="Save settings">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Maximum joining window" hint="Candidates beyond this are not listed."><Select name="max_joining_window" defaultValue={String(s.max_joining_window)} options={Object.entries(AVAILABILITY).map(([value, label]) => ({ value, label }))} /></Field>
              <Field label="Reconfirm availability every (days)"><input name="availability_reconfirm_days" type="number" min={7} max={60} defaultValue={Number(s.availability_reconfirm_days)} className="input" /></Field>
              <Field label="Payment grace period (days)"><input name="subscription_grace_days" type="number" min={0} max={15} defaultValue={Number(s.subscription_grace_days)} className="input" /></Field>
              <Field label="Free launch period (days)"><input name="launch_free_days" type="number" min={0} max={365} defaultValue={Number(s.launch_free_days ?? 60)} className="input" /></Field>
              <Field label="Enquiries per employer per day"><input name="enquiries_per_day" type="number" min={1} max={500} defaultValue={Number(s.enquiries_per_day)} className="input" /></Field>
            </div>
            <Check name="require_candidate_subscription" defaultChecked={s.require_candidate_subscription === true} label="Candidates need an active subscription to be listed"
              hint="Switch off to list candidates free of charge (for example during a launch period). This is a business decision; it takes effect immediately." />
            <Check name="launch_free_employers" defaultChecked={s.launch_free_employers === true} label="Verified employers are also free during the launch period"
              hint="Off: employers pay from day one. On: verified employers can search without paying until the launch period ends." />
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
