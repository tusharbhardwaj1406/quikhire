import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/** Email confirmation and password-recovery links land here (token_hash flow; works across devices). */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const token_hash = sp.get('token_hash'), type = sp.get('type') as EmailOtpType | null, code = sp.get('code');
  const next = sp.get('next') === '/reset-password' || type === 'recovery' ? '/reset-password' : '/dashboard';
  const supabase = await supabaseServer();
  const { error } = token_hash && type ? await supabase.auth.verifyOtp({ token_hash, type })
    : code ? await supabase.auth.exchangeCodeForSession(code) : { error: new Error('missing token') };
  return NextResponse.redirect(new URL(error ? '/login?error=link' : next, request.url));
}
