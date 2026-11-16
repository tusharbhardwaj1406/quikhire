import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/** OAuth (PKCE) return leg: exchange the code for a session, then route by role. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.redirect(new URL('/login?error=callback', request.url));
}
