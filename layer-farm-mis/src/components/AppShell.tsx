'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Nav } from './Nav';
import { useData } from '@/lib/store';

/**
 * Everything behind the sign-in.
 *
 * The redirect waits for `ready`: the session lives in IndexedDB, so for the
 * first few frames after a cold start nobody is signed in yet. Redirecting on
 * that would bounce every returning user through the sign-in screen.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { ready, session } = useData();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) router.replace('/signin');
  }, [ready, session, router]);

  if (!ready) {
    return (
      <div className="app">
        <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '60dvh' }}>
          <div className="muted small">Opening the farm’s records…</div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="app">
      {children}
      <Nav />
    </div>
  );
}
