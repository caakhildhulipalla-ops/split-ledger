/**
 * Native shell glue.
 *
 * Everything here is optional: the same bundle runs in a browser, where the
 * Capacitor plugins simply report that they are unavailable. Guarding on
 * `isNativePlatform` rather than try/catch alone keeps the web build from
 * paying for plugin bridges that will never answer.
 */

import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export async function initNative(): Promise<void> {
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: dark ? '#0b100d' : '#f3f5f0' });
  } catch {
    /* status bar control is cosmetic */
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* no splash to hide */
  }

  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
  } catch {
    /* keyboard accessory is a nicety */
  }
}

/** A short tap of feedback when a figure is committed. */
export async function tap(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* haptics are optional */
  }
}

/**
 * Local notifications carry the alerts.
 *
 * The requirements settle on push over WhatsApp because WhatsApp Business
 * messages are billed per message (decision 14). Until a push service is
 * wired up, scheduling them locally means a farmer still gets told — on the
 * device, for free, and offline.
 */
export async function notify(items: readonly { id: number; title: string; body: string }[]): Promise<void> {
  if (!isNative() || items.length === 0) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      const asked = await LocalNotifications.requestPermissions();
      if (asked.display !== 'granted') return;
    }
    await LocalNotifications.schedule({
      notifications: items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        schedule: { at: new Date(Date.now() + 1_000) },
      })),
    });
  } catch {
    /* notifications refused or unavailable */
  }
}

/** Stable small integer id for a notification, from an alert key. */
export function notificationId(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return Math.abs(hash) % 2_000_000_000;
}
