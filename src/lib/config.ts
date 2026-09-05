/**
 * The public origin used to build shareable links (invite links, mostly).
 *
 * On the web this is just where the app is served from. Inside the native
 * shell `window.location.origin` is a private scheme like `capacitor://localhost`
 * that no one else can open, so a real deployment must set
 * `NEXT_PUBLIC_SITE_URL` at build time and that value wins.
 */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.origin.startsWith('http')) {
    return window.location.origin;
  }
  return 'https://splitledger.example.com';
}

/** Shareable invite URL for a code. */
export const inviteUrl = (code: string) => `${siteOrigin()}/join?code=${code}`;
