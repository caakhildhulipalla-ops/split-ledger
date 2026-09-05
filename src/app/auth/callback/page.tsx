'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { FullScreenLoader } from '@/lib/auth';

/**
 * OAuth and magic-link landing point.
 *
 * The provider redirects here with a one-time `?code=`; we exchange it for a
 * session (stored in localStorage) and then send the person where they were
 * originally headed. On native this same URL is reached through a deep link
 * that the Capacitor layer forwards here.
 */
function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const rawNext = params.get('next');
    const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/groups';
    const authError = params.get('error_description') ?? params.get('error');
    const code = params.get('code');

    (async () => {
      if (authError) {
        setError(authError);
        return;
      }
      if (!code) {
        setError('That sign-in link is no longer valid. Request a new one.');
        return;
      }
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setError(exchangeError.message);
        return;
      }
      router.replace(next);
    })();
  }, [params, router]);

  if (error) {
    return (
      <div className="wrap-narrow">
        <div className="sheet">
          <div className="sheet-head">
            <h2>Could not sign you in</h2>
          </div>
          <div className="sheet-body">
            <p className="hint bad" style={{ marginTop: 0 }}>
              {error}
            </p>
          </div>
          <div className="modal-foot">
            <a className="btn btn-primary" href="/signin">
              Back to sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <FullScreenLoader />;
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Callback />
    </Suspense>
  );
}
