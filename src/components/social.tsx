import { SubmitButton } from '@/components/forms';
import { oauthProviders } from '@/lib/env';
import { oauthAction } from '@/app/(auth)/actions';

/** Renders only the providers that have been switched on via NEXT_PUBLIC_OAUTH_PROVIDERS. */
export function SocialButtons() {
  const providers = oauthProviders();
  if (providers.length === 0) return null;
  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <p className="mb-3 text-center text-sm text-slate-500">or continue with</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {providers.map((p) => (
          <form key={p.id} action={oauthAction}><input type="hidden" name="provider" value={p.id} /><SubmitButton variant="outline">{p.label}</SubmitButton></form>
        ))}
      </div>
    </div>
  );
}
