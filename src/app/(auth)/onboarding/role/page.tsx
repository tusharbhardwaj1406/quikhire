import { redirect } from 'next/navigation';
import { SubmitButton } from '@/components/forms';
import { Card } from '@/components/ui';
import { homeFor, requireUser } from '@/lib/auth';
import { chooseRoleAction } from '../../actions';

export const metadata = { title: 'How will you use QuikHire?', robots: { index: false } };
/** Shown once after a social sign-in, where no role was chosen on a form. */
export default async function ChooseRole() {
  const user = await requireUser();
  if (user.role) redirect(homeFor(user.role));
  return (
    <Card className="w-full max-w-xl">
      <h1 className="text-2xl font-bold">How will you use QuikHire?</h1>
      <p className="mt-1 text-sm text-slate-600">By continuing you agree to the Terms of Service and Privacy Policy. This choice cannot be changed later.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <form action={chooseRoleAction} className="rounded-xl border border-slate-200 p-5"><input type="hidden" name="role" value="candidate" />
          <p className="font-semibold text-navy-900">I&rsquo;m available to join</p><p className="mt-1 mb-4 text-sm text-slate-600">Create a profile and get discovered.</p><SubmitButton variant="accent">Continue as candidate</SubmitButton></form>
        <form action={chooseRoleAction} className="rounded-xl border border-slate-200 p-5"><input type="hidden" name="role" value="employer" />
          <p className="font-semibold text-navy-900">I&rsquo;m hiring</p><p className="mt-1 mb-4 text-sm text-slate-600">Register your company and search.</p><SubmitButton>Continue as employer</SubmitButton></form>
      </div>
    </Card>
  );
}
