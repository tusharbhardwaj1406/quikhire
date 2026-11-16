import { ActionForm, SubmitButton } from '@/components/forms';
import { Alert, Card, Check, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { asUser } from '@/lib/db';
import { requestDeletion, savePrivacy } from '../actions';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ deletion?: string }> }) {
  const user = await requireRole('candidate');
  const { c, p } = await asUser(user.id, async (tx) => ({
    c: (await tx`select * from candidates where user_id = ${user.id}`)[0], p: (await tx`select notify_email, status from profiles where id = ${user.id}`)[0] }));
  const requested = (await searchParams).deletion === 'requested' || p.status === 'deletion_requested';
  return (
    <>
      <PageHeader title="Privacy & settings" sub="You decide what verified employers can see. Nothing here is ever public." />
      <div className="space-y-6">
        {requested && <Alert tone="warn" title="Account deletion requested">Your profile has been removed from search. We will delete your account and data and confirm by email.</Alert>}
        <Card title="What employers can see">
          <p className="mb-4 text-sm text-slate-600">Always visible to verified employers: designation, experience, industry, specialisations, skills, city and availability. Until you choose otherwise you appear as “Candidate {c.public_code}”.</p>
          <ActionForm action={savePrivacy} submit="Save privacy settings">
            <div className="grid gap-4 sm:grid-cols-2">
              <Check name="show_full_name" defaultChecked={c.show_full_name} label="Show my full name" hint="Also shows your LinkedIn and portfolio links." />
              <Check name="show_email" defaultChecked={c.show_email} label="Show my email address" />
              <Check name="show_phone" defaultChecked={c.show_phone} label="Show my phone number" />
              <Check name="show_salary" defaultChecked={c.show_salary} label="Show my last and expected salary" hint="Also lets employers filter by salary." />
              <Check name="show_employment_history" defaultChecked={c.show_employment_history} label="Show my employment history" />
              <Check name="allow_resume_download" defaultChecked={c.allow_resume_download} label="Allow resume downloads" hint="You are notified of every download." />
              <Check name="allow_contact" defaultChecked={c.allow_contact} label="Allow employers to send me enquiries" />
              <Check name="notify_email" defaultChecked={p.notify_email} label="Email me about enquiries and reminders" />
            </div>
            <div className="rounded-lg bg-slate-50 p-4"><Check name="paused" defaultChecked={c.visibility === 'paused'} label="Pause my profile" hint="Hides you from employer search without deleting anything. Useful once you have accepted an offer." /></div>
            <p className="text-xs text-slate-500">Accepting an employer&rsquo;s enquiry shares your name and contact details with that employer only.</p>
          </ActionForm>
        </Card>
        <Card title="Your data">
          <div className="flex flex-wrap items-center gap-3">
            <a href="/api/me/export" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-navy-900 hover:bg-slate-50">Download my data (JSON)</a>
            {!requested && <form action={requestDeletion}><SubmitButton variant="danger" confirm="Request deletion of your account and all your data? Your profile will be removed from search immediately.">Delete my account</SubmitButton></form>}
          </div>
          <p className="mt-3 text-xs text-slate-500">Deleting your account removes your profile, resumes and history. If you have an active subscription, cancel it first from the Subscription page.</p>
        </Card>
      </div>
    </>
  );
}
