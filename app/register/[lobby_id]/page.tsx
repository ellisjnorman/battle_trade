'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const bebas = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const mono = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const sans = "var(--font-dm-sans, 'DM Sans'), sans-serif";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Screen = 'welcome' | 'register' | 'profile' | 'success';

interface RegistrationResult {
  trader_id: string;
  code: string;
  lobby_id: string;
  lobby_name: string;
  display_name: string;
  handle: string | null;
  is_competitor: boolean;
  credits: number;
  trade_url: string;
  spectate_url: string;
}

const TRADE_ASSETS = ['BTC', 'ETH', 'SOL', 'MEMES', 'ALTS', 'PERPS', 'OPTIONS', 'EVERYTHING'];
const VOLUME_TIERS = ['JUST WATCHING', 'UNDER $10K/MO', '$10K-$100K/MO', '$100K-$1M/MO', '$1M+/MO', 'DEGEN LEVELS'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const { lobby_id: lobbyId } = useParams<{ lobby_id: string }>();

  const [screen, setScreen] = useState<Screen>('welcome');
  const [isCompetitor, setIsCompetitor] = useState(true);

  // Form fields — step 1
  const [teamName, setTeamName] = useState('');
  const [handle, setHandle] = useState('');
  const [walletAddress, setWalletAddress] = useState('');

  // Form fields — step 2 (profile)
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [volume, setVolume] = useState('');
  const [wantsWhitelist, setWantsWhitelist] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lobby info
  const [lobbyName, setLobbyName] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lobby/${lobbyId}/info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.name) setLobbyName(data.name); })
      .catch(() => {});
  }, [lobbyId]);

  // Result
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Generate QR code when result is available
  useEffect(() => {
    if (!result) return;
    const url = result.is_competitor ? result.trade_url : result.spectate_url;
    QRCode.toDataURL(url, {
      width: 240,
      margin: 1,
      color: { dark: '#FFFFFF', light: '#0A0A0A' },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [result]);

  const toggleAsset = (asset: string) => {
    setSelectedAssets(prev =>
      prev.includes(asset) ? prev.filter(a => a !== asset) : [...prev, asset]
    );
  };

  const handleNext = () => {
    const name = isCompetitor ? teamName.trim() : (handle.trim() || 'SPECTATOR');
    if (isCompetitor && !name) { setError('Enter a team name'); return; }
    setError(null);
    setScreen('profile');
  };

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const name = isCompetitor ? teamName.trim() : (handle.trim() || 'SPECTATOR');

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: name,
          handle: handle.trim() || null,
          is_competitor: isCompetitor,
          wallet_address: walletAddress.trim() || null,
          team_name: isCompetitor ? teamName.trim() || null : null,
          trading_assets: selectedAssets.length > 0 ? selectedAssets : null,
          monthly_volume: volume || null,
          wants_whitelist: wantsWhitelist,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Registration failed'); setSubmitting(false); return; }
      setResult(data);
      setScreen('success');
    } catch {
      setError('Network error — try again');
    }
    setSubmitting(false);
  }, [lobbyId, isCompetitor, teamName, handle, walletAddress, selectedAssets, volume, wantsWhitelist]);

  const handleReset = () => {
    setScreen('welcome');
    setTeamName('');
    setHandle('');
    setWalletAddress('');
    setSelectedAssets([]);
    setVolume('');
    setWantsWhitelist(false);
    setResult(null);
    setQrDataUrl(null);
    setError(null);
    setIsCompetitor(true);
  };

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

            {/* CTAs */}
            <div className="fade-up-3" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => { setIsCompetitor(true); setScreen('register'); }}
                style={{
                  width: '100%', height: 72,
                  background: '#F5A0D0', color: '#0A0A0A',
                  border: 'none', fontFamily: bebas,
                  fontSize: 32, letterSpacing: '0.08em',
                  cursor: 'pointer',
                }}
              >
                ENTER THE ARENA
              </button>
              <button
                onClick={() => { setIsCompetitor(false); setScreen('register'); }}
                style={{
                  width: '100%', height: 56,
                  background: 'transparent', color: '#999999',
                  border: '1px solid #1A1A1A', fontFamily: bebas,
                  fontSize: 24, letterSpacing: '0.08em',
                  cursor: 'pointer',
                }}
              >
                SPECTATE + SABOTAGE
              </button>
            </div>

            {/* Bottom line */}
            <div style={{ fontFamily: sans, fontSize: 10, color: '#888888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              POWERED BY CRACKED LABS
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* SCREEN 2 — REGISTRATION FORM                                  */}
        {/* ============================================================= */}
        {screen === 'register' && (
          <div className="fade-up" style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 40, color: '#FFF', letterSpacing: '0.05em', lineHeight: 1 }}>
                {isCompetitor ? 'LOCK IN' : 'JOIN THE CROWD'}
              </div>
              <div style={{ fontFamily: sans, fontSize: 12, color: '#999999', marginTop: 8 }}>
                {isCompetitor
                  ? 'Register your team. Trade live. Last one standing wins.'
                  : 'Watch the chaos. Launch sabotages. Bet on winners.'}
              </div>
            </div>

            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {isCompetitor && (
                <div className="slide-in">
                  <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    TEAM NAME
                  </div>
                  <input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                    placeholder="WOLFPACK"
                    style={{
                      width: '100%', height: 56,
                      background: '#111111', border: '2px solid #1A1A1A',
                      color: '#FFF', fontFamily: bebas,
                      fontSize: 24, letterSpacing: '0.05em',
                      padding: '0 16px', outline: 'none',
                    }}
                    autoFocus
                  />
                </div>
              )}

              <div className="slide-in" style={{ animationDelay: '50ms' }}>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  HANDLE
                </div>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                  placeholder="@yourhandle"
                  style={{
                    width: '100%', height: 48,
                    background: '#111111', border: '1px solid #1A1A1A',
                    color: '#FFF', fontFamily: sans,
                    fontSize: 16, padding: '0 16px', outline: 'none',
                  }}
                  autoFocus={!isCompetitor}
                />
              </div>

              <div className="slide-in" style={{ animationDelay: '100ms' }}>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  WALLET ADDRESS <span style={{ color: '#888888' }}>OPTIONAL</span>
                </div>
                <input
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                  placeholder="0x... or SOL address"
                  style={{
                    width: '100%', height: 48,
                    background: '#111111', border: '1px solid #1A1A1A',
                    color: '#888888', fontFamily: mono,
                    fontSize: 13, letterSpacing: '-0.02em',
                    padding: '0 16px', outline: 'none',
                  }}
                />
              </div>
            </div>

            {error && (
              <div style={{ fontFamily: mono, fontSize: 12, color: '#FF3333', textShadow: '0 0 10px rgba(255,51,51,0.4)' }}>
                {error}
              </div>
            )}

            <button
              onClick={handleNext}
              style={{
                width: '100%', height: 56,
                background: '#F5A0D0', color: '#0A0A0A',
                border: 'none', fontFamily: bebas,
                fontSize: 28, letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              NEXT
            </button>

            <button
              onClick={handleReset}
              style={{ background: 'transparent', border: 'none', fontFamily: sans, fontSize: 12, color: '#888888', cursor: 'pointer', alignSelf: 'center' }}
            >
              BACK
            </button>
          </div>
        )}

        {/* ============================================================= */}
        {/* SCREEN 3 — PROFILE / TRADING INFO                             */}
        {/* ============================================================= */}
        {screen === 'profile' && (
          <div className="fade-up" style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 40, color: '#FFF', letterSpacing: '0.05em', lineHeight: 1 }}>
                TELL US MORE
              </div>
              <div style={{ fontFamily: sans, fontSize: 12, color: '#999999', marginTop: 8 }}>
                Help us match you with the right opponents and rewards.
              </div>
            </div>

            {/* What do you trade */}
            <div>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                WHAT DO YOU TRADE?
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TRADE_ASSETS.map(asset => {
                  const active = selectedAssets.includes(asset);
                  return (
                    <button
                      key={asset}
                      onClick={() => toggleAsset(asset)}
                      style={{
                        padding: '8px 16px',
                        background: active ? 'rgba(245,160,208,0.06)' : 'transparent',
                        border: active ? '2px solid #F5A0D0' : '1px solid #222222',
                        color: active ? '#F5A0D0' : '#555555',
                        fontFamily: bebas, fontSize: 16,
                        letterSpacing: '0.05em',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {asset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Volume */}
            <div>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                MONTHLY VOLUME
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {VOLUME_TIERS.map(tier => {
                  const active = volume === tier;
                  return (
                    <button
                      key={tier}
                      onClick={() => setVolume(tier)}
                      style={{
                        width: '100%', height: 40,
                        textAlign: 'left', padding: '0 16px',
                        background: active ? 'rgba(245,160,208,0.06)' : '#111111',
                        border: active ? '2px solid #F5A0D0' : '1px solid #1A1A1A',
                        color: active ? '#F5A0D0' : '#555555',
                        fontFamily: bebas, fontSize: 16,
                        letterSpacing: '0.05em',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Whitelist toggle */}
            <button
              onClick={() => setWantsWhitelist(!wantsWhitelist)}
              style={{
                width: '100%', padding: '16px',
                background: wantsWhitelist ? 'rgba(245,160,208,0.06)' : '#111111',
                border: wantsWhitelist ? '2px solid #F5A0D0' : '1px solid #1A1A1A',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <div style={{
                width: 24, height: 24,
                border: wantsWhitelist ? '2px solid #F5A0D0' : '2px solid #333333',
                background: wantsWhitelist ? '#F5A0D0' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {wantsWhitelist && <span style={{ color: '#0A0A0A', fontFamily: mono, fontSize: 14, fontWeight: 700 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontFamily: bebas, fontSize: 18, color: wantsWhitelist ? '#F5A0D0' : '#888888', letterSpacing: '0.05em' }}>
                  WHITELIST + REWARD OPPORTUNITIES
                </div>
                <div style={{ fontFamily: sans, fontSize: 11, color: '#999999', marginTop: 2 }}>
                  Get early access to drops, token rewards, and exclusive lobbies
                </div>
              </div>
            </button>

            {error && (
              <div style={{ fontFamily: mono, fontSize: 12, color: '#FF3333', textShadow: '0 0 10px rgba(255,51,51,0.4)' }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
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
              {submitting ? 'LOCKING IN...' : 'JOIN THE BATTLE'}
            </button>

            <button
              onClick={() => setScreen('register')}
              style={{ background: 'transparent', border: 'none', fontFamily: sans, fontSize: 12, color: '#888888', cursor: 'pointer', alignSelf: 'center' }}
            >
              BACK
            </button>
          </div>
        )}

        {/* ============================================================= */}
        {/* SCREEN 4 — SUCCESS — YOU'RE IN                                */}
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

            {/* Team name */}
            <div className="fade-up-2" style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: bebas, fontSize: 48, color: '#F5A0D0',
                letterSpacing: '0.05em',
                textShadow: '0 0 20px rgba(245,160,208,0.3)',
              }}>
                {result.display_name}
              </div>
              {result.handle && (
                <div style={{ fontFamily: sans, fontSize: 14, color: '#999999', marginTop: 4 }}>
                  {result.handle}
                </div>
              )}
            </div>

            {/* QR Code */}
            {qrDataUrl && (
              <div className="fade-up-2" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                border: '1px solid #1A1A1A', padding: 24,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  width={200}
                  height={200}
                  style={{ imageRendering: 'pixelated' }}
                />
                <div style={{ fontFamily: sans, fontSize: 11, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>
                  SCAN TO OPEN YOUR {result.is_competitor ? 'COCKPIT' : 'VIEW'}
                </div>
              </div>
            )}

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
            </div>

            {/* Enter terminal button */}
            <button
              onClick={() => {
                const path = result.is_competitor
                  ? `/lobby/${result.lobby_id}/trade?code=${result.code}`
                  : `/lobby/${result.lobby_id}/spectate?code=${result.code}`;
                window.location.href = path;
              }}
              style={{
                width: '100%', height: 72,
                background: '#F5A0D0', color: '#0A0A0A',
                border: 'none', fontFamily: bebas,
                fontSize: 32, letterSpacing: '0.08em',
                cursor: 'pointer',
              }}
            >
              {result.is_competitor ? 'ENTER TRADING TERMINAL' : 'ENTER SPECTATOR VIEW'}
            </button>

            {/* Register another */}
            <button
              onClick={handleReset}
              style={{
                background: 'transparent',
                border: '1px solid #1A1A1A',
                color: '#777',
                fontFamily: bebas,
                fontSize: 18,
                letterSpacing: '0.08em',
                padding: '12px 32px',
                cursor: 'pointer',
              }}
            >
              REGISTER ANOTHER
            </button>
          </div>
        )}
      </div>
    </>
  );
}
