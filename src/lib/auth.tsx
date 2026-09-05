'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase/client';

interface AuthState {
  user: User | null;
  /** True until the first session check resolves. */
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

/**
 * Holds the current session for the whole app and keeps it fresh.
 *
 * Replaces the old Next.js middleware: there is no server to gate routes, so
 * the session lives in React and `RequireAuth` does the gating on the client.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ user: data.session?.user ?? null, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ user: session?.user ?? null, loading: false });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/**
 * Renders `children` only for a signed-in user. Anyone else is sent to
 * `/signin`, with a `next` param so the invite-link flow still returns them
 * where they were headed.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || user) return;
    const here =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/';
    const next = here && here !== '/' ? `?next=${encodeURIComponent(here)}` : '';
    router.replace(`/signin${next}`);
  }, [loading, user, router]);

  if (loading) return <FullScreenLoader />;
  if (!user) return <FullScreenLoader />;
  return <>{children}</>;
}

export function FullScreenLoader() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--ink-2)',
        fontSize: 14,
      }}
    >
      <span>Loading…</span>
    </div>
  );
}

/** Sign out and return to the sign-in screen. */
export async function signOutAndRedirect(push: (href: string) => void) {
  await supabase.auth.signOut();
  push('/signin');
}
