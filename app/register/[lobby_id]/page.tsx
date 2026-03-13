'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const bebas = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const mono = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const sans = "var(--font-dm-sans, 'DM Sans'), sans-serif";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Screen = 'welcome' | 'success';

interface RegistrationResult {
  trader_id: string;
  code: string;
  lobby_id: string;
  lobby_name: string;
  display_name: string;
  handle: string | null;
  is_competitor: boolean;
  credits: number;
  entry_fee?: number;
  trade_url: string;
  spectate_url: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const { lobby_id: lobbyId } = useParams<{ lobby_id: string }>();
  const { user, ready: privyReady } = usePrivy();

  const [screen, setScreen] = useState<Screen>('welcome');
  const [isCompetitor, setIsCompetitor] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lobby info
  const [lobbyName, setLobbyName] = useState<string | null>(null);
  const [entryFee, setEntryFee] = useState(0);
  const [prizePool, setPrizePool] = useState(0);
  const [totalEntries, setTotalEntries] = useState(0);

  // Get wallet address from Privy automatically
  const walletAddress = user?.wallet?.address ?? '';

  useEffect(() => {
    fetch(`/api/lobby/${lobbyId}/info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.name) setLobbyName(data.name); })
      .catch(() => {});
    fetch(`/api/lobby/${lobbyId}/fee-info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setEntryFee(data.entry_fee ?? 0);
          setPrizePool(data.prize_pool ?? 0);
          setTotalEntries(data.total_entries ?? 0);
        }
      })
      .catch(() => {});
  }, [lobbyId]);

  // Result
  const [result, setResult] = useState<RegistrationResult | null>(null);

  // Auto-redirect to terminal after success
  useEffect(() => {
    if (!result) return;
    const path = result.is_competitor
      ? `/lobby/${result.lobby_id}/trade?code=${result.code}`
      : `/lobby/${result.lobby_id}/spectate?code=${result.code}`;
    const timer = setTimeout(() => {
      window.location.href = path;
    }, 1000);
    return () => clearTimeout(timer);
  }, [result]);

  const handleSubmit = useCallback(async (competitor: boolean) => {
    setSubmitting(true);
    setError(null);

    const displayName =
      user?.google?.name ??
      user?.twitter?.username ??
      user?.email?.address?.split('@')[0] ??
      'ANON';

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          is_competitor: competitor,
          wallet_address: walletAddress || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.insufficient_credits) {
          setError(`Not enough credits to enter. Entry fee: ${data.entry_fee} CR. You can earn credits during the match.`);
        } else {
          setError(data.error ?? 'Registration failed');
        }
        setSubmitting(false);
        return;
      }
      setResult(data);
      setScreen('success');
    } catch {
      setError('Network error — try again');
    }
    setSubmitting(false);
  }, [lobbyId, user, walletAddress]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: #333; }
        input, button { border-radius: 0 !important; -webkit-appearance: none; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%, 100% { text-shadow: 0 0 40px rgba(245,160,208,0.3); } 50% { text-shadow: 0 0 80px rgba(245,160,208,0.6); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: translateX(0); } }
        .fade-up { animation: fadeUp 600ms ease both; }
        .fade-up-1 { animation: fadeUp 600ms ease 100ms both; }
        .fade-up-2 { animation: fadeUp 600ms ease 200ms both; }
        .fade-up-3 { animation: fadeUp 600ms ease 300ms both; }
        .slide-in { animation: slideIn 400ms ease both; }
      `}</style>

      {/* Scanlines */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'repeating-linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)',
        backgroundSize: '2px 2px',
        pointerEvents: 'none', zIndex: 999,
      }} />

      <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>

        {/* ============================================================= */}
        {/* SCREEN 1 — WELCOME — THE HYPE SCREEN                          */}
        {/* ============================================================= */}
        {screen === 'welcome' && (
          <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
            {/* Logo — big and proud */}
            <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/logo-main.png"
                alt="Battle Trade"
                style={{ width: '100%', maxWidth: 360, height: 'auto' }}
              />
            </div>

            {/* Tagline */}
            <div className="fade-up-1" style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: sans, fontSize: 13, color: '#999999', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                THE FUTURE OF FINANCE IS MULTIPLAYER
              </div>
            </div>

            {/* Event badge */}
            <div className="fade-up-2" style={{
              border: '1px solid #1A1A1A',
              padding: '12px 32px',
              textAlign: 'center',
            }}>
              <div style={{ fontFamily: bebas, fontSize: 28, color: '#F5A0D0', letterSpacing: '0.15em' }}>
                {lobbyName ?? 'BATTLE TRADE'}
              </div>
              <div style={{ fontFamily: mono, fontSize: 11, color: '#999999', letterSpacing: '-0.02em', marginTop: 4 }}>
                LIVE ELIMINATION TRADING
              </div>
            </div>

            {/* Entry Fee + Prize Pool */}
            {entryFee > 0 && (
              <div className="fade-up-3" style={{
                width: '100%',
                border: '1px solid #1A1A1A',
                background: 'rgba(0,255,136,0.02)',
                padding: '16px 24px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 9, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase' }}>ENTRY FEE</div>
                    <div style={{ fontFamily: bebas, fontSize: 28, color: '#F5A0D0', lineHeight: 1, marginTop: 2 }}>
                      {entryFee.toLocaleString()} CR
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: sans, fontSize: 9, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase' }}>PRIZE POOL</div>
                    <div style={{ fontFamily: bebas, fontSize: 28, color: '#00FF88', lineHeight: 1, marginTop: 2 }}>
                      {prizePool.toLocaleString()} CR
                    </div>
                  </div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 11, color: '#555', textAlign: 'center' }}>
                  1st: 60% · 2nd: 25% · 3rd: 15% · {totalEntries} entered
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ fontFamily: mono, fontSize: 12, color: '#FF3333', textShadow: '0 0 10px rgba(255,51,51,0.4)' }}>
                {error}
              </div>
            )}

            {/* CTAs */}
            <div className="fade-up-3" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => { setIsCompetitor(true); handleSubmit(true); }}
                disabled={submitting}
                style={{
                  width: '100%', height: 72,
                  background: submitting ? '#1A1A1A' : '#F5A0D0',
                  color: submitting ? '#444444' : '#0A0A0A',
                  border: 'none', fontFamily: bebas,
                  fontSize: 32, letterSpacing: '0.08em',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'LOCKING IN...' : (entryFee > 0 ? `JOIN THE BATTLE · ${entryFee.toLocaleString()} CR` : 'JOIN THE BATTLE')}
              </button>
              <button
                onClick={() => { setIsCompetitor(false); handleSubmit(false); }}
                disabled={submitting}
                style={{
                  width: '100%', height: 56,
                  background: 'transparent',
                  color: submitting ? '#444444' : '#999999',
                  border: '1px solid #1A1A1A', fontFamily: bebas,
                  fontSize: 24, letterSpacing: '0.08em',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                SPECTATE + EVENTS
              </button>
            </div>

            {/* Bottom line */}
            <div style={{ fontFamily: sans, fontSize: 10, color: '#888888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              POWERED BY CRACKED LABS
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* SCREEN 2 — SUCCESS — YOU'RE IN                                */}
        {/* ============================================================= */}
        {screen === 'success' && result && (
          <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            {/* Logo — same as welcome screen */}
            <div className="fade-up">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/logo-main.png"
                alt="Battle Trade"
                style={{ width: '100%', maxWidth: 320, height: 'auto' }}
              />
            </div>

            {/* YOU'RE IN */}
            <div className="fade-up-1" style={{
              fontFamily: bebas, fontSize: 96,
              color: '#FFF', lineHeight: 1,
              textAlign: 'center', letterSpacing: '0.05em',
              animation: 'pulseGlow 3s ease-in-out infinite',
            }}>
              YOU&apos;RE IN
            </div>

            {/* Display name */}
            <div className="fade-up-2" style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: bebas, fontSize: 48, color: '#F5A0D0',
                letterSpacing: '0.05em',
                textShadow: '0 0 20px rgba(245,160,208,0.3)',
              }}>
                {result.display_name}
              </div>
            </div>

            {/* Stats row */}
            <div className="fade-up-3" style={{
              display: 'flex', gap: 32,
              padding: '16px 32px',
              border: '1px solid #1A1A1A',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: mono, fontSize: 28, color: '#F5A0D0', fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {result.credits}
                </div>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  CREDITS
                </div>
              </div>
              <div style={{ width: 1, background: '#1A1A1A' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: mono, fontSize: 28, color: '#FFF', fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {result.code}
                </div>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  ACCESS CODE
                </div>
              </div>
              {result.entry_fee && result.entry_fee > 0 && (
                <>
                  <div style={{ width: 1, background: '#1A1A1A' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: mono, fontSize: 28, color: '#00FF88', fontWeight: 700, letterSpacing: '-0.02em' }}>
                      {result.entry_fee}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      FEE PAID
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Redirecting indicator */}
            <div style={{ fontFamily: sans, fontSize: 12, color: '#999999', letterSpacing: '0.05em' }}>
              Redirecting to {result.is_competitor ? 'trading terminal' : 'spectator view'}...
            </div>
          </div>
        )}
      </div>
    </>
  );
}
