'use client';
import { useEffect } from 'react';
import { isNative } from '@/lib/native';

/**
 * Registers the offline shell for the web build. Kept out of the critical path
 * deliberately: the app works without it, and a failed registration must never
 * break a page load. Skipped inside the native shell, where Capacitor already
 * serves the bundle locally and a service worker would only get in the way.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (isNative()) return;
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
