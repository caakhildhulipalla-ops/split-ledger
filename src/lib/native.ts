'use client';

import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor native shell (not a plain browser). */
export const isNative = () => Capacitor.isNativePlatform();

/** 'ios' | 'android' | 'web' */
export const platform = () => Capacitor.getPlatform();

/**
 * A light haptic tap. No-op on the web. Used to acknowledge a committed action
 * (expense saved, payment recorded) the way a native app is expected to.
 */
export async function tapFeedback() {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* haptics are a nicety, never a requirement */
  }
}

/** Open an external URL in the system browser (for links that must leave the app). */
export async function openExternal(url: string) {
  if (!isNative()) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}
