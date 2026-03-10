'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------
const B = { fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", letterSpacing: '0.05em' } as const;
const M = { fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", letterSpacing: '-0.02em' } as const;
const S = { fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif" } as const;

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
const PRESETS = [
  {
    id: 'quick-battle', name: 'QUICK BATTLE', tagline: 'Fast & chaotic', time: '15 MIN',
    icon: '⚡', gradient: 'linear-gradient(135deg, rgba(245,160,208,0.15), rgba(245,160,208,0.03))',
    border: '#F5A0D0',
    config: { starting_balance: 10000, round_duration_seconds: 180, entry_fee: 0, scoring_mode: 'best_round' as const, lobby_duration_minutes: 15, volatility_engine: 'algorithmic' as const, credit_source: 'self_funded' as const, format: 'elimination' as const },
  },
  {
    id: 'tournament', name: 'TOURNAMENT', tagline: 'Winner takes the pot', time: '1 HOUR',
    icon: '🏆', gradient: 'linear-gradient(135deg, rgba(0,255,136,0.12), rgba(0,255,136,0.02))',
    border: '#00FF88',
    config: { starting_balance: 10000, round_duration_seconds: 300, entry_fee: 500, scoring_mode: 'best_round' as const, lobby_duration_minutes: 60, volatility_engine: 'manual' as const, credit_source: 'self_funded' as const, format: 'elimination' as const },
  },
  {
    id: 'irl-event', name: 'IRL EVENT', tagline: 'Conference / meetup', time: '30 MIN',
    icon: '🎤', gradient: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))',
    border: '#444',
    config: { starting_balance: 10000, round_duration_seconds: 300, entry_fee: 0, scoring_mode: 'best_round' as const, lobby_duration_minutes: 30, volatility_engine: 'manual' as const, credit_source: 'sponsor_funded' as const, format: 'elimination' as const },
  },
  {
    id: 'custom', name: 'CUSTOM', tagline: 'You decide everything', time: '∞',
    icon: '⚙️', gradient: 'linear-gradient(135deg, rgba(255,255,255,0.04), transparent)',
    border: '#222',
    config: null,
  },
];

const LEVERAGE_OPTIONS = [2, 5, 10, 20, 50, 100];
const ROUND_DURATIONS = [
  { label: '3 MIN', value: 180 },
  { label: '5 MIN', value: 300 },
  { label: '10 MIN', value: 600 },
  { label: '15 MIN', value: 900 },
];
const LOBBY_DURATIONS = [
  { label: '15 MIN', value: 15 },
  { label: '30 MIN', value: 30 },
  { label: '45 MIN', value: 45 },
  { label: '1 HOUR', value: 60 },
];

export default function CreateLobbyPage() {
  const router = useRouter();
  const [step, setStep] = useState<'preset' | 'config' | 'done'>('preset');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdLobby, setCreatedLobby] = useState<{ id: string; invite_code: string } | null>(null);
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null);

  // Config state
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [startingBalance, setStartingBalance] = useState(10000);
  const [roundDuration, setRoundDuration] = useState(300);
  const [lobbyDuration, setLobbyDuration] = useState(30);
  const [leverages, setLeverages] = useState<number[]>([5, 10, 20]);
  const [scoringMode, setScoringMode] = useState<'best_round' | 'cumulative' | 'last_round'>('best_round');
  const [volatilityEngine, setVolatilityEngine] = useState<'manual' | 'algorithmic' | 'off'>('manual');
  const [entryFee, setEntryFee] = useState(0);
  const [format, setFormat] = useState<'elimination' | 'rounds'>('elimination');

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = PRESETS.find(p => p.id === presetId);
    if (preset?.config) {
      setRoundDuration(preset.config.round_duration_seconds);
      setLobbyDuration(preset.config.lobby_duration_minutes);
      setEntryFee(preset.config.entry_fee);
      setScoringMode(preset.config.scoring_mode);
      setVolatilityEngine(preset.config.volatility_engine);
      setStartingBalance(preset.config.starting_balance);
      setFormat(preset.config.format);
    }
    // Custom preset starts with advanced open
    if (presetId === 'custom') setShowAdvanced(true);
    else setShowAdvanced(false);
    setStep('config');
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/lobby/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          format,
          is_public: isPublic,
          admin_password: password || undefined,
          config: {
            starting_balance: startingBalance,
            available_symbols: [],
            leverage_tiers: leverages,
            volatility_engine: volatilityEngine,
            round_duration_seconds: roundDuration,
            lobby_duration_minutes: lobbyDuration,
            scoring_mode: scoringMode,
            entry_fee: entryFee,
            entry_rake_pct: 20,
            operator_controlled: true,
            credit_source: entryFee > 0 ? 'self_funded' : 'sponsor_funded',
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedLobby(data);
        setStep('done');
      }
    } catch { /* */ }
    finally { setCreating(false); }
  };

  const toggleLeverage = (lev: number) => {
    setLeverages(prev =>
      prev.includes(lev) ? prev.filter(l => l !== lev) : [...prev, lev].sort((a, b) => a - b)
    );
  };

  const presetData = PRESETS.find(p => p.id === selectedPreset);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button, select, input { border-radius: 0 !important; outline: none; }
        button:hover:not(:disabled) { filter: brightness(1.15); }
        button:active:not(:disabled) { transform: scale(0.97); }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glowPulse { 0%,100% { box-shadow: 0 0 20px rgba(245,160,208,0.15); } 50% { box-shadow: 0 0 40px rgba(245,160,208,0.3); } }
        @keyframes breathe { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 800px; } }
        .fade-in { animation: fadeIn 0.4s ease-out; }
        .glow-pulse { animation: glowPulse 2s ease-in-out infinite; }
        .breathe { animation: breathe 2s ease-in-out infinite; }
      `}</style>

      <div style={{ minHeight: '100dvh', background: '#0A0A0A', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '2px solid #1A1A1A', background: '#0D0D0D', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/brand/logo-main.png" alt="Battle Trade" style={{ height: 32, width: 'auto', cursor: 'pointer' }} onClick={() => router.push('/')} />
            <span style={{ width: 1, height: 24, background: '#222' }} />
            <span style={{ ...B, fontSize: 18, color: '#888' }}>CREATE</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflowY: 'auto', padding: '32px 24px' }}>
          <div style={{ width: '100%', maxWidth: 560 }} className="fade-in">

            {/* ═══ STEP 1: PICK YOUR GAME ═══ */}
            {step === 'preset' && (
              <div>
                <h1 style={{ ...B, fontSize: 64, color: '#FFF', lineHeight: 0.95, textShadow: '0 0 60px rgba(245,160,208,0.2)' }}>
                  START A<br /><span style={{ color: '#F5A0D0' }}>BATTLE</span>
                </h1>
                <p style={{ ...S, fontSize: 14, color: '#888', marginTop: 12 }}>Pick your format. You can tweak settings after.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 28 }}>
                  {PRESETS.map((p, i) => {
                    const isHovered = hoveredPreset === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handlePresetSelect(p.id)}
                        onMouseEnter={() => setHoveredPreset(p.id)}
                        onMouseLeave={() => setHoveredPreset(null)}
                        style={{
                          padding: '20px 24px',
                          background: isHovered ? p.gradient : '#0D0D0D',
                          border: `2px solid ${isHovered ? p.border : '#1A1A1A'}`,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 16,
                          textAlign: 'left',
                          transition: 'all 200ms ease',
                          animation: `fadeIn 0.3s ease-out ${i * 0.08}s both`,
                        }}
                      >
                        <span style={{ fontSize: 36, width: 48, textAlign: 'center', filter: isHovered ? 'none' : 'grayscale(0.5)' }}>{p.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ ...B, fontSize: 24, color: isHovered ? '#FFF' : '#CCC' }}>{p.name}</span>
                            {p.config?.entry_fee ? (
                              <span style={{ ...M, fontSize: 10, color: '#00FF88', border: '1px solid #00FF88', padding: '1px 6px' }}>PRIZE POOL</span>
                            ) : null}
                          </div>
                          <span style={{ ...S, fontSize: 12, color: '#888' }}>{p.tagline}</span>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ ...M, fontSize: 14, color: isHovered ? '#FFF' : '#555', fontWeight: 700 }}>{p.time}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ═══ STEP 2: NAME + CREATE (quick) / CONFIGURE (pro) ═══ */}
            {step === 'config' && (
              <div>
                <button onClick={() => { setStep('preset'); setSelectedPreset(null); }} style={{ ...B, fontSize: 14, color: '#555', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16 }}>← BACK</button>

                {/* Preset badge */}
                {presetData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <span style={{ fontSize: 28 }}>{presetData.icon}</span>
                    <div>
                      <span style={{ ...B, fontSize: 20, color: '#FFF' }}>{presetData.name}</span>
                      <span style={{ ...M, fontSize: 11, color: '#555', marginLeft: 10 }}>
                        {Math.floor(roundDuration / 60)}min rounds · {lobbyDuration}min · {leverages.map(l => `${l}x`).join('/')} · {entryFee === 0 ? 'Free' : `${entryFee}CR entry`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Name — THE main input */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>NAME YOUR LOBBY</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value.toUpperCase())}
                    placeholder="E.G. FRIDAY NIGHT BATTLE"
                    maxLength={40}
                    autoFocus
                    style={{
                      width: '100%', height: 60, ...B, fontSize: 26, color: '#FFF',
                      background: '#111', border: '2px solid #222', padding: '0 16px',
                      transition: 'border-color 200ms',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#F5A0D0'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#222'; }}
                  />
                </div>

                {/* CREATE BUTTON — prominent, above the fold */}
                <button
                  onClick={handleCreate}
                  disabled={!name.trim() || creating}
                  className={name.trim() && !creating ? 'glow-pulse' : ''}
                  style={{
                    width: '100%', height: 72, ...B, fontSize: 32,
                    color: name.trim() ? '#0A0A0A' : '#555',
                    background: name.trim() ? (creating ? '#888' : '#00FF88') : '#1A1A1A',
                    border: 'none',
                    cursor: name.trim() && !creating ? 'pointer' : 'not-allowed',
                    transition: 'all 200ms',
                    marginBottom: 16,
                  }}
                >
                  {creating ? 'CREATING...' : '⚡ CREATE LOBBY'}
                </button>

                {/* Advanced toggle */}
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    width: '100%', padding: '12px 0',
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <span style={{ ...S, fontSize: 12, color: '#555' }}>{showAdvanced ? 'HIDE' : 'CUSTOMIZE'} SETTINGS</span>
                  <span style={{ ...M, fontSize: 12, color: '#555', transition: 'transform 200ms', transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                </button>

                {/* Advanced settings — collapsible */}
                {showAdvanced && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 16, borderTop: '1px solid #1A1A1A', animation: 'fadeIn 0.3s ease-out' }}>
                    {/* Format */}
                    <div>
                      <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>FORMAT</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {([
                          { key: 'elimination' as const, label: 'ELIMINATION', desc: 'Last one standing' },
                          { key: 'rounds' as const, label: 'ROUNDS', desc: 'Best performance wins' },
                        ]).map(f => (
                          <button key={f.key} onClick={() => setFormat(f.key)} style={{ flex: 1, padding: 14, background: format === f.key ? 'rgba(245,160,208,0.08)' : '#0D0D0D', border: `2px solid ${format === f.key ? '#F5A0D0' : '#1A1A1A'}`, cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ ...B, fontSize: 16, color: format === f.key ? '#F5A0D0' : '#FFF', display: 'block' }}>{f.label}</span>
                            <span style={{ ...S, fontSize: 10, color: '#888' }}>{f.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Timing — side by side */}
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>ROUND LENGTH</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {ROUND_DURATIONS.map(d => (
                            <button key={d.value} onClick={() => setRoundDuration(d.value)} style={{ flex: 1, height: 40, ...M, fontSize: 11, fontWeight: 700, color: roundDuration === d.value ? '#0A0A0A' : '#555', background: roundDuration === d.value ? '#F5A0D0' : 'transparent', border: `1px solid ${roundDuration === d.value ? '#F5A0D0' : '#222'}`, cursor: 'pointer' }}>
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>LOBBY DURATION</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {LOBBY_DURATIONS.map(d => (
                            <button key={d.value} onClick={() => setLobbyDuration(d.value)} style={{ flex: 1, height: 40, ...M, fontSize: 11, fontWeight: 700, color: lobbyDuration === d.value ? '#0A0A0A' : '#555', background: lobbyDuration === d.value ? '#F5A0D0' : 'transparent', border: `1px solid ${lobbyDuration === d.value ? '#F5A0D0' : '#222'}`, cursor: 'pointer' }}>
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Leverage */}
                    <div>
                      <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>LEVERAGE OPTIONS</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {LEVERAGE_OPTIONS.map(lev => (
                          <button key={lev} onClick={() => toggleLeverage(lev)} style={{ flex: 1, height: 40, ...M, fontSize: 13, fontWeight: 700, color: leverages.includes(lev) ? '#0A0A0A' : '#555', background: leverages.includes(lev) ? '#F5A0D0' : 'transparent', border: `1px solid ${leverages.includes(lev) ? '#F5A0D0' : '#222'}`, cursor: 'pointer' }}>
                            {lev}X
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Starting Balance */}
                    <div>
                      <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>STARTING BALANCE</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[5000, 10000, 25000, 50000, 100000].map(b => (
                          <button key={b} onClick={() => setStartingBalance(b)} style={{ flex: 1, height: 40, ...M, fontSize: 11, fontWeight: 700, color: startingBalance === b ? '#0A0A0A' : '#555', background: startingBalance === b ? '#F5A0D0' : 'transparent', border: `1px solid ${startingBalance === b ? '#F5A0D0' : '#222'}`, cursor: 'pointer' }}>
                            ${(b / 1000).toFixed(0)}K
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Scoring + Events */}
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>SCORING</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {([
                            { key: 'best_round' as const, label: 'BEST' },
                            { key: 'cumulative' as const, label: 'CUMUL' },
                            { key: 'last_round' as const, label: 'LAST' },
                          ]).map(s => (
                            <button key={s.key} onClick={() => setScoringMode(s.key)} style={{ flex: 1, height: 40, ...M, fontSize: 11, fontWeight: 700, color: scoringMode === s.key ? '#0A0A0A' : '#555', background: scoringMode === s.key ? '#F5A0D0' : 'transparent', border: `1px solid ${scoringMode === s.key ? '#F5A0D0' : '#222'}`, cursor: 'pointer' }}>
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>EVENTS</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {([
                            { key: 'manual' as const, label: 'MANUAL' },
                            { key: 'algorithmic' as const, label: 'AUTO' },
                            { key: 'off' as const, label: 'OFF' },
                          ]).map(v => (
                            <button key={v.key} onClick={() => setVolatilityEngine(v.key)} style={{ flex: 1, height: 40, ...M, fontSize: 11, fontWeight: 700, color: volatilityEngine === v.key ? '#0A0A0A' : '#555', background: volatilityEngine === v.key ? '#F5A0D0' : 'transparent', border: `1px solid ${volatilityEngine === v.key ? '#F5A0D0' : '#222'}`, cursor: 'pointer' }}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Entry fee */}
                    <div>
                      <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>ENTRY FEE</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[0, 100, 250, 500, 1000].map(f => (
                          <button key={f} onClick={() => setEntryFee(f)} style={{ flex: 1, height: 40, ...M, fontSize: 11, fontWeight: 700, color: entryFee === f ? '#0A0A0A' : '#555', background: entryFee === f ? '#F5A0D0' : 'transparent', border: `1px solid ${entryFee === f ? '#F5A0D0' : '#222'}`, cursor: 'pointer' }}>
                            {f === 0 ? 'FREE' : `${f}CR`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Visibility + password */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                      <div>
                        <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>VISIBILITY</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setIsPublic(true)} style={{ height: 40, padding: '0 20px', ...B, fontSize: 14, color: isPublic ? '#0A0A0A' : '#555', background: isPublic ? '#F5A0D0' : 'transparent', border: `1px solid ${isPublic ? '#F5A0D0' : '#222'}`, cursor: 'pointer' }}>PUBLIC</button>
                          <button onClick={() => setIsPublic(false)} style={{ height: 40, padding: '0 20px', ...B, fontSize: 14, color: !isPublic ? '#0A0A0A' : '#555', background: !isPublic ? '#F5A0D0' : 'transparent', border: `1px solid ${!isPublic ? '#F5A0D0' : '#222'}`, cursor: 'pointer' }}>PRIVATE</button>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...S, fontSize: 10, color: '#777', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>ADMIN PASSWORD</label>
                        <input
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="OPTIONAL"
                          type="password"
                          style={{ width: '100%', height: 40, ...M, fontSize: 12, color: '#FFF', background: '#111', border: '1px solid #222', padding: '0 12px' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ STEP 3: DONE ═══ */}
            {step === 'done' && createdLobby && (
              <div style={{ textAlign: 'center', paddingTop: 32 }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>⚡</div>
                <h1 style={{ ...B, fontSize: 64, color: '#00FF88', lineHeight: 1, textShadow: '0 0 60px rgba(0,255,136,0.4)' }}>LET&apos;S GO</h1>
                <p style={{ ...B, fontSize: 28, color: '#FFF', marginTop: 16 }}>{name}</p>

                <div style={{ marginTop: 32, padding: 24, border: '2px solid #F5A0D0', background: '#0D0D0D', display: 'inline-block' }} className="glow-pulse">
                  <div style={{ ...S, fontSize: 10, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>INVITE CODE</div>
                  <div style={{ ...M, fontSize: 48, color: '#F5A0D0', fontWeight: 700, letterSpacing: '0.15em', textShadow: '0 0 30px rgba(245,160,208,0.5)' }}>
                    {createdLobby.invite_code}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => router.push(`/lobby/${createdLobby.id}/admin`)}
                    style={{ height: 56, padding: '0 32px', ...B, fontSize: 20, color: '#0A0A0A', background: '#F5A0D0', border: 'none', cursor: 'pointer' }}
                  >
                    OPEN ADMIN PANEL
                  </button>
                  <button
                    onClick={() => router.push(`/register/${createdLobby.invite_code}`)}
                    style={{ height: 56, padding: '0 32px', ...B, fontSize: 20, color: '#FFF', background: 'transparent', border: '2px solid #333', cursor: 'pointer' }}
                  >
                    JOIN AS PLAYER
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(createdLobby.invite_code); }}
                    style={{ height: 56, padding: '0 32px', ...B, fontSize: 20, color: '#888', background: 'transparent', border: '1px solid #222', cursor: 'pointer' }}
                  >
                    COPY CODE
                  </button>
                </div>

                <div style={{ marginTop: 32 }}>
                  <div style={{ ...S, fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>SHARE LINK</div>
                  <div style={{ ...M, fontSize: 11, color: '#444', wordBreak: 'break-all' }}>
                    {typeof window !== 'undefined' ? `${window.location.origin}/register/${createdLobby.invite_code}` : ''}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
