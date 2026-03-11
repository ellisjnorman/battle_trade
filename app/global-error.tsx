'use client';

/**
 * Global error boundary — catches errors in the root layout itself.
 * Must render its own <html> and <body> since the layout may have crashed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0A',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', color: '#F5A0D0' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#999', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            A critical error occurred. Please refresh the page.
          </p>
          {error.digest && (
            <p style={{ color: '#555', fontSize: '0.75rem', marginBottom: '1rem', fontFamily: 'monospace' }}>
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
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
