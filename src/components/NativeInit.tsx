'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNative } from '@/lib/native';

/**
 * Native-shell wiring. Renders nothing; on the web every effect early-returns.
 *
 * - dismisses the launch screen once React has painted
 * - themes the status bar to match light / dark
 * - maps the Android hardware Back button to in-app history, and lets a Back
 *   press on a top-level screen send the app to the background instead of
 *   killing it
 */
export default function NativeInit() {
  const router = useRouter();

  useEffect(() => {
    if (!isNative()) return;
    let cleanup = () => {};

    (async () => {
      const [{ SplashScreen }, { StatusBar, Style }, { App }] = await Promise.all([
        import('@capacitor/splash-screen'),
        import('@capacitor/status-bar'),
        import('@capacitor/app'),
      ]);

      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      try {
        await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      } catch {
        /* not fatal */
      }

      await SplashScreen.hide();

      const handle = await App.addListener('backButton', ({ canGoBack }) => {
        const path = window.location.pathname;
        const topLevel =
          path === '/' || path.startsWith('/groups') || path.startsWith('/signin');
        if (canGoBack && !topLevel) router.back();
        else App.minimizeApp();
      });

      cleanup = () => handle.remove();
    })();

    return () => cleanup();
  }, [router]);

  return null;
}
