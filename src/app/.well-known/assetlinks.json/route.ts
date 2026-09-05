/**
 * Digital Asset Links.
 *
 * This is what removes the browser address bar from the Play build. Android
 * fetches it over HTTPS and checks that the certificate that signed the
 * installed APK is listed here. Get it wrong and the app still works but
 * opens inside a Chrome tab with a URL bar — the single most common reason a
 * TWA looks unfinished.
 *
 * ANDROID_CERT_FINGERPRINT is the SHA-256 of your signing certificate, as
 * colon-separated uppercase hex. Take it from Play Console >
 * Setup > App integrity > App signing key certificate, NOT from your local
 * upload keystore — Play re-signs your app with its own key.
 *
 * Multiple fingerprints (upload key plus Play's signing key, or a debug key
 * while testing) are comma-separated in the variable.
 */
export const dynamic = 'force-dynamic';

const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME ?? 'app.splitledger.twa';

export async function GET() {
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINT ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  const body = fingerprints.length
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: PACKAGE_NAME,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Android caches this; keep it short while you are still verifying.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
