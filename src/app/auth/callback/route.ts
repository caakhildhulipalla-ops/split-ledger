import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth and magic-link landing point. Exchanges the one-time code for a
 * session cookie, then sends the person where they were originally going.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/groups';
  const authError = searchParams.get('error_description') ?? searchParams.get('error');

  // Only ever redirect within this app — an open redirect here would be a
  // credential-phishing vector.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/groups';

  if (authError) {
    return NextResponse.redirect(
      `${origin}/signin?error=${encodeURIComponent(authError)}`,
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    return NextResponse.redirect(
      `${origin}/signin?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/signin?error=${encodeURIComponent('That sign-in link is no longer valid. Request a new one.')}`,
  );
}
