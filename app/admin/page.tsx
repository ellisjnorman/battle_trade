'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PRESETS, PRESET_CATEGORIES } from '@/lib/event-presets';
import type { EventPreset } from '@/lib/event-presets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TraderStanding {
  trader: { id: string; name: string; team_id: string | null; is_eliminated: boolean };
  portfolioValue: number;
  returnPct: number;
  rank: number;
  teamName?: string;
}

interface RoundData {
  id: string;
  round_number: number;
  status: 'pending' | 'active' | 'frozen' | 'completed';
  started_at: string | null;
  ended_at: string | null;
  starting_balance: number;
  duration_seconds: number;
  elimination_pct: number;
}

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'action' | 'error' | 'info' | 'broadcast';
}

type AdminTab = 'rounds' | 'dj' | 'chat';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const bebas = "var(--font-bebas), sans-serif";
const mono = "var(--font-jetbrains), monospace";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const [standings, setStandings] = useState<TraderStanding[]>([]);
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null);
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState<AdminTab>('rounds');

  // Round settings
  const [duration, setDuration] = useState(300);
  const [firingPreset, setFiringPreset] = useState<string | null>(null);

  // Auto-admin
  const [autoAdmin, setAutoAdmin] = useState(false);
  const [autoAdminLoading, setAutoAdminLoading] = useState(false);

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Core functions
  // ---------------------------------------------------------------------------

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: new Date().toISOString(), message, type }]);
  }, []);

  const adminPost = useCallback(
    async (path: string, body: Record<string, unknown> = {}) => {
      const label = path.split('/').pop() ?? path;
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/admin/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: password },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) { addLog(`[${label}] ERROR: ${data.error}`, 'error'); return null; }
        addLog(`[${label}] OK`, 'action');
        return data;
      } catch (err) {
        addLog(`[${label}] FETCH ERROR: ${String(err)}`, 'error');
        return null;
      }
    },
    [password, lobbyId, addLog],
  );

  const fetchCurrentRound = useCallback(async () => {
    if (!lobbyId) return;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/admin/status`, { headers: { Authorization: password } });
      if (res.ok) {
        const data = await res.json();
        if (data.round) setCurrentRound(data.round);
        if (data.traders) {
          const mapped: TraderStanding[] = (data.traders as Array<Record<string, unknown>>)
            .filter(t => t.rank != null)
            .map(t => ({
              trader: {
                id: t.trader_id as string,
                name: t.name as string,
                team_id: (t.team_id as string) ?? null,
                is_eliminated: t.is_eliminated as boolean,
              },
              portfolioValue: t.balance as number,
              returnPct: t.return_pct as number,
              rank: t.rank as number,
            }));
          setStandings(mapped);
        }
      }
    } catch { /* silent */ }
  }, [lobbyId, password]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => { if (lobbyId && authenticated) fetchCurrentRound(); }, [lobbyId, authenticated, fetchCurrentRound]);
  useEffect(() => {
    if (!authenticated || !lobbyId) return;
    const interval = setInterval(fetchCurrentRound, 2000);
    return () => clearInterval(interval);
  }, [authenticated, lobbyId, fetchCurrentRound]);

  useEffect(() => {
    if (!currentRound || currentRound.status !== 'active' || !currentRound.started_at) { setElapsed(0); return; }
    const tick = () => { setElapsed(Math.floor((Date.now() - new Date(currentRound.started_at!).getTime()) / 1000)); };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [currentRound]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleLogin = () => { setPassword(passwordInput); setAuthenticated(true); addLog('Authenticated', 'info'); };

  // One-click game start: create round + start it
  const handleCreateAndStart = async () => {
    if (!lobbyId) return;
    // Create round
    const result = await adminPost('round/next', {
      settings: { duration_seconds: duration, starting_balance: currentRound?.starting_balance ?? 10000 },
    });
    if (result?.round) {
      setCurrentRound(result.round);
      addLog(`Created Round ${result.round.round_number}`, 'action');
      // Auto-start it
      const startResult = await adminPost('round/start', { round_id: result.round.id });
      if (startResult?.round) setCurrentRound(startResult.round);
    }
  };

  const handleStartRound = async () => {
    if (!currentRound) return;
    const result = await adminPost('round/start', { round_id: currentRound.id });
    if (result?.round) setCurrentRound(result.round);
  };

  const handleFreezeRound = async () => {
    if (!currentRound) return;
    const result = await adminPost('round/freeze', { round_id: currentRound.id });
    if (result?.round) setCurrentRound(result.round);
  };

  const handleEndRound = async () => {
    if (!currentRound) return;
    const result = await adminPost('round/next', {
      settings: { duration_seconds: currentRound.duration_seconds, starting_balance: currentRound.starting_balance },
    });
    if (result?.round) { setCurrentRound(result.round); addLog(`Round ended → Round ${result.round.round_number}`, 'action'); }
  };

  const handleEliminate = async (traderId: string, traderName: string) => {
    const result = await adminPost('round/eliminate', { trader_id: traderId });
    if (result) { addLog(`Eliminated: ${traderName}`, 'action'); fetchCurrentRound(); }
  };

  const handleNextRound = async () => {
    if (!lobbyId) return;
    const result = await adminPost('round/next', {
      settings: { duration_seconds: duration, starting_balance: currentRound?.starting_balance ?? 10000 },
    });
    if (result?.round) { setCurrentRound(result.round); addLog(`Created Round ${result.round.round_number}`, 'action'); }
  };

  const handleToggleAutoAdmin = async () => {
    setAutoAdminLoading(true);
    const result = await adminPost('auto-admin', { enabled: !autoAdmin });
    if (result) {
      setAutoAdmin(!autoAdmin);
      addLog(`Auto-admin ${!autoAdmin ? 'ENABLED' : 'DISABLED'}`, 'action');
    }
    setAutoAdminLoading(false);
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim() || broadcastSending) return;
    setBroadcastSending(true);
    const result = await adminPost('broadcast', { message: broadcastMsg.trim() });
    if (result) {
      addLog(`[BROADCAST] ${broadcastMsg.trim()}`, 'broadcast');
      setBroadcastMsg('');
    }
    setBroadcastSending(false);
  };

  const handleFirePreset = async (preset: EventPreset) => {
    if (!lobbyId || firingPreset) return;
    setFiringPreset(preset.id);
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: password },
        body: JSON.stringify({ preset_id: preset.id }),
      });
      const data = await res.json();
      if (res.ok) {
        addLog(`[DJ] ${preset.emoji} ${preset.name} — ${data.events_fired} events`, 'action');
        const maxDelay = Math.max(...preset.events.map(e => (e.delay_seconds ?? 0) + e.duration_seconds));
        setTimeout(() => setFiringPreset(null), maxDelay * 1000);
      } else {
        addLog(`[DJ] ${preset.name} FAILED: ${data.error}`, 'error');
        setFiringPreset(null);
      }
    } catch (err) {
      addLog(`[DJ] ${preset.name} ERROR: ${String(err)}`, 'error');
      setFiringPreset(null);
    }
  };

  const handleReset = async () => {
    if (!lobbyId) return;
    const result = await adminPost('reset');
    if (result) { addLog('GAME RESET', 'action'); setCurrentRound(null); setStandings([]); }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const remaining = currentRound ? Math.max(0, currentRound.duration_seconds - elapsed) : 0;
  const roundStatus = currentRound?.status ?? 'none';
  const statusColor = roundStatus === 'active' ? '#00FF88' : roundStatus === 'frozen' ? '#FFD700' : roundStatus === 'pending' ? '#F5A0D0' : '#666';

  // ---------------------------------------------------------------------------
  // PASSWORD GATE
  // ---------------------------------------------------------------------------

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A0A' }}>
        <div className="w-full max-w-sm p-8" style={{ border: '2px solid #F5A0D0' }}>
          <h1 className="text-4xl tracking-widest text-center mb-2" style={{ color: '#F5A0D0', fontFamily: bebas, letterSpacing: '0.2em' }}>
            MISSION CONTROL
          </h1>
          <p className="text-xs tracking-widest text-center mb-6 uppercase" style={{ color: '#666', fontFamily: mono }}>
            Battle Trade Admin
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="PASSWORD"
            className="w-full p-3 text-sm tracking-widest text-center outline-none"
            style={{ background: '#111', border: '2px solid #333', color: '#F5A0D0', fontFamily: mono }}
          />
          <button onClick={handleLogin} className="w-full mt-4 p-3 cursor-pointer" style={{ background: '#F5A0D0', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: '1.2rem', letterSpacing: '0.15em' }}>
            ENTER
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN ADMIN PANEL
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen" style={{ background: '#0A0A0A', color: '#EEE' }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .admin-btn { transition: all 150ms ease; }
        .admin-btn:hover { filter: brightness(1.2); transform: translateY(-1px); }
        .admin-btn:active { transform: translateY(0); }
      `}</style>

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: '2px solid #F5A0D0' }}>
        <div className="flex items-center gap-4">
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-icon.png" alt="" style={{ height: 28, width: 'auto' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <h1 className="text-2xl tracking-widest" style={{ color: '#F5A0D0', fontFamily: bebas, letterSpacing: '0.15em' }}>
              MISSION CONTROL
            </h1>
          </a>
          {lobbyId && (
            <span className="text-xs px-2 py-1" style={{ background: '#111', border: '1px solid #222', color: '#666', fontFamily: mono, fontSize: '0.65rem' }}>
              {lobbyId.slice(0, 8)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Auto-admin toggle */}
          {lobbyId && (
            <button
              onClick={handleToggleAutoAdmin}
              disabled={autoAdminLoading}
              className="admin-btn px-3 py-1.5 text-xs uppercase tracking-widest cursor-pointer"
              style={{
                background: autoAdmin ? 'rgba(0,255,136,0.1)' : 'transparent',
                border: `2px solid ${autoAdmin ? '#00FF88' : '#333'}`,
                color: autoAdmin ? '#00FF88' : '#666',
                fontFamily: mono, fontSize: '0.65rem',
              }}
            >
              {autoAdmin ? '⚡ AUTO-PILOT ON' : 'AUTO-PILOT OFF'}
            </button>
          )}

          {/* Round info */}
          <div className="flex items-center gap-3">
            <span style={{ fontFamily: mono, color: '#F5A0D0', fontWeight: 700, fontSize: '1.1rem' }}>
              {currentRound ? `R${currentRound.round_number}` : '--'}
            </span>
            <span className="px-2 py-0.5 text-xs uppercase" style={{ border: `1px solid ${statusColor}`, color: statusColor, fontFamily: mono, fontSize: '0.6rem' }}>
              {roundStatus === 'none' ? 'NO ROUND' : roundStatus.toUpperCase()}
            </span>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: '1.4rem', color: remaining <= 30 && roundStatus === 'active' ? '#FF4444' : '#FFF', animation: remaining <= 10 && roundStatus === 'active' ? 'pulse 1s ease infinite' : 'none' }}>
              {roundStatus === 'active' ? formatTime(remaining) : '--:--'}
            </span>
          </div>
        </div>
      </div>

      {/* LOBBY CONNECT */}
      {!lobbyId && (
        <div className="p-6">
          <div className="flex gap-3 max-w-xl mx-auto">
            <input
              id="lobby-input"
              type="text"
              placeholder="PASTE LOBBY ID"
              className="flex-1 p-3 text-sm tracking-widest outline-none"
              style={{ background: '#111', border: '2px solid #333', color: '#F5A0D0', fontFamily: mono }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) { setLobbyId(val); addLog(`Connected to ${val}`, 'info'); }
                }
              }}
            />
            <button
              onClick={() => {
                const val = (document.getElementById('lobby-input') as HTMLInputElement)?.value.trim();
                if (val) { setLobbyId(val); addLog(`Connected to ${val}`, 'info'); }
              }}
              className="admin-btn px-6 py-3 cursor-pointer"
              style={{ background: '#F5A0D0', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: '1.1rem', letterSpacing: '0.1em' }}
            >
              CONNECT
            </button>
          </div>
        </div>
      )}

      {lobbyId && (
        <div className="flex" style={{ height: 'calc(100vh - 56px)' }}>
          {/* LEFT PANEL — Main controls */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

            {/* QUICK ACTIONS — The big buttons */}
            <div className="flex gap-3">
              {/* One-click CREATE + START */}
              {(!currentRound || currentRound.status === 'completed') && (
                <button
                  onClick={handleCreateAndStart}
                  className="admin-btn flex-1 py-5 cursor-pointer"
                  style={{ background: '#00FF88', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: '1.6rem', letterSpacing: '0.1em' }}
                >
                  CREATE &amp; START ROUND
                </button>
              )}

              {/* START (if round is pending) */}
              {currentRound?.status === 'pending' && (
                <button
                  onClick={handleStartRound}
                  className="admin-btn flex-1 py-5 cursor-pointer"
                  style={{ background: '#00FF88', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: '1.6rem', letterSpacing: '0.1em' }}
                >
                  START ROUND {currentRound.round_number}
                </button>
              )}

              {/* FREEZE + END (if round is active) */}
              {currentRound?.status === 'active' && (
                <>
                  <button
                    onClick={handleFreezeRound}
                    className="admin-btn flex-1 py-5 cursor-pointer"
                    style={{ background: '#FFD700', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: '1.4rem', letterSpacing: '0.1em' }}
                  >
                    FREEZE
                  </button>
                  <button
                    onClick={handleEndRound}
                    className="admin-btn flex-1 py-5 cursor-pointer"
                    style={{ background: '#FF4444', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: '1.4rem', letterSpacing: '0.1em' }}
                  >
                    END ROUND
                  </button>
                </>
              )}

              {/* FROZEN state — unfreeze or end */}
              {currentRound?.status === 'frozen' && (
                <>
                  <button
                    onClick={handleStartRound}
                    className="admin-btn flex-1 py-5 cursor-pointer"
                    style={{ background: '#00FF88', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: '1.4rem', letterSpacing: '0.1em' }}
                  >
                    RESUME
                  </button>
                  <button
                    onClick={handleEndRound}
                    className="admin-btn flex-1 py-5 cursor-pointer"
                    style={{ background: '#FF4444', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: '1.4rem', letterSpacing: '0.1em' }}
                  >
                    END ROUND
                  </button>
                </>
              )}
            </div>

            {/* ROUND SETTINGS — Compact inline */}
            <div className="flex items-center gap-4 px-3 py-2" style={{ background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
              <span style={{ fontFamily: mono, fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>DURATION</span>
              <div className="flex gap-1">
                {[{ label: '3m', value: 180 }, { label: '5m', value: 300 }, { label: '10m', value: 600 }, { label: '15m', value: 900 }].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setDuration(opt.value)}
                    className="px-2 py-1 text-xs cursor-pointer"
                    style={{
                      background: duration === opt.value ? '#F5A0D0' : 'transparent',
                      color: duration === opt.value ? '#0A0A0A' : '#555',
                      border: `1px solid ${duration === opt.value ? '#F5A0D0' : '#222'}`,
                      fontFamily: mono, fontWeight: 700, fontSize: '0.65rem',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleNextRound}
                disabled={!lobbyId}
                className="admin-btn px-4 py-1.5 cursor-pointer disabled:opacity-30"
                style={{ background: 'transparent', border: '1px solid #F5A0D0', color: '#F5A0D0', fontFamily: bebas, fontSize: '0.9rem', letterSpacing: '0.08em' }}
              >
                NEXT ROUND
              </button>
              <button
                onClick={handleReset}
                className="admin-btn px-4 py-1.5 cursor-pointer"
                style={{ background: 'transparent', border: '1px solid #FF4444', color: '#FF4444', fontFamily: mono, fontSize: '0.6rem', letterSpacing: '0.05em' }}
              >
                RESET
              </button>
            </div>

            {/* BROADCAST LINKS */}
            <div className="flex items-center gap-2 px-3 py-2 flex-wrap" style={{ background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
              <span style={{ fontFamily: mono, fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>LINKS</span>
              {[
                { label: 'SPECTATE', path: 'spectate', color: '#F5A0D0' },
                { label: 'OBS', path: 'broadcast', color: '#00FF88' },
                { label: 'CAST', path: 'cast', color: '#FFD700' },
                { label: 'STAGE', path: 'stage', color: '#00BFFF' },
                { label: 'BOARD', path: 'leaderboard', color: '#888' },
                { label: 'HUB', path: '', color: '#FFF' },
              ].map(link => {
                const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/lobby/${lobbyId}${link.path ? '/' + link.path : ''}`;
                return (
                  <button
                    key={link.label}
                    onClick={() => { navigator.clipboard.writeText(url); addLog(`Copied ${link.label} URL`, 'info'); }}
                    className="admin-btn px-2 py-1 cursor-pointer"
                    style={{
                      background: 'transparent',
                      border: `1px solid ${link.color}33`,
                      color: link.color,
                      fontFamily: mono, fontSize: '0.6rem', letterSpacing: '0.05em',
                    }}
                    title={url}
                  >
                    {link.label}
                  </button>
                );
              })}
              <button
                onClick={() => window.open(`/lobby/${lobbyId}`, '_blank')}
                className="admin-btn px-2 py-1 cursor-pointer"
                style={{ background: 'transparent', border: '1px solid #333', color: '#555', fontFamily: mono, fontSize: '0.55rem', marginLeft: 'auto' }}
              >
                OPEN HUB ↗
              </button>
            </div>

            {/* TABS — Standings always visible, switchable lower panel */}

            {/* STANDINGS TABLE */}
            <div style={{ border: '1px solid #1A1A1A' }}>
              <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid #1A1A1A', background: '#0D0D0D' }}>
                <span style={{ fontFamily: bebas, fontSize: '1rem', color: '#F5A0D0', letterSpacing: '0.1em' }}>LIVE STANDINGS</span>
                <span style={{ fontFamily: mono, fontSize: '0.6rem', color: '#555' }}>{standings.length} ALIVE</span>
              </div>
              <div className="grid px-3 py-1.5 text-xs uppercase" style={{ gridTemplateColumns: '40px 1fr 100px 100px 80px', color: '#444', fontFamily: mono, fontSize: '0.6rem', borderBottom: '1px solid #111' }}>
                <span>#</span><span>TRADER</span><span className="text-right">BALANCE</span><span className="text-right">RETURN</span><span className="text-right" />
              </div>
              {standings.length === 0 ? (
                <div className="px-3 py-6 text-center" style={{ color: '#333', fontFamily: mono, fontSize: '0.75rem' }}>WAITING FOR TRADERS</div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {standings.map((s, idx) => {
                    const isBottom = idx === standings.length - 1 && standings.length > 1;
                    const isElim = s.trader.is_eliminated;
                    return (
                      <div
                        key={s.trader.id}
                        className="grid px-3 py-2 items-center"
                        style={{
                          gridTemplateColumns: '40px 1fr 100px 100px 80px',
                          fontFamily: mono, fontSize: '0.75rem',
                          borderBottom: '1px solid #111',
                          background: isElim ? 'rgba(255,68,68,0.05)' : isBottom ? 'rgba(255,68,68,0.08)' : 'transparent',
                          opacity: isElim ? 0.4 : 1,
                        }}
                      >
                        <span style={{ color: s.rank <= 3 ? '#F5A0D0' : '#555', fontWeight: 700 }}>#{s.rank}</span>
                        <span style={{ color: '#FFF', fontWeight: 700 }}>{s.trader.name}</span>
                        <span className="text-right" style={{ color: '#CCC' }}>${s.portfolioValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                        <span className="text-right" style={{ color: s.returnPct >= 0 ? '#00FF88' : '#FF4444', fontWeight: 700 }}>
                          {s.returnPct >= 0 ? '+' : ''}{s.returnPct.toFixed(1)}%
                        </span>
                        <div className="text-right">
                          {!isElim && (
                            <button
                              onClick={() => handleEliminate(s.trader.id, s.trader.name)}
                              className="px-2 py-0.5 cursor-pointer"
                              style={{ background: 'transparent', border: '1px solid #FF4444', color: '#FF4444', fontFamily: mono, fontSize: '0.55rem' }}
                            >
                              ELIM
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* LOWER TABS */}
            <div className="flex gap-1">
              {(['rounds', 'dj', 'chat'] as AdminTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-4 py-2 cursor-pointer"
                  style={{
                    background: tab === t ? '#1A1A1A' : 'transparent',
                    border: `1px solid ${tab === t ? '#333' : '#111'}`,
                    borderBottom: tab === t ? '1px solid #1A1A1A' : '1px solid #333',
                    color: tab === t ? '#F5A0D0' : '#555',
                    fontFamily: bebas, fontSize: '0.9rem', letterSpacing: '0.08em',
                  }}
                >
                  {t === 'rounds' ? '🎮 ROUNDS' : t === 'dj' ? '🎧 DJ BOOTH' : '📢 BROADCAST'}
                </button>
              ))}
            </div>

            {/* DJ BOOTH TAB */}
            <div style={{ display: tab === 'dj' ? 'block' : 'none' }}>
              <div className="flex flex-col gap-4">
                {PRESET_CATEGORIES.map(cat => {
                  const presets = PRESETS.filter(p => p.category === cat);
                  const catColors: Record<string, string> = { crash: '#FF4444', pump: '#00FF88', chaos: '#FFD700', punish: '#FF6B35', comeback: '#00BFFF', drama: '#F5A0D0' };
                  const color = catColors[cat] ?? '#888';
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-1.5 py-0.5" style={{ border: `1px solid ${color}`, color, fontFamily: mono, fontSize: '0.55rem', textTransform: 'uppercase' }}>{cat}</span>
                        <div style={{ flex: 1, height: 1, background: '#1A1A1A' }} />
                      </div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                        {presets.map(preset => {
                          const isFiring = firingPreset === preset.id;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => handleFirePreset(preset)}
                              disabled={!!firingPreset || !currentRound || currentRound.status !== 'active'}
                              className="admin-btn text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                              style={{ background: isFiring ? 'rgba(245,160,208,0.08)' : '#0D0D0D', border: `1px solid ${isFiring ? '#F5A0D0' : '#1A1A1A'}`, padding: '8px 10px' }}
                            >
                              <div className="flex items-center gap-2">
                                <span style={{ fontSize: '1rem' }}>{preset.emoji}</span>
                                <span style={{ fontFamily: bebas, fontSize: '0.9rem', color: isFiring ? '#F5A0D0' : '#FFF', letterSpacing: '0.03em' }}>{preset.name}</span>
                              </div>
                              <p style={{ fontFamily: mono, fontSize: '0.55rem', color: '#444', marginTop: 2 }}>{preset.narrative}</p>
                              {isFiring && <div className="mt-1 py-0.5 text-center text-xs uppercase animate-pulse" style={{ background: 'rgba(245,160,208,0.15)', color: '#F5A0D0', fontFamily: bebas, fontSize: '0.7rem' }}>FIRING...</div>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* BROADCAST / CHAT TAB */}
            <div style={{ display: tab === 'chat' ? 'block' : 'none' }}>
              <div style={{ border: '1px solid #1A1A1A' }}>
                <div className="px-3 py-2" style={{ borderBottom: '1px solid #1A1A1A', background: '#0D0D0D' }}>
                  <span style={{ fontFamily: bebas, fontSize: '1rem', color: '#F5A0D0', letterSpacing: '0.1em' }}>BROADCAST TO ALL</span>
                </div>
                <div className="p-3">
                  <div style={{ fontFamily: mono, fontSize: '0.6rem', color: '#666', marginBottom: 8 }}>
                    Message appears on ALL player screens, spectator views, and broadcast overlays
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={broadcastMsg}
                      onChange={e => setBroadcastMsg(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleBroadcast()}
                      placeholder="Type announcement..."
                      className="flex-1 px-3 py-2 text-sm outline-none"
                      style={{ background: '#111', border: '1px solid #222', color: '#FFF', fontFamily: mono, fontSize: '0.8rem' }}
                    />
                    <button
                      onClick={handleBroadcast}
                      disabled={!broadcastMsg.trim() || broadcastSending}
                      className="admin-btn px-4 py-2 cursor-pointer disabled:opacity-30"
                      style={{ background: '#F5A0D0', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: '1rem', letterSpacing: '0.08em' }}
                    >
                      SEND
                    </button>
                  </div>

                  {/* Quick broadcast presets */}
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {[
                      { label: '🔥 ROUND HEATING UP', msg: 'This round is HEATING UP! Positions are moving fast.' },
                      { label: '⚠️ 1 MIN LEFT', msg: 'ONE MINUTE REMAINING! Make your final moves.' },
                      { label: '🎯 ELIMINATION INCOMING', msg: 'Elimination coming next — bottom traders watch out!' },
                      { label: '💰 PRIZE UPDATE', msg: 'Prize pool growing! More players, bigger rewards.' },
                      { label: '🚀 LFG', msg: 'LFG! New round starting — trade hard or go home.' },
                    ].map(p => (
                      <button
                        key={p.label}
                        onClick={() => { setBroadcastMsg(p.msg); }}
                        className="admin-btn px-2 py-1 cursor-pointer"
                        style={{ background: '#111', border: '1px solid #1A1A1A', color: '#888', fontFamily: mono, fontSize: '0.55rem' }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* EVENT LOG TAB (always in rounds tab) */}
            <div style={{ display: tab === 'rounds' ? 'block' : 'none' }}>
              <div style={{ border: '1px solid #1A1A1A' }}>
                <div className="px-3 py-2" style={{ borderBottom: '1px solid #1A1A1A', background: '#0D0D0D' }}>
                  <span style={{ fontFamily: bebas, fontSize: '1rem', color: '#F5A0D0', letterSpacing: '0.1em' }}>EVENT LOG</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 200, background: '#0A0A0A' }}>
                  {logs.length === 0 ? (
                    <div className="px-3 py-4 text-center" style={{ color: '#333', fontFamily: mono, fontSize: '0.7rem' }}>No events yet.</div>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="px-3 py-1 flex gap-3 text-xs" style={{ fontFamily: mono, borderBottom: '1px solid #0D0D0D', fontSize: '0.65rem' }}>
                        <span style={{ color: '#333', flexShrink: 0 }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span style={{ color: log.type === 'error' ? '#FF4444' : log.type === 'action' ? '#00FF88' : log.type === 'broadcast' ? '#F5A0D0' : '#666' }}>
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
