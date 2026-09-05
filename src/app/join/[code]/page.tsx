import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { redeemInvite } from '@/app/actions';

export const metadata: Metadata = { title: 'Join a group' };

/**
 * Invite landing page.
 *
 * A signed-out visitor is sent to sign in and returned here afterwards, so
 * the link works whether or not they already have an account — which is the
 * whole point of sending it to a flatmate.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signin?next=${encodeURIComponent(`/join/${code}`)}`);
  }

  const result = await redeemInvite(code);

  if (result.ok && result.id) {
    redirect(`/g/${result.id}`);
  }

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
          <p style={{ marginTop: 0 }}>
            {result.ok ? 'Something went wrong joining that group.' : result.error}
          </p>
          <p className="mini">
            Invite links expire after two weeks and can be used a limited number of
            times. Whoever sent it can generate a fresh one from the group&rsquo;s
            settings.
          </p>
        </div>
        <div className="modal-foot">
          <Link className="btn btn-primary" href="/groups">
            Go to your groups
          </Link>
        </div>
      </div>
    </div>
  );
}
