import { ActionForm } from '@/components/forms';
import { Card, Field } from '@/components/ui';
import { resetAction } from '../actions';

export const metadata = { title: 'Choose a new password', robots: { index: false } };
export default function Reset() {
  return (
    <Card className="w-full max-w-md">
      <h1 className="mb-4 text-2xl font-bold">Choose a new password</h1>
      <ActionForm action={resetAction} submit="Update password">
        <Field label="New password" hint="At least 10 characters."><input name="password" type="password" autoComplete="new-password" minLength={10} required className="input" /></Field>
      </ActionForm>
    </Card>
  );
}
