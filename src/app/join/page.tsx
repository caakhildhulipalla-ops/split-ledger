'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, FullScreenLoader } from '@/lib/auth';
import { redeemInvite } from '@/lib/mutations';

/**
 * Invite landing page.
 *
 * A signed-out visitor is sent to sign in and returned here afterwards, so the
 * link works whether or not they already have an account — which is the whole
 * point of sending it to a flatmate.
 */
function Join() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const ran = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  const code = params.get('code') ?? '';

  useEffect(() => {
    if (loading || ran.current) return;

    if (!user) {
      router.replace(`/signin?next=${encodeURIComponent(`/join?code=${code}`)}`);
      return;
    }
    if (!code) {
      setMessage('This invite link is missing its code.');
      return;
    }

    ran.current = true;
    redeemInvite(code).then((result) => {
      if (result.ok && result.id) {
        router.replace(`/g?id=${result.id}`);
      } else {
        setMessage(result.ok ? 'Something went wrong joining that group.' : result.error);
      }
    });
  }, [loading, user, code, router]);

  if (!message) return <FullScreenLoader />;

  return (
    <div className="wrap-narrow">
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span className="rule-mark" style={{ width: 26, height: 15 }} />
          <h1 style={{ fontSize: 24 }}>Split Ledger</h1>
        </div>
      </div>
      <div className="sheet">
        <div className="sheet-head">
          <h2>This invite did not work</h2>
        </div>
        <div className="sheet-body">
          <p style={{ marginTop: 0 }}>{message}</p>
          <p className="mini">
            Invite links expire after two weeks and can be used a limited number of
            times. Whoever sent it can generate a fresh one from the group&rsquo;s
            settings.
          </p>
        </div>
        <div className="modal-foot">
          <a className="btn btn-primary" href="/groups">
            Go to your groups
          </a>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Join />
    </Suspense>
  );
}
