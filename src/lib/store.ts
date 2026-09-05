'use client';

/**
 * A one-line pub/sub used to tell every live data hook that something it
 * loaded may now be stale and should be re-fetched.
 *
 * In the server-rendered version of this app a mutation called
 * `router.refresh()` and Next re-ran the server components. There is no server
 * here any more — the app is a static bundle talking straight to Supabase — so
 * `revalidate()` takes that job: a mutation calls it, and `useGroup` /
 * `useGroups` / `useInvites` reload.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Re-fetch every mounted data hook. Call after any successful mutation. */
export function revalidate(): void {
  for (const l of [...listeners]) l();
}

/** Subscribe a hook's loader. Returns an unsubscribe function. */
export function onRevalidate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
