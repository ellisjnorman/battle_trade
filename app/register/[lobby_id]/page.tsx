'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const bebas = "'Bebas Neue', sans-serif";
const mono = "'JetBrains Mono', monospace";
const sans = "'DM Sans', sans-serif";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Screen = 'welcome' | 'register' | 'success';

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const { lobby_id: lobbyId } = useParams<{ lobby_id: string }>();

  const [screen, setScreen] = useState<Screen>('welcome');
  const [isCompetitor, setIsCompetitor] = useState(true);

  // Form fields
  const [teamName, setTeamName] = useState('');
  const [handle, setHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = useCallback(async () => {
    const name = isCompetitor ? teamName.trim() : (handle.trim() || 'SPECTATOR');
    if (isCompetitor && !name) { setError('Enter a team name'); return; }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: name,
          handle: handle.trim() || null,
          is_competitor: isCompetitor,
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
  }, [lobbyId, isCompetitor, teamName, handle]);

  const handleReset = () => {
    setScreen('welcome');
    setTeamName('');
    setHandle('');
    setResult(null);
    setQrDataUrl(null);
    setError(null);
    setIsCompetitor(true);
  };

  // ---------------------------------------------------------------------------
  // Shared styles
  // ---------------------------------------------------------------------------

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 48,
    background: '#111',
    border: '1px solid #333',
    color: '#FFF',
    fontFamily: bebas,
    fontSize: 20,
    letterSpacing: '0.05em',
    padding: '0 16px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const primaryBtn: React.CSSProperties = {
    width: '100%',
    height: 72,
    background: '#F5A0D0',
    color: '#0A0A0A',
    border: 'none',
    fontFamily: bebas,
    fontSize: 28,
    letterSpacing: '0.08em',
    cursor: 'pointer',
  };

  const secondaryBtn: React.CSSProperties = {
    width: '100%',
    height: 72,
    background: 'transparent',
    color: '#555',
    border: '1px solid #333',
    fontFamily: bebas,
    fontSize: 28,
    letterSpacing: '0.08em',
    cursor: 'pointer',
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
      `}</style>

      <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {/* ============================================================= */}
        {/* SCREEN 1 — WELCOME                                            */}
        {/* ============================================================= */}
        {screen === 'welcome' && (
          <div style={{ width: '100%', maxWidth: 480, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: bebas, fontSize: 64, color: '#FFF', lineHeight: 1, letterSpacing: '0.05em' }}>
                ★ BATTLE TRADE
              </div>
              <div style={{ fontFamily: bebas, fontSize: 24, color: '#F5A0D0', letterSpacing: '0.15em', marginTop: 8 }}>
                CONSENSUS MIAMI 2026
              </div>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => { setIsCompetitor(true); setScreen('register'); }}
                style={primaryBtn}
              >
                ENTER AS COMPETITOR
              </button>
              <button
                onClick={() => { setIsCompetitor(false); setScreen('register'); }}
                style={secondaryBtn}
              >
                ENTER AS SPECTATOR
              </button>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* SCREEN 2 — REGISTRATION FORM                                  */}
        {/* ============================================================= */}
        {screen === 'register' && (
          <div style={{ width: '100%', maxWidth: 480, padding: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ fontFamily: bebas, fontSize: 32, color: '#FFF', letterSpacing: '0.05em' }}>
              {isCompetitor ? 'REGISTER TO COMPETE' : 'REGISTER AS SPECTATOR'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {isCompetitor && (
                <div>
                  <div style={{ fontFamily: sans, fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                    TEAM NAME
                  </div>
                  <input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="WOLFPACK"
                    style={inputStyle}
                    autoFocus
                  />
                </div>
              )}

              <div>
                <div style={{ fontFamily: sans, fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                  HANDLE
                </div>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="@wolfpacktrades"
                  style={inputStyle}
                  autoFocus={!isCompetitor}
                />
              </div>
            </div>

            {error && (
              <div style={{ fontFamily: mono, fontSize: 12, color: '#FF3333' }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                ...primaryBtn,
                opacity: submitting ? 0.5 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'REGISTERING...' : 'JOIN THE BATTLE'}
            </button>

            <button
              onClick={handleReset}
              style={{ background: 'transparent', border: 'none', fontFamily: sans, fontSize: 12, color: '#444', cursor: 'pointer', alignSelf: 'center' }}
            >
              ← BACK
            </button>
          </div>
        )}

        {/* ============================================================= */}
        {/* SCREEN 3 — SUCCESS                                            */}
        {/* ============================================================= */}
        {screen === 'success' && result && (
          <div style={{ width: '100%', maxWidth: 480, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{
              fontFamily: bebas,
              fontSize: 96,
              color: '#FFF',
              lineHeight: 1,
              textAlign: 'center',
              textShadow: '0 0 40px rgba(255,255,255,0.2)',
              letterSpacing: '0.05em',
            }}>
              YOU&apos;RE IN
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: bebas, fontSize: 48, color: '#F5A0D0', letterSpacing: '0.05em' }}>
                {result.display_name}
              </div>
              {result.handle && (
                <div style={{ fontFamily: sans, fontSize: 16, color: '#555', marginTop: 4 }}>
                  {result.handle}
                </div>
              )}
            </div>

            {qrDataUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  width={240}
                  height={240}
                  style={{ imageRendering: 'pixelated' }}
                />
                <div style={{ fontFamily: sans, fontSize: 14, color: '#444', textAlign: 'center' }}>
                  SCAN TO OPEN YOUR {result.is_competitor ? 'COCKPIT' : 'VIEW'}
                </div>
                <div style={{ fontFamily: sans, fontSize: 12, color: '#F5A0D0' }}>
                  battle.fyi
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: mono, fontSize: 24, color: '#F5A0D0', fontWeight: 700 }}>{result.credits}</div>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textTransform: 'uppercase' }}>CREDITS</div>
              </div>
              <div style={{ width: 1, background: '#1A1A1A' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: mono, fontSize: 24, color: '#FFF', fontWeight: 700 }}>{result.code}</div>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textTransform: 'uppercase' }}>YOUR CODE</div>
              </div>
            </div>

            <button
              onClick={handleReset}
              style={{
                marginTop: 16,
                background: 'transparent',
                border: '1px solid #333',
                color: '#555',
                fontFamily: bebas,
                fontSize: 16,
                letterSpacing: '0.08em',
                padding: '10px 32px',
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
