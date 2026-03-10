'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { ErrorBoundary } from './error-boundary';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <PrivyProvider
        appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'MISSING_PRIVY_APP_ID'}
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
