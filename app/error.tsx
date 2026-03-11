'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console in structured format; in production this would
    // be picked up by any client-side error reporter.
    console.error('[battle-trade] Client error boundary caught:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A0A0A',
        color: '#fff',
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        padding: '2rem',
      }}
    >
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', color: '#F5A0D0' }}>
          Something went wrong
        </h2>
        <p style={{ color: '#999', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          An unexpected error occurred. Our team has been notified.
        </p>
        {error.digest && (
          <p style={{ color: '#555', fontSize: '0.75rem', marginBottom: '1rem', fontFamily: 'var(--font-jetbrains), monospace' }}>
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            background: '#F5A0D0',
            color: '#0A0A0A',
            border: 'none',
            borderRadius: 14,
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
