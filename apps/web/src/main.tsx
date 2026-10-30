import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardStyle } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { queryClient } from '@/lib/queryClient';
import App from '@/App';
import '@/styles/globals.css';

// We restore scroll ourselves (see ScrollRestoration) — stop the browser fighting it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// Hide the WKWebView form-accessory toolbar (the ^ ⌄ / Done bar) so text entry shows the
// plain native iOS keyboard instead of looking like a web page. iOS only.
if (Capacitor.getPlatform() === 'ios') {
  Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
  // Light keyboard + dark status-bar content to match the cream theme.
  Keyboard.setStyle({ style: KeyboardStyle.Light }).catch(() => {});
  StatusBar.setStyle({ style: Style.Light }).catch(() => {}); // Style.Light = dark text (for light bg)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
