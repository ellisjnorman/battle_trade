import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://*.tradingview.com https://auth.privy.io https://js.stripe.com https://*.posthog.com https://*.sentry.io",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: blob: https: http:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://stream.binance.com https://api.binance.com https://*.tradingview.com https://auth.privy.io https://*.privy.io https://api.hyperliquid.xyz https://js.stripe.com https://*.posthog.com https://*.sentry.io wss://*.walletconnect.com wss://*.walletconnect.org https://*.walletconnect.com https://*.walletconnect.org https://*.web3modal.com https://*.infura.io https://*.alchemyapi.io",
              "frame-src 'self' https://s3.tradingview.com https://*.tradingview.com https://auth.privy.io https://js.stripe.com https://verify.walletconnect.com https://verify.walletconnect.org",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
