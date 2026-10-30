import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.seemsfithealth.app',
  appName: 'SeemsFit',
  webDir: 'dist',
  ios: {
    // Serve bundled assets from https://localhost so the WebView is a secure
    // context (Firebase, crypto, camera all require this). No server.url —
    // the app runs fully offline-capable from the bundled dist/.
    scheme: 'https',
    contentInset: 'never',
  },
  plugins: {
    FirebaseAuthentication: {
      // Use the native Google SDK; we mirror the credential into the JS SDK
      // ourselves (signInWithCredential) so Firestore sees the same user.
      skipNativeAuth: false,
      providers: ['google.com'],
    },
    Keyboard: {
      // Resize the native webview frame with the keyboard so the input bar rises WITH the
      // keyboard animation (no split-second catch-up), and force a light keyboard to match the
      // app's light UI so it reads as one surface, not a dark bar under a light screen.
      resize: 'native',
      style: 'light',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
