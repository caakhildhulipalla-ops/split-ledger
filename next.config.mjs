/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static single-page export. There is no Next.js server in production: the
  // `out/` directory is served as-is by a static host on the web and bundled
  // into the native app by Capacitor. Every route is client-rendered and talks
  // straight to Supabase.
  output: 'export',

  // `next/image` optimisation needs a server; serve the images as authored.
  images: { unoptimized: true },

  // Emit `route/index.html` for every route so a cold load or a deep link to a
  // nested path resolves to a real file under both static hosting and the
  // Capacitor WebView.
  trailingSlash: true,

  reactStrictMode: true,
  poweredByHeader: false,

  // Security headers can't be set from here in export mode — they come from the
  // static host (see vercel.json) and, on native, from the app shell.
};

export default nextConfig;
