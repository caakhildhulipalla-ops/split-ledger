'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNative } from '@/lib/native';
import { supabase } from '@/lib/supabase/client';

/**
 * Catches the email sign-in callback when it arrives as a deep link
 * (`app.splitledger://auth/callback?code=…`). The link is opened from the
 * user's mail app in the system browser, Supabase verifies it and 302s to the
 * custom scheme, and Android hands the URL to the app here. The PKCE code
 * verifier stored when the link was requested is still in this WebView's
 * localStorage, so the exchange completes.
 *
 * Renders nothing; no-op on the web (there the callback is a normal route).
 */
export default function DeepLinkAuth() {
  const router = useRouter();

  useEffect(() => {
    if (!isNative()) return;
    let remove = () => {};

    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appUrlOpen', async ({ url }) => {
        if (!url.includes('auth/callback')) return;

        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return;
        }

        const params = parsed.searchParams;
        const hash = parsed.hash.startsWith('#')
          ? new URLSearchParams(parsed.hash.slice(1))
          : new URLSearchParams();

        const authError = params.get('error_description') ?? params.get('error');
        if (authError) {
          router.replace(`/signin?error=${encodeURIComponent(authError)}`);
          return;
        }

        const code = params.get('code');
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            router.replace(`/signin?error=${encodeURIComponent(error.message)}`);
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            router.replace(`/signin?error=${encodeURIComponent(error.message)}`);
            return;
          }
        } else {
          return;
        }

        const next = params.get('next');
        router.replace(next && next.startsWith('/') ? next : '/groups');
      });
      remove = () => handle.remove();
    })();

    return () => remove();
  }, [router]);

  return null;
}
