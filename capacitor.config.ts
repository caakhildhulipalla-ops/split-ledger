import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell configuration.
 *
 * `webDir` is Next's static export output. `npx cap sync` copies it into the
 * native projects, so the flow is always: `npm run build` then `npx cap sync`.
 *
 * The app bundles its own web assets and talks to Supabase over HTTPS; it never
 * points `server.url` at a remote site (that would be a thin wrapper Apple
 * rejects, and would break offline start-up).
 */
const config: CapacitorConfig = {
  appId: 'app.splitledger',
  appName: 'Split Expense',
  webDir: 'out',
  server: {
    // Serve the bundled app from https://localhost inside the WebView.
    androidScheme: 'https',
  },
  plugins: {
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
