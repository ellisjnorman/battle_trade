'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const bebas = "'Bebas Neue', sans-serif";
const mono = "'JetBrains Mono', monospace";
const sans = "'DM Sans', sans-serif";

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

const WEAPONS = [
  { type: 'lockout', icon: '🔒', name: 'LOCKOUT', desc: "Can't open positions 90s", cost: 200 },
  { type: 'fake_news', icon: '📰', name: 'FAKE NEWS', desc: 'Inject a headline', cost: 150 },
  { type: 'margin_squeeze', icon: '💸', name: 'SQUEEZE', desc: 'Take 10% of their money', cost: 300 },
  { type: 'expose', icon: '🎯', name: 'EXPOSE', desc: 'Show their positions publicly', cost: 100 },
  { type: 'asset_freeze', icon: '🔀', name: 'FREEZE', desc: 'Lock them to one asset', cost: 250 },
  { type: 'glitch', icon: '🌀', name: 'GLITCH', desc: 'Visual chaos on their screen', cost: 50 },
  { type: 'forced_trade', icon: '⚡', name: 'FORCE', desc: 'Make them open a random trade', cost: 500 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpectatePage() {
  const { id: lobbyId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const spectatorCode = searchParams.get('code');

  const [tab, setTab] = useState<Tab>('watch');
  const [spectatorId, setSpectatorId] = useState<string | null>(null);

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

  // ---------------------------------------------------------------------------
  // Initialize spectator
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Look up spectator by code (simplified — use trader_id from URL or first available)
    const initSpectator = async () => {
      if (!spectatorCode) return;
      // For now, get all traders and use the code as lookup
      const { data } = await supabase
        .from('traders')
        .select('id')
        .eq('lobby_id', lobbyId)
        .limit(1)
        .single();
      if (data) setSpectatorId(data.id);
    };
    initSpectator();
  }, [lobbyId, spectatorCode]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/admin/status`, {
        headers: { Authorization: process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? '' },
      });
      const data = await res.json();
      if (data.round) setRound(data.round);
      if (data.traders) setTraders(data.traders);
    } catch {
      // Fallback: fetch leaderboard
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/leaderboard`);
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
      } catch {
        // silent
      }
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
    lobbyCh.on('broadcast', { event: 'forced_trade_public' }, ({ payload }) => {
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
    fetchStatus();
    fetchCredits();
    fetchMarket();
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
      }
    } catch {
      // silent
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
        setCurrentBet({
          outcome_id: selectedOutcome,
          team_name: outcome?.team_name ?? '???',
          amount: betAmount,
          potential_payout: data.potential_payout ?? Math.round(betAmount * (outcome?.odds ?? 1)),
          locked: true,
        });
        setCredits(data.new_balance ?? credits - betAmount);
        fetchMarket();
      }
    } catch {
      // silent
    }
  };

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const remaining = round ? Math.max(0, round.duration_seconds - elapsed) : 0;
  const remainingStr = `${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
  const isLowTime = remaining < 120 && remaining > 0;

  const activeTraders = traders.filter((t) => !t.is_eliminated && t.rank !== null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  const selectedOutcomeData = outcomes.find((o) => o.id === selectedOutcome);
  const potentialPayout = betAmount && selectedOutcomeData ? Math.round(betAmount * selectedOutcomeData.odds) : 0;

  const maxVolume = Math.max(1, ...outcomes.map((o) => o.volume));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
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

        {/* ============================================================= */}
        {/* STICKY HEADER                                                 */}
        {/* ============================================================= */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: isLowTime ? 'rgba(255,51,51,0.05)' : '#0A0A0A' }}>
          <div style={{ fontFamily: bebas, fontSize: 20, color: '#FFF', letterSpacing: '0.05em' }}>
            ROUND {round?.round_number ?? '-'} · <span style={{ color: isLowTime ? '#FF3333' : '#FFF' }}>{round?.status === 'active' ? remainingStr : round?.status?.toUpperCase() ?? '--'}</span>
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
                    <div style={{ fontFamily: bebas, fontSize: 24, color: '#333' }}>WAITING FOR ACTION...</div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: '#333', marginTop: 8 }}>Events will appear here in real-time</div>
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
                <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>YOUR CREDITS</div>
                <div style={{ fontFamily: bebas, fontSize: 48, color: '#FFF', lineHeight: 1, marginTop: 4 }}>{credits}CR</div>
                <div style={{ fontFamily: sans, fontSize: 9, color: '#333', marginTop: 4 }}>SPONSORED BY PARTNER</div>
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
                        <div style={{ width: 32, height: 32, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: bebas, fontSize: 14, color: '#555', flexShrink: 0 }}>
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
                    <button onClick={() => { setSelectedTarget(null); setSelectedWeapon(null); }} style={{ fontFamily: sans, fontSize: 10, color: '#555', background: 'transparent', border: 'none', cursor: 'pointer' }}>← BACK</button>
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
                          <span style={{ fontFamily: sans, fontSize: 10, color: '#555', marginLeft: 8 }}>{w.desc}</span>
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
                <div style={{ fontFamily: bebas, fontSize: 28, color: '#FFF', letterSpacing: '0.03em' }}>WHO WINS ROUND {round?.round_number ?? '-'}?</div>
                <div style={{ fontFamily: mono, fontSize: 12, color: '#555', marginTop: 4 }}>{totalBets} BETS PLACED</div>
              </div>

              {/* Bet result */}
              {currentBet?.result === 'won' && (
                <div style={{ padding: 32, textAlign: 'center', background: 'rgba(0,255,136,0.08)' }}>
                  <div style={{ fontSize: 48 }}>🏆</div>
                  <div style={{ fontFamily: bebas, fontSize: 48, color: '#00FF88', marginTop: 8 }}>YOU CALLED IT</div>
                  <div style={{ fontFamily: bebas, fontSize: 48, color: '#00FF88' }}>+{currentBet.potential_payout}CR ADDED</div>
                </div>
              )}
              {currentBet?.result === 'lost' && (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <div style={{ fontFamily: bebas, fontSize: 64, color: '#FF3333' }}>rekt.</div>
                  <div style={{ fontFamily: sans, fontSize: 14, color: '#555', marginTop: 8 }}>better luck next round</div>
                </div>
              )}

              {/* Locked bet display */}
              {currentBet?.locked && !currentBet.result && (
                <div style={{ padding: '16px', borderBottom: '1px solid #1A1A1A', background: 'rgba(245,160,208,0.05)' }}>
                  <div style={{ fontFamily: bebas, fontSize: 16, color: '#FFF' }}>YOU BET {currentBet.amount}CR ON {currentBet.team_name}</div>
                  <div style={{ fontFamily: bebas, fontSize: 20, color: '#00FF88', marginTop: 4 }}>POTENTIAL: +{currentBet.potential_payout}CR</div>
                  <div style={{ fontFamily: mono, fontSize: 12, color: '#555', marginTop: 2 }}>
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
                      <div style={{ width: 36, height: 36, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: bebas, fontSize: 16, color: '#555', flexShrink: 0 }}>
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
                      <div style={{ fontFamily: mono, fontSize: 10, color: '#555' }}>{(o.probability * 100).toFixed(0)}%</div>
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
                  <div style={{ fontFamily: sans, fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>YOUR BET</div>
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
    </>
  );
}
