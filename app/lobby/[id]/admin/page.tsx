'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PRESETS, PRESET_CATEGORIES } from '@/lib/event-presets';
import type { EventPreset } from '@/lib/event-presets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface TraderStatus {
  trader_id: string;
  name: string;
  team_id: string | null;
  is_eliminated: boolean;
  balance: number;
  rank: number | null;
  return_pct: number;
  open_positions: Array<{
    id: string;
    symbol: string;
    direction: 'long' | 'short';
    size: number;
    leverage: number;
    entry_price: number;
  }>;
  activity_status: {
    status: 'active' | 'warning' | 'critical';
    score: number;
    seconds_idle: number;
    time_until_forced: number | null;
  } | null;
  credits: number;
}

interface VolatilityEvent {
  id: string;
  type: string;
  asset: string | null;
  magnitude: number | null;
  duration_seconds: number | null;
  fired_at: string | null;
  headline: string | null;
}

interface SabotageEvent {
  id: string;
  attacker_id: string;
  target_id: string;
  type: string;
  cost: number;
  status: string;
  fired_at: string;
}

interface MarketOutcome {
  id: string;
  team_id: string;
  team_name: string;
  probability: number;
  odds: number;
  volume: number;
}

interface MarketData {
  id: string;
  total_volume: number;
  status: string;
  outcomes: MarketOutcome[];
}

interface PriceData {
  symbol: string;
  price: number;
  prev?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_CARDS = [
  { type: 'flash_crash', icon: '⚡', name: 'FLASH CRASH', desc: 'Drop asset X%' },
  { type: 'moon_shot', icon: '🌙', name: 'MOON SHOT', desc: 'Pump asset X%' },
  { type: 'volatility_spike', icon: '📈', name: 'VOL SPIKE', desc: 'Oscillate prices' },
  { type: 'dead_cat', icon: '📉', name: 'DEAD CAT', desc: 'Drop, recover, drop' },
  { type: 'margin_call', icon: '💸', name: 'MARGIN CALL', desc: 'Hit bottom traders' },
  { type: 'leverage_surge', icon: '⚡', name: 'LEVERAGE SURGE', desc: '2x all positions' },
  { type: 'wild_card', icon: '🎲', name: 'WILD CARD', desc: '$2k to random trader' },
  { type: 'reversal', icon: '🔄', name: 'REVERSAL', desc: 'Invert leaderboard' },
  { type: 'lockout', icon: '🔒', name: 'LOCKOUT ALL', desc: 'Block all trades' },
] as const;

const LEVERAGE_OPTIONS = [2, 5, 10, 20];
const SIZE_OPTIONS = [500, 1000, 2000, 5000];
const ASSET_OPTIONS = ['BTC', 'ETH', 'SOL', 'ALL'];
const MAGNITUDE_OPTIONS = [5, 10, 15, 25];
const DURATION_OPTIONS = [30, 60, 90, 120];

// ---------------------------------------------------------------------------
// Fonts CSS
// ---------------------------------------------------------------------------

const bebas = "'Bebas Neue', sans-serif";
const mono = "'JetBrains Mono', monospace";
const sans = "'DM Sans', sans-serif";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminPanel() {
  const { id: lobbyId } = useParams<{ id: string }>();

  // Auth
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  // Round state
  const [round, setRound] = useState<RoundData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [totalRounds] = useState(4);

  // Settings
  const [leverage, setLeverage] = useState(5);
  const [minSize, setMinSize] = useState(2000);

  // Traders
  const [traders, setTraders] = useState<TraderStatus[]>([]);

  // Presets
  const [presetCategory, setPresetCategory] = useState<EventPreset['category']>('crash');
  const [presetCooldown, setPresetCooldown] = useState(false);

  // Volatility
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [eventAsset, setEventAsset] = useState('BTC');
  const [eventMagnitude, setEventMagnitude] = useState(10);
  const [eventDuration, setEventDuration] = useState(60);
  const [activeEvent, setActiveEvent] = useState<VolatilityEvent | null>(null);
  const [activeEventEnd, setActiveEventEnd] = useState<number | null>(null);
  const [recentEvents, setRecentEvents] = useState<VolatilityEvent[]>([]);
  const [fireCooldown, setFireCooldown] = useState(false);

  // Market
  const [market, setMarket] = useState<MarketData | null>(null);
  const [totalBets, setTotalBets] = useState(0);

  // Sabotage feed
  const [sabotageEvents, setSabotageEvents] = useState<SabotageEvent[]>([]);

  // Prices
  const [prices, setPrices] = useState<PriceData[]>([]);

  // Credits
  const [creditPool, setCreditPool] = useState(0);
  const [creditsSpent, setCreditsSpent] = useState(0);

  // Refs
  const traderNamesRef = useRef<Record<string, string>>({});

  // ---------------------------------------------------------------------------
  // API helpers
  // ---------------------------------------------------------------------------

  const adminPost = useCallback(
    async (path: string, body: Record<string, unknown> = {}) => {
      const res = await fetch(`/api/lobby/${lobbyId}/admin/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: password },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    [lobbyId, password],
  );

  const adminGet = useCallback(
    async (path: string) => {
      const res = await fetch(`/api/lobby/${lobbyId}/admin/${path}`, {
        headers: { Authorization: password },
      });
      return res.json();
    },
    [lobbyId, password],
  );

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchStatus = useCallback(async () => {
    if (!authenticated) return;
    try {
      const data = await adminGet('status');
      if (data.round) setRound(data.round);
      if (data.traders) {
        setTraders(data.traders);
        const names: Record<string, string> = {};
        for (const t of data.traders) names[t.trader_id] = t.name;
        traderNamesRef.current = names;
      }
    } catch {
      // silent
    }
  }, [authenticated, adminGet]);

  const fetchEvents = useCallback(async () => {
    if (!authenticated) return;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/events`, {
        headers: { Authorization: password },
      });
      const data = await res.json();
      const events = (data.events ?? []) as VolatilityEvent[];
      setRecentEvents(events.slice(0, 5));

      // Check if any event is still active
      const now = Date.now();
      for (const ev of events) {
        if (ev.fired_at && ev.duration_seconds) {
          const end = new Date(ev.fired_at).getTime() + ev.duration_seconds * 1000;
          if (end > now) {
            setActiveEvent(ev);
            setActiveEventEnd(end);
            break;
          }
        }
      }
    } catch {
      // silent
    }
  }, [authenticated, lobbyId, password]);

  const fetchMarket = useCallback(async () => {
    if (!authenticated || !round) return;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/markets`);
      const data = await res.json();
      if (data.market) {
        setMarket(data.market);
        setTotalBets(data.total_bets ?? 0);
      }
    } catch {
      // silent
    }
  }, [authenticated, lobbyId, round]);

  const fetchPrices = useCallback(async () => {
    try {
      const { data } = await supabase.from('prices').select('*');
      if (data) {
        setPrices((prev) => {
          const prevMap: Record<string, number> = {};
          for (const p of prev) prevMap[p.symbol] = p.price;
          return data.map((p) => ({
            symbol: p.symbol,
            price: p.price,
            prev: prevMap[p.symbol],
          }));
        });
      }
    } catch {
      // silent
    }
  }, []);

  const fetchSabotage = useCallback(async () => {
    if (!authenticated) return;
    try {
      const { data } = await supabase
        .from('sabotages')
        .select('*')
        .eq('lobby_id', lobbyId)
        .order('fired_at', { ascending: false })
        .limit(5);
      if (data) setSabotageEvents(data as SabotageEvent[]);
    } catch {
      // silent
    }
  }, [authenticated, lobbyId]);

  const fetchCredits = useCallback(async () => {
    if (!authenticated) return;
    try {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('starting_balance')
        .eq('lobby_id', lobbyId);
      const totalStarting = (sessions ?? []).reduce((s, row) => s + (row.starting_balance ?? 0), 0);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('credits');
      const totalCredits = (profiles ?? []).reduce((s, row) => s + (row.credits ?? 0), 0);
      setCreditPool(totalCredits);

      const { data: sabs } = await supabase
        .from('sabotages')
        .select('cost')
        .eq('lobby_id', lobbyId);
      const spent = (sabs ?? []).reduce((s, row) => s + (row.cost ?? 0), 0);
      setCreditsSpent(spent);
    } catch {
      // silent
    }
  }, [authenticated, lobbyId]);

  // ---------------------------------------------------------------------------
  // Polling + Realtime
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!authenticated) return;
    fetchStatus();
    fetchEvents();
    fetchPrices();
    fetchSabotage();
    fetchCredits();
    fetchMarket();
    const interval = setInterval(() => {
      fetchStatus();
      fetchEvents();
      fetchPrices();
      fetchSabotage();
      fetchCredits();
      fetchMarket();
    }, 3000);
    return () => clearInterval(interval);
  }, [authenticated, fetchStatus, fetchEvents, fetchPrices, fetchSabotage, fetchCredits, fetchMarket]);

  // Round countdown timer
  useEffect(() => {
    if (!round || round.status !== 'active' || !round.started_at) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      const start = new Date(round.started_at!).getTime();
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [round]);

  // Active event countdown
  const [activeEventRemaining, setActiveEventRemaining] = useState(0);
  useEffect(() => {
    if (!activeEventEnd) { setActiveEventRemaining(0); return; }
    const tick = () => {
      const rem = Math.max(0, Math.floor((activeEventEnd - Date.now()) / 1000));
      setActiveEventRemaining(rem);
      if (rem <= 0) { setActiveEvent(null); setActiveEventEnd(null); }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeEventEnd]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleStartRound = async () => {
    if (!round) return;
    const data = await adminPost('round/start', { round_id: round.id });
    if (data.round) setRound(data.round);
  };

  const handleFreezeRound = async () => {
    if (!round) return;
    const data = await adminPost('round/freeze', { round_id: round.id });
    if (data.round) setRound(data.round);
  };

  const handleEliminate = async () => {
    const lastPlace = [...traders].filter((t) => !t.is_eliminated && t.rank !== null).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];
    if (!lastPlace) return;
    const data = await adminPost('round/eliminate', { trader_id: lastPlace.trader_id });
    if (data.trader) fetchStatus();
  };

  const handleNextRound = async () => {
    const data = await adminPost('round/next', {
      settings: {
        starting_balance: round?.starting_balance ?? 10000,
      },
    });
    if (data.round) setRound(data.round);
  };

  const handleFireEvent = async () => {
    if (!selectedEvent || fireCooldown) return;
    const assetMap: Record<string, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', ALL: 'ALL' };
    const res = await fetch(`/api/lobby/${lobbyId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: password },
      body: JSON.stringify({
        type: selectedEvent,
        asset: assetMap[eventAsset] ?? eventAsset,
        magnitude: eventMagnitude / 100,
        duration_seconds: eventDuration,
        trigger_mode: 'manual',
      }),
    });
    const data = await res.json();
    if (data.id) {
      setActiveEvent(data);
      setActiveEventEnd(Date.now() + eventDuration * 1000);
      setFireCooldown(true);
      setTimeout(() => setFireCooldown(false), 5000);
      fetchEvents();
    }
  };

  const handleCancelEvent = async () => {
    setActiveEvent(null);
    setActiveEventEnd(null);
  };

  const handleFirePreset = async (preset: EventPreset) => {
    if (presetCooldown) return;
    const res = await fetch(`/api/lobby/${lobbyId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: password },
      body: JSON.stringify({ preset_id: preset.id }),
    });
    const data = await res.json();
    if (data.preset_id) {
      // Set active event display from the first event in the chain
      const maxDuration = Math.max(...preset.events.map(e => (e.delay_seconds ?? 0) + e.duration_seconds));
      setActiveEvent({ id: preset.id, type: preset.events[0].type, asset: null, magnitude: null, duration_seconds: maxDuration, fired_at: new Date().toISOString(), headline: preset.headline });
      setActiveEventEnd(Date.now() + maxDuration * 1000);
      setPresetCooldown(true);
      setTimeout(() => setPresetCooldown(false), 5000);
      fetchEvents();
    }
  };

  const handleForceTrader = async (traderId: string) => {
    // Force a trade via participation system — trigger through admin
    // This calls the status endpoint which includes forced trades
    try {
      await fetch(`/api/lobby/${lobbyId}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: password },
        body: JSON.stringify({
          trader_id: traderId,
          round_id: round?.id,
          symbol: 'BTCUSDT',
          direction: Math.random() > 0.5 ? 'long' : 'short',
          size: minSize,
          leverage: 1,
          is_forced: true,
        }),
      });
      fetchStatus();
    } catch {
      // silent
    }
  };

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const remaining = round ? Math.max(0, round.duration_seconds - elapsed) : 0;
  const remainingStr = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;

  const lastPlace = [...traders]
    .filter((t) => !t.is_eliminated && t.rank !== null)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];

  const executionMode = 'PAPER TRADING';

  // ---------------------------------------------------------------------------
  // Password gate
  // ---------------------------------------------------------------------------

  if (!authenticated) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ border: '2px solid #F5A0D0', padding: 40, width: 340 }}>
            <h1 style={{ fontFamily: bebas, fontSize: 36, color: '#F5A0D0', textAlign: 'center', letterSpacing: '0.2em', marginBottom: 8 }}>BATTLE TRADE</h1>
            <p style={{ fontFamily: sans, fontSize: 10, color: '#444', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 24 }}>Admin Access Required</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (() => { setPassword(passwordInput); setAuthenticated(true); })()}
              placeholder="ENTER PASSWORD"
              style={{ width: '100%', padding: 12, background: '#111', border: '2px solid #333', color: '#F5A0D0', fontFamily: mono, fontSize: 12, textAlign: 'center', letterSpacing: '0.15em', outline: 'none', boxSizing: 'border-box' }}
            />
            <button
              onClick={() => { setPassword(passwordInput); setAuthenticated(true); }}
              style={{ width: '100%', marginTop: 12, padding: 12, background: '#F5A0D0', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: 20, letterSpacing: '0.15em', cursor: 'pointer' }}
            >
              ENTER
            </button>
          </div>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Main panel
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes pulse-fire { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .pulse-fire { animation: pulse-fire 0.8s ease-in-out infinite; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0A0A0A; }
        ::-webkit-scrollbar-thumb { background: #333; }
      `}</style>

      <div style={{ background: '#0A0A0A', minHeight: '100vh', width: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column' }}>

        {/* ================================================================= */}
        {/* THREE COLUMNS                                                     */}
        {/* ================================================================= */}
        <div style={{ display: 'flex', flex: 1, height: 800, overflow: 'hidden' }}>

          {/* ============================================================= */}
          {/* LEFT COLUMN — ROUND CONTROL — 280px                          */}
          {/* ============================================================= */}
          <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #1A1A1A', padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ fontFamily: bebas, fontSize: 18, color: '#444', letterSpacing: '0.1em' }}>ROUND CONTROL</div>

            {/* Current round display */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 48, color: '#FFF', lineHeight: 1 }}>
                ROUND {round?.round_number ?? '-'} OF {totalRounds}
              </div>
              <div style={{ fontFamily: bebas, fontSize: 16, color: round?.status === 'active' ? '#00FF88' : round?.status === 'frozen' ? '#FFD700' : '#666', marginTop: 4 }}>
                {round?.status?.toUpperCase() ?? 'NO ROUND'}
              </div>
              <div style={{ fontFamily: mono, fontSize: 36, color: '#FFF', marginTop: 8 }}>
                {round?.status === 'active' ? remainingStr : '--:--'}
              </div>
            </div>

            {/* Round config */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontFamily: bebas, fontSize: 20, color: '#F5A0D0' }}>LEVERAGE: {leverage}X</div>
              <div style={{ fontFamily: bebas, fontSize: 20, color: '#F5A0D0' }}>MIN SIZE: ${minSize.toLocaleString()}</div>
              <div style={{ fontFamily: sans, fontSize: 10, color: '#444', background: '#1A1A1A', display: 'inline-block', padding: '2px 8px', alignSelf: 'flex-start' }}>{executionMode}</div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleStartRound}
                disabled={!round || round.status === 'active'}
                style={{ width: '100%', height: 60, background: (!round || round.status === 'active') ? '#1A1A1A' : '#00FF88', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: 24, letterSpacing: '0.08em', cursor: (!round || round.status === 'active') ? 'not-allowed' : 'pointer', opacity: (!round || round.status === 'active') ? 0.3 : 1 }}
              >
                ▶ START ROUND
              </button>

              <button
                onClick={handleFreezeRound}
                disabled={!round || round.status !== 'active'}
                style={{ width: '100%', height: 60, background: round?.status === 'active' ? '#F5A0D0' : '#1A1A1A', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: 24, letterSpacing: '0.08em', cursor: round?.status !== 'active' ? 'not-allowed' : 'pointer', opacity: round?.status !== 'active' ? 0.3 : 1 }}
              >
                ⏸ FREEZE SCORES
              </button>

              <div>
                <button
                  onClick={handleEliminate}
                  disabled={!round || round.status !== 'frozen'}
                  style={{ width: '100%', height: 60, background: round?.status === 'frozen' ? '#FF3333' : '#1A1A1A', color: '#FFF', border: 'none', fontFamily: bebas, fontSize: 24, letterSpacing: '0.08em', cursor: round?.status !== 'frozen' ? 'not-allowed' : 'pointer', opacity: round?.status !== 'frozen' ? 0.3 : 1 }}
                >
                  💀 ELIMINATE LAST PLACE
                </button>
                {lastPlace && round?.status === 'frozen' && (
                  <div style={{ fontFamily: sans, fontSize: 11, color: '#888', marginTop: 4 }}>
                    ELIMINATES: {lastPlace.name} {lastPlace.return_pct >= 0 ? '+' : ''}{lastPlace.return_pct.toFixed(1)}%
                  </div>
                )}
              </div>

              <button
                onClick={handleNextRound}
                disabled={!round || (round.status !== 'completed' && round.status !== 'frozen')}
                style={{ width: '100%', height: 60, background: '#1A1A1A', color: '#888', border: 'none', fontFamily: bebas, fontSize: 24, letterSpacing: '0.08em', cursor: (round?.status !== 'completed' && round?.status !== 'frozen') ? 'not-allowed' : 'pointer', opacity: (round?.status !== 'completed' && round?.status !== 'frozen') ? 0.3 : 1 }}
              >
                ⏭ START NEXT ROUND
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#1A1A1A' }} />

            {/* Round settings */}
            <div>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>LEVERAGE</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {LEVERAGE_OPTIONS.map((lev) => (
                  <button
                    key={lev}
                    onClick={() => setLeverage(lev)}
                    style={{ flex: 1, padding: '6px 0', background: leverage === lev ? '#F5A0D0' : 'transparent', color: leverage === lev ? '#0A0A0A' : '#666', border: `1px solid ${leverage === lev ? '#F5A0D0' : '#333'}`, fontFamily: mono, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {lev}X
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>MIN POSITION SIZE</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {SIZE_OPTIONS.map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setMinSize(sz)}
                    style={{ flex: 1, padding: '6px 0', background: minSize === sz ? '#F5A0D0' : 'transparent', color: minSize === sz ? '#0A0A0A' : '#666', border: `1px solid ${minSize === sz ? '#F5A0D0' : '#333'}`, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                  >
                    ${sz >= 1000 ? `${sz / 1000}K` : sz}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#1A1A1A' }} />

            {/* Participation */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 14, color: '#333', letterSpacing: '0.08em', marginBottom: 8 }}>PARTICIPATION</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {traders.filter((t) => !t.is_eliminated).map((t) => {
                  const act = t.activity_status;
                  const statusIcon = act?.status === 'active' ? '🔥' : act?.status === 'warning' ? '⚠️' : act?.status === 'critical' ? '💀' : '·';
                  const statusLabel = act?.status === 'active' ? 'active' : act?.status === 'warning' ? `idle ${Math.floor((act?.seconds_idle ?? 0) / 60)}:${((act?.seconds_idle ?? 0) % 60).toString().padStart(2, '0')}` : act?.status === 'critical' ? `forced in ${act?.time_until_forced ?? 0}s` : 'unknown';
                  const isCriticalOrWarning = act?.status === 'warning' || act?.status === 'critical';

                  return (
                    <div key={t.trader_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                      <span style={{ fontSize: 12 }}>{statusIcon}</span>
                      <span style={{ fontFamily: bebas, fontSize: 12, color: '#FFF', flex: 1, letterSpacing: '0.05em' }}>{t.name}</span>
                      <span style={{ fontFamily: sans, fontSize: 9, color: act?.status === 'active' ? '#00FF88' : act?.status === 'warning' ? '#FFD700' : '#FF3333' }}>
                        {statusLabel}
                      </span>
                      {isCriticalOrWarning && (
                        <button
                          onClick={() => handleForceTrader(t.trader_id)}
                          style={{ fontFamily: bebas, fontSize: 10, color: '#FF3333', background: 'transparent', border: '1px solid #FF3333', padding: '1px 6px', cursor: 'pointer', lineHeight: 1.4 }}
                        >
                          FORCE NOW
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* CENTER COLUMN — DJ BOOTH                                      */}
          {/* ============================================================= */}
          <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <div style={{ fontFamily: bebas, fontSize: 18, color: '#444', letterSpacing: '0.1em' }}>VOLATILITY ENGINE</div>
              <div style={{ fontFamily: sans, fontSize: 10, color: '#555' }}>FIRE AN EVENT</div>
            </div>

            {/* Event grid 3x3 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {EVENT_CARDS.map((card) => (
                <button
                  key={card.type}
                  onClick={() => setSelectedEvent(selectedEvent === card.type ? null : card.type)}
                  style={{
                    background: '#0D0D0D',
                    border: selectedEvent === card.type ? '2px solid #F5A0D0' : '1px solid #1A1A1A',
                    padding: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 24 }}>{card.icon}</span>
                  <span style={{ fontFamily: bebas, fontSize: 16, color: '#FFF', letterSpacing: '0.05em' }}>{card.name}</span>
                  <span style={{ fontFamily: sans, fontSize: 9, color: '#444' }}>{card.desc}</span>
                </button>
              ))}
            </div>

            {/* Event config panel */}
            {selectedEvent && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textTransform: 'uppercase', marginBottom: 6 }}>ASSET</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {ASSET_OPTIONS.map((a) => (
                        <button key={a} onClick={() => setEventAsset(a)} style={{ padding: '6px 12px', background: eventAsset === a ? '#F5A0D0' : 'transparent', color: eventAsset === a ? '#0A0A0A' : '#666', border: `1px solid ${eventAsset === a ? '#F5A0D0' : '#333'}`, fontFamily: mono, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textTransform: 'uppercase', marginBottom: 6 }}>MAGNITUDE</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {MAGNITUDE_OPTIONS.map((m) => (
                        <button key={m} onClick={() => setEventMagnitude(m)} style={{ padding: '6px 12px', background: eventMagnitude === m ? '#F5A0D0' : 'transparent', color: eventMagnitude === m ? '#0A0A0A' : '#666', border: `1px solid ${eventMagnitude === m ? '#F5A0D0' : '#333'}`, fontFamily: mono, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          {m}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textTransform: 'uppercase', marginBottom: 6 }}>DURATION</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {DURATION_OPTIONS.map((d) => (
                        <button key={d} onClick={() => setEventDuration(d)} style={{ padding: '6px 12px', background: eventDuration === d ? '#F5A0D0' : 'transparent', color: eventDuration === d ? '#0A0A0A' : '#666', border: `1px solid ${eventDuration === d ? '#F5A0D0' : '#333'}`, fontFamily: mono, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          {d}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleFireEvent}
                  disabled={fireCooldown}
                  className={fireCooldown ? 'pulse-fire' : ''}
                  style={{ width: '100%', height: 56, background: fireCooldown ? '#991111' : '#FF3333', color: '#FFF', border: 'none', fontFamily: bebas, fontSize: 28, letterSpacing: '0.08em', cursor: fireCooldown ? 'not-allowed' : 'pointer', opacity: fireCooldown ? 0.7 : 1 }}
                >
                  🔥 FIRE EVENT
                </button>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: '#1A1A1A' }} />

            {/* PRESET DJ BOOTH */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 18, color: '#444', letterSpacing: '0.1em' }}>PRESET CHAINS</div>
              <div style={{ fontFamily: sans, fontSize: 10, color: '#555', marginBottom: 8 }}>ONE-CLICK EVENT CHAINS WITH TIMING</div>

              {/* Category tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
                {PRESET_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setPresetCategory(cat)}
                    style={{
                      padding: '4px 12px',
                      background: presetCategory === cat ? '#F5A0D0' : 'transparent',
                      color: presetCategory === cat ? '#0A0A0A' : '#666',
                      border: `1px solid ${presetCategory === cat ? '#F5A0D0' : '#333'}`,
                      fontFamily: bebas,
                      fontSize: 13,
                      letterSpacing: '0.08em',
                      cursor: 'pointer',
                    }}
                  >
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Preset cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {PRESETS.filter(p => p.category === presetCategory).map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleFirePreset(preset)}
                    disabled={presetCooldown}
                    style={{
                      background: '#0D0D0D',
                      border: '1px solid #1A1A1A',
                      padding: 12,
                      cursor: presetCooldown ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      opacity: presetCooldown ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{preset.emoji}</span>
                      <span style={{ fontFamily: bebas, fontSize: 16, color: '#FFF', letterSpacing: '0.05em' }}>{preset.name}</span>
                    </div>
                    <span style={{ fontFamily: sans, fontSize: 9, color: '#888' }}>{preset.narrative}</span>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {preset.events.map((ev, i) => (
                        <span key={i} style={{ fontFamily: mono, fontSize: 8, color: '#555', background: '#111', padding: '1px 4px' }}>
                          {ev.type.replace(/_/g, ' ').toUpperCase()}{ev.delay_seconds ? ` +${ev.delay_seconds}s` : ''}
                        </span>
                      ))}
                    </div>
                    <span style={{ fontFamily: mono, fontSize: 8, color: '#333', marginTop: 2 }}>
                      {preset.timing.toUpperCase()} ROUND
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#1A1A1A' }} />

            {/* Active event display */}
            {activeEvent && (
              <div style={{ background: 'rgba(255,51,51,0.08)', border: '1px solid #FF3333', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: bebas, fontSize: 20, color: '#FF3333', letterSpacing: '0.05em' }}>
                    {EVENT_CARDS.find((c) => c.type === activeEvent.type)?.name ?? activeEvent.type.toUpperCase()} ACTIVE
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 14, color: '#888' }}>
                    {activeEvent.asset ?? 'ALL'} · {activeEvent.magnitude ? `-${(activeEvent.magnitude * 100).toFixed(1)}%` : ''} · ENDS IN {Math.floor(activeEventRemaining / 60)}:{(activeEventRemaining % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                <button
                  onClick={handleCancelEvent}
                  style={{ fontFamily: bebas, fontSize: 12, color: '#FF3333', background: 'transparent', border: '1px solid #FF3333', padding: '4px 12px', cursor: 'pointer' }}
                >
                  CANCEL
                </button>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: '#1A1A1A' }} />

            {/* Recent events */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 12, color: '#333', letterSpacing: '0.08em', marginBottom: 6 }}>RECENT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {recentEvents.length === 0 && (
                  <div style={{ fontFamily: mono, fontSize: 11, color: '#333' }}>No events yet</div>
                )}
                {recentEvents.map((ev) => {
                  const time = ev.fired_at ? new Date(ev.fired_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
                  const name = EVENT_CARDS.find((c) => c.type === ev.type)?.name ?? ev.type.toUpperCase();
                  const asset = ev.asset ? ev.asset.replace('USDT', '') : 'ALL';
                  const mag = ev.magnitude ? `${ev.magnitude > 0 ? (ev.type === 'moon_shot' ? '+' : '-') : ''}${(ev.magnitude * 100).toFixed(0)}%` : '';
                  return (
                    <div key={ev.id} style={{ fontFamily: mono, fontSize: 11, color: '#444' }}>
                      {time} · {name} · {asset} {mag} · {ev.duration_seconds ?? 60}s
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* RIGHT COLUMN — LIVE STATUS — 240px                            */}
          {/* ============================================================= */}
          <div style={{ width: 240, flexShrink: 0, borderLeft: '1px solid #1A1A1A', padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Live standings */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 14, color: '#333', letterSpacing: '0.08em', marginBottom: 8 }}>LIVE STANDINGS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {traders
                  .filter((t) => t.rank !== null)
                  .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
                  .map((t) => {
                    const actIcon = t.activity_status?.status === 'active' ? '🔥' : t.activity_status?.status === 'warning' ? '⚠️' : t.activity_status?.status === 'critical' ? '💀' : '';
                    return (
                      <div key={t.trader_id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', borderBottom: '1px solid #111' }}>
                        <span style={{ fontFamily: mono, fontSize: 11, color: '#666', width: 20 }}>#{t.rank}</span>
                        <span style={{ fontFamily: bebas, fontSize: 13, color: '#FFF', flex: 1, letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                        <span style={{ fontFamily: mono, fontSize: 11, color: t.return_pct >= 0 ? '#00FF88' : '#FF3333', width: 52, textAlign: 'right' }}>
                          {t.return_pct >= 0 ? '+' : ''}{t.return_pct.toFixed(1)}%
                        </span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: '#666', width: 52, textAlign: 'right' }}>
                          ${Math.round(t.balance).toLocaleString()}
                        </span>
                        <span style={{ fontSize: 10, width: 14 }}>{actIcon}</span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#1A1A1A' }} />

            {/* Prediction market */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 13, color: '#333', letterSpacing: '0.08em', marginBottom: 4 }}>MARKET</div>
              <div style={{ fontFamily: mono, fontSize: 12, color: '#888', marginBottom: 8 }}>
                {totalBets} BETS · ${market?.total_volume?.toLocaleString() ?? '0'} VOLUME
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {(market?.outcomes ?? []).map((o) => (
                  <div key={o.id} style={{ fontFamily: mono, fontSize: 11, color: '#888' }}>
                    {o.team_name} {o.odds.toFixed(1)}X — {(o.probability * 100).toFixed(0)}%
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#1A1A1A' }} />

            {/* Sabotage feed */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 13, color: '#333', letterSpacing: '0.08em', marginBottom: 4 }}>SABOTAGE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {sabotageEvents.length === 0 && (
                  <div style={{ fontFamily: mono, fontSize: 10, color: '#333' }}>No sabotage yet</div>
                )}
                {sabotageEvents.map((s) => {
                  const attackerName = traderNamesRef.current[s.attacker_id] ?? 'ANON';
                  const targetName = traderNamesRef.current[s.target_id] ?? '???';
                  return (
                    <div key={s.id} style={{ fontFamily: mono, fontSize: 10, color: '#444' }}>
                      🎯 {attackerName} → {targetName} · {s.type.toUpperCase()} · {s.cost}cr
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#1A1A1A' }} />

            {/* Prices */}
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {prices.map((p) => {
                  const symbol = p.symbol.replace('USDT', '');
                  const up = p.prev !== undefined ? p.price >= p.prev : true;
                  return (
                    <div key={p.symbol} style={{ fontFamily: mono, fontSize: 12, color: '#FFF', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{symbol}</span>
                      <span>
                        ${p.price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        {' '}<span style={{ color: up ? '#00FF88' : '#FF3333' }}>{up ? '▲' : '▼'}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#1A1A1A' }} />

            {/* Credit pool */}
            <div>
              <div style={{ fontFamily: bebas, fontSize: 13, color: '#333', letterSpacing: '0.08em', marginBottom: 4 }}>CREDITS</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: '#888' }}>
                POOL: {creditPool.toLocaleString()}CR REMAINING
              </div>
              <div style={{ fontFamily: mono, fontSize: 11, color: '#888' }}>
                SPENT: {creditsSpent.toLocaleString()}CR THIS ROUND
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
