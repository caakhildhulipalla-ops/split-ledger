import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

/**
 * Native shell configuration.
 *
 * `webDir` is Next's static export. `cap sync` copies it into the Android
 * project, so the flow is always `next build` then `cap sync android`.
 *
 * The app bundles its own web assets — `server.url` is never pointed at a
 * remote site. A shed supervisor with no signal must be able to cold-start the
 * app and record the morning collection.
 */
const config: CapacitorConfig = {
  appId: 'in.layerfarm.mis',
  appName: 'Layer Farm MIS',
  webDir: 'out',
  server: { androidScheme: 'https' },
  plugins: {
    // Resize the native view rather than the WebView, so a number pad never
    // pushes the figure being typed off the top of the screen.
    Keyboard: { resize: KeyboardResize.Native },
    SplashScreen: { launchAutoHide: false, backgroundColor: '#0f1c14' },
  },
};

export default config;
