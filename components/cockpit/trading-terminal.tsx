'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { calcUnrealizedPnl, calcPortfolioValue, calcReturnPct } from '@/lib/pnl';
import { PYTH_FEEDS } from '@/lib/pyth-feeds';
import { ATTACKS, DEFENSES } from '@/lib/weapons';
import { TopBar, AutoCloseWarning } from './top-bar';
import { LeftColumn } from './left-column';
import { CenterColumn } from './center-column';
import { RightColumn } from './right-column';
import { OverlayManager } from './overlays';
import type { Position } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TraderData {
  id: string;
  name: string;
  code: string;
  lobby_id: string;
  is_eliminated: boolean;
  avatar_url: string | null;
}

interface RoundData {
  id: string;
  round_number: number;
  status: string;
  started_at: string | null;
  duration_seconds: number;
  starting_balance: number;
}

interface StandingEntry {
  trader: { id: string; name: string };
  portfolioValue: number;
  returnPct: number;
  rank: number;
  teamName: string | null;
}

interface CreditData {
  balance: number;
  total_earned: number;
  total_spent: number;
}

interface ActiveEffect {
  id: string;
  type: string;
  source: 'attack' | 'defense';
  label: string;
  expiresAt: number | null;
  secondsRemaining: number;
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const bebas: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' };
const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' };
const sans: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ---------------------------------------------------------------------------
// Main TradingTerminal — composes all cockpit sub-components
// ---------------------------------------------------------------------------

export default function TradingTerminal() {
  const { id: lobbyId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  // Core state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trader, setTrader] = useState<TraderData | null>(null);
  const [round, setRound] = useState<RoundData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [credits, setCredits] = useState<CreditData>({ balance: 0, total_earned: 0, total_spent: 0 });
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [lobbyName, setLobbyName] = useState('BATTLE TRADE');
  const [totalTraders, setTotalTraders] = useState(0);
  const [startingBalance, setStartingBalance] = useState(10000);
  const [allTraders, setAllTraders] = useState<{ id: string; name: string }[]>([]);

  // Game state
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [activeEffects, setActiveEffects] = useState<ActiveEffect[]>([]);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [frozenAsset, setFrozenAsset] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  // ---- Timer ----
  useEffect(() => {
    if (!round?.started_at || round.status !== 'active') { setTimeRemaining(0); return; }
    const calc = () => {
      const start = new Date(round.started_at!).getTime();
      const end = start + round.duration_seconds * 1000;
      return Math.max(0, Math.floor((end - Date.now()) / 1000));
    };
    setTimeRemaining(calc());
    const interval = setInterval(() => setTimeRemaining(calc()), 1000);
    return () => clearInterval(interval);
  }, [round]);

  // ---- Lockout timer ----
  useEffect(() => {
    if (!isLockedOut || lockoutTime <= 0) return;
    const interval = setInterval(() => {
      setLockoutTime(prev => {
        if (prev <= 1) { setIsLockedOut(false); setActiveOverlay(null); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isLockedOut, lockoutTime]);

  // ---- Effects timer ----
  useEffect(() => {
    if (activeEffects.length === 0) return;
    const interval = setInterval(() => {
      setActiveEffects(prev => prev
        .map(e => ({ ...e, secondsRemaining: e.expiresAt ? Math.max(0, Math.floor((e.expiresAt - Date.now()) / 1000)) : 0 }))
        .filter(e => e.expiresAt === null || e.secondsRemaining > 0)
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeEffects.length]);

  // ---- Lookup trader by code ----
  const lookupTrader = useCallback(async () => {
    if (!code || !lobbyId) {
      setError('Missing trader code — use your registration link');
      setLoading(false);
      return;
    }

    const { data: traderRow } = await supabase
      .from('traders')
      .select('id, name, code, lobby_id, is_eliminated, avatar_url')
      .eq('lobby_id', lobbyId)
      .eq('code', code)
      .single();

    if (!traderRow) {
      setError('Invalid code — check your registration link');
      setLoading(false);
      return;
    }

    setTrader(traderRow as TraderData);
    return traderRow as TraderData;
  }, [code, lobbyId]);

  // ---- Fetch all initial data ----
  const fetchInitialData = useCallback(async (traderData: TraderData) => {
    // Lobby
    const { data: lobbyRow } = await supabase
      .from('lobbies')
      .select('name, config')
      .eq('id', lobbyId)
      .single();

    if (lobbyRow) {
      setLobbyName(lobbyRow.name);
      const config = lobbyRow.config as Record<string, unknown>;
      setStartingBalance((config.starting_balance as number) ?? 10000);
    }

    // All traders in lobby (for weapons target list)
    const { data: traderRows } = await supabase
      .from('traders')
      .select('id, name')
      .eq('lobby_id', lobbyId)
      .eq('is_eliminated', false);

    if (traderRows) {
      setAllTraders(traderRows.filter(t => t.id !== traderData.id));
      setTotalTraders(traderRows.length);
    }

    // Active round
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id, round_number, status, started_at, duration_seconds, starting_balance')
      .eq('lobby_id', lobbyId)
      .in('status', ['active', 'frozen', 'pending'])
      .order('round_number', { ascending: false })
      .limit(1);

    const activeRound = rounds?.[0] ?? null;
    if (activeRound) {
      setRound(activeRound as RoundData);
      if (activeRound.starting_balance) setStartingBalance(activeRound.starting_balance);
    }

    // Positions
    if (activeRound) {
      const { data: pos } = await supabase
        .from('positions')
        .select('*')
        .eq('trader_id', traderData.id)
        .eq('round_id', activeRound.id)
        .is('closed_at', null);
      if (pos) setPositions(pos as Position[]);
    }

    // Prices
    const { data: priceRows } = await supabase.from('prices').select('symbol, price');
    if (priceRows) {
      const p: Record<string, number> = {};
      for (const row of priceRows) p[row.symbol] = row.price;
      setPrices(p);
    }

    // Standings
    if (activeRound) {
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${activeRound.id}`);
        if (res.ok) {
          const data = await res.json();
          setStandings(data.standings ?? []);
        }
      } catch { /* Non-critical */ }
    }

    // Credits
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/sabotage/credits?trader_id=${traderData.id}`);
      if (res.ok) {
        const data = await res.json();
        setCredits(data);
      }
    } catch { /* Non-critical */ }

    // Check session for active sabotage effects
    try {
      const { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('trader_id', traderData.id)
        .eq('lobby_id', lobbyId)
        .single();

      if (session) {
        if (session.positions_locked) {
          setIsLockedOut(true);
          setLockoutTime(90);
          setActiveOverlay('locked');
        }
        if (session.frozen_asset) {
          setFrozenAsset(session.frozen_asset);
        }
      }
    } catch { /* Non-critical */ }

    setLoading(false);
  }, [lobbyId]);

  // ---- Init ----
  useEffect(() => {
    (async () => {
      const t = await lookupTrader();
      if (t) await fetchInitialData(t);
    })();
  }, [lookupTrader, fetchInitialData]);

  // ---- Realtime subscriptions ----
  useEffect(() => {
    if (!lobbyId || !trader) return;

    // Price updates
    const priceChannel = supabase.channel(`cockpit-${lobbyId}-prices`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, (payload) => {
        const row = payload.new as { symbol: string; price: number };
        setPrices(prev => ({ ...prev, [row.symbol]: row.price }));
      })
      .subscribe();

    // Position updates (own)
    const posChannel = supabase.channel(`cockpit-${trader.id}-positions`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `trader_id=eq.${trader.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPositions(prev => [...prev, payload.new as Position]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Position;
          if (updated.closed_at) {
            setPositions(prev => prev.filter(p => p.id !== updated.id));
          } else {
            setPositions(prev => prev.map(p => p.id === updated.id ? updated : p));
          }
        }
      })
      .subscribe();

    // Sabotage channel (personal)
    const sabotageChannel = supabase.channel(`trader-${trader.id}`)
      .on('broadcast', { event: 'sabotage' }, (payload) => {
        const msg = payload.payload as Record<string, unknown>;
        const sabType = (msg.type as string) ?? 'unknown';
        const sabotageType = (msg.sabotage_type as string) ?? sabType;

        // Handle different sabotage types
        if (sabotageType === 'lockout' || sabType === 'sabotage_received') {
          const sab = msg.sabotage as Record<string, unknown> | undefined;
          const type = (sab?.type as string) ?? sabotageType;

          if (type === 'lockout') {
            setIsLockedOut(true);
            setLockoutTime(90);
            setActiveOverlay('locked');
          } else if (type === 'fake_news') {
            setActiveOverlay('fakenews');
          } else if (type === 'asset_freeze') {
            setFrozenAsset((sab?.payload as Record<string, string>)?.asset ?? 'BTCUSDT');
            addEffect('asset_freeze', 'attack', 60);
          } else if (type === 'expose') {
            addEffect('expose', 'attack', 120);
          } else if (type === 'glitch') {
            addEffect('glitch', 'attack', 10);
          }
        }

        if (sabType === 'defense_activated') {
          const defType = (msg.defense_type as string) ?? 'shield';
          const dur = defType === 'ghost_mode' ? 120 : defType === 'speed_boost' ? 60 : null;
          if (dur) addEffect(defType, 'defense', dur);
        }
      })
      .subscribe();

    // Round updates
    const roundChannel = supabase.channel(`cockpit-${lobbyId}-rounds`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds' }, (payload) => {
        const updated = payload.new as Record<string, unknown>;
        if (updated.lobby_id === lobbyId || !updated.lobby_id) {
          setRound(updated as unknown as RoundData);
          if (updated.status === 'frozen') setActiveOverlay('frozen');
        }
      })
      .subscribe();

    channelsRef.current = [priceChannel, posChannel, sabotageChannel, roundChannel];

    return () => {
      for (const ch of channelsRef.current) supabase.removeChannel(ch);
      channelsRef.current = [];
    };
  }, [lobbyId, trader]);

  // ---- Periodic standings refresh ----
  useEffect(() => {
    if (!round || !lobbyId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${round.id}`);
        if (res.ok) {
          const data = await res.json();
          setStandings(data.standings ?? []);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [round, lobbyId]);

  // ---- Helpers ----
  function addEffect(type: string, source: 'attack' | 'defense', durationSec: number) {
    const weapon = ATTACKS.find(a => a.id === type) ?? DEFENSES.find(d => d.id === type);
    setActiveEffects(prev => [...prev, {
      id: `${type}-${Date.now()}`,
      type,
      source,
      label: weapon?.name ?? type.replace(/_/g, ' ').toUpperCase(),
      expiresAt: Date.now() + durationSec * 1000,
      secondsRemaining: durationSec,
    }]);
  }

  // ---- Trade actions ----
  const openPosition = async (direction: 'long' | 'short', size: number) => {
    if (!trader || !round) return;

    const symbolUsdt = `${selectedSymbol}USDT`;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trader_id: trader.id,
          round_id: round.id,
          symbol: symbolUsdt,
          direction,
          size,
          leverage: 5, // TODO: pass from center column
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === 'LOCKED_OUT') {
          setIsLockedOut(true);
          setLockoutTime(data.remaining ?? 90);
        }
      }
    } catch { /* Network error */ }
  };

  const closePosition = async (positionId: string) => {
    try {
      await fetch(`/api/lobby/${lobbyId}/positions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_id: positionId }),
      });
    } catch { /* Network error */ }
  };

  // ---- Weapon actions ----
  const launchAttack = async (attackId: string, targetId: string) => {
    if (!trader) return;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/sabotage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attacker_id: trader.id,
          target_id: targetId,
          type: attackId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.credits_remaining !== undefined) {
          setCredits(prev => ({ ...prev, balance: data.credits_remaining }));
        }
      }
    } catch { /* Network error */ }
  };

  const activateDefense = async (defenseId: string) => {
    if (!trader) return;
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/sabotage/defense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trader_id: trader.id,
          type: defenseId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.credits_remaining !== undefined) {
          setCredits(prev => ({ ...prev, balance: data.credits_remaining }));
        }
        const defense = DEFENSES.find(d => d.id === defenseId);
        if (defense?.duration) {
          addEffect(defenseId, 'defense', defense.duration);
        }
      }
    } catch { /* Network error */ }
  };

  // ---- Portfolio calc ----
  const openPositions = positions.filter(p => !p.closed_at);
  const closedPositions = positions.filter(p => p.closed_at);
  const portfolioValue = calcPortfolioValue(startingBalance, openPositions, closedPositions, prices);
  const returnPct = calcReturnPct(portfolioValue, startingBalance);

  const myRank = standings.find(s => s.trader.id === trader?.id)?.rank ?? 0;
  const canTrade = round?.status === 'active' && !trader?.is_eliminated;
  const isUrgent = timeRemaining > 0 && timeRemaining < 120;
  const timeFmt = `${Math.floor(timeRemaining / 60)}:${(timeRemaining % 60).toString().padStart(2, '0')}`;

  // Build asset list from prices for center column
  const availableSymbols = Object.keys(PYTH_FEEDS).map(s => s.replace('USD', ''));
  const assets = availableSymbols.slice(0, 12).map(sym => {
    const usdt = `${sym}USDT`;
    const usd = `${sym}USD`;
    const price = prices[usdt] ?? prices[usd] ?? 0;
    return {
      symbol: sym,
      price,
      change24h: 0,
      high24h: price * 1.02,
      low24h: price * 0.98,
      volume: price > 10000 ? '24.1B' : price > 100 ? '8.2B' : '1.4B',
      funding: 0.01,
    };
  });

  // Build order history from recent closed positions
  const orderHistory = closedPositions.slice(-3).map(p => ({
    time: p.closed_at ? new Date(p.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--',
    asset: p.symbol.replace('USDT', ''),
    type: p.direction as 'long' | 'short',
    size: p.size,
    result: (p.realized_pnl ?? 0) as number | 'open',
  }));

  // Build price data for right column intel
  const priceData = ['BTC', 'ETH', 'SOL'].map(sym => {
    const usdt = `${sym}USDT`;
    const usd = `${sym}USD`;
    const price = prices[usdt] ?? prices[usd] ?? 0;
    return { symbol: sym, price, change: 0 };
  });

  // ---- Loading ----
  if (loading) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } button { border-radius: 0 !important; }`}</style>
        <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
          <div className="flex flex-col items-center gap-[16px]">
            <div className="w-[8px] h-[8px] bg-[#F5A0D0] animate-pulse" />
            <span style={bebas} className="text-[24px] text-[#555]">LOADING TERMINAL...</span>
          </div>
        </div>
      </>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
        <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
          <div className="flex flex-col items-center gap-[16px]">
            <span style={bebas} className="text-[48px] text-[#FF3333]">ACCESS DENIED</span>
            <span style={sans} className="text-[14px] text-[#555]">{error}</span>
          </div>
        </div>
      </>
    );
  }

  // ---- Eliminated ----
  if (trader?.is_eliminated) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <OverlayManager
          activeOverlay="eliminated"
          onClose={() => {}}
          trader={{ name: trader.name, avatar: trader.avatar_url ?? '/brand/logo-icon.png', returnPct }}
        />
      </>
    );
  }

  const currentPos = openPositions.find(p => p.symbol.replace('USDT', '') === selectedSymbol);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { border-radius: 0 !important; }
        button:active:not(:disabled) { transform: scale(0.97) !important; filter: brightness(0.85) !important; }
        button { transition: transform 100ms ease, filter 100ms ease; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0A0A0A; }
        ::-webkit-scrollbar-thumb { background: #333; }
      `}</style>

      {/* Scanlines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '2px 2px', pointerEvents: 'none', zIndex: 999 }} />

      {/* Overlays */}
      <OverlayManager
        activeOverlay={activeOverlay}
        onClose={() => setActiveOverlay(null)}
        trader={{ name: trader?.name ?? '', avatar: trader?.avatar_url ?? '/brand/logo-icon.png', returnPct }}
      />

      <div className="h-screen bg-[#0A0A0A] flex flex-col overflow-hidden">
        {/* Auto-close warning when round ending */}
        {isUrgent && round?.status === 'active' && (
          <AutoCloseWarning secondsRemaining={timeRemaining} />
        )}

        {/* Top Bar */}
        <TopBar
          trader={{
            name: trader?.name ?? '',
            handle: `@${(trader?.name ?? '').toLowerCase().replace(/\s/g, '')}`,
            avatar: trader?.avatar_url ?? '/brand/logo-icon.png',
            rank: myRank,
            totalTraders,
            balance: portfolioValue,
            returnPct,
          }}
          round={{
            current: round?.round_number ?? 0,
            total: 4,
            leverage: '5X',
            timeRemaining: round?.status === 'active' ? timeFmt : '--:--',
            isUrgent,
          }}
          credits={credits.balance}
          activityStatus="active"
        />

        {/* Main 3-column layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Positions + Standings */}
          <LeftColumn
            positions={openPositions.map(p => {
              const pnl = calcUnrealizedPnl(p, prices[p.symbol] ?? 0);
              const pnlPct = p.size > 0 ? (pnl / p.size) * 100 : 0;
              return {
                id: p.id,
                type: p.direction as 'long' | 'short',
                asset: p.symbol.replace('USDT', ''),
                size: p.size,
                pnl,
                pnlPct,
                liqPrice: p.direction === 'long'
                  ? p.entry_price * (1 - 1 / p.leverage)
                  : p.entry_price * (1 + 1 / p.leverage),
                isNearLiquidation: Math.abs(pnlPct) > 80,
              };
            })}
            activityState="active"
            returnPct={returnPct}
            standings={standings.slice(0, 8).map(s => ({
              rank: s.rank,
              name: s.teamName ?? s.trader.name,
              returnPct: s.returnPct,
              isYou: s.trader.id === trader?.id,
              isEliminated: false,
              activityStatus: 'active' as const,
            }))}
            events={[]}
            onClosePosition={closePosition}
          />

          {/* Center: Chart + Trade Execution */}
          <CenterColumn
            assets={assets}
            selectedAsset={selectedSymbol}
            onAssetChange={setSelectedSymbol}
            currentPosition={currentPos ? {
              type: currentPos.direction as 'long' | 'short',
              entryPrice: currentPos.entry_price,
              liqPrice: currentPos.direction === 'long'
                ? currentPos.entry_price * (1 - 1 / currentPos.leverage)
                : currentPos.entry_price * (1 + 1 / currentPos.leverage),
            } : undefined}
            roundMinimum={500}
            isLockedOut={isLockedOut}
            lockoutTime={lockoutTime}
            isFrozen={round?.status === 'frozen'}
            isFullPositions={openPositions.length >= 3}
            assetRestriction={frozenAsset?.replace('USDT', '')}
            isIdleWarning={false}
            credits={credits.balance}
            orderHistory={orderHistory}
            onExecute={(direction, size) => {
              if (!canTrade) return;
              openPosition(direction, size);
            }}
          />

          {/* Right: Weapons + Intel */}
          <RightColumn
            prices={priceData}
            activeEffects={activeEffects}
            credits={credits.balance}
            onBetOnSelf={() => {/* TODO: prediction market */}}
            onLaunchAttack={launchAttack}
            onActivateDefense={activateDefense}
            traders={allTraders}
          />
        </div>
      </div>
    </>
  );
}
