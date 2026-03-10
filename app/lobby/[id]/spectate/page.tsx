'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ATTACKS as WEAPONS_LIST } from '@/lib/weapons';
import { CREDIT_PACKAGES, totalCredits, type CreditPackage, type PaymentMethod } from '@/lib/payments';
import { useToastStore } from '@/lib/toast-store';

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpectatePage() {
  const { id: lobbyId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const spectatorCode = searchParams.get('code');

  const [tab, setTab] = useState<Tab>('watch');
  const [spectatorId, setSpectatorId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const addToast = useToastStore((s) => s.addToast);
  const [betStreak, setBetStreak] = useState(0);

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

  // Predict
  const [outcomes, setOutcomes] = useState<MarketOutcome[]>([]);
  const [totalBets, setTotalBets] = useState(0);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState<number | null>(null);
  const [currentBet, setCurrentBet] = useState<BetState | null>(null);
  const [eventAlert, setEventAlert] = useState<{ headline: string; expiresAt: number } | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);

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
  }, [spectatorId, lobbyId]);

  // ---------------------------------------------------------------------------
  // Initialize spectator
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const initSpectator = async () => {
      if (!spectatorCode || !lobbyId) return;
      // Look up trader by their unique code in this lobby
      const { data } = await supabase
        .from('traders')
        .select('id')
        .eq('lobby_id', lobbyId)
        .eq('code', spectatorCode)
        .single();
      if (data) {
        setSpectatorId(data.id);
      } else {
        // Fallback: try using code as a trader_id directly
        const { data: byId } = await supabase
          .from('traders')
          .select('id')
          .eq('lobby_id', lobbyId)
          .eq('id', spectatorCode)
          .single();
        if (byId) setSpectatorId(byId.id);
      }
    };
    initSpectator();
  }, [lobbyId, spectatorCode]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchStatus = useCallback(async () => {
    try {
      // Fetch active round directly from supabase
      const { data: rnds } = await supabase
        .from('rounds')
        .select('id, round_number, status, started_at, duration_seconds')
        .eq('lobby_id', lobbyId)
        .in('status', ['active', 'frozen', 'pending'])
        .order('round_number', { ascending: false })
        .limit(1);
      const activeRound = rnds?.[0] ?? null;
      if (activeRound) setRound(activeRound as RoundData);

      // Fetch leaderboard from public endpoint
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
    } catch {
      // silent
    }
  }, [lobbyId]);

  const fetchCredits = useCallback(async () => {
    if (!spectatorId) return;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/sabotage/credits?trader_id=${spectatorId}`);
      const data = await res.json();
      setCredits(data.balance ?? 0);
    } catch {
      // silent
    }
  }, [lobbyId, spectatorId]);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/markets`);
      const data = await res.json();
      if (data.market?.outcomes) {
        setOutcomes(data.market.outcomes);
        const vol = data.market.outcomes.reduce((s: number, o: MarketOutcome) => s + o.volume, 0);
        setTotalBets(Math.round(vol / 50)); // approximate bet count
      }
    } catch {
      // silent
    }
  }, [lobbyId]);

  // ---------------------------------------------------------------------------
  // Realtime subscriptions
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Sabotage channel — generates feed items
    const sabCh = supabase.channel(`lobby-${lobbyId}-sabotage`);
    sabCh.on('broadcast', { event: 'sabotage' }, ({ payload }) => {
      if (!payload) return;
      const id = `feed-${++feedIdCounter.current}`;
      if (payload.type === 'sabotage_received' || payload.type === 'sabotage_shielded' || payload.type === 'sabotage_deflected') {
        const sab = payload.sabotage as Record<string, unknown> | undefined;
        const targetName = traders.find((t) => t.trader_id === (sab?.target_id ?? payload.target_id))?.name ?? '???';
        const weaponDef = WEAPONS.find((w) => w.type === sab?.type);
        setFeed((prev) => [{
          id,
          type: 'sabotage' as const,
          title: `SOMEONE just ${weaponDef?.name ?? 'ATTACKED'} ${targetName}`,
          subtitle: `${weaponDef?.cost ?? 0}CR SPENT`,
          detail: payload.type === 'sabotage_shielded' ? 'SHIELDED!' : payload.type === 'sabotage_deflected' ? 'DEFLECTED!' : undefined,
          color: '#F5A0D0',
          icon: '⚡',
          timestamp: Date.now(),
        }, ...prev].slice(0, 30));
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

    return () => {
      supabase.removeChannel(sabCh);
      supabase.removeChannel(evCh);
      supabase.removeChannel(lobbyCh);
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
            id,
            type: 'big_trade' as const,
            title: `${t.name} just made a move`,
            subtitle: `+$${Math.round(pnlDelta).toLocaleString()} · ${t.open_positions.length > 0 ? `${t.open_positions[0].direction.toUpperCase()} · ${t.open_positions[0].leverage}X` : 'CLOSED'}`,
            color: '#00FF88',
            icon: '🔥',
            timestamp: Date.now(),
          }, ...f].slice(0, 30));
        } else {
          setFeed((f) => [{
            id,
            type: 'wrecked' as const,
            title: `${t.name} down -$${Math.abs(Math.round(pnlDelta)).toLocaleString()} this minute`,
            subtitle: t.open_positions.length > 0 ? 'Still holding...' : 'Liquidated.',
            color: '#FF3333',
            icon: '💀',
            timestamp: Date.now(),
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

  // Sabotage hit tracking
  useEffect(() => {
    const hits: Record<string, number> = {};
    // Count from feed
    for (const item of feed) {
      if (item.type === 'sabotage') {
        // extract target from title
        const match = item.title.match(/just \w+ (.+)/);
        if (match) {
          const name = match[1];
          hits[name] = (hits[name] ?? 0) + 1;
        }
      }
    }
    setAttackHits(hits);
  }, [feed]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleAttack = async () => {
    if (!selectedTarget || !selectedWeapon || !spectatorId) return;
    const weapon = WEAPONS.find((w) => w.type === selectedWeapon);
    if (!weapon || credits < weapon.cost) return;

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
        setCooldownEnd(Date.now() + 180_000);
        setSelectedTarget(null);
        setSelectedWeapon(null);
        fetchCredits();
        addToast(`${weapon.icon} ${weapon.name} launched at ${targetName}!`, 'attack', weapon.icon);
        setAttackHits((h) => ({ ...h, [selectedTarget!]: (h[selectedTarget!] ?? 0) + 1 }));
      } else {
        addToast(data?.error || 'Attack failed', 'error');
      }
    } catch {
      addToast('Network error', 'error');
    }
  };

  const handlePlaceBet = async () => {
    if (!selectedOutcome || !betAmount || !spectatorId) return;

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
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: '0.05em', color: '#999' }}>LOADING SPECTATOR VIEW...</span>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes bounceIn { 0%{transform:scale(0.3);opacity:0} 50%{transform:scale(1.05)} 70%{transform:scale(0.95)} 100%{transform:scale(1);opacity:1} }
        @keyframes urgentPulse { 0%,100%{border-color:#FF3333;box-shadow:0 0 8px rgba(255,51,51,0.3)} 50%{border-color:#FF6666;box-shadow:0 0 16px rgba(255,51,51,0.5)} }
        .shake { animation: shake 0.3s ease-in-out; }
        .pulse { animation: pulse 1s ease-in-out infinite; }
        .slideUp { animation: slideUp 0.3s ease-out; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>

      <div style={{ background: '#0A0A0A', minHeight: '100vh', width: '100%', maxWidth: 375, margin: '0 auto', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

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
            <img src="/brand/logo-main.png" alt="Battle Trade" style={{ height: 20, width: 'auto' }} />
            <div style={{ fontFamily: bebas, fontSize: 20, color: '#FFF', letterSpacing: '0.05em' }}>
              ROUND {round?.round_number ?? '-'} · <span style={{ color: isLowTime ? '#FF3333' : '#FFF' }}>{round?.status === 'active' ? remainingStr : round?.status?.toUpperCase() ?? '--'}</span>
            </div>
          </div>
          <div style={{ fontFamily: bebas, fontSize: 16, color: '#F5A0D0' }}>LEVERAGE {currentLeverage}X</div>
        </div>

        {/* ============================================================= */}
        {/* TAB CONTENT                                                   */}
        {/* ============================================================= */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 60 }}>

          {/* =========================================================== */}
          {/* WATCH TAB                                                    */}
          {/* =========================================================== */}
          {tab === 'watch' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Feed */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {feed.length === 0 && (
                  <div style={{ padding: 32, textAlign: 'center' }}>
                    <div style={{ fontFamily: bebas, fontSize: 24, color: '#666' }}>WAITING FOR ACTION...</div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: '#666', marginTop: 8 }}>Events will appear here in real-time</div>
                  </div>
                )}
                {feed.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '12px 16px',
                      borderLeft: `3px solid ${item.color}`,
                      background: item.type === 'market_event'
                        ? 'rgba(255,51,51,0.08)'
                        : item.type === 'big_trade'
                          ? 'rgba(0,255,136,0.06)'
                          : item.type === 'wrecked'
                            ? 'rgba(255,51,51,0.06)'
                            : item.type === 'sabotage'
                              ? 'rgba(245,160,208,0.06)'
                              : 'transparent',
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
                        flexShrink: 0,
                        padding: '6px 12px',
                        background: currentBet?.team_name === t.name ? 'rgba(245,160,208,0.15)' : '#111',
                        border: currentBet?.team_name === t.name ? '1px solid #F5A0D0' : '1px solid #1A1A1A',
                        display: 'flex',
                        gap: 6,
                        alignItems: 'center',
                        cursor: 'pointer',
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
          )}

          {/* =========================================================== */}
          {/* ATTACK TAB                                                   */}
          {/* =========================================================== */}
          {tab === 'attack' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Credits */}
              <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #1A1A1A' }}>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em' }}>YOUR CREDITS</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontFamily: bebas, fontSize: 48, color: '#FFF', lineHeight: 1, marginTop: 4 }}>{credits}CR</div>
                  <button onClick={() => setShowPurchaseModal(true)} style={{ fontFamily: bebas, fontSize: 14, color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '6px 14px', cursor: 'pointer', letterSpacing: '0.08em', marginTop: 4 }}>BUY MORE</button>
                </div>
              </div>

              {/* Cooldown */}
              {cooldownEnd && cooldownRemaining > 0 && (
                <div style={{ padding: '10px 16px', background: 'rgba(255,51,51,0.08)', borderBottom: '1px solid #1A1A1A' }}>
                  <div style={{ fontFamily: bebas, fontSize: 16, color: '#FF3333' }}>
                    ⏳ COOLDOWN · NEXT ATTACK IN {Math.floor(cooldownRemaining / 60)}:{(cooldownRemaining % 60).toString().padStart(2, '0')}
                  </div>
                </div>
              )}

              {!selectedTarget ? (
                <>
                  {/* Target selection */}
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
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 16px',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px solid #111',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontFamily: mono, fontSize: 12, color: '#666', width: 24 }}>#{t.rank}</span>
                        <div style={{ width: 32, height: 32, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: bebas, fontSize: 14, color: '#999', flexShrink: 0 }}>
                          {t.name.charAt(0)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: bebas, fontSize: 16, color: '#FFF', letterSpacing: '0.03em' }}>{t.name}</div>
                          <div style={{ height: 3, background: '#1A1A1A', marginTop: 3 }}>
                            <div style={{ height: 3, background: '#FF3333', width: `${chaosWidth}%`, transition: 'width 0.3s' }} />
                          </div>
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
                  {/* Weapons panel */}
                  <div style={{ padding: '12px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontFamily: bebas, fontSize: 20, color: '#FFF', letterSpacing: '0.03em' }}>
                      ATTACK {traders.find((t) => t.trader_id === selectedTarget)?.name ?? '???'}?
                    </div>
                    <button onClick={() => { setSelectedTarget(null); setSelectedWeapon(null); }} style={{ fontFamily: sans, fontSize: 10, color: '#999', background: 'transparent', border: 'none', cursor: 'pointer' }}>← BACK</button>
                  </div>

                  {WEAPONS.map((w) => {
                    const canAfford = credits >= w.cost;
                    const isSelected = selectedWeapon === w.type;
                    return (
                      <button
                        key={w.type}
                        onClick={() => canAfford && setSelectedWeapon(isSelected ? null : w.type)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          height: 56,
                          padding: '0 16px',
                          background: isSelected ? 'rgba(245,160,208,0.05)' : 'transparent',
                          border: 'none',
                          borderBottom: isSelected ? '2px solid #F5A0D0' : '1px solid #111',
                          cursor: canAfford ? 'pointer' : 'not-allowed',
                          opacity: canAfford ? 1 : 0.4,
                          width: '100%',
                          textAlign: 'left',
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

                  {selectedWeapon && (
                    <div style={{ padding: 16 }}>
                      <button
                        onClick={handleAttack}
                        disabled={!!(cooldownEnd && cooldownRemaining > 0)}
                        className="shake"
                        style={{
                          width: '100%',
                          height: 72,
                          background: (cooldownEnd && cooldownRemaining > 0) ? '#333' : '#F5A0D0',
                          color: '#0A0A0A',
                          border: 'none',
                          fontFamily: bebas,
                          fontSize: 28,
                          letterSpacing: '0.08em',
                          cursor: (cooldownEnd && cooldownRemaining > 0) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        ⚡ LAUNCH ATTACK
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =========================================================== */}
          {/* PREDICT TAB                                                  */}
          {/* =========================================================== */}
          {tab === 'predict' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ padding: '16px 16px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontFamily: bebas, fontSize: 28, color: '#FFF', letterSpacing: '0.03em' }}>WHO WINS ROUND {round?.round_number ?? '-'}?</div>
                  {isLowTime && !currentBet?.locked && (
                    <div style={{ fontFamily: mono, fontSize: 14, color: '#FF3333', animation: 'pulse 1s infinite', fontWeight: 700 }}>
                      {remainingStr}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <span style={{ fontFamily: mono, fontSize: 12, color: '#999' }}>{totalBets} BETS PLACED</span>
                  {betStreak > 0 && <span style={{ fontFamily: bebas, fontSize: 12, color: '#F5A0D0' }}>🔥 {betStreak} STREAK</span>}
                </div>
              </div>

              {/* Bet result */}
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

              {/* Locked bet display */}
              {currentBet?.locked && !currentBet.result && (
                <div style={{ padding: '16px', borderBottom: '1px solid #1A1A1A', background: 'rgba(245,160,208,0.05)' }}>
                  <div style={{ fontFamily: bebas, fontSize: 16, color: '#FFF' }}>YOU BET {currentBet.amount}CR ON {currentBet.team_name}</div>
                  <div style={{ fontFamily: bebas, fontSize: 20, color: '#00FF88', marginTop: 4 }}>POTENTIAL: +{currentBet.potential_payout}CR</div>
                  <div style={{ fontFamily: mono, fontSize: 12, color: '#999', marginTop: 2 }}>
                    ODDS: {outcomes.find((o) => o.id === currentBet.outcome_id)?.odds.toFixed(1) ?? '?'}X · BET LOCKED
                  </div>
                </div>
              )}

              {/* Team cards */}
              {!currentBet?.locked && outcomes.map((o, idx) => {
                const trader = activeTraders.find((t) => t.team_id === o.team_id);
                const isTop = idx === 0;
                const isLongShot = idx === outcomes.length - 1 && outcomes.length > 1;
                const isSelected = selectedOutcome === o.id;

                return (
                  <button
                    key={o.id}
                    onClick={() => setSelectedOutcome(isSelected ? null : o.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: 64,
                      padding: '0 16px',
                      background: isSelected ? '#111' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid #111',
                      borderLeft: isSelected ? '1px solid #F5A0D0' : '1px solid transparent',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: mono, fontSize: 11, color: '#666', width: 20 }}>#{trader?.rank ?? idx + 1}</span>
                      <div style={{ width: 36, height: 36, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: bebas, fontSize: 16, color: '#999', flexShrink: 0 }}>
                        {o.team_name.charAt(0)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: bebas, fontSize: 18, color: '#FFF', letterSpacing: '0.03em' }}>{o.team_name}</span>
                          {isTop && <span style={{ fontFamily: bebas, fontSize: 9, color: '#00FF88', border: '1px solid #00FF88', padding: '1px 5px' }}>POPULAR</span>}
                          {isLongShot && <span style={{ fontFamily: bebas, fontSize: 9, color: '#F5A0D0', border: '1px solid #F5A0D0', padding: '1px 5px' }}>LONG SHOT</span>}
                        </div>
                        <span style={{ fontFamily: mono, fontSize: 14, color: (trader?.return_pct ?? 0) >= 0 ? '#00FF88' : '#FF3333' }}>
                          {(trader?.return_pct ?? 0) >= 0 ? '+' : ''}{(trader?.return_pct ?? 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: bebas, fontSize: 24, color: '#FFF' }}>{o.odds.toFixed(1)}X</div>
                      <div style={{ fontFamily: mono, fontSize: 10, color: '#999' }}>{(o.probability * 100).toFixed(0)}%</div>
                    </div>
                    {/* Volume bar */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: '#111' }}>
                      <div style={{ height: 3, background: '#F5A0D0', width: `${(o.volume / maxVolume) * 100}%`, transition: 'width 0.3s' }} />
                    </div>
                  </button>
                );
              })}

              {/* Bet placement */}
              {selectedOutcome && !currentBet?.locked && (
                <div className="slideUp" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid #1A1A1A' }}>
                  <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em' }}>YOUR BET</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[50, 100, 200].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setBetAmount(betAmount === amt ? null : amt)}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          background: betAmount === amt ? '#F5A0D0' : 'transparent',
                          color: betAmount === amt ? '#0A0A0A' : '#666',
                          border: `1px solid ${betAmount === amt ? '#F5A0D0' : '#333'}`,
                          fontFamily: bebas,
                          fontSize: 16,
                          cursor: credits >= amt ? 'pointer' : 'not-allowed',
                          opacity: credits >= amt ? 1 : 0.4,
                        }}
                      >
                        {amt}CR
                      </button>
                    ))}
                    <button
                      onClick={() => setBetAmount(betAmount === credits ? null : credits)}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        background: betAmount === credits ? '#F5A0D0' : 'transparent',
                        color: betAmount === credits ? '#0A0A0A' : '#666',
                        border: `1px solid ${betAmount === credits ? '#F5A0D0' : '#333'}`,
                        fontFamily: bebas,
                        fontSize: 16,
                        cursor: 'pointer',
                      }}
                    >
                      ALL IN
                    </button>
                  </div>

                  {betAmount && (
                    <>
                      <div style={{
                        fontFamily: bebas,
                        fontSize: 28,
                        color: '#00FF88',
                        textAlign: 'center',
                        textShadow: '0 0 20px rgba(0,255,136,0.4)',
                      }}>
                        POTENTIAL PAYOUT: +{potentialPayout}CR
                      </div>

                      <button
                        onClick={handlePlaceBet}
                        style={{
                          width: '100%',
                          height: 72,
                          background: '#F5A0D0',
                          color: '#0A0A0A',
                          border: 'none',
                          fontFamily: bebas,
                          fontSize: 28,
                          letterSpacing: '0.08em',
                          cursor: 'pointer',
                        }}
                      >
                        🎲 PLACE BET
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
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
                flex: 1,
                padding: '8px 0 6px',
                background: 'transparent',
                border: 'none',
                borderTop: tab === t.key ? '2px solid #F5A0D0' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
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
                return (
                  <div key={pkg.id} style={{ border: pkg.popular ? '2px solid #F5A0D0' : '1px solid #222', background: pkg.popular ? 'rgba(245,160,208,0.04)' : '#111', padding: 12 }}>
                    {pkg.popular && <div style={{ fontFamily: bebas, fontSize: 9, color: '#F5A0D0', marginBottom: 4, letterSpacing: '0.1em' }}>MOST POPULAR</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontFamily: bebas, fontSize: 18, color: '#FFF' }}>{pkg.label}</span>
                        {pkg.bonus_pct > 0 && <span style={{ fontFamily: mono, fontSize: 10, color: '#00FF88', marginLeft: 8 }}>+{pkg.bonus_pct}%</span>}
                      </div>
                      <span style={{ fontFamily: mono, fontSize: 14, color: '#F5A0D0' }}>${(pkg.price_usd / 100).toFixed(2)}</span>
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
              <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textAlign: 'center' }}>BTC, ETH, SOL, USDC, DOGE, LTC, MATIC, SHIB & more</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
