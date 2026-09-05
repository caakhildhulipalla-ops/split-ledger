'use client';
import { useEffect } from 'react';

/**
 * Registers the offline shell. Kept out of the critical path deliberately:
 * the app works without it, and a failed registration must never break a
 * page load.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* offline support is a bonus, not a requirement */
      });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
