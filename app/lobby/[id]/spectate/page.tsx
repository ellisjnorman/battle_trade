'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ATTACKS as WEAPONS_LIST } from '@/lib/weapons';
import { CREDIT_PACKAGES, totalCredits, type CreditPackage, type PaymentMethod } from '@/lib/payments';
import { useToastStore } from '@/lib/toast-store';
import LobbyChat from '@/components/lobby-chat';
import { StreamPlayer } from '@/components/stream-player';
import PredictionPanel from '@/components/prediction-panel';
import type { BetConfirmation } from '@/components/prediction-panel';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const bebas = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const mono = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const sans = "var(--font-dm-sans, 'DM Sans'), sans-serif";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'watch' | 'attack' | 'predict';

interface TraderInfo {
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
  }>;
  activity_status: {
    status: 'active' | 'warning' | 'critical';
  } | null;
}

interface RoundData {
  id: string;
  round_number: number;
  status: 'pending' | 'active' | 'frozen' | 'completed';
  started_at: string | null;
  duration_seconds: number;
}

interface FeedItem {
  id: string;
  type: 'big_trade' | 'wrecked' | 'sabotage' | 'exposed' | 'market_event' | 'forced';
  title: string;
  subtitle: string;
  detail?: string;
  color: string;
  icon: string;
  timestamp: number;
}

interface MarketOutcome {
  id: string;
  team_id: string;
  team_name: string;
  probability: number;
  odds: number;
  volume: number;
}

interface BetState {
  outcome_id: string;
  team_name: string;
  amount: number;
  potential_payout: number;
  locked: boolean;
  result?: 'won' | 'lost';
}

// ---------------------------------------------------------------------------
// Weapon definitions
// ---------------------------------------------------------------------------

const WEAPONS = WEAPONS_LIST.map(w => ({
  type: w.id,
  icon: w.icon,
  name: w.name,
  desc: w.desc,
  cost: w.cost,
} as const));

const cheapestWeapon = Math.min(...WEAPONS.map(w => w.cost));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpectatePage() {
  const { id: lobbyId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const spectatorCode = searchParams.get('code');

  const [tab, setTab] = useState<Tab>('watch');
  const [spectatorId, setSpectatorId] = useState<string | null>(null);
  const [spectatorName, setSpectatorName] = useState('Spectator');
  const [initialLoading, setInitialLoading] = useState(true);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [joinName, setJoinName] = useState('');
  const [joining, setJoining] = useState(false);
  const addToast = useToastStore((s) => s.addToast);
  const [betStreak, setBetStreak] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Round
  const [round, setRound] = useState<RoundData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [currentLeverage, setCurrentLeverage] = useState(5);

  // Traders
  const [traders, setTraders] = useState<TraderInfo[]>([]);

  // Watch
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const feedIdCounter = useRef(0);

  // Attack
  const [credits, setCredits] = useState(500);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedWeapon, setSelectedWeapon] = useState<string | null>(null);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [attackOverlay, setAttackOverlay] = useState<{ weapon: string; target: string; cost: number; remaining: number } | null>(null);
  const [attackHits, setAttackHits] = useState<Record<string, number>>({});
  const [confirmAttack, setConfirmAttack] = useState(false);

  // Predict
  const [outcomes, setOutcomes] = useState<MarketOutcome[]>([]);
  const [totalBets, setTotalBets] = useState(0);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState<number | null>(null);
  const [currentBet, setCurrentBet] = useState<BetState | null>(null);
  const [confirmBet, setConfirmBet] = useState(false);
  const [eventAlert, setEventAlert] = useState<{ headline: string; expiresAt: number } | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);

  // Stream
  const [streamPlaybackUrl, setStreamPlaybackUrl] = useState<string | null>(null);
  const [streamView, setStreamView] = useState(false);

  // Reactions
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: number; emoji: string; x: number }>>([]);
  const reactionCounter = useRef(0);

  const handlePurchase = useCallback(async (pkg: CreditPackage, method: PaymentMethod) => {
    if (!spectatorId) return;
    setPurchaseLoading(`${pkg.id}-${method}`);
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/credits/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: pkg.id, payment_method: method, trader_id: spectatorId }),
      });
      const data = await res.json();
      if (!res.ok) { addToast(data.error || 'Purchase failed', 'error'); return; }
      if (data.url) window.open(data.url, '_blank');
    } catch { addToast('Purchase failed', 'error'); }
    finally { setPurchaseLoading(null); }
  }, [spectatorId, lobbyId, addToast]);

  // ---------------------------------------------------------------------------
  // Quick join (no registration form)
  // ---------------------------------------------------------------------------

  const handleQuickJoin = async () => {
    setJoining(true);
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/spectate-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: joinName || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.trader_id) {
        setSpectatorId(data.trader_id);
        setSpectatorName(joinName || data.name || 'Spectator');
        setCredits(data.credits ?? 500);
        setNeedsJoin(false);
        // Save to localStorage so they don't need to rejoin
        localStorage.setItem(`bt-spectator-${lobbyId}`, JSON.stringify({ id: data.trader_id, code: data.code }));
        // Show onboarding on first join
        if (!localStorage.getItem('bt-onboarding-seen')) {
          setShowOnboarding(true);
          localStorage.setItem('bt-onboarding-seen', '1');
        }
      } else {
        addToast(data.error || 'Join failed', 'error');
      }
    } catch { addToast('Network error', 'error'); }
    finally { setJoining(false); }
  };

  // ---------------------------------------------------------------------------
  // Initialize spectator
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const initSpectator = async () => {
      // 1. Try code from URL
      if (spectatorCode && lobbyId) {
        const { data } = await supabase
          .from('traders')
          .select('id, name')
          .eq('lobby_id', lobbyId)
          .eq('code', spectatorCode)
          .single();
        if (data) { setSpectatorId(data.id); setSpectatorName(data.name ?? 'Spectator'); return; }
        // Fallback: try as trader_id
        const { data: byId } = await supabase
          .from('traders')
          .select('id, name')
          .eq('lobby_id', lobbyId)
          .eq('id', spectatorCode)
          .single();
        if (byId) { setSpectatorId(byId.id); setSpectatorName(byId.name ?? 'Spectator'); return; }
      }

      // 2. Try localStorage (returning spectator)
      if (lobbyId) {
        try {
          const saved = localStorage.getItem(`bt-spectator-${lobbyId}`);
          if (saved) {
            const { id } = JSON.parse(saved);
            const { data } = await supabase
              .from('traders')
              .select('id, name')
              .eq('id', id)
              .eq('lobby_id', lobbyId)
              .single();
            if (data) { setSpectatorId(data.id); setSpectatorName(data.name ?? 'Spectator'); return; }
          }
        } catch { /* ignore */ }
      }

      // 3. No spectator found — show quick join
      setNeedsJoin(true);
    };
    initSpectator();
  }, [lobbyId, spectatorCode]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchStatus = useCallback(async () => {
    try {
      const { data: rnds } = await supabase
        .from('rounds')
        .select('id, round_number, status, started_at, duration_seconds')
        .eq('lobby_id', lobbyId)
        .in('status', ['active', 'frozen', 'pending'])
        .order('round_number', { ascending: false })
        .limit(1);
      const activeRound = rnds?.[0] ?? null;
      if (activeRound) setRound(activeRound as RoundData);

      const roundId = activeRound?.id ?? round?.id;
      const url = roundId ? `/api/lobby/${lobbyId}/leaderboard?round_id=${roundId}` : `/api/lobby/${lobbyId}/leaderboard`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.standings) {
          setTraders(data.standings.map((s: Record<string, unknown>) => ({
            trader_id: (s.trader as Record<string, string>)?.id ?? '',
            name: (s.trader as Record<string, string>)?.name ?? '',
            team_id: (s.trader as Record<string, string | null>)?.team_id ?? null,
            is_eliminated: false,
            balance: s.portfolioValue as number ?? 10000,
            rank: s.rank as number,
            return_pct: s.returnPct as number ?? 0,
            open_positions: [],
            activity_status: null,
          })));
        }
      }
    } catch { /* silent */ }
  }, [lobbyId]);

  const fetchCredits = useCallback(async () => {
    if (!spectatorId) return;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/sabotage/credits?trader_id=${spectatorId}`);
      const data = await res.json();
      setCredits(data.balance ?? 0);
    } catch { /* silent */ }
  }, [lobbyId, spectatorId]);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/markets`);
      const data = await res.json();
      if (data.market?.outcomes) {
        setOutcomes(data.market.outcomes);
        const vol = data.market.outcomes.reduce((s: number, o: MarketOutcome) => s + o.volume, 0);
        setTotalBets(Math.round(vol / 50));
      }
    } catch { /* silent */ }
  }, [lobbyId]);

  // ---------------------------------------------------------------------------
  // Realtime subscriptions
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Sabotage channel — generates feed items (now with attacker names)
    const sabCh = supabase.channel(`lobby-${lobbyId}-sabotage`);
    sabCh.on('broadcast', { event: 'sabotage' }, ({ payload }) => {
      if (!payload) return;
      const id = `feed-${++feedIdCounter.current}`;
      const pType = payload.type as string;

      if (pType === 'sabotage_received' || pType === 'sabotage_hedged' || pType === 'sabotage_stopped') {
        const sab = payload.sabotage as Record<string, unknown> | undefined;
        const attackerName = (payload.attacker_name as string) ?? 'SOMEONE';
        const targetName = (payload.target_name as string) ?? traders.find((t) => t.trader_id === (sab?.target_id ?? payload.target_id))?.name ?? '???';
        const weaponType = (payload.weapon_type as string) ?? (sab?.type as string);
        const weaponDef = WEAPONS.find((w) => w.type === weaponType);
        const resultSuffix = pType === 'sabotage_hedged' ? ' — HEDGED!' : pType === 'sabotage_stopped' ? ' — STOPPED!' : '';
        setFeed((prev) => [{
          id,
          type: 'sabotage' as const,
          title: `${attackerName} ${weaponDef?.name ?? 'ATTACKED'} ${targetName}`,
          subtitle: `${weaponDef?.icon ?? '⚡'} ${weaponDef?.cost ?? 0}CR${resultSuffix}`,
          detail: undefined,
          color: pType === 'sabotage_received' ? '#F5A0D0' : '#00BFFF',
          icon: pType === 'sabotage_received' ? '⚡' : pType === 'sabotage_hedged' ? '🛡' : '🔄',
          timestamp: Date.now(),
        }, ...prev].slice(0, 30));
        setAttackHits((h) => ({ ...h, [targetName]: (h[targetName] ?? 0) + 1 }));
      }

      // Defense activation events
      if (pType === 'defense_activated') {
        const traderName = (payload.trader_name as string) ?? traders.find((t) => t.trader_id === payload.trader_id)?.name ?? '???';
        const defType = (payload.defense_type as string) ?? 'hedge';
        setFeed((prev) => [{
          id,
          type: 'sabotage' as const,
          title: `${traderName} activated ${defType.replace(/_/g, ' ').toUpperCase()}`,
          subtitle: 'Defense deployed!',
          detail: undefined,
          color: '#00BFFF',
          icon: '🛡',
          timestamp: Date.now(),
        }, ...prev].slice(0, 30));
      }

      // Also handle sabotage_launched from applySabotageEffect (dedup via different event name)
      if (pType === 'sabotage_launched') {
        const attackerName = traders.find((t) => t.trader_id === payload.attacker_id)?.name ?? (payload.sponsor_name as string) ?? 'SOMEONE';
        const targetName = traders.find((t) => t.trader_id === payload.target_id)?.name ?? '???';
        const weaponType = payload.sabotage_type as string;
        const weaponDef = WEAPONS.find((w) => w.type === weaponType);
        // Only add if we haven't already added a sabotage_received for this (avoid duplicate)
        // sabotage_launched comes from applySabotageEffect, sabotage_received from the route
        // We'll skip this if we already got sabotage_received in the last second
        setFeed((prev) => {
          const recent = prev.find(f => f.timestamp > Date.now() - 2000 && f.title.includes(targetName) && f.title.includes(weaponDef?.name ?? ''));
          if (recent) return prev; // skip duplicate
          return [{
            id,
            type: 'sabotage' as const,
            title: `${attackerName} ${weaponDef?.name ?? 'ATTACKED'} ${targetName}`,
            subtitle: `${weaponDef?.icon ?? '⚡'} ${payload.cost ?? 0}CR`,
            detail: undefined,
            color: '#F5A0D0',
            icon: weaponDef?.icon ?? '⚡',
            timestamp: Date.now(),
          }, ...prev].slice(0, 30);
        });
      }
    }).subscribe();

    // Events channel
    const evCh = supabase.channel(`lobby-${lobbyId}-events`);
    evCh.on('broadcast', { event: 'volatility' }, ({ payload }) => {
      if (!payload) return;
      const id = `feed-${++feedIdCounter.current}`;
      if (payload.type === 'event_start') {
        const ev = payload.event as Record<string, unknown>;
        setFeed((prev) => [{
          id,
          type: 'market_event' as const,
          title: `⚡ ${String(ev.type ?? '').replace(/_/g, ' ').toUpperCase()} ACTIVE`,
          subtitle: `${String(ev.asset ?? 'ALL').replace('USDT', '')} · ${payload.secondsRemaining ?? 60}s`,
          color: '#FF3333',
          icon: '💸',
          timestamp: Date.now(),
        }, ...prev].slice(0, 30));
      }
    }).subscribe();

    // Lobby channel — round events, forced trades
    const lobbyCh = supabase.channel(`lobby-${lobbyId}`);
    lobbyCh.on('broadcast', { event: 'volatility_event' }, ({ payload }) => {
      if (!payload) return;
      const headline = (payload.headline as string) ?? `${(payload.type as string ?? 'EVENT').replace(/_/g, ' ').toUpperCase()}`;
      const dur = (payload.duration_seconds as number) ?? 60;
      setEventAlert({ headline, expiresAt: Date.now() + dur * 1000 });
      const id = `feed-${++feedIdCounter.current}`;
      setFeed((prev) => [{ id, type: 'market_event' as const, title: headline, subtitle: `${dur}s duration`, color: '#FF3333', icon: '⚡', timestamp: Date.now() }, ...prev].slice(0, 30));
    }).on('broadcast', { event: 'forced_trade_public' }, ({ payload }) => {
      if (!payload) return;
      const id = `feed-${++feedIdCounter.current}`;
      setFeed((prev) => [{
        id,
        type: 'forced' as const,
        title: `${payload.trader_name ?? 'SOMEONE'} WAS FORCED INTO A TRADE`,
        subtitle: `${payload.direction?.toUpperCase() ?? 'LONG'} ${String(payload.asset ?? 'BTC').replace('USDT', '')} · $${payload.size_usd ?? 1000}`,
        color: '#FF3333',
        icon: '💀',
        timestamp: Date.now(),
      }, ...prev].slice(0, 30));
    }).subscribe();

    // Market odds channel — live odds updates (FIX #7)
    const mktCh = supabase.channel(`lobby-${lobbyId}-markets`);
    mktCh.on('broadcast', { event: 'market' }, ({ payload }) => {
      if (payload?.type === 'odds_update' && payload.outcomes) {
        setOutcomes(payload.outcomes as MarketOutcome[]);
      }
    }).subscribe();

    return () => {
      supabase.removeChannel(sabCh);
      supabase.removeChannel(evCh);
      supabase.removeChannel(lobbyCh);
      supabase.removeChannel(mktCh);
    };
  }, [lobbyId, traders]);

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  useEffect(() => {
    Promise.all([fetchStatus(), fetchCredits(), fetchMarket()]).finally(() => setInitialLoading(false));
    const interval = setInterval(() => {
      fetchStatus();
      fetchCredits();
      fetchMarket();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchCredits, fetchMarket]);

  // Fetch stream info
  useEffect(() => {
    let cancelled = false;
    const fetchStream = async () => {
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/stream`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.stream?.playback_url) {
          setStreamPlaybackUrl(json.stream.playback_url);
        }
      } catch {
        // ignore — stream is optional
      }
    };
    fetchStream();
    const si = setInterval(fetchStream, 15000);
    return () => { cancelled = true; clearInterval(si); };
  }, [lobbyId]);

  // Generate feed items from trader data changes
  const prevTradersRef = useRef<TraderInfo[]>([]);
  useEffect(() => {
    const prev = prevTradersRef.current;
    if (prev.length === 0) { prevTradersRef.current = traders; return; }

    for (const t of traders) {
      const old = prev.find((p) => p.trader_id === t.trader_id);
      if (!old) continue;
      const pnlDelta = t.balance - old.balance;
      if (Math.abs(pnlDelta) > 200) {
        const id = `feed-${++feedIdCounter.current}`;
        if (pnlDelta > 0) {
          setFeed((f) => [{
            id, type: 'big_trade' as const,
            title: `${t.name} just made a move`,
            subtitle: `+$${Math.round(pnlDelta).toLocaleString()} · ${t.open_positions.length > 0 ? `${t.open_positions[0].direction.toUpperCase()} · ${t.open_positions[0].leverage}X` : 'CLOSED'}`,
            color: '#00FF88', icon: '🔥', timestamp: Date.now(),
          }, ...f].slice(0, 30));
        } else {
          setFeed((f) => [{
            id, type: 'wrecked' as const,
            title: `${t.name} down -$${Math.abs(Math.round(pnlDelta)).toLocaleString()} this minute`,
            subtitle: t.open_positions.length > 0 ? 'Still holding...' : 'Liquidated.',
            color: '#FF3333', icon: '💀', timestamp: Date.now(),
          }, ...f].slice(0, 30));
        }
      }
    }
    prevTradersRef.current = traders;
  }, [traders]);

  // Countdown timer
  useEffect(() => {
    if (!round || round.status !== 'active' || !round.started_at) { setElapsed(0); return; }
    const tick = () => {
      const start = new Date(round.started_at!).getTime();
      setElapsed(Math.floor((Date.now() - start) / 1000));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [round]);

  // Event alert countdown
  useEffect(() => {
    if (!eventAlert) return;
    const i = setInterval(() => { if (Date.now() >= eventAlert.expiresAt) setEventAlert(null); }, 1000);
    return () => clearInterval(i);
  }, [eventAlert]);

  // Cooldown timer
  useEffect(() => {
    if (!cooldownEnd) { setCooldownRemaining(0); return; }
    const tick = () => {
      const rem = Math.max(0, Math.floor((cooldownEnd - Date.now()) / 1000));
      setCooldownRemaining(rem);
      if (rem <= 0) setCooldownEnd(null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  // Attack overlay auto-dismiss
  useEffect(() => {
    if (!attackOverlay) return;
    const timer = setTimeout(() => setAttackOverlay(null), 3000);
    return () => clearTimeout(timer);
  }, [attackOverlay]);

  // Floating reactions auto-dismiss
  useEffect(() => {
    if (floatingReactions.length === 0) return;
    const timer = setTimeout(() => setFloatingReactions((r) => r.slice(1)), 2500);
    return () => clearTimeout(timer);
  }, [floatingReactions]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleAttack = async () => {
    if (!selectedTarget || !selectedWeapon || !spectatorId) return;
    const weapon = WEAPONS.find((w) => w.type === selectedWeapon);
    if (!weapon || credits < weapon.cost) return;

    // Confirmation gate (FIX #6)
    if (!confirmAttack) {
      setConfirmAttack(true);
      return;
    }
    setConfirmAttack(false);

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/sabotage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attacker_id: spectatorId,
          target_id: selectedTarget,
          type: selectedWeapon,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        const targetName = traders.find((t) => t.trader_id === selectedTarget)?.name ?? '???';
        setAttackOverlay({
          weapon: weapon.name,
          target: targetName,
          cost: weapon.cost,
          remaining: credits - weapon.cost,
        });
        setCredits((c) => c - weapon.cost);
        setCooldownEnd(Date.now() + 45_000); // 45s cooldown
        setSelectedWeapon(null);
        fetchCredits();
        addToast(`${weapon.icon} ${weapon.name} launched at ${targetName}!`, 'attack', weapon.icon);
      } else {
        addToast(data?.error || 'Attack failed', 'error');
      }
    } catch {
      addToast('Network error', 'error');
    }
  };

  const handlePlaceBet = async () => {
    if (!selectedOutcome || !betAmount || !spectatorId) return;

    // Confirmation gate (FIX #6)
    if (!confirmBet) {
      setConfirmBet(true);
      return;
    }
    setConfirmBet(false);

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/markets/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bettor_id: spectatorId,
          outcome_id: selectedOutcome,
          amount_credits: betAmount,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const outcome = outcomes.find((o) => o.id === selectedOutcome);
        const payout = data.potential_payout ?? Math.round(betAmount * (outcome?.odds ?? 1));
        setCurrentBet({
          outcome_id: selectedOutcome,
          team_name: outcome?.team_name ?? '???',
          amount: betAmount,
          potential_payout: payout,
          locked: true,
        });
        setCredits(data.new_balance ?? credits - betAmount);
        fetchMarket();
        addToast(`${betAmount}CR on ${outcome?.team_name ?? '???'} · Payout: +${payout}CR`, 'success', '🎲');
      } else {
        addToast(data?.error || 'Bet failed', 'error');
      }
    } catch {
      addToast('Network error', 'error');
    }
  };

  const sendReaction = (emoji: string) => {
    const id = ++reactionCounter.current;
    const x = 20 + Math.random() * 60;
    setFloatingReactions((prev) => [...prev, { id, emoji, x }]);
  };

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const remaining = round ? Math.max(0, round.duration_seconds - elapsed) : 0;
  const remainingStr = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
  const isLowTime = remaining < 120 && remaining > 0;

  const activeTraders = traders.filter((t) => !t.is_eliminated && t.rank !== null && t.trader_id !== spectatorId).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  const selectedOutcomeData = outcomes.find((o) => o.id === selectedOutcome);
  const potentialPayout = betAmount && selectedOutcomeData ? Math.round(betAmount * selectedOutcomeData.odds) : 0;

  const maxVolume = Math.max(1, ...outcomes.map((o) => o.volume));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (initialLoading) {
    return (
      <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ width: 8, height: 8, background: '#F5A0D0', animation: 'pulse 1s infinite' }} />
        <span style={{ fontFamily: bebas, fontSize: 24, letterSpacing: '0.05em', color: '#999' }}>LOADING...</span>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      </div>
    );
  }

  // =========================================================================
  // QUICK JOIN SCREEN (no code needed) — FIX #1 + #2
  // =========================================================================
  if (needsJoin) {
    return (
      <>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
        <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24, maxWidth: 375, margin: '0 auto' }}>
          <div style={{ fontSize: 48 }}>⚡</div>
          <div style={{ fontFamily: bebas, fontSize: 40, color: '#FFF', textAlign: 'center', lineHeight: 1 }}>WATCH THE BATTLE</div>
          <div style={{ fontFamily: sans, fontSize: 14, color: '#999', textAlign: 'center', lineHeight: 1.5 }}>
            Attack traders, bet on winners, earn credits. No signup needed.
          </div>

          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={32}
            style={{
              width: '100%', padding: '14px 16px', background: '#111', border: '1px solid #333', color: '#FFF',
              fontFamily: sans, fontSize: 16, outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#F5A0D0'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#333'; }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickJoin(); }}
          />

          <button
            onClick={handleQuickJoin}
            disabled={joining}
            style={{
              width: '100%', height: 64, background: '#F5A0D0', color: '#0A0A0A', border: 'none',
              fontFamily: bebas, fontSize: 28, letterSpacing: '0.08em', cursor: joining ? 'wait' : 'pointer',
            }}
          >
            {joining ? 'JOINING...' : '⚡ JOIN AS SPECTATOR'}
          </button>

          <div style={{ fontFamily: mono, fontSize: 11, color: '#555', textAlign: 'center' }}>
            You&apos;ll get 500CR free · Enough for {Math.floor(500 / cheapestWeapon)} attacks
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes bounceIn { 0%{transform:scale(0.3);opacity:0} 50%{transform:scale(1.05)} 70%{transform:scale(0.95)} 100%{transform:scale(1);opacity:1} }
        @keyframes floatUp { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-120px) scale(1.4)} }
        .shake { animation: shake 0.3s ease-in-out; }
        .pulse { animation: pulse 1s ease-in-out infinite; }
        .slideUp { animation: slideUp 0.3s ease-out; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>

      <div style={{ background: '#0A0A0A', minHeight: '100vh', width: '100%', maxWidth: 375, margin: '0 auto', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

        {/* ============================================================= */}
        {/* FLOATING REACTIONS                                            */}
        {/* ============================================================= */}
        {floatingReactions.map((r) => (
          <div key={r.id} style={{
            position: 'fixed', bottom: 80, left: `${r.x}%`, fontSize: 32, zIndex: 60, pointerEvents: 'none',
            animation: 'floatUp 2s ease-out forwards',
          }}>{r.emoji}</div>
        ))}

        {/* ============================================================= */}
        {/* ONBOARDING OVERLAY — FIX #8                                   */}
        {/* ============================================================= */}
        {showOnboarding && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, maxWidth: 375, margin: '0 auto' }}>
            <div style={{ fontFamily: bebas, fontSize: 36, color: '#FFF', textAlign: 'center', marginBottom: 24 }}>HOW IT WORKS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
              {[
                { icon: '👁', tab: 'WATCH', desc: 'See live trades, attacks, and market events in real-time' },
                { icon: '⚡', tab: 'ATTACK', desc: 'Spend credits to sabotage traders — lock them out, force trades, squeeze their margins' },
                { icon: '🎲', tab: 'PREDICT', desc: 'Bet on who wins the round — earn credits if you call it right' },
              ].map((item) => (
                <div key={item.tab} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 28, width: 36, textAlign: 'center', flexShrink: 0 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontFamily: bebas, fontSize: 18, color: '#F5A0D0' }}>{item.tab}</div>
                    <div style={{ fontFamily: sans, fontSize: 13, color: '#999', lineHeight: 1.4 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowOnboarding(false)}
              style={{ marginTop: 32, width: '100%', height: 56, background: '#F5A0D0', color: '#0A0A0A', border: 'none', fontFamily: bebas, fontSize: 24, letterSpacing: '0.08em', cursor: 'pointer' }}
            >
              GOT IT — LET&apos;S GO
            </button>
          </div>
        )}

        {/* ============================================================= */}
        {/* ATTACK OVERLAY                                                */}
        {/* ============================================================= */}
        {attackOverlay && (
          <div style={{ position: 'fixed', inset: 0, background: '#0A0A0A', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px solid #F5A0D0', maxWidth: 375, margin: '0 auto' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>⚡</div>
            <div style={{ fontFamily: bebas, fontSize: 64, color: '#FFF', textAlign: 'center', lineHeight: 1 }}>ATTACK LAUNCHED</div>
            <div style={{ fontFamily: bebas, fontSize: 28, color: '#F5A0D0', marginTop: 12, letterSpacing: '0.05em' }}>
              {attackOverlay.weapon} → {attackOverlay.target}
            </div>
            <div style={{ fontFamily: mono, fontSize: 16, color: '#888', marginTop: 12 }}>{attackOverlay.cost}CR SPENT</div>
            <div style={{ fontFamily: mono, fontSize: 20, color: '#FFF', marginTop: 8 }}>CREDITS LEFT: {attackOverlay.remaining}CR</div>
          </div>
        )}

        {/* EVENT ALERT BAR */}
        {eventAlert && (
          <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderBottom: '2px solid #FF3333', background: 'linear-gradient(90deg, rgba(255,51,51,0.12), rgba(245,160,208,0.08), rgba(255,51,51,0.12))', flexShrink: 0, animation: 'pulse 1.5s infinite' }}>
            <span style={{ fontFamily: bebas, fontSize: 14, color: '#FF3333', letterSpacing: '0.05em' }}>⚡ {eventAlert.headline}</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: '#FF3333' }}>{Math.max(0, Math.ceil((eventAlert.expiresAt - Date.now()) / 1000))}s</span>
          </div>
        )}

        {/* ============================================================= */}
        {/* STICKY HEADER                                                 */}
        {/* ============================================================= */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: isLowTime ? 'rgba(255,51,51,0.05)' : '#0A0A0A' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: bebas, fontSize: 20, color: '#FFF', letterSpacing: '0.05em' }}>
              ROUND {round?.round_number ?? '-'} · <span style={{ color: isLowTime ? '#FF3333' : '#FFF' }}>{round?.status === 'active' ? remainingStr : round?.status?.toUpperCase() ?? 'WAITING'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 14, color: '#F5A0D0', fontWeight: 700 }}>{credits}CR</span>
            {/* Reaction buttons */}
            {['🔥', '💀', '😤', '🚀'].map((emoji) => (
              <button key={emoji} onClick={() => sendReaction(emoji)} style={{ fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>{emoji}</button>
            ))}
          </div>
        </div>

        {/* ============================================================= */}
        {/* TAB CONTENT — uses display:none to preserve state (FIX #9)   */}
        {/* ============================================================= */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>

          {/* =========================================================== */}
          {/* WATCH TAB                                                    */}
          {/* =========================================================== */}
          <div style={{ display: tab === 'watch' ? 'flex' : 'none', flexDirection: 'column' }}>
            {/* Stream / Data toggle */}
            {streamPlaybackUrl && (
              <div style={{ display: 'flex', borderBottom: '1px solid #1A1A1A' }}>
                <button
                  onClick={() => setStreamView(false)}
                  style={{
                    flex: 1, padding: '8px 0', background: 'transparent', border: 'none',
                    borderBottom: !streamView ? '2px solid #F5A0D0' : '2px solid transparent',
                    fontFamily: bebas, fontSize: 13, letterSpacing: '0.1em',
                    color: !streamView ? '#F5A0D0' : '#555', cursor: 'pointer',
                  }}
                >
                  DATA FEED
                </button>
                <button
                  onClick={() => setStreamView(true)}
                  style={{
                    flex: 1, padding: '8px 0', background: 'transparent', border: 'none',
                    borderBottom: streamView ? '2px solid #F5A0D0' : '2px solid transparent',
                    fontFamily: bebas, fontSize: 13, letterSpacing: '0.1em',
                    color: streamView ? '#F5A0D0' : '#555', cursor: 'pointer',
                  }}
                >
                  LIVE STREAM
                </button>
              </div>
            )}

            {/* Stream player */}
            {streamPlaybackUrl && streamView && (
              <StreamPlayer playbackUrl={streamPlaybackUrl} autoplay muted />
            )}
          </div>
          <div style={{ display: tab === 'watch' && !(streamPlaybackUrl && streamView) ? 'flex' : 'none', flexDirection: 'column' }}>
            {/* Feed */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {feed.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <div style={{ fontFamily: bebas, fontSize: 24, color: '#666' }}>WAITING FOR ACTION...</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: '#666', marginTop: 8 }}>
                    {round?.status === 'active' ? 'Trades, attacks, and events will appear here' : 'The round hasn\'t started yet — hang tight'}
                  </div>
                </div>
              )}
              {feed.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '12px 16px',
                    borderLeft: `3px solid ${item.color}`,
                    background: item.type === 'market_event' ? 'rgba(255,51,51,0.08)' : item.type === 'big_trade' ? 'rgba(0,255,136,0.06)' : item.type === 'wrecked' ? 'rgba(255,51,51,0.06)' : item.type === 'sabotage' ? 'rgba(245,160,208,0.06)' : 'transparent',
                    borderBottom: '1px solid #111',
                  }}
                >
                  <div style={{ fontFamily: bebas, fontSize: item.type === 'market_event' ? 20 : 18, color: item.type === 'market_event' ? '#FF3333' : '#FFF', letterSpacing: '0.03em' }}>
                    {item.icon} {item.title}
                  </div>
                  <div style={{
                    fontFamily: item.type === 'wrecked' ? sans : mono,
                    fontSize: item.type === 'sabotage' ? 14 : 12,
                    color: item.type === 'sabotage' ? '#F5A0D0' : item.color,
                    marginTop: 2,
                    fontStyle: item.type === 'wrecked' ? 'italic' : 'normal',
                  }}>
                    {item.subtitle}
                  </div>
                  {item.detail && (
                    <div style={{ fontFamily: sans, fontSize: 12, color: '#888', marginTop: 2 }}>{item.detail}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom standings strip */}
            <div style={{ padding: '12px 0', borderTop: '1px solid #1A1A1A', position: 'sticky', bottom: 60, background: '#0A0A0A' }}>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px' }}>
                {activeTraders.map((t) => (
                  <button
                    key={t.trader_id}
                    onClick={() => { setSelectedTarget(t.trader_id); setTab('attack'); }}
                    style={{
                      flexShrink: 0, padding: '6px 12px',
                      background: currentBet?.team_name === t.name ? 'rgba(245,160,208,0.15)' : '#111',
                      border: currentBet?.team_name === t.name ? '1px solid #F5A0D0' : '1px solid #1A1A1A',
                      display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontFamily: mono, fontSize: 10, color: '#666' }}>#{t.rank}</span>
                    <span style={{ fontFamily: bebas, fontSize: 13, color: '#FFF', letterSpacing: '0.03em' }}>{t.name}</span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: t.return_pct >= 0 ? '#00FF88' : '#FF3333' }}>
                      {t.return_pct >= 0 ? '+' : ''}{t.return_pct.toFixed(1)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* =========================================================== */}
          {/* ATTACK TAB                                                   */}
          {/* =========================================================== */}
          <div style={{ display: tab === 'attack' ? 'flex' : 'none', flexDirection: 'column', gap: 0 }}>
            {/* Credits with explanation — FIX #3 */}
            <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1A1A1A' }}>
              <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em' }}>YOUR CREDITS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontFamily: bebas, fontSize: 48, color: '#FFF', lineHeight: 1, marginTop: 4 }}>{credits}CR</div>
                <button onClick={() => setShowPurchaseModal(true)} style={{ fontFamily: bebas, fontSize: 14, color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '6px 14px', cursor: 'pointer', letterSpacing: '0.08em', marginTop: 4 }}>BUY MORE</button>
              </div>
              <div style={{ fontFamily: mono, fontSize: 10, color: '#555', marginTop: 6 }}>
                {credits >= cheapestWeapon ? `${Math.floor(credits / cheapestWeapon)} attacks remaining · Cheapest: ${cheapestWeapon}CR` : 'Not enough for an attack — buy more credits'}
              </div>
            </div>

            {/* Cooldown */}
            {cooldownEnd && cooldownRemaining > 0 && (
              <div style={{ padding: '10px 16px', background: 'rgba(255,51,51,0.08)', borderBottom: '1px solid #1A1A1A' }}>
                <div style={{ fontFamily: bebas, fontSize: 16, color: '#FF3333' }}>
                  ⏳ COOLDOWN · NEXT ATTACK IN {cooldownRemaining}s
                </div>
              </div>
            )}

            {!selectedTarget ? (
              <>
                <div style={{ padding: '12px 16px 8px' }}>
                  <div style={{ fontFamily: bebas, fontSize: 16, color: '#888', letterSpacing: '0.05em' }}>CHOOSE YOUR TARGET</div>
                </div>

                {activeTraders.length === 0 && (
                  <div style={{ padding: 32, textAlign: 'center' }}>
                    <div style={{ fontFamily: bebas, fontSize: 24, color: '#666' }}>NO TARGETS AVAILABLE</div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: '#666', marginTop: 8 }}>Waiting for traders to join the round</div>
                  </div>
                )}
                {activeTraders.map((t) => {
                  const hits = attackHits[t.name] ?? 0;
                  const chaosWidth = Math.min(100, hits * 15);
                  return (
                    <button
                      key={t.trader_id}
                      onClick={() => setSelectedTarget(t.trader_id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                        background: 'transparent', border: 'none', borderBottom: '1px solid #111',
                        cursor: 'pointer', width: '100%', textAlign: 'left',
                      }}
                    >
                      <span style={{ fontFamily: mono, fontSize: 12, color: '#666', width: 24 }}>#{t.rank}</span>
                      <div style={{ width: 32, height: 32, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: bebas, fontSize: 14, color: '#999', flexShrink: 0 }}>
                        {t.name.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: bebas, fontSize: 16, color: '#FFF', letterSpacing: '0.03em' }}>{t.name}</div>
                        {hits > 0 && (
                          <div style={{ height: 3, background: '#1A1A1A', marginTop: 3 }}>
                            <div style={{ height: 3, background: '#FF3333', width: `${chaosWidth}%`, transition: 'width 0.3s' }} />
                          </div>
                        )}
                      </div>
                      <span style={{ fontFamily: mono, fontSize: 14, color: t.return_pct >= 0 ? '#00FF88' : '#FF3333', fontWeight: 700 }}>
                        {t.return_pct >= 0 ? '+' : ''}{t.return_pct.toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </>
            ) : (
              <div className="slideUp" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontFamily: bebas, fontSize: 20, color: '#FFF', letterSpacing: '0.03em' }}>
                    ATTACK {traders.find((t) => t.trader_id === selectedTarget)?.name ?? '???'}
                  </div>
                  <button onClick={() => { setSelectedTarget(null); setSelectedWeapon(null); setConfirmAttack(false); }} style={{ fontFamily: sans, fontSize: 10, color: '#999', background: 'transparent', border: 'none', cursor: 'pointer' }}>← BACK</button>
                </div>

                {WEAPONS.map((w) => {
                  const canAfford = credits >= w.cost;
                  const isSelected = selectedWeapon === w.type;
                  return (
                    <button
                      key={w.type}
                      onClick={() => { canAfford && setSelectedWeapon(isSelected ? null : w.type); setConfirmAttack(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', height: 56, padding: '0 16px',
                        background: isSelected ? 'rgba(245,160,208,0.05)' : 'transparent',
                        border: 'none', borderBottom: isSelected ? '2px solid #F5A0D0' : '1px solid #111',
                        cursor: canAfford ? 'pointer' : 'not-allowed', opacity: canAfford ? 1 : 0.4,
                        width: '100%', textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 20, width: 32 }}>{w.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontFamily: bebas, fontSize: 16, color: '#FFF', letterSpacing: '0.03em' }}>{w.name}</span>
                        <span style={{ fontFamily: sans, fontSize: 10, color: '#999', marginLeft: 8 }}>{w.desc}</span>
                      </div>
                      <span style={{ fontFamily: bebas, fontSize: 18, color: canAfford ? '#F5A0D0' : '#FF3333' }}>{w.cost}CR</span>
                    </button>
                  );
                })}

                {/* Launch button with confirmation — FIX #6 */}
                {selectedWeapon && (
                  <div style={{ padding: 16 }}>
                    {confirmAttack && (
                      <div style={{ fontFamily: mono, fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 8 }}>
                        Spend {WEAPONS.find(w => w.type === selectedWeapon)?.cost}CR on {WEAPONS.find(w => w.type === selectedWeapon)?.name}? You&apos;ll have {credits - (WEAPONS.find(w => w.type === selectedWeapon)?.cost ?? 0)}CR left.
                      </div>
                    )}
                    <button
                      onClick={handleAttack}
                      disabled={!!(cooldownEnd && cooldownRemaining > 0)}
                      className={confirmAttack ? '' : 'shake'}
                      style={{
                        width: '100%', height: 64,
                        background: (cooldownEnd && cooldownRemaining > 0) ? '#333' : confirmAttack ? '#FF3333' : '#F5A0D0',
                        color: confirmAttack ? '#FFF' : '#0A0A0A',
                        border: 'none', fontFamily: bebas, fontSize: 24, letterSpacing: '0.08em',
                        cursor: (cooldownEnd && cooldownRemaining > 0) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {confirmAttack ? '⚡ CONFIRM ATTACK' : '⚡ LAUNCH ATTACK'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* =========================================================== */}
          {/* PREDICT TAB                                                  */}
          {/* =========================================================== */}
          <div style={{ display: tab === 'predict' ? 'flex' : 'none', flexDirection: 'column' }}>
            {/* Bet result overlays (streak/result UI kept in spectate) */}
            {currentBet?.result === 'won' && (
              <div style={{ padding: 32, textAlign: 'center', background: 'rgba(0,255,136,0.08)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ fontSize: 56, animation: 'bounceIn 0.5s ease-out' }}>🏆</div>
                <div style={{ fontFamily: bebas, fontSize: 52, color: '#00FF88', marginTop: 8, textShadow: '0 0 30px rgba(0,255,136,0.5)', animation: 'bounceIn 0.5s ease-out 0.1s both' }}>YOU CALLED IT</div>
                <div style={{ fontFamily: bebas, fontSize: 52, color: '#00FF88', animation: 'bounceIn 0.5s ease-out 0.2s both' }}>+{currentBet.potential_payout}CR</div>
                {betStreak > 1 && (
                  <div style={{ fontFamily: bebas, fontSize: 24, color: '#F5A0D0', marginTop: 8, animation: 'bounceIn 0.5s ease-out 0.3s both' }}>
                    {betStreak} STREAK 🔥
                  </div>
                )}
              </div>
            )}
            {currentBet?.result === 'lost' && (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ fontFamily: bebas, fontSize: 72, color: '#FF3333', textShadow: '0 0 20px rgba(255,51,51,0.3)' }}>rekt.</div>
                <div style={{ fontFamily: sans, fontSize: 14, color: '#999', marginTop: 8 }}>-{currentBet.amount}CR · better luck next round</div>
              </div>
            )}

            {/* PredictionPanel component — handles markets, outcomes, betting via /api/lobby/{id}/predictions */}
            <PredictionPanel
              lobbyId={lobbyId}
              bettorId={spectatorId ?? undefined}
              credits={credits}
              onCreditsChange={(newBal) => setCredits(newBal)}
              onBetPlaced={(bet: BetConfirmation) => {
                setCurrentBet({
                  outcome_id: bet.outcome_id,
                  team_name: bet.team_name,
                  amount: bet.amount,
                  potential_payout: bet.potential_payout,
                  locked: true,
                });
                fetchCredits();
              }}
            />
          </div>

          {/* OLD PREDICT TAB — removed (replaced by PredictionPanel above) */}
        </div>

        {/* ============================================================= */}
        {/* BOTTOM NAV                                                    */}
        {/* ============================================================= */}
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 375, display: 'flex', borderTop: '1px solid #1A1A1A', background: '#0D0D0D', zIndex: 50 }}>
          {([
            { key: 'watch', icon: '👁', label: 'WATCH' },
            { key: 'attack', icon: '⚡', label: 'ATTACK' },
            { key: 'predict', icon: '🎲', label: 'PREDICT' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '8px 0 6px', background: 'transparent', border: 'none',
                borderTop: tab === t.key ? '2px solid #F5A0D0' : '2px solid transparent',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{ fontFamily: bebas, fontSize: 11, color: tab === t.key ? '#F5A0D0' : '#555', letterSpacing: '0.1em' }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div onClick={() => setShowPurchaseModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: '#0A0A0A', border: '2px solid #F5A0D0', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: bebas, fontSize: 20, color: '#F5A0D0' }}>BUY CREDITS</span>
              <button onClick={() => setShowPurchaseModal(false)} style={{ fontFamily: mono, fontSize: 16, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>X</button>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CREDIT_PACKAGES.map(pkg => {
                const tc = totalCredits(pkg);
                const attackCount = Math.floor(tc / cheapestWeapon);
                return (
                  <div key={pkg.id} style={{ border: pkg.popular ? '2px solid #F5A0D0' : '1px solid #222', background: pkg.popular ? 'rgba(245,160,208,0.04)' : '#111', padding: 12 }}>
                    {pkg.popular && <div style={{ fontFamily: bebas, fontSize: 9, color: '#F5A0D0', marginBottom: 4, letterSpacing: '0.1em' }}>MOST POPULAR</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div>
                        <span style={{ fontFamily: bebas, fontSize: 18, color: '#FFF' }}>{tc} CREDITS</span>
                        {pkg.bonus_pct > 0 && <span style={{ fontFamily: mono, fontSize: 10, color: '#00FF88', marginLeft: 8 }}>+{pkg.bonus_pct}% BONUS</span>}
                      </div>
                      <span style={{ fontFamily: mono, fontSize: 14, color: '#F5A0D0' }}>${(pkg.price_usd / 100).toFixed(2)}</span>
                    </div>
                    {/* FIX #3: Show what credits buy */}
                    <div style={{ fontFamily: mono, fontSize: 10, color: '#555', marginBottom: 8 }}>
                      = {attackCount} attacks or {Math.floor(tc / 50)} bets
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handlePurchase(pkg, 'stripe')} disabled={purchaseLoading !== null} style={{ flex: 1, fontFamily: bebas, fontSize: 12, color: '#FFF', background: '#1A1A1A', border: '1px solid #333', padding: '7px 0', cursor: purchaseLoading ? 'wait' : 'pointer' }}>
                        {purchaseLoading === `${pkg.id}-stripe` ? '...' : 'CARD / APPLE PAY'}
                      </button>
                      <button onClick={() => handlePurchase(pkg, 'coinbase_commerce')} disabled={purchaseLoading !== null} style={{ flex: 1, fontFamily: bebas, fontSize: 12, color: '#FFF', background: '#1A1A1A', border: '1px solid #333', padding: '7px 0', cursor: purchaseLoading ? 'wait' : 'pointer' }}>
                        {purchaseLoading === `${pkg.id}-coinbase_commerce` ? '...' : 'CRYPTO'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chat */}
      {spectatorId && (
        <LobbyChat
          lobbyId={lobbyId}
          userId={spectatorId}
          userName={spectatorName}
          userRole="spectator"
        />
      )}
    </>
  );
}
