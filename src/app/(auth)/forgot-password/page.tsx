import Link from 'next/link';
import { ActionForm } from '@/components/forms';
import { Card, Field } from '@/components/ui';
import { forgotAction } from '../actions';

export const metadata = { title: 'Reset your password', robots: { index: false } };
export default function Forgot() {
  return (
    <Card className="w-full max-w-md">
      <h1 className="mb-4 text-2xl font-bold">Reset your password</h1>
      <ActionForm action={forgotAction} submit="Send reset link">
        <Field label="Email"><input name="email" type="email" autoComplete="email" required className="input" /></Field>
      </ActionForm>
      <p className="mt-4 text-sm"><Link href="/login" className="text-accent-700 hover:underline">Back to log in</Link></p>
    </Card>
  );
}
