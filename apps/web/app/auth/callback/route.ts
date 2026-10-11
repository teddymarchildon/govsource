import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { safeAuthRedirect } from '@/utils/authRedirect';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = safeAuthRedirect(url.searchParams.get('redirect'));
  const login = new URL('/login', url.origin);
  login.searchParams.set('redirect', destination);
  const code = url.searchParams.get('code');

  if (code && !url.searchParams.has('error')) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Login resolves onboarding after the session cookies are established.
        return NextResponse.redirect(login, { headers: { 'Cache-Control': 'private, no-store' } });
      }
    } catch {
      // Never expose provider errors or authorization codes in the URL.
    }
  }

  login.searchParams.set('error', 'auth_callback_failed');
  return NextResponse.redirect(login, { headers: { 'Cache-Control': 'private, no-store' } });
}
