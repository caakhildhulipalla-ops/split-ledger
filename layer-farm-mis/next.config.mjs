/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export. There is no server in production: `out/` is bundled into the
  // Android app by Capacitor and can equally be served by any static host. Every
  // screen is client-rendered and reads the device database first.
  output: 'export',
  images: { unoptimized: true },
  // Emit `route/index.html` per route so a cold start or deep link to a nested
  // path resolves to a real file inside the WebView.
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
