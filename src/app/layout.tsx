import type { Metadata, Viewport } from 'next';

// Fonts are self-hosted from npm rather than fetched from Google. Three
// reasons: the installed app keeps its typography with no network, there is
// no third-party request on every page load for a privacy policy to explain,
// and the build does not depend on fonts.googleapis.com being reachable.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/zilla-slab/600.css';
import '@fontsource/zilla-slab/700.css';

import './globals.css';
import ServiceWorker from '@/components/ServiceWorker';
import NativeInit from '@/components/NativeInit';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: { default: 'Split Ledger', template: '%s · Split Ledger' },
  description:
    'Share expenses with the people you live and travel with. Split bills any way you need, settle up in the fewest payments, and see where the money actually goes.',
  applicationName: 'Split Ledger',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Split Ledger', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfefc' },
    { media: '(prefers-color-scheme: dark)', color: '#161b17' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <NativeInit />
        <ServiceWorker />
      </body>
    </html>
  );
}
