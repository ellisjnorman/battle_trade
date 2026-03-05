'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PRESETS, PRESET_CATEGORIES } from '@/lib/event-presets';
import type { EventPreset } from '@/lib/event-presets';

interface TraderStanding {
  trader: {
    id: string;
    name: string;
    team_id: string | null;
    is_eliminated: boolean;
  };
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
  type: 'action' | 'error' | 'info';
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  const [standings, setStandings] = useState<TraderStanding[]>([]);
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null);
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);

  const [leverageTier, setLeverageTier] = useState(10);
  const [duration, setDuration] = useState(300);
  const [firingPreset, setFiringPreset] = useState<string | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [
      ...prev,
      { timestamp: new Date().toISOString(), message, type },
    ]);
  }, []);

  const adminPost = useCallback(
    async (path: string, body: Record<string, unknown> = {}) => {
      const label = path.split('/').pop() ?? path;
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/admin/${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: password,
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          addLog(`[${label}] ERROR: ${data.error}`, 'error');
          return null;
        }
        addLog(`[${label}] OK`, 'action');
        return data;
      } catch (err) {
        addLog(`[${label}] FETCH ERROR: ${String(err)}`, 'error');
        return null;
      }
    },
    [password, lobbyId, addLog]
  );


  const fetchCurrentRound = useCallback(async () => {
    if (!lobbyId) return;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/admin/status`, {
        headers: { Authorization: password },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.round) setCurrentRound(data.round);
        if (data.traders) {
          // Map status response traders to standings format
          const mapped: TraderStanding[] = (data.traders as Array<Record<string, unknown>>)
            .filter((t) => t.rank != null)
            .map((t) => ({
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
    } catch {
      // silent
    }
  }, [lobbyId, password]);

  // Auto-fetch round when lobbyId is set
  useEffect(() => {
    if (lobbyId && authenticated) {
      fetchCurrentRound();
    }
  }, [lobbyId, authenticated, fetchCurrentRound]);

  // Poll standings every 2s
  useEffect(() => {
    if (!authenticated || !lobbyId) return;
    const interval = setInterval(fetchCurrentRound, 2000);
    return () => clearInterval(interval);
  }, [authenticated, lobbyId, fetchCurrentRound]);

  // Round timer
  useEffect(() => {
    if (!currentRound || currentRound.status !== 'active' || !currentRound.started_at) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      const start = new Date(currentRound.started_at!).getTime();
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [currentRound]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleLogin = () => {
    setPassword(passwordInput);
    setAuthenticated(true);
    addLog('Authenticated', 'info');
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
    // End round = next round without starting (completes current)
    const result = await adminPost('round/next', {
      settings: {
        duration_seconds: currentRound.duration_seconds,
        starting_balance: currentRound.starting_balance,
      },
    });
    if (result?.round) {
      setCurrentRound(result.round);
      addLog(`Round ended, created Round ${result.round.round_number}`, 'action');
    }
  };

  const handleEliminate = async (traderId: string, traderName: string) => {
    const result = await adminPost('round/eliminate', { trader_id: traderId });
    if (result) {
      addLog(`Eliminated: ${traderName}`, 'action');
      fetchCurrentRound();
    }
  };

  const handleNextRound = async () => {
    if (!lobbyId) return;
    const result = await adminPost('round/next', {
      settings: {
        duration_seconds: duration,
        starting_balance: currentRound?.starting_balance ?? 10000,
      },
    });
    if (result?.round) {
      setCurrentRound(result.round);
      addLog(`Created Round ${result.round.round_number}`, 'action');
    }
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
        addLog(`[DJ] ${preset.emoji} ${preset.name} — ${data.events_fired} events fired`, 'action');
        // Keep firing state for total chain duration
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const remaining = currentRound
    ? Math.max(0, currentRound.duration_seconds - elapsed)
    : 0;

  // PASSWORD GATE
  if (!authenticated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#0A0A0A' }}
      >
        <div className="w-full max-w-sm p-8" style={{ border: '2px solid #F5A0D0' }}>
          <h1
            className="text-4xl tracking-widest text-center mb-8"
            style={{
              color: '#F5A0D0',
              fontFamily: "var(--font-bebas), sans-serif",
              letterSpacing: '0.2em',
            }}
          >
            BATTLE TRADE
          </h1>
          <p
            className="text-xs tracking-widest text-center mb-6 uppercase"
            style={{ color: '#666' }}
          >
            Admin Access Required
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="ENTER PASSWORD"
            className="w-full p-3 text-sm tracking-widest text-center outline-none"
            style={{
              background: '#111',
              border: '2px solid #333',
              color: '#F5A0D0',
              fontFamily: "var(--font-jetbrains), monospace",
            }}
          />
          <button
            onClick={handleLogin}
            className="w-full mt-4 p-3 text-sm tracking-widest uppercase font-bold cursor-pointer"
            style={{
              background: '#F5A0D0',
              color: '#0A0A0A',
              border: 'none',
              fontFamily: "var(--font-bebas), sans-serif",
              fontSize: '1.1rem',
              letterSpacing: '0.15em',
            }}
          >
            ENTER
          </button>
        </div>
      </div>
    );
  }

  // MAIN ADMIN PANEL
  return (
    <div className="min-h-screen" style={{ background: '#0A0A0A', color: '#EEE' }}>
      {/* TOP BAR */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '2px solid #F5A0D0' }}
      >
        <h1
          className="text-3xl tracking-widest"
          style={{
            color: '#F5A0D0',
            fontFamily: "var(--font-bebas), sans-serif",
            letterSpacing: '0.2em',
          }}
        >
          BATTLE TRADE ADMIN
        </h1>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span
              className="text-xs uppercase tracking-widest"
              style={{ color: '#666' }}
            >
              Round
            </span>
            <span
              className="text-xl"
              style={{
                color: '#F5A0D0',
                fontFamily: "var(--font-jetbrains), monospace",
                fontWeight: 700,
              }}
            >
              {currentRound ? `#${currentRound.round_number}` : '--'}
            </span>
          </div>
          <div
            className="px-3 py-1 text-xs uppercase tracking-widest"
            style={{
              border: '2px solid',
              borderColor:
                currentRound?.status === 'active'
                  ? '#00FF88'
                  : currentRound?.status === 'frozen'
                    ? '#FFD700'
                    : '#666',
              color:
                currentRound?.status === 'active'
                  ? '#00FF88'
                  : currentRound?.status === 'frozen'
                    ? '#FFD700'
                    : '#666',
              fontFamily: "var(--font-jetbrains), monospace",
            }}
          >
            {currentRound?.status?.toUpperCase() ?? 'NO ROUND'}
          </div>
          <div
            className="text-2xl"
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontWeight: 700,
              color:
                currentRound?.status === 'active' && remaining <= 30
                  ? '#FF4444'
                  : '#FFF',
            }}
          >
            {currentRound?.status === 'active' ? formatTime(remaining) : '--:--'}
          </div>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* LOBBY ID INPUT */}
        {!lobbyId && (
          <div className="flex gap-3">
            <input
              id="lobby-input"
              type="text"
              placeholder="LOBBY ID"
              className="flex-1 p-3 text-sm tracking-widest outline-none"
              style={{
                background: '#111',
                border: '2px solid #333',
                color: '#F5A0D0',
                fontFamily: "var(--font-jetbrains), monospace",
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) {
                    setLobbyId(val);
                    addLog(`Lobby set: ${val}`, 'info');
                  }
                }
              }}
            />
            <button
              onClick={() => {
                const val = (document.getElementById('lobby-input') as HTMLInputElement)?.value.trim();
                if (val) {
                  setLobbyId(val);
                  addLog(`Lobby set: ${val}`, 'info');
                }
              }}
              className="px-6 py-3 text-sm uppercase tracking-widest font-bold cursor-pointer"
              style={{
                background: '#F5A0D0',
                color: '#0A0A0A',
                border: 'none',
                fontFamily: "var(--font-bebas), sans-serif",
                fontSize: '1.1rem',
                letterSpacing: '0.15em',
              }}
            >
              CONNECT
            </button>
          </div>
        )}

        {/* ROUND CONTROLS */}
        <div className="flex gap-4">
          <button
            onClick={handleStartRound}
            disabled={!currentRound || currentRound.status === 'active'}
            className="flex-1 py-4 text-lg uppercase tracking-widest font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: '#00FF88',
              color: '#0A0A0A',
              border: 'none',
              fontFamily: "var(--font-bebas), sans-serif",
              fontSize: '1.4rem',
              letterSpacing: '0.15em',
            }}
          >
            START ROUND
          </button>
          <button
            onClick={handleFreezeRound}
            disabled={!currentRound || currentRound.status !== 'active'}
            className="flex-1 py-4 text-lg uppercase tracking-widest font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: '#FFD700',
              color: '#0A0A0A',
              border: 'none',
              fontFamily: "var(--font-bebas), sans-serif",
              fontSize: '1.4rem',
              letterSpacing: '0.15em',
            }}
          >
            FREEZE SCORES
          </button>
          <button
            onClick={handleEndRound}
            disabled={!currentRound || currentRound.status === 'completed'}
            className="flex-1 py-4 text-lg uppercase tracking-widest font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: '#FF4444',
              color: '#0A0A0A',
              border: 'none',
              fontFamily: "var(--font-bebas), sans-serif",
              fontSize: '1.4rem',
              letterSpacing: '0.15em',
            }}
          >
            END ROUND
          </button>
        </div>

        {/* STANDINGS TABLE */}
        <div style={{ border: '2px solid #222' }}>
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: '2px solid #222', background: '#111' }}
          >
            <span
              className="text-xl tracking-widest"
              style={{
                fontFamily: "var(--font-bebas), sans-serif",
                color: '#F5A0D0',
                letterSpacing: '0.15em',
              }}
            >
              LIVE STANDINGS
            </span>
            <span
              className="text-xs"
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                color: '#666',
              }}
            >
              {standings.length} TRADERS
            </span>
          </div>

          {/* Table Header */}
          <div
            className="grid px-4 py-2 text-xs uppercase tracking-widest"
            style={{
              gridTemplateColumns: '60px 1fr 120px 140px 120px 100px',
              color: '#666',
              fontFamily: "var(--font-jetbrains), monospace",
              borderBottom: '1px solid #1A1A1A',
            }}
          >
            <span>Rank</span>
            <span>Trader</span>
            <span>Team</span>
            <span className="text-right">Balance</span>
            <span className="text-right">Return</span>
            <span className="text-right">Action</span>
          </div>

          {/* Table Rows */}
          {standings.length === 0 ? (
            <div
              className="px-4 py-8 text-center text-sm"
              style={{
                color: '#444',
                fontFamily: "var(--font-jetbrains), monospace",
              }}
            >
              NO TRADERS
            </div>
          ) : (
            standings.map((s, idx) => {
              const isBottom = idx === standings.length - 1 && standings.length > 1;
              return (
                <div
                  key={s.trader.id}
                  className="grid px-4 py-3 items-center"
                  style={{
                    gridTemplateColumns: '60px 1fr 120px 140px 120px 100px',
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontSize: '0.85rem',
                    borderBottom: '1px solid #1A1A1A',
                    background: isBottom ? 'rgba(255, 68, 68, 0.1)' : 'transparent',
                    borderLeft: isBottom ? '3px solid #FF4444' : '3px solid transparent',
                  }}
                >
                  <span
                    className="font-bold"
                    style={{
                      color: s.rank <= 3 ? '#F5A0D0' : '#888',
                    }}
                  >
                    #{s.rank}
                  </span>
                  <span className="font-bold" style={{ color: '#FFF' }}>
                    {s.trader.name}
                  </span>
                  <span style={{ color: '#666' }}>
                    {s.teamName ?? '--'}
                  </span>
                  <span
                    className="text-right font-bold"
                    style={{ color: '#FFF' }}
                  >
                    ${s.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span
                    className="text-right font-bold"
                    style={{
                      color: s.returnPct >= 0 ? '#00FF88' : '#FF4444',
                    }}
                  >
                    {s.returnPct >= 0 ? '+' : ''}
                    {s.returnPct.toFixed(2)}%
                  </span>
                  <div className="text-right">
                    <button
                      onClick={() => handleEliminate(s.trader.id, s.trader.name)}
                      className="px-2 py-1 text-xs uppercase tracking-wider cursor-pointer"
                      style={{
                        background: 'transparent',
                        border: '1px solid #FF4444',
                        color: '#FF4444',
                        fontFamily: "var(--font-jetbrains), monospace",
                        fontSize: '0.65rem',
                      }}
                    >
                      ELIMINATE
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ROUND SETTINGS + NEXT ROUND */}
        <div
          className="p-5 flex items-center gap-8"
          style={{ border: '2px solid #222', background: '#111' }}
        >
          <div>
            <span
              className="text-xs uppercase tracking-widest block mb-2"
              style={{
                color: '#666',
                fontFamily: "var(--font-jetbrains), monospace",
              }}
            >
              Max Leverage
            </span>
            <div className="flex gap-2">
              {[1, 2, 5, 10].map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverageTier(lev)}
                  className="px-3 py-2 text-sm cursor-pointer"
                  style={{
                    background: leverageTier === lev ? '#F5A0D0' : 'transparent',
                    color: leverageTier === lev ? '#0A0A0A' : '#888',
                    border: `2px solid ${leverageTier === lev ? '#F5A0D0' : '#333'}`,
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontWeight: 700,
                  }}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          <div>
            <span
              className="text-xs uppercase tracking-widest block mb-2"
              style={{
                color: '#666',
                fontFamily: "var(--font-jetbrains), monospace",
              }}
            >
              Duration
            </span>
            <div className="flex gap-2">
              {[
                { label: '3m', value: 180 },
                { label: '5m', value: 300 },
                { label: '10m', value: 600 },
                { label: '15m', value: 900 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDuration(opt.value)}
                  className="px-3 py-2 text-sm cursor-pointer"
                  style={{
                    background: duration === opt.value ? '#F5A0D0' : 'transparent',
                    color: duration === opt.value ? '#0A0A0A' : '#888',
                    border: `2px solid ${duration === opt.value ? '#F5A0D0' : '#333'}`,
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontWeight: 700,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto">
            <button
              onClick={handleNextRound}
              disabled={!lobbyId}
              className="px-8 py-3 text-lg uppercase tracking-widest font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'transparent',
                border: '2px solid #F5A0D0',
                color: '#F5A0D0',
                fontFamily: "var(--font-bebas), sans-serif",
                fontSize: '1.3rem',
                letterSpacing: '0.15em',
              }}
            >
              NEXT ROUND
            </button>
          </div>
        </div>

        {/* DJ BOOTH */}
        <div style={{ border: '2px solid #222' }}>
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: '2px solid #222', background: '#111' }}
          >
            <span
              className="text-xl tracking-widest"
              style={{
                fontFamily: "var(--font-bebas), sans-serif",
                color: '#F5A0D0',
                letterSpacing: '0.15em',
              }}
            >
              DJ BOOTH
            </span>
            <span
              className="text-xs"
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                color: '#666',
              }}
            >
              {PRESETS.length} PRESETS
            </span>
          </div>

          <div className="p-4 flex flex-col gap-6">
            {PRESET_CATEGORIES.map((cat) => {
              const presets = PRESETS.filter((p) => p.category === cat);
              const catColors: Record<string, string> = {
                crash: '#FF4444',
                pump: '#00FF88',
                chaos: '#FFD700',
                punish: '#FF6B35',
                comeback: '#00BFFF',
                drama: '#F5A0D0',
              };
              const color = catColors[cat] ?? '#888';

              return (
                <div key={cat}>
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="px-2 py-0.5 text-xs uppercase tracking-widest"
                      style={{
                        border: `1px solid ${color}`,
                        color,
                        fontFamily: "var(--font-jetbrains), monospace",
                        fontSize: '0.6rem',
                      }}
                    >
                      {cat}
                    </span>
                    <div style={{ flex: 1, height: 1, background: '#1A1A1A' }} />
                  </div>

                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                    {presets.map((preset) => {
                      const isFiring = firingPreset === preset.id;
                      const isDisabled = !!firingPreset && !isFiring;

                      return (
                        <button
                          key={preset.id}
                          onClick={() => handleFirePreset(preset)}
                          disabled={isDisabled || !lobbyId || !currentRound || currentRound.status !== 'active'}
                          className="text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 hover:border-[#F5A0D0]"
                          style={{
                            background: isFiring ? 'rgba(245,160,208,0.08)' : '#0D0D0D',
                            border: `2px solid ${isFiring ? '#F5A0D0' : '#1A1A1A'}`,
                            padding: '12px',
                            transition: 'border-color 0.2s, background 0.2s',
                          }}
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span style={{ fontSize: '1.2rem' }}>{preset.emoji}</span>
                              <span
                                style={{
                                  fontFamily: "var(--font-bebas), sans-serif",
                                  fontSize: '1.1rem',
                                  color: isFiring ? '#F5A0D0' : '#FFF',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                {preset.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className="px-1.5 py-0.5 text-xs uppercase"
                                style={{
                                  border: `1px solid ${color}`,
                                  color,
                                  fontFamily: "var(--font-jetbrains), monospace",
                                  fontSize: '0.55rem',
                                }}
                              >
                                {cat}
                              </span>
                              <span
                                className="px-1.5 py-0.5 text-xs uppercase"
                                style={{
                                  border: '1px solid #444',
                                  color: '#666',
                                  fontFamily: "var(--font-jetbrains), monospace",
                                  fontSize: '0.55rem',
                                }}
                              >
                                {preset.timing}
                              </span>
                            </div>
                          </div>

                          {/* Event chain */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {preset.events.map((ev, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5"
                                style={{
                                  background: '#111',
                                  border: '1px solid #222',
                                  fontFamily: "var(--font-jetbrains), monospace",
                                  fontSize: '0.6rem',
                                  color: '#888',
                                }}
                              >
                                {ev.type.replace(/_/g, ' ').toUpperCase()}
                                {ev.delay_seconds ? ` +${ev.delay_seconds}s` : ''}
                              </span>
                            ))}
                          </div>

                          {/* Narrative */}
                          <p
                            style={{
                              fontFamily: "var(--font-jetbrains), monospace",
                              fontSize: '0.65rem',
                              color: '#444',
                              lineHeight: 1.4,
                            }}
                          >
                            {preset.narrative}
                          </p>

                          {/* Firing indicator */}
                          {isFiring && (
                            <div
                              className="mt-2 py-1 text-center text-xs uppercase tracking-widest animate-pulse"
                              style={{
                                background: 'rgba(245,160,208,0.15)',
                                color: '#F5A0D0',
                                fontFamily: "var(--font-bebas), sans-serif",
                                fontSize: '0.8rem',
                                letterSpacing: '0.1em',
                              }}
                            >
                              FIRING...
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* EVENT LOG */}
        <div style={{ border: '2px solid #222' }}>
          <div
            className="px-4 py-3"
            style={{
              borderBottom: '2px solid #222',
              background: '#111',
            }}
          >
            <span
              className="text-xl tracking-widest"
              style={{
                fontFamily: "var(--font-bebas), sans-serif",
                color: '#F5A0D0',
                letterSpacing: '0.15em',
              }}
            >
              EVENT LOG
            </span>
          </div>
          <div
            className="overflow-y-auto"
            style={{ maxHeight: '200px', background: '#0A0A0A' }}
          >
            {logs.length === 0 ? (
              <div
                className="px-4 py-4 text-sm"
                style={{
                  color: '#444',
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                No events yet.
              </div>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className="px-4 py-1.5 flex gap-4 text-xs"
                  style={{
                    fontFamily: "var(--font-jetbrains), monospace",
                    borderBottom: '1px solid #111',
                  }}
                >
                  <span style={{ color: '#444', flexShrink: 0 }}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    style={{
                      color:
                        log.type === 'error'
                          ? '#FF4444'
                          : log.type === 'action'
                            ? '#00FF88'
                            : '#888',
                    }}
                  >
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
  );
}
