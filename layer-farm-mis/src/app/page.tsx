'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/store';

/**
 * The front door.
 *
 * Owners and managers land on the dashboard; a supervisor lands on the entry
 * screen, because that is the only thing they open the app to do.
 */
export default function Home() {
  const { ready, session } = useData();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace('/signin');
    else router.replace(session.role === 'supervisor' ? '/entry' : '/dashboard');
  }, [ready, session, router]);

  return (
    <div className="app">
      <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '70dvh' }}>
        <div className="muted small">Layer Farm MIS</div>
      </div>
    </div>
  );
}
