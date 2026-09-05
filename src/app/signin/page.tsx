'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SignInForm from '@/components/SignInForm';
import { useAuth, FullScreenLoader } from '@/lib/auth';

function SignIn() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();

  const rawNext = params.get('next');
  const next = rawNext && rawNext.startsWith('/') ? rawNext : '/groups';
  const error = params.get('error') ?? undefined;

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  if (loading || user) return <FullScreenLoader />;

  return (
    <div className="wrap-narrow">
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 10 }}
        >
          <span className="rule-mark" style={{ width: 26, height: 15 }} />
          <h1 style={{ fontSize: 26, letterSpacing: '-.02em' }}>Split Ledger</h1>
        </div>
        <p style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '34ch', marginInline: 'auto' }}>
          Share expenses with the people you live and travel with — and settle up in the
          fewest payments that clear everyone.
        </p>
      </div>

      <SignInForm next={next} initialError={error} />
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <SignIn />
    </Suspense>
  );
}
