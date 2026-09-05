import type { Metadata } from 'next';
import SignInForm from '@/components/SignInForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith('/') ? params.next : '/groups';

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

      <SignInForm next={next} initialError={params.error} />
    </div>
  );
}
