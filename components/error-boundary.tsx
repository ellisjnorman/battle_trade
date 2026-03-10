'use client';

import React from 'react';

const B: React.CSSProperties = { fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", letterSpacing: '0.05em' };
const M: React.CSSProperties = { fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", letterSpacing: '-0.02em' };
const S: React.CSSProperties = { fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif" };

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <div style={{ ...B, fontSize: 64, color: '#FF3333' }}>CRASH</div>
          <div style={{ ...S, fontSize: 16, color: '#888', textAlign: 'center', maxWidth: 400 }}>
            Something went wrong. This error has been logged.
          </div>
          {this.state.error && (
            <div style={{ ...M, fontSize: 11, color: '#444', maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {this.state.error.message}
            </div>
          )}
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ ...B, fontSize: 20, color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '12px 32px', cursor: 'pointer', marginTop: 8 }}
          >
            RELOAD
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/** Lighter-weight inline error boundary for sections within a page */
export class SectionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[SectionError]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{ padding: 16, background: '#0D0D0D', border: '1px solid #FF3333', textAlign: 'center' }}>
          <div style={{ ...B, fontSize: 16, color: '#FF3333' }}>SECTION ERROR</div>
          <div style={{ ...M, fontSize: 10, color: '#555', marginTop: 4 }}>{this.state.error?.message}</div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ ...B, fontSize: 12, color: '#FFF', background: 'transparent', border: '1px solid #333', padding: '4px 12px', cursor: 'pointer', marginTop: 8 }}
          >
            RETRY
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
