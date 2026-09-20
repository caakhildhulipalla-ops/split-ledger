/**
 * Cloud configuration.
 *
 * The app is complete without any of this. Supabase turns a one-phone farm
 * into a three-farm business where the owner sees every shed from home — but
 * until those two variables are set at build time, the device database is the
 * whole system and nothing in the UI should suggest otherwise.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;

/** True only when both values are present and look real. */
export const cloudEnabled = (): boolean =>
  url.startsWith('http') && anonKey.length > 20;

export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.origin.startsWith('http')) return window.location.origin;
  return '';
}
