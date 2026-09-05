import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * The one Supabase client in the app.
 *
 * This build is a static single-page app wrapped in a native shell (Capacitor)
 * and also deployable to any static host — there is no server. Every query
 * runs in the browser / WebView as the signed-in user, authenticated by the
 * public anon key plus the session. Row-level security is the only thing
 * deciding what each user can reach, exactly as before; the server actions the
 * old version used were ergonomics, never a security boundary.
 *
 * The session is persisted in `localStorage`, which survives an app restart in
 * the WebView. `detectSessionInUrl` is off because the OAuth / magic-link
 * landing is handled explicitly in `app/auth/callback`.
 */
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    },
  );
}

/** A single shared instance for modules that just need to make a call. */
export const supabase = createClient();
