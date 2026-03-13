'use client';

import { useState, useEffect } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { ErrorBoundary } from './error-boundary';
import { registerServiceWorker } from '@/lib/register-sw';

// Suppress hydration warnings and wallet extension errors (MetaMask, Phantom, etc.)
// These extensions inject DOM nodes and attempt connections that React/Next.js don't expect
if (typeof window !== 'undefined') {
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('unique "key" prop') && new Error().stack?.includes('inpage.js')) return;
    if (msg.includes('Hydration') || msg.includes('hydrat')) return;
    if (msg.includes('MetaMask') || msg.includes('metamask')) return;
    if (msg.includes('Cross-Origin-Opener-Policy') || msg.includes('COOP')) return;
    if (msg.includes('Failed to connect to MetaMask')) return;
    origError.apply(console, args);
  };

  // Intercept unhandled rejections from wallet extensions
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason?.message || String(e.reason || '');
    if (msg.includes('MetaMask') || msg.includes('metamask') || msg.includes('inpage.js')) {
      e.preventDefault();
    }
  });

  // Suppress error events from wallet extensions
  window.addEventListener('error', (e) => {
    const msg = e.message || '';
    if (msg.includes('MetaMask') || msg.includes('Cross-Origin-Opener-Policy')) {
      e.preventDefault();
    }
  });
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    registerServiceWorker();
  }, []);

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // During SSR/SSG or before client mount, show a minimal loading shell
  // instead of rendering children bare (which would crash usePrivy hooks)
  if (!mounted || !appId) {
    return (
      <div suppressHydrationWarning style={{ background: '#0A0A0A', minHeight: '100vh' }} />
    );
  }

  return (
    <ErrorBoundary>
      <PrivyProvider
        appId={appId}
        config={{
          appearance: {
            theme: 'dark',
            accentColor: '#F5A0D0',
            logo: '/brand/logo-main.png',
            landingHeader: 'Sign In',
            loginMessage: 'Trade against real people. Win real prizes.',
            showWalletLoginFirst: false,
          },
          loginMethods: ['google', 'twitter', 'email', 'wallet'],
          externalWallets: {
            walletConnect: { enabled: true },
          },
          embeddedWallets: {
            ethereum: {
              createOnLogin: 'users-without-wallets',
            },
          },
        }}
      >
        {children}
      </PrivyProvider>
    </ErrorBoundary>
  );
}
