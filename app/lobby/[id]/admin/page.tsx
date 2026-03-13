'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PRESETS, PRESET_CATEGORIES } from '@/lib/event-presets';
import type { EventPreset } from '@/lib/event-presets';
import { PYTH_FEEDS, MARKET_TYPES, getFeedsByMarket } from '@/lib/pyth-feeds';
import type { AssetCategory, MarketType } from '@/lib/pyth-feeds';
import PredictionAdmin from '@/components/prediction-admin';
import TutorialOverlay, { resetTutorial } from '@/components/tutorial-overlay';

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

interface RoundResult {
  round_number: number;
  round_id: string;
  status: string;
  winner_name: string | null;
  winner_return: number | null;
  eliminated_name: string | null;
  eliminated_return: number | null;
  trader_count: number;
}

interface ActiveSabotage {
  target_id: string;
  type: string;
  expires_at: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_CARDS = [
  { type: 'circuit_breaker', icon: '⚡', name: 'CIRCUIT BREAKER', desc: 'Drop asset X%' },
  { type: 'moon_shot', icon: '🌙', name: 'MOON SHOT', desc: 'Pump asset X%' },
  { type: 'volatility_spike', icon: '📈', name: 'VOL SPIKE', desc: 'Oscillate prices' },
  { type: 'dead_cat', icon: '📉', name: 'DEAD CAT', desc: 'Drop, recover, drop' },
  { type: 'margin_call', icon: '💸', name: 'MARGIN CALL', desc: 'Hit bottom traders' },
  { type: 'leverage_surge', icon: '⚡', name: 'LEVERAGE SURGE', desc: '2x all positions' },
  { type: 'wild_card', icon: '🎲', name: 'WILD CARD', desc: '$2k to random trader' },
  { type: 'reversal', icon: '🔄', name: 'REVERSAL', desc: 'Invert leaderboard' },
  { type: 'blackout', icon: '🔒', name: 'BLACKOUT ALL', desc: 'Block all trades' },
] as const;

const LEVERAGE_OPTIONS = [2, 5, 10, 20];
const SIZE_OPTIONS = [500, 1000, 2000, 5000];
// Build asset options from Pyth feed catalog, grouped by market type
const _feedsByMarket = getFeedsByMarket();
const ASSET_GROUPS: { label: string; items: { value: string; label: string }[] }[] = [
  { label: 'ALL', items: [{ value: 'ALL', label: 'ALL ASSETS' }] },
  ...MARKET_TYPES.map(mt => ({
    label: mt.label,
    items: _feedsByMarket[mt.key].map(f => ({ value: f.symbol, label: `${f.symbol} — ${f.entry.label}` })),
  })).filter(g => g.items.length > 0),
];
const MAGNITUDE_OPTIONS = [5, 10, 15, 25];
const DURATION_OPTIONS = [30, 60, 90, 120];

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const bebas = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const mono = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const sans = "var(--font-dm-sans, 'DM Sans'), sans-serif";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminPanel() {
  const { id: lobbyId } = useParams<{ id: string }>();

  // Auth — profile ID (creator) or password
  const [authToken, setAuthToken] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [autoAuthAttempted, setAutoAuthAttempted] = useState(false);
  const [tutorialKey, setTutorialKey] = useState(0);

  // Auto-authenticate if user is the lobby creator
  useEffect(() => {
    if (authenticated || autoAuthAttempted) return;
    setAutoAuthAttempted(true);
    const profileId = localStorage.getItem('bt_profile_id');
    if (!profileId) return;
    // Try auth with profile ID
    fetch(`/api/lobby/${lobbyId}/admin/status`, {
      headers: { Authorization: profileId },
    }).then(r => {
      if (r.ok) {
        setAuthToken(profileId);
        setAuthenticated(true);
      }
    }).catch(() => {});
  }, [lobbyId, authenticated, autoAuthAttempted]);

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

  // Round history
  const [roundHistory, setRoundHistory] = useState<RoundResult[]>([]);

  // Active sabotages on traders
  const [activeSabotages, setActiveSabotages] = useState<ActiveSabotage[]>([]);

  // Announcement
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementSent, setAnnouncementSent] = useState(false);

  // Credit grant
  const [grantTarget, setGrantTarget] = useState<string>('ALL');
  const [grantAmount, setGrantAmount] = useState(200);

  // Revenue
  const [revenue, setRevenue] = useState<{ predictionRake: number; entryRake: number; purchases: number; prizePool: number; prizeStatus: string } | null>(null);

  // All lobbies (for lobby switcher)
  const [allLobbies, setAllLobbies] = useState<{ id: string; name: string; status: string; player_count: number }[]>([]);

  // Refs
  const traderNamesRef = useRef<Record<string, string>>({});

  // ---------------------------------------------------------------------------
  // API helpers
  // ---------------------------------------------------------------------------

  const adminPost = useCallback(
    async (path: string, body: Record<string, unknown> = {}) => {
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/admin/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authToken },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error ?? `Request failed (${res.status})`;
          console.error(`[admin] ${path}:`, msg);
          alert(`Error: ${msg}`);
          return data;
        }
        return data;
      } catch (err) {
        console.error(`[admin] ${path}:`, err);
        alert(`Network error: ${(err as Error).message}`);
        return { error: 'Network error' };
      }
    },
    [lobbyId, authToken],
  );

  const adminGet = useCallback(
    async (path: string) => {
      const res = await fetch(`/api/lobby/${lobbyId}/admin/${path}`, {
        headers: { Authorization: authToken },
      });
      return res.json();
    },
    [lobbyId, authToken],
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
        headers: { Authorization: authToken },
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
  }, [authenticated, lobbyId, authToken]);

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

  const fetchRoundHistory = useCallback(async () => {
    if (!authenticated) return;
    try {
      const { data: allRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('lobby_id', lobbyId)
        .order('round_number', { ascending: true });
      if (!allRounds) return;

      const results: RoundResult[] = [];
      for (const r of allRounds) {
        if (r.status === 'completed' || r.status === 'frozen') {
          // Get standings for this round from leaderboard endpoint
          try {
            const res = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${r.id}`);
            const data = await res.json();
            const standings = data.standings ?? [];
            const winner = standings[0];
            const { data: elimTraders } = await supabase
              .from('traders')
              .select('name')
              .eq('lobby_id', lobbyId)
              .eq('is_eliminated', true)
              .order('eliminated_at', { ascending: false })
              .limit(1);
            results.push({
              round_number: r.round_number,
              round_id: r.id,
              status: r.status,
              winner_name: winner?.trader?.name ?? null,
              winner_return: winner?.returnPct ?? null,
              eliminated_name: elimTraders?.[0]?.name ?? null,
              eliminated_return: null,
              trader_count: standings.length,
            });
          } catch {
            results.push({
              round_number: r.round_number, round_id: r.id, status: r.status,
              winner_name: null, winner_return: null, eliminated_name: null, eliminated_return: null, trader_count: 0,
            });
          }
        }
      }
      setRoundHistory(results);
    } catch {
      // silent
    }
  }, [authenticated, lobbyId]);

  const fetchActiveSabotages = useCallback(async () => {
    if (!authenticated) return;
    try {
      const { data } = await supabase
        .from('sabotages')
        .select('target_id, type, fired_at, duration_seconds')
        .eq('lobby_id', lobbyId)
        .not('duration_seconds', 'is', null)
        .order('fired_at', { ascending: false })
        .limit(20);
      if (!data) return;
      const now = Date.now();
      const active: ActiveSabotage[] = [];
      for (const s of data) {
        if (s.fired_at && s.duration_seconds) {
          const expires = new Date(s.fired_at).getTime() + s.duration_seconds * 1000;
          if (expires > now) {
            active.push({ target_id: s.target_id, type: s.type, expires_at: expires });
          }
        }
      }
      setActiveSabotages(active);
    } catch {
      // silent
    }
  }, [authenticated, lobbyId]);

  const fetchRevenue = useCallback(async () => {
    if (!authenticated) return;
    try {
      // Prediction market rake
      const { data: markets } = await supabase
        .from('prediction_markets')
        .select('total_rake')
        .eq('lobby_id', lobbyId);
      const predictionRake = (markets ?? []).reduce((s, m) => s + (m.total_rake ?? 0), 0);

      // Entry fee pot
      const { data: pot } = await supabase
        .from('entry_fee_pots')
        .select('rake_collected, prize_pool, status')
        .eq('lobby_id', lobbyId)
        .single();

      // Purchases
      const { data: purchases } = await supabase
        .from('purchases')
        .select('amount_usd_cents')
        .eq('lobby_id', lobbyId)
        .eq('status', 'completed');
      const purchaseTotal = (purchases ?? []).reduce((s, p) => s + (p.amount_usd_cents ?? 0), 0);

      setRevenue({
        predictionRake,
        entryRake: pot?.rake_collected ?? 0,
        purchases: purchaseTotal,
        prizePool: pot?.prize_pool ?? 0,
        prizeStatus: pot?.status ?? 'none',
      });
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
    fetchActiveSabotages();
    fetchRoundHistory();
    fetchRevenue();
    // Fast poll: standings + prices (5s) — what the admin stares at
    const fastInterval = setInterval(() => {
      fetchStatus();
      fetchPrices();
      fetchActiveSabotages();
    }, 5000);
    // Medium poll: markets, sabotage feed, credits (15s)
    const medInterval = setInterval(() => {
      fetchEvents();
      fetchSabotage();
      fetchCredits();
      fetchMarket();
    }, 15000);
    // Slow poll: revenue, history (60s)
    const slowInterval = setInterval(() => {
      fetchRoundHistory();
      fetchRevenue();
    }, 60000);
    // Keep price feed alive
    fetch('/api/health').catch(() => {});
    const healthInterval = setInterval(() => { fetch('/api/health').catch(() => {}); }, 30000);
    return () => { clearInterval(fastInterval); clearInterval(medInterval); clearInterval(slowInterval); clearInterval(healthInterval); };
  }, [authenticated, fetchStatus, fetchEvents, fetchPrices, fetchSabotage, fetchCredits, fetchMarket, fetchActiveSabotages, fetchRoundHistory, fetchRevenue]);

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
    // If no round or round is completed/frozen, create via API then start
    if (!round || round.status === 'completed' || round.status === 'frozen') {
      // Create round via admin API (uses service role, no RLS issues)
      const createData = await adminPost('round/next', {
        settings: { starting_balance: 10000, duration_seconds: 600, elimination_pct: 0.25 },
      });
      if (!createData?.round) return;
      setRound(createData.round);

      // Immediately start it — no second click needed
      const startData = await adminPost('round/start', { round_id: createData.round.id });
      if (startData?.round) setRound(startData.round);
      return;
    }

    // If round exists but is pending, start it
    if (round.status === 'pending') {
      const data = await adminPost('round/start', { round_id: round.id });
      if (data?.round) setRound(data.round);
      return;
    }
  };

  const handleFreezeRound = async () => {
    if (!round) return;
    const data = await adminPost('round/freeze', { round_id: round.id });
    if (data.round) setRound(data.round);
  };

  const [showEliminateConfirm, setShowEliminateConfirm] = useState(false);
  const handleEliminate = async () => {
    const last = [...traders].filter((t) => !t.is_eliminated && t.rank !== null).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];
    if (!last) return;
    const data = await adminPost('round/eliminate', { trader_id: last.trader_id });
    if (data.trader) fetchStatus();
  };

  const [showLiquidateConfirm, setShowLiquidateConfirm] = useState(false);

  const handleNextRound = async () => {
    const data = await adminPost('round/next', {
      settings: { starting_balance: round?.starting_balance ?? 10000 },
    });
    if (data.round) setRound(data.round);
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCloseAllConfirm, setShowCloseAllConfirm] = useState(false);
  const handleResetGame = async () => {
    const data = await adminPost('reset');
    if (data.success) {
      setRound(null);
      setShowResetConfirm(false);
      fetchStatus();
    }
  };

  const [botLoading, setBotLoading] = useState(false);
  const [botResult, setBotResult] = useState<string | null>(null);
  const handleBackfillBots = async () => {
    setBotLoading(true);
    setBotResult(null);
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/backfill-bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: authToken, bot_count: 3 }),
      });
      const data = await res.json();
      if (res.ok) {
        setBotResult(`+${data.bots_added} bots: ${data.bot_names.join(', ')}`);
        fetchStatus();
      } else {
        setBotResult(data.error || 'Failed');
      }
    } catch {
      setBotResult('Network error');
    }
    setBotLoading(false);
  };

  const handleFireEvent = async () => {
    if (!selectedEvent || fireCooldown) return;
    const asset = eventAsset === 'ALL' ? 'ALL' : `${eventAsset}USDT`;
    const res = await fetch(`/api/lobby/${lobbyId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authToken },
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
      // Broadcast event alert to all dashboards
      const evName = EVENT_CARDS.find(c => c.type === selectedEvent)?.name ?? selectedEvent.replace(/_/g, ' ').toUpperCase();
      const headline = `${evName} — ${eventAsset === 'ALL' ? 'ALL ASSETS' : eventAsset} · ${eventMagnitude}% · ${eventDuration}s`;
      const ch = supabase.channel(`lobby-${lobbyId}`);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.send({ type: 'broadcast', event: 'volatility_event', payload: { type: selectedEvent, asset: asset, headline, duration_seconds: eventDuration, magnitude: eventMagnitude } });
          setTimeout(() => supabase.removeChannel(ch), 1000);
        }
      });
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
      headers: { 'Content-Type': 'application/json', Authorization: authToken },
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
      // Broadcast preset event alert to all dashboards
      const ch = supabase.channel(`lobby-${lobbyId}`);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.send({ type: 'broadcast', event: 'volatility_event', payload: { type: preset.events[0].type, asset: null, headline: preset.headline ?? preset.name, duration_seconds: maxDuration } });
          setTimeout(() => supabase.removeChannel(ch), 1000);
        }
      });
    }
  };

  const handleForceTrader = async (traderId: string) => {
    try {
      // Pick a random asset from the price feed
      const symbols = prices.map(p => p.symbol).filter(s => s.endsWith('USDT') || s.endsWith('USD'));
      const symbol = symbols.length > 0 ? symbols[Math.floor(Math.random() * symbols.length)] : 'BTCUSDT';
      await fetch(`/api/lobby/${lobbyId}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authToken },
        body: JSON.stringify({
          trader_id: traderId,
          round_id: round?.id,
          symbol,
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

  const handleAnnouncement = async () => {
    if (!announcementText.trim()) return;
    try {
      const channel = supabase.channel(`lobby-${lobbyId}`);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({
            type: 'broadcast',
            event: 'announcement',
            payload: { type: 'announcement', message: announcementText.trim(), timestamp: Date.now() },
          });
          setTimeout(() => supabase.removeChannel(channel), 1000);
        }
      });
      setAnnouncementSent(true);
      setTimeout(() => { setAnnouncementSent(false); setAnnouncementText(''); }, 2000);
    } catch {
      // silent
    }
  };

  const handleGrantCredits = async () => {
    if (grantAmount <= 0) return;
    try {
      const targetIds = grantTarget === 'ALL'
        ? traders.map(t => t.trader_id)
        : [grantTarget];
      for (const tid of targetIds) {
        const { error: rpcErr } = await supabase.rpc('increment_credits', { p_trader_id: tid, p_amount: grantAmount });
        if (rpcErr) {
          // Fallback: direct update
          const current = traders.find(t => t.trader_id === tid)?.credits ?? 0;
          await supabase.from('profiles').update({ credits: current + grantAmount }).eq('id', tid);
        }
      }
      // Broadcast credit event
      const channel = supabase.channel(`lobby-${lobbyId}`);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({
            type: 'broadcast',
            event: 'announcement',
            payload: {
              type: 'credit_grant',
              message: grantTarget === 'ALL'
                ? `ALL PLAYERS RECEIVE +${grantAmount}CR!`
                : `${traderNamesRef.current[grantTarget] ?? 'PLAYER'} RECEIVES +${grantAmount}CR!`,
              amount: grantAmount,
              timestamp: Date.now(),
            },
          });
          setTimeout(() => supabase.removeChannel(channel), 1000);
        }
      });
      fetchCredits();
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

  // Price lookup for position P&L
  const pricesMap: Record<string, number> = {};
  for (const p of prices) pricesMap[p.symbol] = p.price;

  // Helper: calc position P&L
  const calcPosPnl = (pos: TraderStatus['open_positions'][0]) => {
    const sym = pos.symbol;
    const curPrice = pricesMap[sym] ?? pricesMap[sym.replace('USDT', 'USD')] ?? pricesMap[sym.replace('USD', 'USDT')] ?? 0;
    if (curPrice <= 0 || pos.entry_price <= 0) return 0;
    return pos.direction === 'long'
      ? ((curPrice - pos.entry_price) / pos.entry_price) * pos.size * pos.leverage
      : ((pos.entry_price - curPrice) / pos.entry_price) * pos.size * pos.leverage;
  };

  // Active sabotage lookup for badges
  const sabotagesByTarget: Record<string, ActiveSabotage[]> = {};
  for (const s of activeSabotages) {
    if (!sabotagesByTarget[s.target_id]) sabotagesByTarget[s.target_id] = [];
    sabotagesByTarget[s.target_id].push(s);
  }

  // ---------------------------------------------------------------------------
  // Admin Alerts — game rule violations & notable events
  // ---------------------------------------------------------------------------
  type AdminAlert = { id: string; severity: 'critical' | 'warning' | 'info'; icon: string; message: string; traderId?: string };
  const adminAlerts: AdminAlert[] = [];
  if (round?.status === 'active') {
    for (const t of activeTraders) {
      const act = t.activity_status;
      const totalExposure = t.open_positions.reduce((s, p) => s + p.size, 0);
      const startBal = round?.starting_balance ?? 10000;
      const healthPct = Math.max(0, Math.min(100, (t.balance / startBal) * 100));
      // No positions deployed
      if (t.open_positions.length === 0) {
        const idleSec = act?.seconds_idle ?? 0;
        if (idleSec > 120) {
          adminAlerts.push({ id: `stall-${t.trader_id}`, severity: 'critical', icon: '🚫', message: `${t.name} STALLING — NO POSITIONS FOR ${Math.round(idleSec)}s`, traderId: t.trader_id });
        } else if (idleSec > 30) {
          adminAlerts.push({ id: `nopos-${t.trader_id}`, severity: 'warning', icon: '⚠️', message: `${t.name} has no positions open (${Math.round(idleSec)}s)`, traderId: t.trader_id });
        }
      }
      // Below minimum position size
      if (t.open_positions.length > 0 && totalExposure < minSize) {
        adminAlerts.push({ id: `minsize-${t.trader_id}`, severity: 'warning', icon: '📏', message: `${t.name} BELOW MIN SIZE — $${totalExposure.toLocaleString()} < $${minSize.toLocaleString()}`, traderId: t.trader_id });
      }
      // Not meeting leverage requirement
      if (t.open_positions.length > 0) {
        const underLev = t.open_positions.filter(p => p.leverage < leverage);
        if (underLev.length > 0) {
          adminAlerts.push({ id: `lev-${t.trader_id}`, severity: 'warning', icon: '⚡', message: `${t.name} BELOW LEVERAGE REQ — ${underLev.map(p => `${p.symbol.replace('USDT','').replace('USD','')} at ${p.leverage}x`).join(', ')} (need ${leverage}x)`, traderId: t.trader_id });
        }
      }
      // Force trade imminent
      if (act?.time_until_forced !== null && act?.time_until_forced !== undefined && act.time_until_forced < 30) {
        adminAlerts.push({ id: `force-${t.trader_id}`, severity: 'critical', icon: '💥', message: `${t.name} FORCE TRADE IN ${Math.round(act.time_until_forced)}s`, traderId: t.trader_id });
      }
      // Near liquidation
      if (healthPct > 0 && healthPct < 15) {
        adminAlerts.push({ id: `nearliq-${t.trader_id}`, severity: 'critical', icon: '💀', message: `${t.name} NEAR LIQUIDATION — ${healthPct.toFixed(0)}% health`, traderId: t.trader_id });
      } else if (healthPct > 0 && healthPct < 30) {
        adminAlerts.push({ id: `lowhealth-${t.trader_id}`, severity: 'warning', icon: '🩸', message: `${t.name} LOW HEALTH — ${healthPct.toFixed(0)}%`, traderId: t.trader_id });
      }
      // Zero credits — can't use weapons
      if (t.credits <= 0) {
        adminAlerts.push({ id: `nocred-${t.trader_id}`, severity: 'info', icon: '🪙', message: `${t.name} has 0 credits — no weapons available`, traderId: t.trader_id });
      }
    }
    // Global alerts
    const totalPositions = activeTraders.reduce((s, t) => s + t.open_positions.length, 0);
    if (totalPositions === 0 && activeTraders.length > 0) {
      adminAlerts.push({ id: 'no-activity', severity: 'critical', icon: '🔇', message: 'NO ONE HAS OPENED A POSITION', });
    }
    if (remainingMin === '00' && parseInt(remainingSec) < 60 && parseInt(remainingSec) > 0) {
      adminAlerts.push({ id: 'ending-soon', severity: 'info', icon: '⏱️', message: `ROUND ENDS IN ${remainingSec}s`, });
    }
  }
  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  adminAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // ---------------------------------------------------------------------------
  // Password gate
  // ---------------------------------------------------------------------------

  if (!authenticated) {
    return (
      <>
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
          {!autoAuthAttempted ? (
            <div style={{ fontFamily: mono, fontSize: 14, color: '#888' }}>AUTHENTICATING...</div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-main.png" alt="Battle Trade" style={{ width: 280, height: 'auto' }} />
              <div style={{ fontFamily: bebas, fontSize: 20, color: '#999', letterSpacing: '0.15em' }}>ADMIN LOGIN</div>
              <div style={{ fontFamily: sans, fontSize: 13, color: '#666', textAlign: 'center', maxWidth: 320 }}>
                Enter the admin password for this lobby.
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!passwordInput.trim()) return;
                const res = await fetch(`/api/lobby/${lobbyId}/admin/status`, {
                  headers: { Authorization: passwordInput.trim() },
                });
                if (res.ok) {
                  setAuthToken(passwordInput.trim());
                  setAuthenticated(true);
                } else {
                  alert('Invalid password');
                }
              }} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Admin password"
                  style={{ height: 44, background: '#111', border: '1px solid #333', color: '#FFF', fontFamily: mono, fontSize: 14, padding: '0 12px', textAlign: 'center' }}
                  autoFocus
                />
                <button type="submit" style={{ height: 44, background: '#F5A0D0', color: '#000', border: 'none', fontFamily: bebas, fontSize: 18, letterSpacing: '0.08em', cursor: 'pointer' }}>
                  ENTER
                </button>
              </form>
              <a href="/dashboard" style={{ fontFamily: sans, fontSize: 12, color: '#555', textDecoration: 'none', marginTop: 8 }}>
                back to dashboard
              </a>
            </>
          )}
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
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="Battle Trade" style={{ height: 28, width: 'auto' }} />
            <div style={{ width: 1, height: 32, background: '#1A1A1A' }} />
            <div style={{ fontFamily: bebas, fontSize: 20, color: '#999999', letterSpacing: '0.1em' }}>MISSION CONTROL</div>
          </a>
          <a href="/dashboard" style={{ fontFamily: sans, fontSize: 12, color: '#888', textDecoration: 'none', padding: '4px 12px', border: '1px solid #1A1A1A', cursor: 'pointer' }}>DASHBOARD</a>
          <a href="/create" style={{ fontFamily: sans, fontSize: 12, color: '#888', textDecoration: 'none', padding: '4px 12px', border: '1px solid #1A1A1A', cursor: 'pointer' }}>+ NEW BATTLE</a>
          <button onClick={() => { resetTutorial('admin', lobbyId); setTutorialKey(k => k + 1); }} style={{ fontFamily: mono, fontSize: 10, color: '#555', background: 'transparent', border: '1px solid #222', padding: '4px 10px', cursor: 'pointer' }}>? GUIDE</button>
          <div style={{ flex: 1 }} />

          {/* Live prices — top assets */}
          {prices.filter((p) => ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSD', 'XRPUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'DOGEUSDT', 'XRPUSDT'].includes(p.symbol)).slice(0, 5).map((p) => {
            const sym = p.symbol.replace('USDT', '').replace('USD', '');
            const up = p.prev !== undefined ? p.price >= p.prev : true;
            return (
              <div key={p.symbol} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: bebas, fontSize: 14, color: '#999999' }}>{sym}</span>
                <span style={{ fontFamily: mono, fontSize: 16, color: '#FFF', letterSpacing: '-0.02em' }}>
                  ${p.price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <span style={{ fontFamily: mono, fontSize: 12, color: up ? '#00FF88' : '#FF3333' }}>{up ? '▲' : '▼'}</span>
              </div>
            );
          })}

          <div style={{ width: 1, height: 32, background: '#1A1A1A' }} />
          <div style={{ fontFamily: mono, fontSize: 11, color: '#999999' }}>
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
        <div className="bt-admin-grid" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ============================================================= */}
          {/* LEFT — ROUND COMMAND + HEALTH — 400px                           */}
          {/* ============================================================= */}
          <div style={{ width: 380, flexShrink: 0, borderRight: '1px solid #1A1A1A', padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* BIG ACTION BUTTONS — ALWAYS FIRST, ALWAYS VISIBLE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={handleStartRound}
                disabled={round?.status === 'active'}
                style={{
                  width: '100%', height: 52,
                  background: round?.status === 'active' ? '#111111' : '#00FF88',
                  color: '#0A0A0A', border: 'none',
                  fontFamily: bebas, fontSize: 26, letterSpacing: '0.08em',
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
                  width: '100%', height: 36,
                  background: round?.status === 'active' ? '#F5A0D0' : '#111111',
                  color: '#0A0A0A', border: 'none',
                  fontFamily: bebas, fontSize: 18, letterSpacing: '0.08em',
                  cursor: round?.status !== 'active' ? 'not-allowed' : 'pointer',
                  opacity: round?.status !== 'active' ? 0.2 : 1,
                }}
              >
                FREEZE SCORES
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                {!showEliminateConfirm ? (
                <button
                  onClick={() => setShowEliminateConfirm(true)}
                  disabled={!round || round.status !== 'frozen'}
                  style={{
                    flex: 1, height: 44,
                    background: round?.status === 'frozen' ? '#FF3333' : '#111111',
                    color: '#FFF', border: 'none',
                    fontFamily: bebas, fontSize: 18, letterSpacing: '0.08em',
                    cursor: round?.status !== 'frozen' ? 'not-allowed' : 'pointer',
                    opacity: round?.status !== 'frozen' ? 0.2 : 1,
                    textShadow: round?.status === 'frozen' ? '0 0 10px rgba(255,51,51,0.4)' : 'none',
                  }}
                >
                  ELIMINATE
                </button>
                ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: 8, border: '2px solid #FF3333', background: 'rgba(255,51,51,0.05)' }}>
                  <div style={{ fontFamily: bebas, fontSize: 14, color: '#FF3333', textAlign: 'center', letterSpacing: '0.05em' }}>
                    ELIMINATE {lastPlace?.name?.toUpperCase() ?? 'LAST PLACE'}?
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setShowEliminateConfirm(false)} style={{ flex: 1, height: 32, background: '#1A1A1A', color: '#888', border: 'none', fontFamily: bebas, fontSize: 12, letterSpacing: '0.05em', cursor: 'pointer' }}>CANCEL</button>
                    <button onClick={() => { setShowEliminateConfirm(false); handleEliminate(); }} style={{ flex: 1, height: 32, background: '#FF3333', color: '#FFF', border: 'none', fontFamily: bebas, fontSize: 12, letterSpacing: '0.05em', cursor: 'pointer' }}>CONFIRM</button>
                  </div>
                </div>
                )}
                <button
                  onClick={handleNextRound}
                  disabled={!round || (round.status !== 'completed' && round.status !== 'frozen')}
                  style={{
                    flex: 1, height: 44,
                    background: (round?.status === 'completed' || round?.status === 'frozen') ? '#222222' : '#111111',
                    color: '#888888', border: 'none',
                    fontFamily: bebas, fontSize: 18, letterSpacing: '0.08em',
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

            {/* Add Bots */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={handleBackfillBots}
                disabled={botLoading}
                style={{
                  flex: 1, height: 36,
                  background: '#1A1A1A', color: '#F5A0D0',
                  border: '1px solid #333', fontFamily: bebas,
                  fontSize: 14, letterSpacing: '0.08em',
                  cursor: botLoading ? 'not-allowed' : 'pointer',
                  opacity: botLoading ? 0.5 : 1,
                }}
              >
                {botLoading ? 'ADDING...' : '+ ADD 3 BOTS'}
              </button>
              {botResult && (
                <span style={{ fontFamily: sans, fontSize: 10, color: botResult.startsWith('+') ? '#4ADE80' : '#FF3333' }}>
                  {botResult}
                </span>
              )}
            </div>

            {/* Round display — compact inline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
              <div style={{ fontFamily: bebas, fontSize: 28, color: '#FFF', lineHeight: 1, whiteSpace: 'nowrap' }}>
                R{round?.round_number ?? '—'} <span style={{ color: '#555', fontSize: 14 }}>/ {totalRounds}</span>
              </div>
              <div style={{ padding: '1px 8px', border: `1px solid ${statusColor}` }} className={round?.status === 'active' ? 'live-glow' : ''}>
                <span style={{ fontFamily: bebas, fontSize: 11, color: statusColor, letterSpacing: '0.1em' }}>{round?.status?.toUpperCase() ?? 'NONE'}</span>
              </div>
              <span className={timerDanger ? 'danger-pulse' : ''} style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: timerDanger ? '#FF3333' : '#FFF', letterSpacing: '-0.02em' }}>
                {round?.status === 'active' ? `${remainingMin}:${remainingSec}` : '--:--'}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: mono, fontSize: 14, color: '#F5A0D0', fontWeight: 700 }}>{leverage}X</div>
                  <div style={{ fontFamily: sans, fontSize: 7, color: '#666', textTransform: 'uppercase' }}>LEV</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: mono, fontSize: 14, color: '#F5A0D0', fontWeight: 700 }}>${(minSize / 1000).toFixed(0)}K</div>
                  <div style={{ fontFamily: sans, fontSize: 7, color: '#666', textTransform: 'uppercase' }}>MIN</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: mono, fontSize: 14, color: '#888', fontWeight: 700 }}>{activeTraders.length}</div>
                  <div style={{ fontFamily: sans, fontSize: 7, color: '#666', textTransform: 'uppercase' }}>ALIVE</div>
                </div>
              </div>
            </div>

            {/* ── HEALTH BAR STANDINGS ── */}
            <div style={{ borderTop: '1px solid #1A1A1A', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: bebas, fontSize: 16, color: '#999', letterSpacing: '0.1em' }}>HEALTH + POSITIONS</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: '#888' }}>{activeTraders.length} ALIVE / {traders.length} TOTAL</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {traders
                  .filter(t => !t.is_eliminated && t.rank !== null)
                  .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
                  .map(t => {
                    const startBal = round?.starting_balance ?? 10000;
                    const healthPct = Math.max(0, Math.min(100, (t.balance / startBal) * 100));
                    const isKO = healthPct <= 0 || t.return_pct <= -99;
                    const barColor = isKO ? '#FF3333' : healthPct > 60 ? '#00FF88' : healthPct > 30 ? '#FFD700' : '#FF3333';
                    const act = t.activity_status;
                    const dotColor = act?.status === 'active' ? '#00FF88' : act?.status === 'warning' ? '#F5A0D0' : act?.status === 'critical' ? '#FF3333' : '#333';
                    const isFirst = t.rank === 1;
                    const traderSabs = sabotagesByTarget[t.trader_id] ?? [];
                    return (
                      <div key={t.trader_id} style={{ padding: '6px 8px', background: isFirst ? 'rgba(245,160,208,0.04)' : '#0D0D0D', borderLeft: `3px solid ${isFirst ? '#F5A0D0' : 'transparent'}` }}>
                        {/* Row 1: Name + P&L + Activity */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                          <span style={{ fontFamily: bebas, fontSize: 16, color: isFirst ? '#F5A0D0' : t.rank! <= 3 ? '#FFF' : '#555', width: 22 }}>#{t.rank}</span>
                          <div style={{ width: 6, height: 6, background: dotColor, flexShrink: 0 }} />
                          <span style={{ fontFamily: bebas, fontSize: 14, color: '#FFF', letterSpacing: '0.03em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                          {traderSabs.map((s, i) => {
                            const remaining = Math.max(0, Math.floor((s.expires_at - Date.now()) / 1000));
                            const label = s.type.replace(/_/g, ' ').toUpperCase().slice(0, 5);
                            return (
                              <span key={i} style={{ fontFamily: mono, fontSize: 7, color: '#FF3333', padding: '0px 3px', border: '1px solid #FF3333', background: 'rgba(255,51,51,0.1)', animation: 'pulse 1s infinite', whiteSpace: 'nowrap' }}>
                                {label} {remaining}s
                              </span>
                            );
                          })}
                          <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: t.return_pct >= 0 ? '#00FF88' : '#FF3333', textShadow: `0 0 8px ${t.return_pct >= 0 ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,51,0.3)'}` }}>
                            {t.return_pct >= 0 ? '+' : ''}{t.return_pct.toFixed(1)}%
                          </span>
                        </div>

                        {/* Row 2: Open positions */}
                        {t.open_positions.length > 0 ? (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 3 }}>
                            {t.open_positions.map(pos => {
                              const isLong = pos.direction === 'long';
                              const dc = isLong ? '#00FF88' : '#FF3333';
                              const sym = pos.symbol.replace('USDT', '').replace('USD', '');
                              const pnl = calcPosPnl(pos);
                              const pnlPct = pos.size > 0 ? (pnl / pos.size) * 100 : 0;
                              return (
                                <div key={pos.id} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 4px', background: `${dc}0A`, border: `1px solid ${dc}33` }}>
                                  <span style={{ fontFamily: bebas, fontSize: 9, color: dc }}>{isLong ? 'L' : 'S'}</span>
                                  <span style={{ fontFamily: mono, fontSize: 9, color: '#FFF' }}>{sym}</span>
                                  <span style={{ fontFamily: mono, fontSize: 8, color: '#999' }}>{pos.leverage}x</span>
                                  <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 700, color: pnl >= 0 ? '#00FF88' : '#FF3333' }}>
                                    {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(0)}%
                                  </span>
                                </div>
                              );
                            })}
                            <button onClick={async (e) => { e.stopPropagation(); const res = await adminPost('close-all', { trader_id: t.trader_id }); if (res) console.log(`Closed ${res.closed} positions for ${t.name}`, 'success'); }} style={{ fontFamily: bebas, fontSize: 8, color: '#FF8C00', background: 'transparent', border: '1px solid #FF8C0066', padding: '0px 4px', cursor: 'pointer', alignSelf: 'center' }}>CLOSE ALL</button>
                            <span style={{ fontFamily: mono, fontSize: 8, color: '#999', alignSelf: 'center' }}>{t.credits}CR</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontFamily: mono, fontSize: 9, color: '#666', fontStyle: 'italic' }}>NO POSITIONS</span>
                            <span style={{ fontFamily: mono, fontSize: 8, color: '#999' }}>{t.credits}CR</span>
                            {(act?.status === 'warning' || act?.status === 'critical') && (
                              <button onClick={() => handleForceTrader(t.trader_id)} style={{ fontFamily: bebas, fontSize: 9, color: '#FF3333', background: 'transparent', border: '1px solid #FF3333', padding: '1px 5px', cursor: 'pointer', marginLeft: 'auto' }}>
                                FORCE
                              </button>
                            )}
                          </div>
                        )}

                        {/* Row 3: Health bar */}
                        <div style={{ width: '100%', height: 5, background: '#1A1A1A', position: 'relative', overflow: 'hidden' }}>
                          <div style={{
                            width: `${healthPct}%`, height: '100%',
                            background: isKO ? '#FF3333' : `linear-gradient(90deg, ${barColor}, ${healthPct > 60 ? '#00CC66' : healthPct > 30 ? '#CC9900' : '#CC0000'})`,
                            boxShadow: isKO ? 'none' : `0 0 6px ${barColor}44`,
                            transition: 'width 600ms ease',
                          }} />
                        </div>

                        {/* Idle warning */}
                        {act?.status === 'critical' && (
                          <div style={{ fontFamily: mono, fontSize: 8, color: '#FF3333', marginTop: 2, animation: 'pulse 1s infinite' }}>
                            IDLE {Math.round(act.seconds_idle)}s{act.time_until_forced !== null ? ` — FORCED IN ${Math.round(act.time_until_forced)}s` : ''}
                          </div>
                        )}
                        {act?.status === 'warning' && (
                          <div style={{ fontFamily: mono, fontSize: 8, color: '#F5A0D0', marginTop: 2 }}>
                            IDLE {Math.round(act.seconds_idle)}s
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* ── ELIMINATED ── */}
            {eliminatedTraders.length > 0 && (
              <div style={{ borderTop: '1px solid #1A1A1A', paddingTop: 6 }}>
                <div style={{ fontFamily: sans, fontSize: 8, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>ELIMINATED</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {eliminatedTraders.map(t => (
                    <div key={t.trader_id} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 4px', border: '1px solid #1A1A1A', background: '#0D0D0D' }}>
                      <span style={{ fontFamily: bebas, fontSize: 8, color: '#FF3333' }}>KO</span>
                      <span style={{ fontFamily: bebas, fontSize: 10, color: '#666', textDecoration: 'line-through' }}>{t.name}</span>
                      <span style={{ fontFamily: mono, fontSize: 8, color: '#FF3333' }}>{t.return_pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SETTINGS — compact row ── */}
            <div style={{ borderTop: '1px solid #1A1A1A', paddingTop: 8, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: sans, fontSize: 8, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>LEVERAGE</div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {LEVERAGE_OPTIONS.map((lev) => (
                    <button key={lev} onClick={() => setLeverage(lev)} style={{ flex: 1, height: 28, background: leverage === lev ? '#F5A0D0' : 'transparent', color: leverage === lev ? '#0A0A0A' : '#555', border: `1px solid ${leverage === lev ? '#F5A0D0' : '#222'}`, fontFamily: mono, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {lev}X
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: sans, fontSize: 8, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>MIN SIZE</div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {SIZE_OPTIONS.map((sz) => (
                    <button key={sz} onClick={() => setMinSize(sz)} style={{ flex: 1, height: 28, background: minSize === sz ? '#F5A0D0' : 'transparent', color: minSize === sz ? '#0A0A0A' : '#555', border: `1px solid ${minSize === sz ? '#F5A0D0' : '#222'}`, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                      ${sz >= 1000 ? `${sz / 1000}K` : sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── CLOSE ALL + LIQUIDATION + RESET — compact row ── */}
            <div style={{ borderTop: '1px solid #1A1A1A', paddingTop: 8, display: 'flex', gap: 6 }}>
              {!showCloseAllConfirm ? (
                <button onClick={() => setShowCloseAllConfirm(true)} style={{ flex: 1, height: 28, fontFamily: bebas, fontSize: 11, color: '#FF8C00', background: 'transparent', border: '1px solid #FF8C00', cursor: 'pointer', letterSpacing: '0.05em' }}>
                  CLOSE ALL POSITIONS
                </button>
              ) : (
                <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                  <button onClick={() => setShowCloseAllConfirm(false)} style={{ flex: 1, height: 28, background: '#1A1A1A', color: '#888', border: 'none', fontFamily: bebas, fontSize: 10, cursor: 'pointer' }}>CANCEL</button>
                  <button onClick={async () => { setShowCloseAllConfirm(false); const res = await adminPost('close-all'); if (res) { console.log(`Closed ${res.closed ?? 0} positions (total P&L: $${(res.total_pnl ?? 0).toFixed(2)})`, res.closed > 0 ? 'success' : 'info'); } }} style={{ flex: 1, height: 28, background: '#FF8C00', color: '#FFF', border: 'none', fontFamily: bebas, fontSize: 10, cursor: 'pointer' }}>CONFIRM</button>
                </div>
              )}
              {!showLiquidateConfirm ? (
                <button onClick={() => setShowLiquidateConfirm(true)} style={{ flex: 1, height: 28, fontFamily: bebas, fontSize: 11, color: '#FF3333', background: 'transparent', border: '1px solid #FF3333', cursor: 'pointer', letterSpacing: '0.05em' }}>
                  LIQUIDATION SWEEP
                </button>
              ) : (
                <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                  <button onClick={() => setShowLiquidateConfirm(false)} style={{ flex: 1, height: 28, background: '#1A1A1A', color: '#888', border: 'none', fontFamily: bebas, fontSize: 10, cursor: 'pointer' }}>CANCEL</button>
                  <button onClick={async () => { setShowLiquidateConfirm(false); const res = await adminPost('liquidate'); if (res) { const count = res.liquidated ?? 0; console.log(count > 0 ? `Liquidated ${count} position(s)` : 'No positions to liquidate', count > 0 ? 'success' : 'info'); } }} style={{ flex: 1, height: 28, background: '#FF3333', color: '#FFF', border: 'none', fontFamily: bebas, fontSize: 10, cursor: 'pointer' }}>CONFIRM</button>
                </div>
              )}
              {!showResetConfirm ? (
                <button onClick={() => setShowResetConfirm(true)} style={{ flex: 1, height: 28, background: 'transparent', border: '1px solid #333', color: '#444', fontFamily: bebas, fontSize: 11, letterSpacing: '0.05em', cursor: 'pointer' }}>
                  RESET GAME
                </button>
              ) : (
                <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                  <button onClick={() => setShowResetConfirm(false)} style={{ flex: 1, height: 28, background: '#1A1A1A', color: '#888', border: 'none', fontFamily: bebas, fontSize: 10, cursor: 'pointer' }}>CANCEL</button>
                  <button onClick={handleResetGame} style={{ flex: 1, height: 28, background: '#FF3333', color: '#FFF', border: 'none', fontFamily: bebas, fontSize: 10, cursor: 'pointer' }}>CONFIRM</button>
                </div>
              )}
            </div>
          </div>

          {/* ============================================================= */}
          {/* CENTER — DJ BOOTH                                              */}
          {/* ============================================================= */}
          <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* TradingView Chart */}
            <div style={{ border: '1px solid #1A1A1A', background: '#0A0A0A', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', borderBottom: '1px solid #1A1A1A', background: '#0D0D0D' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: bebas, fontSize: 14, color: '#888', letterSpacing: '0.08em' }}>CHART</span>
                  <select
                    value={eventAsset}
                    onChange={(e) => setEventAsset(e.target.value)}
                    style={{
                      height: 28, background: '#111', color: '#F5A0D0',
                      border: '1px solid #F5A0D0', borderRadius: 0,
                      fontFamily: mono, fontSize: 11, fontWeight: 700,
                      padding: '0 20px 0 6px', cursor: 'pointer', outline: 'none',
                      appearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23F5A0D0' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 6px center',
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
                <span style={{ fontFamily: mono, fontSize: 11, color: '#F5A0D0' }}>
                  ${(prices.find(p => p.symbol === `${eventAsset}USDT` || p.symbol === `${eventAsset}USD`)?.price ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ height: 380 }}>
                <AdminTradingViewChart symbol={eventAsset} />
              </div>
            </div>

            {/* QUICK-FIRE PRESETS — always visible */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Category bar + label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: bebas, fontSize: 18, color: '#F5A0D0', letterSpacing: '0.08em', flexShrink: 0 }}>PRESETS</span>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flex: 1 }}>
                  {PRESET_CATEGORIES.map((cat) => (
                    <button key={cat} onClick={() => setPresetCategory(cat)} style={{ padding: '4px 12px', background: presetCategory === cat ? '#F5A0D0' : 'transparent', color: presetCategory === cat ? '#0A0A0A' : '#555555', border: `1px solid ${presetCategory === cat ? '#F5A0D0' : '#222222'}`, fontFamily: bebas, fontSize: 13, letterSpacing: '0.06em', cursor: 'pointer' }}>
                      {cat.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preset grid — compact, always showing */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {PRESETS.filter(p => p.category === presetCategory).map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleFirePreset(preset)}
                    disabled={presetCooldown}
                    className={presetCooldown ? '' : 'fire-glow'}
                    style={{
                      background: '#111111', border: '1px solid #1A1A1A', borderTop: '2px solid #F5A0D060',
                      padding: '8px 6px', cursor: presetCooldown ? 'not-allowed' : 'pointer',
                      textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      opacity: presetCooldown ? 0.4 : 1,
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={(e) => { if (!presetCooldown) { e.currentTarget.style.borderColor = '#F5A0D0'; e.currentTarget.style.background = 'rgba(245,160,208,0.06)'; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#1A1A1A'; e.currentTarget.style.background = '#111111'; }}
                  >
                    <span style={{ fontSize: 22 }}>{preset.emoji}</span>
                    <span style={{ fontFamily: bebas, fontSize: 11, color: '#FFF', letterSpacing: '0.04em', lineHeight: 1.1 }}>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* MANUAL EVENTS — collapsible */}
            <div>
              <button onClick={() => setDjTab(djTab === 'events' ? 'presets' : 'events')} style={{ width: '100%', height: 36, background: djTab === 'events' ? 'rgba(245,160,208,0.06)' : 'transparent', color: djTab === 'events' ? '#F5A0D0' : '#555555', border: `1px solid ${djTab === 'events' ? '#F5A0D0' : '#1A1A1A'}`, fontFamily: bebas, fontSize: 14, letterSpacing: '0.06em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                MANUAL EVENTS <span style={{ fontSize: 10, transition: 'transform 150ms', transform: djTab === 'events' ? 'rotate(180deg)' : 'none' }}>▼</span>
              </button>
            </div>
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
                      <span style={{ fontFamily: sans, fontSize: 10, color: '#999999' }}>{card.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Config panel */}
                {selectedEvent && (
                  <div style={{ border: '1px solid #1A1A1A', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 200 }}>
                        <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>ASSET</div>
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
                        <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>MAGNITUDE</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {MAGNITUDE_OPTIONS.map((m) => (
                            <button key={m} onClick={() => setEventMagnitude(m)} style={{ padding: '8px 16px', background: eventMagnitude === m ? '#F5A0D0' : 'transparent', color: eventMagnitude === m ? '#0A0A0A' : '#555555', border: `1px solid ${eventMagnitude === m ? '#F5A0D0' : '#222222'}`, fontFamily: mono, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              {m}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>DURATION</div>
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
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>EVENT LOG</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recentEvents.length === 0 && (
                  <div style={{ fontFamily: mono, fontSize: 12, color: '#888888' }}>No events fired yet</div>
                )}
                {recentEvents.map((ev) => {
                  const time = ev.fired_at ? new Date(ev.fired_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
                  const name = EVENT_CARDS.find((c) => c.type === ev.type)?.name ?? ev.type.toUpperCase();
                  const asset = ev.asset ? ev.asset.replace('USDT', '') : 'ALL';
                  return (
                    <div key={ev.id} style={{ fontFamily: mono, fontSize: 12, color: '#999999', display: 'flex', gap: 8 }}>
                      <span style={{ color: '#888888' }}>{time}</span>
                      <span style={{ color: '#888888' }}>{name}</span>
                      <span>{asset}</span>
                      <span style={{ color: '#888888' }}>{ev.duration_seconds ?? 60}s</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* RIGHT — WAR ROOM — 440px                                       */}
          {/* ============================================================= */}
          <div style={{ width: 440, flexShrink: 0, borderLeft: '1px solid #1A1A1A', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* ── LEADER HERO ── */}
            {activeTraders.length > 0 && (() => {
              const leader = activeTraders.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0];
              return (
                <div style={{ padding: '16px 20px', borderBottom: '2px solid #1A1A1A', background: 'linear-gradient(135deg, rgba(245,160,208,0.06), transparent)' }}>
                  <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>CURRENT LEADER</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ fontFamily: bebas, fontSize: 36, color: '#F5A0D0', letterSpacing: '0.03em' }}>{leader.name}</span>
                    <span style={{ fontFamily: mono, fontSize: 24, fontWeight: 700, color: leader.return_pct >= 0 ? '#00FF88' : '#FF3333', textShadow: `0 0 12px ${leader.return_pct >= 0 ? 'rgba(0,255,136,0.5)' : 'rgba(255,51,51,0.5)'}` }}>
                      {leader.return_pct >= 0 ? '+' : ''}{leader.return_pct.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 12, color: '#999', marginTop: 2 }}>
                    ${Math.round(leader.balance).toLocaleString()} · {leader.open_positions.length} OPEN · {leader.credits}CR
                  </div>
                </div>
              );
            })()}

            {/* ── ROUND HISTORY / SCOREBOARD ── */}
            {roundHistory.length > 0 && (
              <div style={{ padding: '10px 20px', borderBottom: '1px solid #1A1A1A' }}>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>ROUND HISTORY</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {roundHistory.map(r => (
                    <div key={r.round_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: '#0D0D0D', border: '1px solid #111' }}>
                      <span style={{ fontFamily: bebas, fontSize: 16, color: '#999', width: 24 }}>R{r.round_number}</span>
                      {r.winner_name && (
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: bebas, fontSize: 14, color: '#F5A0D0' }}>{r.winner_name}</span>
                            <span style={{ fontFamily: mono, fontSize: 12, color: '#00FF88', fontWeight: 700 }}>
                              {r.winner_return !== null ? `+${r.winner_return.toFixed(1)}%` : ''}
                            </span>
                          </div>
                          {r.eliminated_name && (
                            <div style={{ fontFamily: mono, fontSize: 9, color: '#FF3333' }}>
                              KO: {r.eliminated_name}
                            </div>
                          )}
                        </div>
                      )}
                      <span style={{ fontFamily: mono, fontSize: 9, color: '#666' }}>{r.trader_count} traders</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ANNOUNCEMENT PUSH ── */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #1A1A1A' }}>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>BROADCAST ANNOUNCEMENT</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={announcementText}
                  onChange={e => setAnnouncementText(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleAnnouncement()}
                  placeholder="MESSAGE TO ALL SCREENS..."
                  style={{ flex: 1, height: 36, background: '#111', border: '1px solid #1A1A1A', color: '#FFF', fontFamily: mono, fontSize: 12, padding: '0 10px', outline: 'none' }}
                />
                <button
                  onClick={handleAnnouncement}
                  disabled={!announcementText.trim()}
                  style={{ height: 36, padding: '0 16px', background: announcementSent ? '#00FF88' : announcementText.trim() ? '#F5A0D0' : '#1A1A1A', color: announcementSent ? '#0A0A0A' : '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: 14, letterSpacing: '0.05em', cursor: announcementText.trim() ? 'pointer' : 'not-allowed' }}
                >
                  {announcementSent ? 'SENT!' : 'PUSH'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {['ROUND STARTS IN 60 SECONDS', 'HALFTIME', 'LAST 2 MINUTES', 'SUDDEN DEATH'].map(q => (
                  <button key={q} onClick={() => { setAnnouncementText(q); }} style={{ padding: '2px 8px', background: 'transparent', border: '1px solid #1A1A1A', fontFamily: mono, fontSize: 8, color: '#999', cursor: 'pointer' }}>{q}</button>
                ))}
              </div>
            </div>

            {/* ── BROADCAST SWITCHER ── */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #1A1A1A' }}>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>BROADCAST VIEWS</div>

              {/* Thumbnail grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                {[
                  { label: 'OBS OVERLAY', path: `/lobby/${lobbyId}/broadcast`, color: '#F5A0D0' },
                  { label: 'SPECTATE', path: `/lobby/${lobbyId}/spectate`, color: '#00DC82' },
                  { label: 'CAST', path: `/lobby/${lobbyId}/cast`, color: '#7B93DB' },
                  { label: 'LEADERBOARD', path: `/lobby/${lobbyId}/leaderboard`, color: '#FFF' },
                  { label: 'STAGE', path: `/lobby/${lobbyId}/stage`, color: '#FF4466' },
                  { label: 'GLOBAL LB', path: '/leaderboard', color: '#FFD700' },
                ].map(view => (
                  <div key={view.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div
                      onClick={() => window.open(view.path, '_blank')}
                      style={{
                        position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 4,
                        border: `1px solid ${view.color}30`, overflow: 'hidden', cursor: 'pointer',
                        background: '#050505',
                      }}
                    >
                      <iframe
                        src={view.path}
                        title={view.label}
                        style={{
                          position: 'absolute', top: 0, left: 0, width: '400%', height: '400%',
                          transform: 'scale(0.25)', transformOrigin: 'top left',
                          border: 'none', pointerEvents: 'none',
                        }}
                        tabIndex={-1}
                        loading="lazy"
                        sandbox="allow-scripts allow-same-origin"
                      />
                      <div style={{
                        position: 'absolute', inset: 0, cursor: 'pointer',
                        background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.6))',
                      }} />
                      <div style={{
                        position: 'absolute', top: 3, left: 3, width: 5, height: 5,
                        borderRadius: '50%', background: view.color,
                      }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontFamily: bebas, fontSize: 10, color: view.color, letterSpacing: '0.05em', flex: 1 }}>{view.label}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(`${window.location.origin}${view.path}`);
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#555', fontFamily: mono, fontSize: 9, cursor: 'pointer', padding: 0 }}
                        title="Copy link"
                      >⎘</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Share links */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/register/${lobbyId}`;
                    navigator.clipboard.writeText(url);
                  }}
                  style={{ flex: 1, height: 28, background: '#F5A0D0', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: 12, letterSpacing: '0.05em', cursor: 'pointer' }}
                >
                  COPY JOIN LINK
                </button>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/lobby/${lobbyId}/spectate`;
                    navigator.clipboard.writeText(url);
                  }}
                  style={{ flex: 1, height: 28, background: 'transparent', color: '#00DC82', border: '1px solid #00DC82', fontFamily: bebas, fontSize: 12, letterSpacing: '0.05em', cursor: 'pointer' }}
                >
                  COPY SPECTATE LINK
                </button>
              </div>
            </div>

            {/* ── CREDIT GRANT ── */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #1A1A1A' }}>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>GRANT CREDITS</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  value={grantTarget}
                  onChange={e => setGrantTarget(e.target.value)}
                  style={{ height: 32, background: '#111', border: '1px solid #1A1A1A', color: '#FFF', fontFamily: mono, fontSize: 11, padding: '0 8px', outline: 'none', flex: 1, appearance: 'none' }}
                >
                  <option value="ALL">ALL PLAYERS</option>
                  {traders.map(t => <option key={t.trader_id} value={t.trader_id}>{t.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[100, 200, 500].map(amt => (
                    <button key={amt} onClick={() => setGrantAmount(amt)} style={{ height: 32, padding: '0 8px', background: grantAmount === amt ? '#F5A0D0' : 'transparent', color: grantAmount === amt ? '#0A0A0A' : '#555', border: `1px solid ${grantAmount === amt ? '#F5A0D0' : '#1A1A1A'}`, fontFamily: mono, fontSize: 11, cursor: 'pointer' }}>
                      {amt}
                    </button>
                  ))}
                </div>
                <button onClick={handleGrantCredits} style={{ height: 32, padding: '0 12px', background: '#00FF88', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: 13, cursor: 'pointer' }}>
                  +{grantAmount}CR
                </button>
              </div>
            </div>

            {/* ── ALERTS PANEL ── */}
            {adminAlerts.length > 0 && (
              <div style={{ padding: '10px 20px', borderBottom: '1px solid #1A1A1A' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ALERTS</div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: adminAlerts.filter(a => a.severity === 'critical').length > 0 ? '#FF3333' : '#888', fontWeight: 700 }}>
                    {adminAlerts.filter(a => a.severity === 'critical').length} CRITICAL · {adminAlerts.filter(a => a.severity === 'warning').length} WARN
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
                  {adminAlerts.map(alert => {
                    const borderColor = alert.severity === 'critical' ? '#FF3333' : alert.severity === 'warning' ? '#FFD700' : '#555';
                    const bgColor = alert.severity === 'critical' ? 'rgba(255,51,51,0.08)' : alert.severity === 'warning' ? 'rgba(255,215,0,0.05)' : 'rgba(255,255,255,0.02)';
                    return (
                      <div key={alert.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: bgColor, borderLeft: `3px solid ${borderColor}`, animation: alert.severity === 'critical' ? 'pulse 1.5s infinite' : 'none' }}>
                        <span style={{ fontSize: 12, flexShrink: 0 }}>{alert.icon}</span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: alert.severity === 'critical' ? '#FF3333' : alert.severity === 'warning' ? '#FFD700' : '#999', flex: 1 }}>
                          {alert.message}
                        </span>
                        {alert.traderId && (
                          <button onClick={() => handleForceTrader(alert.traderId!)} style={{ fontFamily: bebas, fontSize: 9, color: '#FF3333', background: 'transparent', border: '1px solid #FF333366', padding: '1px 5px', cursor: 'pointer', flexShrink: 0 }}>
                            FORCE
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── ALL POSITIONS SUMMARY ── */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #1A1A1A' }}>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>ALL OPEN POSITIONS</div>
              {(() => {
                const allPositions = activeTraders.flatMap(t => t.open_positions.map(p => ({ ...p, traderName: t.name, traderId: t.trader_id })));
                if (allPositions.length === 0) return <div style={{ fontFamily: mono, fontSize: 11, color: '#666' }}>No positions open</div>;

                const byAsset: Record<string, { longs: number; shorts: number; totalSize: number; totalPnl: number; traders: string[] }> = {};
                for (const p of allPositions) {
                  const sym = p.symbol.replace('USDT', '').replace('USD', '');
                  if (!byAsset[sym]) byAsset[sym] = { longs: 0, shorts: 0, totalSize: 0, totalPnl: 0, traders: [] };
                  if (p.direction === 'long') byAsset[sym].longs++;
                  else byAsset[sym].shorts++;
                  byAsset[sym].totalSize += p.size;
                  byAsset[sym].totalPnl += calcPosPnl(p);
                  if (!byAsset[sym].traders.includes(p.traderName)) byAsset[sym].traders.push(p.traderName);
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {Object.entries(byAsset).sort((a, b) => b[1].totalSize - a[1].totalSize).map(([sym, data]) => {
                      const total = data.longs + data.shorts;
                      const longPct = total > 0 ? (data.longs / total) * 100 : 50;
                      return (
                        <div key={sym} style={{ padding: '4px 8px', background: '#0D0D0D', border: '1px solid #111' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: bebas, fontSize: 14, color: '#FFF' }}>{sym}</span>
                              <span style={{ fontFamily: mono, fontSize: 10, color: '#999' }}>${data.totalSize.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: mono, fontSize: 10, color: '#00FF88' }}>{data.longs}L</span>
                              <span style={{ fontFamily: mono, fontSize: 10, color: '#FF3333' }}>{data.shorts}S</span>
                              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: data.totalPnl >= 0 ? '#00FF88' : '#FF3333' }}>
                                {data.totalPnl >= 0 ? '+' : ''}${Math.round(data.totalPnl).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div style={{ width: '100%', height: 3, background: '#FF3333', overflow: 'hidden' }}>
                            <div style={{ width: `${longPct}%`, height: '100%', background: '#00FF88', transition: 'width 300ms' }} />
                          </div>
                          <div style={{ fontFamily: mono, fontSize: 8, color: '#999', marginTop: 2 }}>{data.traders.join(', ')}</div>
                        </div>
                      );
                    })}
                    <div style={{ fontFamily: mono, fontSize: 10, color: '#999', marginTop: 4 }}>
                      {allPositions.length} TOTAL · ${allPositions.reduce((s, p) => s + p.size, 0).toLocaleString()} EXPOSURE · P&L: <span style={{ color: allPositions.reduce((s, p) => s + calcPosPnl(p), 0) >= 0 ? '#00FF88' : '#FF3333', fontWeight: 700 }}>${Math.round(allPositions.reduce((s, p) => s + calcPosPnl(p), 0)).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── PREDICTION MARKET CONTROLS ── */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #1A1A1A' }}>
              <PredictionAdmin
                lobbyId={lobbyId}
                password={authToken}
                traders={traders.map(t => ({ trader_id: t.trader_id, name: t.name, team_id: t.team_id }))}
              />
            </div>

            {/* ── SABOTAGE FEED ── */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #1A1A1A' }}>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>SABOTAGE FEED</div>
              {sabotageEvents.length === 0 ? (
                <div style={{ fontFamily: mono, fontSize: 11, color: '#666' }}>No sabotage yet</div>
              ) : sabotageEvents.map(s => (
                <div key={s.id} style={{ fontFamily: mono, fontSize: 11, color: '#999', padding: '2px 0', display: 'flex', gap: 6 }}>
                  <span style={{ color: '#F5A0D0' }}>{traderNamesRef.current[s.attacker_id] ?? 'ANON'}</span>
                  <span style={{ color: '#666' }}>→</span>
                  <span style={{ color: '#FFF' }}>{traderNamesRef.current[s.target_id] ?? '???'}</span>
                  <span style={{ color: '#888' }}>{s.type.replace(/_/g, ' ').toUpperCase()}</span>
                  <span style={{ color: '#666' }}>{s.cost}CR</span>
                </div>
              ))}
            </div>

            {/* ── CREDIT ECONOMY ── */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #1A1A1A' }}>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>CREDIT ECONOMY</div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 16, color: '#F5A0D0', fontWeight: 700 }}>{creditPool.toLocaleString()}</div>
                  <div style={{ fontFamily: sans, fontSize: 8, color: '#999', textTransform: 'uppercase' }}>POOL</div>
                </div>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 16, color: '#FF3333', fontWeight: 700 }}>{creditsSpent.toLocaleString()}</div>
                  <div style={{ fontFamily: sans, fontSize: 8, color: '#999', textTransform: 'uppercase' }}>SPENT</div>
                </div>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 16, color: '#888', fontWeight: 700 }}>{sabotageEvents.length}</div>
                  <div style={{ fontFamily: sans, fontSize: 8, color: '#999', textTransform: 'uppercase' }}>ATTACKS</div>
                </div>
              </div>
            </div>


          </div>
        </div>
      </div>

      {/* Tutorial */}
      <TutorialOverlay key={tutorialKey} role="admin" lobbyId={lobbyId} />
    </>
  );
}

// ===========================================================================
// Admin TradingView Chart
// ===========================================================================
// Auto-generate TradingView symbol map from Pyth feeds
const ADMIN_TV_OVERRIDES: Record<string, string> = {
  AAPL: 'NASDAQ:AAPL', TSLA: 'NASDAQ:TSLA', NVDA: 'NASDAQ:NVDA',
  MSFT: 'NASDAQ:MSFT', GOOG: 'NASDAQ:GOOGL', AMZN: 'NASDAQ:AMZN',
  META: 'NASDAQ:META', AMD: 'NASDAQ:AMD', COIN: 'NASDAQ:COIN',
  MSTR: 'NASDAQ:MSTR', GME: 'NYSE:GME', AMC: 'NYSE:AMC',
  INTC: 'NASDAQ:INTC', NFLX: 'NASDAQ:NFLX', PLTR: 'NASDAQ:PLTR', TSM: 'NYSE:TSM',
  SPY: 'AMEX:SPY', QQQ: 'NASDAQ:QQQ', GLD: 'AMEX:GLD', ARKK: 'AMEX:ARKK',
  XAU: 'TVC:GOLD', XAG: 'TVC:SILVER',
};
const ADMIN_TV_MAP: Record<string, string> = Object.fromEntries(
  Object.keys(PYTH_FEEDS).map(sym => {
    const short = sym.replace('USD', '');
    return [short, ADMIN_TV_OVERRIDES[short] ?? `BINANCE:${short}USDT`];
  })
);

function AdminTradingViewChart({ symbol }: { symbol: string }) {
  const tvSymbol = encodeURIComponent(ADMIN_TV_MAP[symbol] || `BINANCE:${symbol}USDT`);
  const src = `https://s.tradingview.com/widgetembed/?symbol=${tvSymbol}&interval=5&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=0A0A0A&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=localhost&utm_medium=widget_new&utm_campaign=chart&hideideas=1`;

  return (
    <iframe
      key={symbol}
      src={src}
      style={{ width: '100%', height: '100%', border: 'none', background: '#0A0A0A' }}
      allow="autoplay; fullscreen"
    />
  );
}
