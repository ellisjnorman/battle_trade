'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PRESETS, PRESET_CATEGORIES } from '@/lib/event-presets';
import type { EventPreset } from '@/lib/event-presets';
import { PYTH_FEEDS } from '@/lib/pyth-feeds';
import type { AssetCategory } from '@/lib/pyth-feeds';

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
// Build asset options from Pyth feed catalog, grouped by category
const ASSET_GROUPS: { label: string; category: AssetCategory | 'special'; items: { value: string; label: string }[] }[] = [
  { label: 'SPECIAL', category: 'special', items: [{ value: 'ALL', label: 'ALL ASSETS' }] },
  { label: 'CRYPTO', category: 'crypto', items: Object.entries(PYTH_FEEDS).filter(([, f]) => f.category === 'crypto').map(([sym, f]) => ({ value: sym.replace('USD', ''), label: `${sym.replace('USD', '')} — ${f.label}` })) },
  { label: 'STOCKS', category: 'equity', items: Object.entries(PYTH_FEEDS).filter(([, f]) => f.category === 'equity').map(([sym, f]) => ({ value: sym.replace('USD', ''), label: `${sym.replace('USD', '')} — ${f.label}` })) },
  { label: 'COMMODITIES', category: 'commodity', items: Object.entries(PYTH_FEEDS).filter(([, f]) => f.category === 'commodity').map(([sym, f]) => ({ value: sym.replace('USD', ''), label: `${sym.replace('USD', '')} — ${f.label}` })) },
];
const MAGNITUDE_OPTIONS = [5, 10, 15, 25];
const DURATION_OPTIONS = [30, 60, 90, 120];

// ---------------------------------------------------------------------------
// Fonts
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

  // Tab state
  const [djTab, setDjTab] = useState<'events' | 'presets'>('presets');

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
    // If no round or round is completed/frozen, create a new one
    if (!round || round.status === 'completed' || round.status === 'frozen') {
      const { data: newRound, error } = await supabase
        .from('rounds')
        .insert({
          lobby_id: lobbyId,
          round_number: (round?.round_number ?? 0) + 1,
          status: 'pending',
          leverage_tier: leverage,
          starting_balance: 10000,
          duration_seconds: 600,
          elimination_pct: 0.25,
        })
        .select()
        .single();
      if (error) {
        // Retry with minimal columns if some don't exist
        console.error('Round create error:', error.message);
        const { data: retry, error: retryErr } = await supabase
          .from('rounds')
          .insert({
            lobby_id: lobbyId,
            round_number: (round?.round_number ?? 0) + 1,
            status: 'pending',
            leverage_tier: leverage,
          })
          .select()
          .single();
        if (retryErr || !retry) {
          console.error('Round create retry error:', retryErr?.message);
          return;
        }
        setRound(retry);
        const data = await adminPost('round/start', { round_id: retry.id });
        if (data.round) setRound(data.round);
        return;
      }
      if (error || !newRound) return;
      setRound(newRound);
      // Now start it
      const data = await adminPost('round/start', { round_id: newRound.id });
      if (data.round) setRound(data.round);
      return;
    }
    // If round exists but is pending, start it
    if (round.status === 'pending') {
      const data = await adminPost('round/start', { round_id: round.id });
      if (data.round) setRound(data.round);
      return;
    }
  };

  const handleFreezeRound = async () => {
    if (!round) return;
    const data = await adminPost('round/freeze', { round_id: round.id });
    if (data.round) setRound(data.round);
  };

  const handleEliminate = async () => {
    const last = [...traders].filter((t) => !t.is_eliminated && t.rank !== null).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];
    if (!last) return;
    const data = await adminPost('round/eliminate', { trader_id: last.trader_id });
    if (data.trader) fetchStatus();
  };

  const handleNextRound = async () => {
    const data = await adminPost('round/next', {
      settings: { starting_balance: round?.starting_balance ?? 10000 },
    });
    if (data.round) setRound(data.round);
  };

  const handleFireEvent = async () => {
    if (!selectedEvent || fireCooldown) return;
    const asset = eventAsset === 'ALL' ? 'ALL' : `${eventAsset}USDT`;
    const res = await fetch(`/api/lobby/${lobbyId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: password },
      body: JSON.stringify({
        type: selectedEvent,
        asset,
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
      const maxDuration = Math.max(...preset.events.map(e => (e.delay_seconds ?? 0) + e.duration_seconds));
      setActiveEvent({ id: preset.id, type: preset.events[0].type, asset: null, magnitude: null, duration_seconds: maxDuration, fired_at: new Date().toISOString(), headline: preset.headline });
      setActiveEventEnd(Date.now() + maxDuration * 1000);
      setPresetCooldown(true);
      setTimeout(() => setPresetCooldown(false), 5000);
      fetchEvents();
    }
  };

  const handleForceTrader = async (traderId: string) => {
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
  const remainingMin = Math.floor(remaining / 60).toString().padStart(2, '0');
  const remainingSec = (remaining % 60).toString().padStart(2, '0');
  const timerDanger = remaining < 120 && round?.status === 'active';

  const lastPlace = [...traders]
    .filter((t) => !t.is_eliminated && t.rank !== null)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];

  const activeTraders = traders.filter(t => !t.is_eliminated);
  const eliminatedTraders = traders.filter(t => t.is_eliminated);

  const statusColor = round?.status === 'active' ? '#00FF88' : round?.status === 'frozen' ? '#F5A0D0' : round?.status === 'completed' ? '#888888' : '#444444';

  // ---------------------------------------------------------------------------
  // Password gate
  // ---------------------------------------------------------------------------

  if (!authenticated) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } input, button { border-radius: 0 !important; }`}</style>
        {/* Scanlines */}
        <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '2px 2px', pointerEvents: 'none', zIndex: 999 }} />
        <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="Battle Trade" style={{ width: 280, height: 'auto' }} />
            <div style={{ fontFamily: bebas, fontSize: 20, color: '#444444', letterSpacing: '0.15em' }}>MISSION CONTROL</div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (() => { setPassword(passwordInput); setAuthenticated(true); })()}
                placeholder="ENTER PASSWORD"
                style={{ width: '100%', height: 56, background: '#111111', border: '2px solid #1A1A1A', color: '#F5A0D0', fontFamily: mono, fontSize: 16, textAlign: 'center', letterSpacing: '0.15em', outline: 'none' }}
              />
              <button
                onClick={() => { setPassword(passwordInput); setAuthenticated(true); }}
                style={{ width: '100%', height: 56, background: '#F5A0D0', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: 24, letterSpacing: '0.15em', cursor: 'pointer' }}
              >
                ENTER
              </button>
            </div>
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
        button:active:not(:disabled) { transform: scale(0.97) !important; filter: brightness(0.85) !important; }
        button { transition: transform 100ms ease, filter 100ms ease, border-color 150ms ease, background 150ms ease; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes dangerPulse { 0%,100%{text-shadow: 0 0 20px rgba(255,51,51,0.6)} 50%{text-shadow: 0 0 40px rgba(255,51,51,0.9)} }
        @keyframes liveGlow { 0%,100%{box-shadow: 0 0 8px rgba(0,255,136,0.4)} 50%{box-shadow: 0 0 16px rgba(0,255,136,0.8)} }
        @keyframes fireGlow { 0%,100%{box-shadow: 0 0 8px rgba(255,51,51,0.4)} 50%{box-shadow: 0 0 24px rgba(255,51,51,0.8)} }
        .danger-pulse { animation: dangerPulse 1s ease-in-out infinite; }
        .live-glow { animation: liveGlow 2s ease-in-out infinite; }
        .fire-glow { animation: fireGlow 0.8s ease-in-out infinite; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0A0A0A; }
        ::-webkit-scrollbar-thumb { background: #333; }
        button { border-radius: 0 !important; }
      `}</style>

      {/* Scanlines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '2px 2px', pointerEvents: 'none', zIndex: 999 }} />

      <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

        {/* ================================================================= */}
        {/* TOP BAR — COMMAND STRIP                                           */}
        {/* ================================================================= */}
        <div style={{ height: 64, borderBottom: '2px solid #1A1A1A', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 24, flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-main.png" alt="Battle Trade" style={{ height: 28, width: 'auto' }} />
          <div style={{ width: 1, height: 32, background: '#1A1A1A' }} />
          <div style={{ fontFamily: bebas, fontSize: 20, color: '#444444', letterSpacing: '0.1em' }}>MISSION CONTROL</div>
          <div style={{ flex: 1 }} />

          {/* Live prices — top 3 only */}
          {prices.filter((p) => ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BTCUSD', 'ETHUSD', 'SOLUSD'].includes(p.symbol)).slice(0, 3).map((p) => {
            const sym = p.symbol.replace('USDT', '').replace('USD', '');
            const up = p.prev !== undefined ? p.price >= p.prev : true;
            return (
              <div key={p.symbol} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: bebas, fontSize: 14, color: '#555555' }}>{sym}</span>
                <span style={{ fontFamily: mono, fontSize: 16, color: '#FFF', letterSpacing: '-0.02em' }}>
                  ${p.price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <span style={{ fontFamily: mono, fontSize: 12, color: up ? '#00FF88' : '#FF3333' }}>{up ? '▲' : '▼'}</span>
              </div>
            );
          })}

          <div style={{ width: 1, height: 32, background: '#1A1A1A' }} />
          <div style={{ fontFamily: mono, fontSize: 11, color: '#444444' }}>
            {creditPool.toLocaleString()}CR POOL
          </div>
        </div>

        {/* ================================================================= */}
        {/* ACTIVE EVENT BANNER                                                */}
        {/* ================================================================= */}
        {activeEvent && (
          <div className="fire-glow" style={{ background: 'rgba(255,51,51,0.1)', borderBottom: '2px solid #FF3333', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontFamily: bebas, fontSize: 32, color: '#FF3333', letterSpacing: '0.05em', textShadow: '0 0 20px rgba(255,51,51,0.5)' }}>
                {EVENT_CARDS.find((c) => c.type === activeEvent.type)?.name ?? activeEvent.type.toUpperCase()} ACTIVE
              </div>
              <div style={{ fontFamily: mono, fontSize: 16, color: '#888888' }}>
                {activeEvent.asset?.replace('USDT', '') ?? 'ALL'} {activeEvent.magnitude ? `${(activeEvent.magnitude * 100).toFixed(0)}%` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontFamily: mono, fontSize: 36, color: '#FF3333', letterSpacing: '-0.02em', textShadow: '0 0 20px rgba(255,51,51,0.5)' }}>
                {Math.floor(activeEventRemaining / 60)}:{(activeEventRemaining % 60).toString().padStart(2, '0')}
              </div>
              <button onClick={handleCancelEvent} style={{ fontFamily: bebas, fontSize: 16, color: '#FF3333', background: 'transparent', border: '1px solid #FF3333', padding: '8px 16px', cursor: 'pointer' }}>
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MAIN GRID — 3 COLUMNS                                             */}
        {/* ================================================================= */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ============================================================= */}
          {/* LEFT — ROUND COMMAND — 340px                                   */}
          {/* ============================================================= */}
          <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid #1A1A1A', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* BIG ACTION BUTTONS — ALWAYS FIRST, ALWAYS VISIBLE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleStartRound}
                disabled={round?.status === 'active'}
                style={{
                  width: '100%', height: 72,
                  background: round?.status === 'active' ? '#111111' : '#00FF88',
                  color: '#0A0A0A', border: 'none',
                  fontFamily: bebas, fontSize: 32, letterSpacing: '0.08em',
                  cursor: round?.status === 'active' ? 'not-allowed' : 'pointer',
                  opacity: round?.status === 'active' ? 0.2 : 1,
                  textShadow: round?.status !== 'active' ? '0 0 10px rgba(0,255,136,0.3)' : 'none',
                }}
              >
                {!round ? 'CREATE & START ROUND' : round.status === 'completed' || round.status === 'frozen' ? 'START NEXT ROUND' : 'START ROUND'}
              </button>

              <button
                onClick={handleFreezeRound}
                disabled={!round || round.status !== 'active'}
                style={{
                  width: '100%', height: 72,
                  background: round?.status === 'active' ? '#F5A0D0' : '#111111',
                  color: '#0A0A0A', border: 'none',
                  fontFamily: bebas, fontSize: 32, letterSpacing: '0.08em',
                  cursor: round?.status !== 'active' ? 'not-allowed' : 'pointer',
                  opacity: round?.status !== 'active' ? 0.2 : 1,
                }}
              >
                FREEZE SCORES
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleEliminate}
                  disabled={!round || round.status !== 'frozen'}
                  style={{
                    flex: 1, height: 72,
                    background: round?.status === 'frozen' ? '#FF3333' : '#111111',
                    color: '#FFF', border: 'none',
                    fontFamily: bebas, fontSize: 24, letterSpacing: '0.08em',
                    cursor: round?.status !== 'frozen' ? 'not-allowed' : 'pointer',
                    opacity: round?.status !== 'frozen' ? 0.2 : 1,
                    textShadow: round?.status === 'frozen' ? '0 0 10px rgba(255,51,51,0.4)' : 'none',
                  }}
                >
                  ELIMINATE
                </button>
                <button
                  onClick={handleNextRound}
                  disabled={!round || (round.status !== 'completed' && round.status !== 'frozen')}
                  style={{
                    flex: 1, height: 72,
                    background: (round?.status === 'completed' || round?.status === 'frozen') ? '#222222' : '#111111',
                    color: '#888888', border: 'none',
                    fontFamily: bebas, fontSize: 24, letterSpacing: '0.08em',
                    cursor: (round?.status !== 'completed' && round?.status !== 'frozen') ? 'not-allowed' : 'pointer',
                    opacity: (round?.status !== 'completed' && round?.status !== 'frozen') ? 0.2 : 1,
                  }}
                >
                  NEXT ROUND
                </button>
              </div>

              {lastPlace && round?.status === 'frozen' && (
                <div style={{ fontFamily: sans, fontSize: 11, color: '#FF3333', textAlign: 'center' }}>
                  ELIMINATES: {lastPlace.name} ({lastPlace.return_pct >= 0 ? '+' : ''}{lastPlace.return_pct.toFixed(1)}%)
                </div>
              )}
            </div>

            {/* Round display */}
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontFamily: bebas, fontSize: 48, color: '#FFF', lineHeight: 1 }}>
                ROUND {round?.round_number ?? '—'} <span style={{ color: '#444444', fontSize: 20 }}>OF {totalRounds}</span>
              </div>
              <div style={{ display: 'inline-block', marginTop: 8, padding: '2px 16px', border: `2px solid ${statusColor}` }}
                className={round?.status === 'active' ? 'live-glow' : ''}
              >
                <span style={{ fontFamily: bebas, fontSize: 16, color: statusColor, letterSpacing: '0.15em' }}>
                  {round?.status?.toUpperCase() ?? 'NO ROUND'}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <span className={timerDanger ? 'danger-pulse' : ''} style={{ fontFamily: mono, fontSize: 48, fontWeight: 700, color: timerDanger ? '#FF3333' : '#FFF', letterSpacing: '-0.02em' }}>
                  {round?.status === 'active' ? `${remainingMin}:${remainingSec}` : '--:--'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: mono, fontSize: 20, color: '#F5A0D0', fontWeight: 700 }}>{leverage}X</div>
                  <div style={{ fontFamily: sans, fontSize: 8, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LEV</div>
                </div>
                <div style={{ width: 1, background: '#1A1A1A' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: mono, fontSize: 20, color: '#F5A0D0', fontWeight: 700 }}>${(minSize / 1000).toFixed(0)}K</div>
                  <div style={{ fontFamily: sans, fontSize: 8, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>MIN</div>
                </div>
                <div style={{ width: 1, background: '#1A1A1A' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: mono, fontSize: 20, color: '#888888', fontWeight: 700 }}>{activeTraders.length}</div>
                  <div style={{ fontFamily: sans, fontSize: 8, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ALIVE</div>
                </div>
              </div>
            </div>

            {/* Settings */}
            <div style={{ height: 1, background: '#1A1A1A' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>LEVERAGE</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {LEVERAGE_OPTIONS.map((lev) => (
                    <button key={lev} onClick={() => setLeverage(lev)} style={{ flex: 1, height: 40, background: leverage === lev ? '#F5A0D0' : 'transparent', color: leverage === lev ? '#0A0A0A' : '#555555', border: `1px solid ${leverage === lev ? '#F5A0D0' : '#222222'}`, fontFamily: mono, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      {lev}X
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>MIN POSITION SIZE</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {SIZE_OPTIONS.map((sz) => (
                    <button key={sz} onClick={() => setMinSize(sz)} style={{ flex: 1, height: 40, background: minSize === sz ? '#F5A0D0' : 'transparent', color: minSize === sz ? '#0A0A0A' : '#555555', border: `1px solid ${minSize === sz ? '#F5A0D0' : '#222222'}`, fontFamily: mono, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      ${sz >= 1000 ? `${sz / 1000}K` : sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* CENTER — DJ BOOTH                                              */}
          {/* ============================================================= */}
          <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Tab switch */}
            <div style={{ display: 'flex', gap: 0 }}>
              <button onClick={() => setDjTab('presets')} style={{ flex: 1, height: 48, background: djTab === 'presets' ? '#F5A0D0' : 'transparent', color: djTab === 'presets' ? '#0A0A0A' : '#555555', border: `1px solid ${djTab === 'presets' ? '#F5A0D0' : '#1A1A1A'}`, fontFamily: bebas, fontSize: 22, letterSpacing: '0.08em', cursor: 'pointer' }}>
                PRESET CHAINS
              </button>
              <button onClick={() => setDjTab('events')} style={{ flex: 1, height: 48, background: djTab === 'events' ? '#F5A0D0' : 'transparent', color: djTab === 'events' ? '#0A0A0A' : '#555555', border: `1px solid ${djTab === 'events' ? '#F5A0D0' : '#1A1A1A'}`, fontFamily: bebas, fontSize: 22, letterSpacing: '0.08em', cursor: 'pointer' }}>
                MANUAL EVENTS
              </button>
            </div>

            {/* PRESETS TAB */}
            {djTab === 'presets' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Category tabs */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {PRESET_CATEGORIES.map((cat) => (
                    <button key={cat} onClick={() => setPresetCategory(cat)} style={{ padding: '8px 20px', background: presetCategory === cat ? '#F5A0D0' : 'transparent', color: presetCategory === cat ? '#0A0A0A' : '#555555', border: `1px solid ${presetCategory === cat ? '#F5A0D0' : '#222222'}`, fontFamily: bebas, fontSize: 16, letterSpacing: '0.08em', cursor: 'pointer' }}>
                      {cat.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Preset grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {PRESETS.filter(p => p.category === presetCategory).map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleFirePreset(preset)}
                      disabled={presetCooldown}
                      style={{
                        background: '#111111', border: '1px solid #1A1A1A',
                        padding: 16, cursor: presetCooldown ? 'not-allowed' : 'pointer',
                        textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8,
                        opacity: presetCooldown ? 0.4 : 1,
                        transition: 'border-color 150ms ease',
                      }}
                      onMouseEnter={(e) => { if (!presetCooldown) e.currentTarget.style.borderColor = '#F5A0D0'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1A1A1A'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 28 }}>{preset.emoji}</span>
                        <span style={{ fontFamily: bebas, fontSize: 20, color: '#FFF', letterSpacing: '0.05em' }}>{preset.name}</span>
                      </div>
                      <span style={{ fontFamily: sans, fontSize: 11, color: '#888888', lineHeight: 1.4 }}>{preset.narrative}</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {preset.events.map((ev, i) => (
                          <span key={i} style={{ fontFamily: mono, fontSize: 9, color: '#555555', background: '#0A0A0A', padding: '2px 6px', border: '1px solid #1A1A1A' }}>
                            {ev.type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* MANUAL EVENTS TAB */}
            {djTab === 'events' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Event grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {EVENT_CARDS.map((card) => (
                    <button
                      key={card.type}
                      onClick={() => setSelectedEvent(selectedEvent === card.type ? null : card.type)}
                      style={{
                        background: selectedEvent === card.type ? 'rgba(245,160,208,0.06)' : '#111111',
                        border: selectedEvent === card.type ? '2px solid #F5A0D0' : '1px solid #1A1A1A',
                        padding: 16, cursor: 'pointer', textAlign: 'left',
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 32 }}>{card.icon}</span>
                      <span style={{ fontFamily: bebas, fontSize: 18, color: '#FFF', letterSpacing: '0.05em' }}>{card.name}</span>
                      <span style={{ fontFamily: sans, fontSize: 10, color: '#555555' }}>{card.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Config panel */}
                {selectedEvent && (
                  <div style={{ border: '1px solid #1A1A1A', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 200 }}>
                        <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>ASSET</div>
                        <select
                          value={eventAsset}
                          onChange={(e) => setEventAsset(e.target.value)}
                          style={{
                            width: '100%', height: 44,
                            background: '#111111', color: '#F5A0D0',
                            border: '2px solid #F5A0D0', borderRadius: 0,
                            fontFamily: mono, fontSize: 13, fontWeight: 700,
                            padding: '0 12px', cursor: 'pointer', outline: 'none',
                            appearance: 'none',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23F5A0D0' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 12px center',
                          }}
                        >
                          {ASSET_GROUPS.map((group) => (
                            <optgroup key={group.label} label={group.label} style={{ background: '#0A0A0A', color: '#888' }}>
                              {group.items.map((item) => (
                                <option key={item.value} value={item.value} style={{ background: '#0A0A0A', color: '#FFF' }}>
                                  {item.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>MAGNITUDE</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {MAGNITUDE_OPTIONS.map((m) => (
                            <button key={m} onClick={() => setEventMagnitude(m)} style={{ padding: '8px 16px', background: eventMagnitude === m ? '#F5A0D0' : 'transparent', color: eventMagnitude === m ? '#0A0A0A' : '#555555', border: `1px solid ${eventMagnitude === m ? '#F5A0D0' : '#222222'}`, fontFamily: mono, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              {m}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>DURATION</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {DURATION_OPTIONS.map((d) => (
                            <button key={d} onClick={() => setEventDuration(d)} style={{ padding: '8px 16px', background: eventDuration === d ? '#F5A0D0' : 'transparent', color: eventDuration === d ? '#0A0A0A' : '#555555', border: `1px solid ${eventDuration === d ? '#F5A0D0' : '#222222'}`, fontFamily: mono, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              {d}s
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleFireEvent}
                      disabled={fireCooldown}
                      className={fireCooldown ? '' : 'fire-glow'}
                      style={{
                        width: '100%', height: 64,
                        background: fireCooldown ? '#1A1A1A' : '#FF3333',
                        color: '#FFF', border: 'none',
                        fontFamily: bebas, fontSize: 32, letterSpacing: '0.08em',
                        cursor: fireCooldown ? 'not-allowed' : 'pointer',
                        opacity: fireCooldown ? 0.4 : 1,
                        textShadow: !fireCooldown ? '0 0 20px rgba(255,51,51,0.5)' : 'none',
                      }}
                    >
                      FIRE EVENT
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Recent events log */}
            <div style={{ height: 1, background: '#1A1A1A' }} />
            <div>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>EVENT LOG</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recentEvents.length === 0 && (
                  <div style={{ fontFamily: mono, fontSize: 12, color: '#333333' }}>No events fired yet</div>
                )}
                {recentEvents.map((ev) => {
                  const time = ev.fired_at ? new Date(ev.fired_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
                  const name = EVENT_CARDS.find((c) => c.type === ev.type)?.name ?? ev.type.toUpperCase();
                  const asset = ev.asset ? ev.asset.replace('USDT', '') : 'ALL';
                  return (
                    <div key={ev.id} style={{ fontFamily: mono, fontSize: 12, color: '#555555', display: 'flex', gap: 8 }}>
                      <span style={{ color: '#333333' }}>{time}</span>
                      <span style={{ color: '#888888' }}>{name}</span>
                      <span>{asset}</span>
                      <span style={{ color: '#333333' }}>{ev.duration_seconds ?? 60}s</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* RIGHT — LIVE STANDINGS — 320px                                 */}
          {/* ============================================================= */}
          <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid #1A1A1A', padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ fontFamily: bebas, fontSize: 20, color: '#444444', letterSpacing: '0.1em' }}>LIVE STANDINGS</div>

            {/* Standings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {traders
                .filter((t) => !t.is_eliminated && t.rank !== null)
                .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
                .map((t) => {
                  const isFirst = t.rank === 1;
                  return (
                    <div key={t.trader_id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '12px 8px',
                      borderBottom: '1px solid #111111',
                      borderLeft: isFirst ? '3px solid #F5A0D0' : '3px solid transparent',
                    }}>
                      <span style={{ fontFamily: bebas, fontSize: 24, color: isFirst ? '#F5A0D0' : t.rank! <= 3 ? '#FFF' : '#444444', width: 32 }}>
                        {t.rank}
                      </span>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontFamily: bebas, fontSize: 18, color: '#FFF', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 11, color: '#555555' }}>
                          ${Math.round(t.balance).toLocaleString()}
                        </div>
                      </div>
                      <span style={{
                        fontFamily: mono, fontSize: 16, fontWeight: 700,
                        color: t.return_pct >= 0 ? '#00FF88' : '#FF3333',
                        letterSpacing: '-0.02em',
                        textShadow: t.return_pct >= 0 ? '0 0 10px rgba(0,255,136,0.4)' : '0 0 10px rgba(255,51,51,0.4)',
                      }}>
                        {t.return_pct >= 0 ? '+' : ''}{t.return_pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
            </div>

            {/* Eliminated */}
            {eliminatedTraders.length > 0 && (
              <>
                <div style={{ height: 1, background: '#1A1A1A' }} />
                <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ELIMINATED</div>
                {eliminatedTraders.map(t => (
                  <div key={t.trader_id} style={{ fontFamily: bebas, fontSize: 14, color: '#333333', textDecoration: 'line-through', padding: '4px 0' }}>
                    {t.name}
                  </div>
                ))}
              </>
            )}

            {/* Participation */}
            <div style={{ height: 1, background: '#1A1A1A' }} />
            <div>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>PARTICIPATION</div>
              {activeTraders.map((t) => {
                const act = t.activity_status;
                const dotColor = act?.status === 'active' ? '#00FF88' : act?.status === 'warning' ? '#F5A0D0' : act?.status === 'critical' ? '#FF3333' : '#333333';
                return (
                  <div key={t.trader_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <div style={{ width: 8, height: 8, background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontFamily: bebas, fontSize: 14, color: '#888888', flex: 1 }}>{t.name}</span>
                    {(act?.status === 'warning' || act?.status === 'critical') && (
                      <button
                        onClick={() => handleForceTrader(t.trader_id)}
                        style={{ fontFamily: bebas, fontSize: 11, color: '#FF3333', background: 'transparent', border: '1px solid #FF3333', padding: '2px 8px', cursor: 'pointer' }}
                      >
                        FORCE
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Market */}
            <div style={{ height: 1, background: '#1A1A1A' }} />
            <div>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>PREDICTION MARKET</div>
              <div style={{ fontFamily: mono, fontSize: 12, color: '#888888', marginBottom: 8 }}>
                {totalBets} BETS · ${market?.total_volume?.toLocaleString() ?? '0'} VOLUME
              </div>
              {(market?.outcomes ?? []).map((o) => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontFamily: mono, fontSize: 12 }}>
                  <span style={{ color: '#888888' }}>{o.team_name}</span>
                  <span style={{ color: '#F5A0D0' }}>{o.odds.toFixed(1)}X ({(o.probability * 100).toFixed(0)}%)</span>
                </div>
              ))}
            </div>

            {/* Sabotage */}
            <div style={{ height: 1, background: '#1A1A1A' }} />
            <div>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#444444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>SABOTAGE FEED</div>
              {sabotageEvents.length === 0 && (
                <div style={{ fontFamily: mono, fontSize: 11, color: '#333333' }}>No sabotage yet</div>
              )}
              {sabotageEvents.map((s) => (
                <div key={s.id} style={{ fontFamily: mono, fontSize: 11, color: '#555555', padding: '2px 0' }}>
                  {traderNamesRef.current[s.attacker_id] ?? 'ANON'} → {traderNamesRef.current[s.target_id] ?? '???'} · {s.type.toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
