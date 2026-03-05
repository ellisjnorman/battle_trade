'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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

  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [
      ...prev,
      { timestamp: new Date().toISOString(), message, type },
    ]);
  }, []);

  const adminFetch = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/admin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: password,
          },
          body: JSON.stringify({ action, ...extra }),
        });
        const data = await res.json();
        if (!res.ok) {
          addLog(`[${action}] ERROR: ${data.error}`, 'error');
          return null;
        }
        addLog(`[${action}] OK`, 'action');
        return data;
      } catch (err) {
        addLog(`[${action}] FETCH ERROR: ${String(err)}`, 'error');
        return null;
      }
    },
    [password, lobbyId, addLog]
  );

  const fetchStandings = useCallback(async () => {
    if (!currentRound || !lobbyId) return;
    try {
      const res = await fetch(
        `/api/lobby/${lobbyId}/leaderboard?round_id=${currentRound.id}`,
        { headers: { Authorization: password } }
      );
      if (res.ok) {
        const data = await res.json();
        setStandings(data.standings ?? []);
      }
    } catch {
      // silent — polling
    }
  }, [currentRound, lobbyId, password]);

  const fetchCurrentRound = useCallback(async () => {
    if (!lobbyId) return;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/admin?action=current_round`, {
        headers: { Authorization: password },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.round) setCurrentRound(data.round);
      }
    } catch {
      // silent
    }
  }, [lobbyId, password]);

  // Poll standings every 2s
  useEffect(() => {
    if (!authenticated || !currentRound) return;
    fetchStandings();
    const interval = setInterval(fetchStandings, 2000);
    return () => clearInterval(interval);
  }, [authenticated, currentRound, fetchStandings]);

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
    const result = await adminFetch('start_round', { round_id: currentRound.id });
    if (result?.round) setCurrentRound(result.round);
  };

  const handleFreezeRound = async () => {
    if (!currentRound) return;
    const result = await adminFetch('freeze_round', { round_id: currentRound.id });
    if (result?.round) setCurrentRound(result.round);
  };

  const handleEndRound = async () => {
    if (!currentRound) return;
    const result = await adminFetch('end_round', { round_id: currentRound.id });
    if (result?.round) setCurrentRound(result.round);
  };

  const handleEliminate = async (traderId: string, traderName: string) => {
    const result = await adminFetch('eliminate_trader', { trader_id: traderId });
    if (result) {
      addLog(`Eliminated: ${traderName}`, 'action');
      fetchStandings();
    }
  };

  const handleNextRound = async () => {
    if (!lobbyId) return;
    const result = await adminFetch('next_round', {
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
              fontFamily: "'Bebas Neue', sans-serif",
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
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <button
            onClick={handleLogin}
            className="w-full mt-4 p-3 text-sm tracking-widest uppercase font-bold cursor-pointer"
            style={{
              background: '#F5A0D0',
              color: '#0A0A0A',
              border: 'none',
              fontFamily: "'Bebas Neue', sans-serif",
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
      {/* Google Fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&display=swap"
        rel="stylesheet"
      />

      {/* TOP BAR */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '2px solid #F5A0D0' }}
      >
        <h1
          className="text-3xl tracking-widest"
          style={{
            color: '#F5A0D0',
            fontFamily: "'Bebas Neue', sans-serif",
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
                fontFamily: "'JetBrains Mono', monospace",
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
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {currentRound?.status?.toUpperCase() ?? 'NO ROUND'}
          </div>
          <div
            className="text-2xl"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
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
              type="text"
              placeholder="LOBBY ID"
              className="flex-1 p-3 text-sm tracking-widest outline-none"
              style={{
                background: '#111',
                border: '2px solid #333',
                color: '#F5A0D0',
                fontFamily: "'JetBrains Mono', monospace",
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) {
                    setLobbyId(val);
                    addLog(`Lobby set: ${val}`, 'info');
                    fetchCurrentRound();
                  }
                }
              }}
            />
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
              fontFamily: "'Bebas Neue', sans-serif",
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
              fontFamily: "'Bebas Neue', sans-serif",
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
              fontFamily: "'Bebas Neue', sans-serif",
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
                fontFamily: "'Bebas Neue', sans-serif",
                color: '#F5A0D0',
                letterSpacing: '0.15em',
              }}
            >
              LIVE STANDINGS
            </span>
            <span
              className="text-xs"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
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
              fontFamily: "'JetBrains Mono', monospace",
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
                fontFamily: "'JetBrains Mono', monospace",
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
                    fontFamily: "'JetBrains Mono', monospace",
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
                        fontFamily: "'JetBrains Mono', monospace",
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
                fontFamily: "'JetBrains Mono', monospace",
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
                    fontFamily: "'JetBrains Mono', monospace",
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
                fontFamily: "'JetBrains Mono', monospace",
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
                    fontFamily: "'JetBrains Mono', monospace",
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
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '1.3rem',
                letterSpacing: '0.15em',
              }}
            >
              NEXT ROUND
            </button>
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
                fontFamily: "'Bebas Neue', sans-serif",
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
                  fontFamily: "'JetBrains Mono', monospace",
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
                    fontFamily: "'JetBrains Mono', monospace",
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
