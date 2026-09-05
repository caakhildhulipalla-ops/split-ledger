'use client';

import { useRouter as useNextRouter } from 'next/navigation';
import { useMemo } from 'react';
import { revalidate } from './store';

/**
 * Drop-in replacement for `next/navigation`'s `useRouter` for a statically
 * exported SPA.
 *
 * `push` / `replace` / `back` still drive real client-side navigation. But
 * `refresh()` — which in a server-rendered app re-ran the server components —
 * now just tells the data hooks to re-fetch from Supabase. Every component
 * that used to call `router.refresh()` after a mutation keeps working
 * unchanged; it simply means "reload the data" instead of "re-render on the
 * server".
 */
export function useRouter() {
  const router = useNextRouter();
  return useMemo(
    () => ({
      push: (href: string) => router.push(href),
      replace: (href: string) => router.replace(href),
      back: () => router.back(),
      forward: () => router.forward(),
      prefetch: (href: string) => router.prefetch(href),
      refresh: () => revalidate(),
    }),
    [router],
  );
}
