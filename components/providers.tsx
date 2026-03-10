'use client';

import { useState, useEffect } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { ErrorBoundary } from './error-boundary';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // During SSR/SSG or before client mount, show a minimal loading shell
  // instead of rendering children bare (which would crash usePrivy hooks)
  if (!mounted || !appId) {
    return (
      <div style={{ background: '#0A0A0A', minHeight: '100vh' }} />
    );
  }

  return (
    <ErrorBoundary>
      <PrivyProvider
        appId={appId}
        config={{
          appearance: {
            theme: 'dark',
            logo: '/brand/logo-icon.png',
            landingHeader: 'sign in to battle trade',
            loginMessage: 'compete with real prices. learn, trade, win.',
            showWalletLoginFirst: false,
          },
          loginMethods: ['google', 'twitter', 'email', 'wallet'],
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
