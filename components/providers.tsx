'use client';

import { useState, useEffect } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { ErrorBoundary } from './error-boundary';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!mounted || !appId) return <>{children}</>;

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
