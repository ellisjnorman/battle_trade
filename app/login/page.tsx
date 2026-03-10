'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  signInWithEmail,
  signInWithPassword,
  signUpWithEmail,
  signInWithApple,
  signInWithWallet,
  getCurrentUser,
  getOrCreateProfile,
} from '@/lib/auth';
import { getAvailableWallets } from '@/lib/wallet';

type Mode = 'login' | 'signup' | 'magic_link_sent';

const bebas = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const mono = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const sans = "var(--font-dm-sans, 'DM Sans'), sans-serif";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // Which button is loading
  const [wallets, setWallets] = useState({ evm: false, solana: false });

  useEffect(() => {
    setWallets(getAvailableWallets());
    // Check if already logged in
    getCurrentUser().then(user => {
      if (user) router.replace(redirect);
    });
  }, [router, redirect]);

  const handleEmailAuth = async () => {
    if (!email) { setError('Enter your email'); return; }
    setError(null);
    setLoading('email');

    if (mode === 'signup') {
      if (!password || password.length < 6) { setError('Password must be 6+ characters'); setLoading(null); return; }
      const result = await signUpWithEmail(email, password);
      if (result.error) { setError(result.error); setLoading(null); return; }
      setMode('magic_link_sent');
    } else {
      if (password) {
        // Password login
        const result = await signInWithPassword(email, password);
        if (result.error) { setError(result.error); setLoading(null); return; }
        // Success — ensure profile exists
        const user = await getCurrentUser();
        if (user) await getOrCreateProfile(user);
        router.replace(redirect);
      } else {
        // Magic link
        const result = await signInWithEmail(email);
        if (result.error) { setError(result.error); setLoading(null); return; }
        setMode('magic_link_sent');
      }
    }
    setLoading(null);
  };

  const handleApple = async () => {
    setError(null);
    setLoading('apple');
    const result = await signInWithApple();
    if (result.error) { setError(result.error); setLoading(null); }
    // Redirect handled by OAuth flow
  };

  const handleWallet = async (type: 'evm' | 'solana') => {
    setError(null);
    setLoading(type);
    const result = await signInWithWallet(type);
    if (result.error) { setError(result.error); setLoading(null); return; }
    const user = await getCurrentUser();
    if (user) await getOrCreateProfile(user);
    router.replace(redirect);
    setLoading(null);
  };

  // Magic link sent screen
  if (mode === 'magic_link_sent') {
    return (
      <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>📧</div>
          <div style={{ fontFamily: bebas, fontSize: 48, color: '#FFF', letterSpacing: '0.05em' }}>
            CHECK YOUR EMAIL
          </div>
          <div style={{ fontFamily: sans, fontSize: 14, color: '#999', marginTop: 12, lineHeight: 1.6 }}>
            We sent a magic link to <span style={{ color: '#F5A0D0' }}>{email}</span>.
            Click it to sign in instantly.
          </div>
          <button
            onClick={() => setMode('login')}
            style={{
              marginTop: 32, padding: '12px 32px',
              background: 'transparent', border: '1px solid #333',
              color: '#888', fontFamily: sans, fontSize: 14, cursor: 'pointer',
            }}
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 20px rgba(245,160,208,0.2); } 50% { box-shadow: 0 0 40px rgba(245,160,208,0.4); } }
        .fade-up { animation: fadeUp 500ms ease both; }
        .fade-up-1 { animation: fadeUp 500ms ease 100ms both; }
        .fade-up-2 { animation: fadeUp 500ms ease 200ms both; }
        .fade-up-3 { animation: fadeUp 500ms ease 300ms both; }
        .fade-up-4 { animation: fadeUp 500ms ease 400ms both; }
        .auth-btn:hover { border-color: #F5A0D0 !important; }
        .auth-btn:active { transform: scale(0.98); }
        input::placeholder { color: #444; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Logo */}
        <div className="fade-up" style={{ textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-main.png" alt="Battle Trade" onClick={() => router.push('/')} style={{ width: '100%', maxWidth: 280, height: 'auto', margin: '0 auto', cursor: 'pointer' }} />
        </div>

        {/* Title */}
        <div className="fade-up-1" style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: bebas, fontSize: 36, color: '#FFF', letterSpacing: '0.08em' }}>
            {mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}
          </div>
          <div style={{ fontFamily: sans, fontSize: 12, color: '#666', marginTop: 4 }}>
            {mode === 'signup' ? 'Join the arena' : 'Welcome back, trader'}
          </div>
        </div>

        {/* Email input */}
        <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleEmailAuth()}
            placeholder="EMAIL"
            autoFocus
            style={{
              width: '100%', height: 52,
              background: '#111', border: '2px solid #222',
              color: '#FFF', fontFamily: sans, fontSize: 15,
              padding: '0 16px', outline: 'none',
            }}
          />
          {(mode === 'signup' || password) && (
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEmailAuth()}
              placeholder="PASSWORD"
              style={{
                width: '100%', height: 52,
                background: '#111', border: '2px solid #222',
                color: '#FFF', fontFamily: sans, fontSize: 15,
                padding: '0 16px', outline: 'none',
              }}
            />
          )}

          <button
            onClick={handleEmailAuth}
            disabled={!!loading}
            style={{
              width: '100%', height: 56,
              background: loading === 'email' ? '#333' : '#F5A0D0',
              color: loading === 'email' ? '#666' : '#0A0A0A',
              border: 'none', fontFamily: bebas,
              fontSize: 24, letterSpacing: '0.1em',
              cursor: loading ? 'not-allowed' : 'pointer',
              animation: !loading ? 'glowPulse 3s ease-in-out infinite' : 'none',
            }}
          >
            {loading === 'email' ? 'LOADING...' : mode === 'signup' ? 'CREATE ACCOUNT' : password ? 'SIGN IN' : 'SEND MAGIC LINK'}
          </button>

          {mode === 'login' && !password && (
            <div style={{ fontFamily: sans, fontSize: 11, color: '#555', textAlign: 'center' }}>
              No password? We&apos;ll email you a magic link.
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="fade-up-3" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1, height: 1, background: '#222' }} />
          <span style={{ fontFamily: mono, fontSize: 10, color: '#444', letterSpacing: '0.1em' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: '#222' }} />
        </div>

        {/* Social / wallet buttons */}
        <div className="fade-up-3" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Apple */}
          <button
            onClick={handleApple}
            disabled={!!loading}
            className="auth-btn"
            style={{
              width: '100%', height: 52,
              background: '#FFF', color: '#000',
              border: '2px solid #FFF',
              fontFamily: sans, fontSize: 15, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              opacity: loading && loading !== 'apple' ? 0.4 : 1,
              transition: 'all 150ms ease',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            {loading === 'apple' ? 'CONNECTING...' : 'CONTINUE WITH APPLE'}
          </button>

          {/* Wallet buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleWallet('evm')}
              disabled={!!loading || !wallets.evm}
              className="auth-btn"
              style={{
                flex: 1, height: 52,
                background: 'transparent', color: wallets.evm ? '#FFF' : '#444',
                border: `2px solid ${wallets.evm ? '#333' : '#1A1A1A'}`,
                fontFamily: mono, fontSize: 12, fontWeight: 700,
                cursor: loading || !wallets.evm ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: loading && loading !== 'evm' ? 0.4 : 1,
                transition: 'all 150ms ease',
              }}
            >
              🦊 {wallets.evm ? 'METAMASK' : 'NO EVM WALLET'}
            </button>
            <button
              onClick={() => handleWallet('solana')}
              disabled={!!loading || !wallets.solana}
              className="auth-btn"
              style={{
                flex: 1, height: 52,
                background: 'transparent', color: wallets.solana ? '#FFF' : '#444',
                border: `2px solid ${wallets.solana ? '#333' : '#1A1A1A'}`,
                fontFamily: mono, fontSize: 12, fontWeight: 700,
                cursor: loading || !wallets.solana ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: loading && loading !== 'solana' ? 0.4 : 1,
                transition: 'all 150ms ease',
              }}
            >
              👻 {wallets.solana ? 'PHANTOM' : 'NO SOL WALLET'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontFamily: mono, fontSize: 12, color: '#FF3333', textAlign: 'center', textShadow: '0 0 10px rgba(255,51,51,0.4)' }}>
            {error}
          </div>
        )}

        {/* Toggle login/signup */}
        <div className="fade-up-4" style={{ textAlign: 'center' }}>
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
            style={{
              background: 'transparent', border: 'none',
              fontFamily: sans, fontSize: 13, color: '#666', cursor: 'pointer',
            }}
          >
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <span style={{ color: '#F5A0D0' }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </span>
          </button>
        </div>

        {/* Footer */}
        <div style={{ fontFamily: sans, fontSize: 10, color: '#333', textAlign: 'center', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          POWERED BY CRACKED LABS
        </div>
      </div>
    </div>
  );
}
