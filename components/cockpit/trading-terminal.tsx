'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { calcPortfolioValue, calcReturnPct } from '@/lib/pnl';
import { PYTH_FEEDS, MARKET_TYPES, getFeedsByMarket, type MarketType } from '@/lib/pyth-feeds';
import { ATTACKS, DEFENSES } from '@/lib/weapons';
import { OverlayManager } from './overlays';
import BattleEndOverlay from '@/components/battle-end-overlay';

import { CREDIT_PACKAGES, totalCredits, type CreditPackage, type PaymentMethod } from '@/lib/payments';
import { getLiquidationPrice } from '@/lib/liquidation';
import { useToastStore } from '@/lib/toast-store';
import { SectionErrorBoundary } from '@/components/error-boundary';
import LobbyChat, { type ChatCommand } from '@/components/lobby-chat';
import TutorialOverlay, { TutorialTrigger, resetTutorial } from '@/components/tutorial-overlay';
import type { Position } from '@/types';

// ---------------------------------------------------------------------------
// Font shortcuts (inline only — no CSS classes)
// ---------------------------------------------------------------------------
const B: React.CSSProperties = { fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", letterSpacing: '0.05em' };
const M: React.CSSProperties = { fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", letterSpacing: '-0.02em' };
const S: React.CSSProperties = { fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif" };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TraderData { id: string; name: string; code: string; lobby_id: string; is_eliminated: boolean; avatar_url: string | null; profile_id: string | null }
interface RoundData { id: string; round_number: number; status: string; started_at: string | null; duration_seconds: number; starting_balance: number }
interface StandingEntry { trader: { id: string; name: string }; portfolioValue: number; returnPct: number; rank: number; teamName: string | null }
interface CreditData { balance: number; total_earned: number; total_spent: number }
interface ActiveEffect { id: string; type: string; source: 'attack' | 'defense'; label: string; expiresAt: number | null; secondsRemaining: number }
interface FeedItem { id: string; text: string; color: string; icon: string; time: number }
interface RoundResultData { round_number: number; winner_name: string | null; winner_return: number | null; eliminated_name: string | null }
interface EventAlert { id: string; headline: string; type: string; asset: string | null; expiresAt: number }

/** Build auth headers for API calls — sends trader code or guest ID */
function getAuthHeaders(traderCode?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (traderCode) h['X-Trader-Code'] = traderCode;
  // Also send guest ID if available
  const guestRaw = typeof window !== 'undefined' ? localStorage.getItem('bt_guest') : null;
  if (guestRaw) {
    try { const g = JSON.parse(guestRaw); if (g?.guest_id) h['X-Guest-Id'] = g.guest_id; } catch {}
  }
  return h;
}

const DEFAULT_TICKER_ASSETS = ['BTC', 'ETH', 'SOL', 'DOGE', 'AVAX', 'LINK', 'XRP', 'ADA', 'DOT', 'UNI', 'AAVE', 'ARB', 'OP', 'SUI', 'APT', 'NEAR', 'INJ'];
const CORE_ASSETS = (() => {
  if (typeof window === 'undefined') return DEFAULT_TICKER_ASSETS;
  try {
    const saved = localStorage.getItem('bt_ticker_assets');
    if (saved) return JSON.parse(saved) as string[];
  } catch {}
  return DEFAULT_TICKER_ASSETS;
})();
const SIZES = [500, 1000, 2000, 5000];
const LEVS = [2, 5, 10, 20, 50];
const fmtP = (p: number) => p === 0 ? '---' : p > 100 ? p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p > 1 ? p.toFixed(2) : p.toFixed(6);

// ===========================================================================
export default function TradingTerminal() {
  const { id: lobbyId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trader, setTrader] = useState<TraderData | null>(null);
  const [round, setRound] = useState<RoundData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [credits, setCredits] = useState<CreditData>({ balance: 0, total_earned: 0, total_spent: 0 });
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [lobbyName, setLobbyName] = useState('');
  const [totalTraders, setTotalTraders] = useState(0);
  const [startingBalance, setStartingBalance] = useState(10000);
  const [allTraders, setAllTraders] = useState<{ id: string; name: string }[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<'long' | 'short' | 'spot' | null>(null);
  const [selectedSize, setSelectedSize] = useState(2000);
  const [leverage, setLeverage] = useState(5);
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop_limit' | 'trailing_stop'>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [trailPct, setTrailPct] = useState('5');
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [activeEffects, setActiveEffects] = useState<ActiveEffect[]>([]);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [frozenAsset, setFrozenAsset] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [mobileTab, setMobileTab] = useState<'chart' | 'trade' | 'battle' | 'rank'>('chart');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [showMoreAssets, setShowMoreAssets] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetTab, setAssetTab] = useState<'all' | MarketType>('all');
  const assetDropdownRef = useRef<HTMLDivElement>(null);
  const assetSearchRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((s) => s.addToast);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [defenseCooldown, setDefenseCooldown] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [prevRanks, setPrevRanks] = useState<Record<string, number>>({});
  const [roundResults, setRoundResults] = useState<RoundResultData[]>([]);
  const [showRoundResult, setShowRoundResult] = useState<RoundResultData | null>(null);
  const [eventAlert, setEventAlert] = useState<EventAlert | null>(null);

  const [marketData, setMarketData] = useState<Record<string, { change24h: number | null; volume24h: number | null; longRatio: number | null; shortRatio: number | null }>>({});
  const [fearGreed, setFearGreed] = useState<{ value: number | null; label: string | null }>({ value: null, label: null });
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [lastMilestone, setLastMilestone] = useState(0);
  const [winStreak, setWinStreak] = useState(0);
  const [battleEndData, setBattleEndData] = useState<{ rank: number; totalPlayers: number; returnPct: number } | null>(null);
  const [rankFlash, setRankFlash] = useState<'up' | 'down' | null>(null);
  const [leverageTiers, setLeverageTiers] = useState<number[]>(LEVS);
  const [orderBook, setOrderBook] = useState<{ bids: { price: number; size: number; total?: number }[]; asks: { price: number; size: number; total?: number }[]; spread: number; spreadPct: number; midPrice: number } | null>(null);
  const [showOrderBook, setShowOrderBook] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showTutorial, setShowTutorial] = useState(0); // increment to re-trigger
  const [globalRank, setGlobalRank] = useState<number | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);

  const [tradeFlashId, setTradeFlashId] = useState<string | null>(null);
  const prevRpRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const roundResultTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tradeFlashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rankFlashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup all one-shot timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(flashTimerRef.current);
      clearTimeout(roundResultTimerRef.current);
      clearTimeout(tradeFlashTimerRef.current);
      clearTimeout(rankFlashTimerRef.current);
    };
  }, []);

  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const allTradersRef = useRef<{ id: string; name: string }[]>([]);
  useEffect(() => { allTradersRef.current = allTraders; }, [allTraders]);

  const addFeedItem = useCallback((text: string, color: string, icon: string) => {
    const id = `f-${Date.now()}-${Math.random()}`;
    setFeedItems(p => [{ id, text, color, icon, time: Date.now() }, ...p].slice(0, 20));
  }, []);

  // ── Buy credits ──
  const handlePurchase = useCallback(async (pkg: CreditPackage, method: PaymentMethod) => {
    if (!trader) return;
    setPurchaseLoading(`${pkg.id}-${method}`);
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/credits/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: pkg.id, payment_method: method, trader_id: trader.id }),
      });
      const data = await res.json();
      if (!res.ok) { addToast(data.error || 'Purchase failed', 'error'); return; }
      if (data.url) window.open(data.url, '_blank');
    } catch { addToast('Purchase failed', 'error'); }
    finally { setPurchaseLoading(null); }
  }, [trader, lobbyId, addToast]);

  // ── Screen flash ──
  const flash = useCallback((color: string) => {
    setFlashColor(color);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashColor(null), 300);
  }, []);

  // ── Timers ──
  useEffect(() => {
    if (!round?.started_at || round.status !== 'active') { setTimeRemaining(0); return; }
    const calc = () => Math.max(0, Math.floor((new Date(round.started_at!).getTime() + round.duration_seconds * 1000 - Date.now()) / 1000));
    setTimeRemaining(calc());
    const i = setInterval(() => setTimeRemaining(calc()), 1000);
    return () => clearInterval(i);
  }, [round]);

  useEffect(() => {
    if (!isLockedOut || lockoutTime <= 0) return;
    const i = setInterval(() => setLockoutTime(p => { if (p <= 1) { setIsLockedOut(false); setActiveOverlay(null); return 0; } return p - 1; }), 1000);
    return () => clearInterval(i);
  }, [isLockedOut, lockoutTime]);

  useEffect(() => {
    if (activeEffects.length === 0) return;
    const i = setInterval(() => setActiveEffects(p => p.map(e => ({ ...e, secondsRemaining: e.expiresAt ? Math.max(0, Math.floor((e.expiresAt - Date.now()) / 1000)) : 0 })).filter(e => e.expiresAt === null || e.secondsRemaining > 0)), 1000);
    return () => clearInterval(i);
  }, [activeEffects.length]);

  // Cooldown timers (attack + defense)
  useEffect(() => {
    if (cooldownRemaining <= 0 && defenseCooldown <= 0) return;
    const i = setInterval(() => {
      setCooldownRemaining(p => Math.max(0, p - 1));
      setDefenseCooldown(p => Math.max(0, p - 1));
    }, 1000);
    return () => clearInterval(i);
  }, [cooldownRemaining, defenseCooldown]);

  // Event alert countdown
  useEffect(() => {
    if (!eventAlert) return;
    const i = setInterval(() => {
      if (Date.now() >= eventAlert.expiresAt) { setEventAlert(null); }
    }, 1000);
    return () => clearInterval(i);
  }, [eventAlert]);

  // ── Limit order fill polling ──
  useEffect(() => {
    if (!lobbyId || !round || round.status !== 'active') return;
    const hasPending = positions.some(p => p.status === 'pending');
    const hasTrailing = positions.some(p => p.status === 'open' && p.order_type === 'trailing_stop');
    if (!hasPending && !hasTrailing) return;
    const poll = async () => {
      try {
        const r = await fetch(`/api/lobby/${lobbyId}/positions/fill`, { method: 'POST' });
        if (r.ok) {
          const d = await r.json();
          if (d.filled > 0) addToast(`${d.filled} limit order${d.filled > 1 ? 's' : ''} filled!`, 'success', '✓');
          if (d.stopped > 0) addToast(`${d.stopped} trailing stop${d.stopped > 1 ? 's' : ''} hit!`, 'info', '🛑');
        }
      } catch { /* polling failure is non-blocking */ }
    };
    const i = setInterval(poll, 15000);
    return () => clearInterval(i);
  }, [lobbyId, round, positions, addToast]);

  // ── Data loading ──
  const lookupTrader = useCallback(async () => {
    if (!code || !lobbyId) { setError('Missing trader code'); setLoading(false); return; }
    try {
      const { data: t } = await supabase.from('traders').select('id, name, code, lobby_id, is_eliminated, avatar_url').eq('lobby_id', lobbyId).eq('code', code).single();
      if (!t) { setError('Invalid code'); setLoading(false); return; }
      setTrader(t as TraderData); return t as TraderData;
    } catch (err) {
      setError('Failed to load trader data'); setLoading(false); return;
    }
  }, [code, lobbyId]);

  const fetchInitialData = useCallback(async (td: TraderData) => {
    try {
    const { data: lobby } = await supabase.from('lobbies').select('name, config').eq('id', lobbyId).single();
    if (lobby) {
      setLobbyName(lobby.name);
      const cfg = lobby.config as Record<string, unknown>;
      setStartingBalance((cfg?.starting_balance as number) ?? 10000);

      const lt = (cfg?.leverage_tiers as number[]);
      if (lt?.length) { setLeverageTiers(lt.sort((a, b) => a - b)); setLeverage(lt[Math.floor(lt.length / 2)] ?? lt[0]); }
    }
    const { data: trs } = await supabase.from('traders').select('id, name').eq('lobby_id', lobbyId).eq('is_eliminated', false);
    if (trs) { setAllTraders(trs.filter(t => t.id !== td.id)); setTotalTraders(trs.length); }
    const { data: rnds } = await supabase.from('rounds').select('id, round_number, status, started_at, duration_seconds, starting_balance').eq('lobby_id', lobbyId).in('status', ['active', 'frozen', 'pending']).order('round_number', { ascending: false }).limit(1);
    const ar = rnds?.[0] ?? null;
    if (ar) { setRound(ar as RoundData); if (ar.starting_balance) setStartingBalance(ar.starting_balance); }
    if (ar) { const { data: pos } = await supabase.from('positions').select('*').eq('trader_id', td.id).eq('round_id', ar.id).is('closed_at', null); if (pos) setPositions(pos as Position[]); }
    const { data: pr } = await supabase.from('prices').select('symbol, price');
    if (pr) { const p: Record<string, number> = {}; for (const r of pr) p[r.symbol] = r.price; setPrices(p); }
    if (ar) { try { const r = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${ar.id}`); if (r.ok) setStandings((await r.json()).standings ?? []); } catch {} }
    try { const r = await fetch(`/api/lobby/${lobbyId}/sabotage/credits?trader_id=${td.id}`); if (r.ok) setCredits(await r.json()); } catch {}
    try { const { data: s } = await supabase.from('sessions').select('*').eq('trader_id', td.id).eq('lobby_id', lobbyId).single(); if (s?.positions_locked) { setIsLockedOut(true); setLockoutTime(90); setActiveOverlay('locked'); } if (s?.frozen_asset) setFrozenAsset(s.frozen_asset); } catch {}
    // Fetch completed round history
    try {
      const { data: completedRounds } = await supabase.from('rounds').select('id, round_number, status').eq('lobby_id', lobbyId).eq('status', 'completed').order('round_number');
      if (completedRounds?.length) {
        const results: RoundResultData[] = [];
        for (const cr of completedRounds) {
          try {
            const lr = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${cr.id}`);
            if (lr.ok) {
              const ld = await lr.json();
              const w = ld.standings?.[0];
              if (w) results.push({ round_number: cr.round_number, winner_name: w.teamName ?? w.trader.name, winner_return: w.returnPct, eliminated_name: null });
            }
          } catch {}
        }
        if (results.length) setRoundResults(results);
      }
    } catch {}
    // Fetch market data (24h change, volume, sentiment)
    try { const r = await fetch('/api/market-data'); if (r.ok) { const d = await r.json(); setMarketData(d.assets ?? {}); setFearGreed(d.fearGreed ?? { value: null, label: null }); } } catch {}
    } catch (err) {
      setError('Failed to load lobby data');
    } finally {
      setLoading(false);
    }
  }, [lobbyId]);

  useEffect(() => {
    (async () => {
      const t = await lookupTrader();
      if (t) {
        await fetchInitialData(t);
        // Fetch global rank from profile
        if (t.profile_id) {
          try {
            const r = await fetch(`/api/profile/${t.profile_id}`);
            if (r.ok) {
              const p = await r.json();
              setGlobalRank(p.global_rank ?? null);
            }
          } catch {}
          // Get total players count
          try {
            const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
            setTotalPlayers(count ?? null);
          } catch {}
        }
      }
    })();
  }, [lookupTrader, fetchInitialData, lobbyId]);


  // ── Auto-admin tick loop (drives bot trading + round transitions for practice lobbies) ──
  useEffect(() => {
    if (!lobbyId || !trader) return;
    let active = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/lobby/${lobbyId}/tick`, { method: 'POST' });
        if (!r.ok || !active) return;
        const d = await r.json();
        if (!d.auto) return; // Not an auto-admin lobby

        // Update round info
        if (d.round) {
          setRound(prev => prev ? { ...prev, round_number: d.round.round_number, status: d.round.status } : prev);
          setTimeRemaining(Math.round(d.round.time_remaining ?? 0));
        }

        // Update prices from tick (keeps chart + PnL live)
        if (d.prices && typeof d.prices === 'object') {
          setPrices(prev => ({ ...prev, ...d.prices }));
        }

        // Update standings from tick (includes live PnL)
        if (d.standings && Array.isArray(d.standings) && d.standings.length > 0) {
          setStandings(d.standings.map((s: { trader_id: string; name: string; portfolio_value: number; return_pct: number; is_eliminated: boolean }, i: number) => ({
            trader: { id: s.trader_id, name: s.name },
            portfolioValue: s.portfolio_value,
            returnPct: s.return_pct,
            rank: i + 1,
            teamName: null,
          })));
        }

        if (d.game_over || d.status === 'completed') {
          const myRank = (d.standings ?? []).findIndex((s: { trader_id: string }) => s.trader_id === trader?.id) + 1;
          const myReturn = (d.standings ?? []).find((s: { trader_id: string }) => s.trader_id === trader?.id)?.return_pct ?? 0;
          setBattleEndData({ rank: myRank || 1, totalPlayers: (d.standings ?? []).length || 2, returnPct: myReturn });
        }
      } catch {}
    };
    // Initial tick immediately, then every 10s
    tick();
    const i = setInterval(tick, 10_000);
    return () => { active = false; clearInterval(i); };
  }, [lobbyId, trader]);

  // ── Market data poll (every 60s) ──
  useEffect(() => {
    const poll = async () => { try { const r = await fetch('/api/market-data'); if (r.ok) { const d = await r.json(); setMarketData(d.assets ?? {}); setFearGreed(d.fearGreed ?? { value: null, label: null }); } } catch {} };
    const i = setInterval(poll, 120000);
    return () => clearInterval(i);
  }, []);

  // ── Order book polling ──
  useEffect(() => {
    if (!showOrderBook) return;
    const sym = selectedSymbol;
    const fetchOB = async () => {
      try {
        const r = await fetch(`/api/orderbook?symbol=${sym}&depth=8`);
        if (r.ok) setOrderBook(await r.json());
      } catch {}
    };
    fetchOB();
    const i = setInterval(fetchOB, 2000);
    return () => clearInterval(i);
  }, [selectedSymbol, showOrderBook]);

  // ── Realtime ──
  useEffect(() => {
    if (!lobbyId || !trader) return;
    const pc = supabase.channel(`c-${lobbyId}-p`).on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, p => { const r = p.new as { symbol: string; price: number }; setPrices(prev => ({ ...prev, [r.symbol]: r.price })); }).subscribe();
    const poc = supabase.channel(`c-${trader.id}-pos`).on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `trader_id=eq.${trader.id}` }, p => {
      if (p.eventType === 'INSERT') setPositions(prev => [...prev, p.new as Position]);
      else if (p.eventType === 'UPDATE') { const u = p.new as Position; if (u.closed_at) setPositions(prev => prev.filter(x => x.id !== u.id)); else setPositions(prev => prev.map(x => x.id === u.id ? u : x)); }
    }).subscribe();
    const sc = supabase.channel(`t-${trader.id}`).on('broadcast', { event: 'sabotage' }, ({ payload }) => {
      const m = payload as Record<string, unknown>; const st = (m.type as string) ?? ''; const sab = m.sabotage as Record<string, unknown> | undefined; const ty = (sab?.type as string) ?? (m.sabotage_type as string) ?? st;
      if (ty === 'blackout') { setIsLockedOut(true); setLockoutTime(90); setActiveOverlay('locked'); flash('#FF3333'); addToast('EXCHANGE OUTAGE — trades frozen!', 'attack', '🔒'); addFeedItem('Exchange outage hit you', '#FF3333', '🔒'); }
      else if (ty === 'fake_news') { setActiveOverlay('fakenews'); flash('#F5A0D0'); addFeedItem('BREAKING NEWS incoming!', '#F5A0D0', '📰'); }
      else if (ty === 'trading_halt') { setFrozenAsset((sab?.payload as Record<string, string>)?.asset ?? 'BTCUSDT'); addEffect('trading_halt', 'attack', 60); flash('#00BFFF'); addToast('REGULATORY HALT!', 'attack', '🔀'); addFeedItem('Regulatory halt', '#00BFFF', '🔀'); }
      else if (ty === 'reveal') { addEffect('reveal', 'attack', 120); flash('#FF3333'); addToast('POSITIONS EXPOSED!', 'attack', '🎯'); addFeedItem('Your positions are exposed', '#FF3333', '🎯'); }
      else if (ty === 'glitch') { addEffect('glitch', 'attack', 10); flash('#F5A0D0'); addFeedItem('FLASH CRASH!', '#F5A0D0', '🌀'); }
      else if (ty === 'leverage_cap') { flash('#FF3333'); addToast('MARGIN CALL! -10% balance', 'attack', '💸'); addFeedItem('Margin call -10%', '#FF3333', '💸'); }
      else if (ty === 'forced_trade') { setActiveOverlay('forced'); flash('#FF3333'); addFeedItem('AUTO-LIQUIDATION triggered!', '#FF3333', '⚡'); }
      else if (ty === 'blackout_lifted') { setIsLockedOut(false); setActiveOverlay(null); addToast('Blackout expired — you\'re free!', 'success', '🔓'); }
      if (st === 'defense_result') {
        const result = m.result as string;
        if (result === 'hedged') { flash('#00BFFF'); addToast('EVENT HEDGED! 50% refund', 'defense', '🛡'); addFeedItem('Event was HEDGED', '#00BFFF', '🛡'); }
        if (result === 'stopped') { flash('#00BFFF'); addToast('EVENT BLOCKED & redirected!', 'defense', '🔄'); addFeedItem('Event redirected!', '#00BFFF', '🔄'); }
      }
      if (st === 'defense_activated') {
        const dt = (m.defense_type as string) ?? 'hedge';
        if (dt === 'resume') {
          setIsLockedOut(false); setLockoutTime(0); setFrozenAsset(null); setActiveOverlay(null);
          setActiveEffects(p => p.filter(e => e.type !== 'trading_halt'));
          flash('#00FF88'); addToast('RESUMED! All restrictions cleared', 'success', '🔥'); addFeedItem('RESUME activated!', '#00FF88', '🔥');
        } else {
          const dur = dt === 'dark_pool' ? 120 : dt === 'speed_boost' ? 60 : null; if (dur) addEffect(dt, 'defense', dur);
        }
      }
    }).on('broadcast', { event: 'liquidation' }, ({ payload }) => {
      const m = payload as Record<string, unknown>;
      const sym = (m.symbol as string) ?? '???';
      const pnl = (m.realized_pnl as number) ?? 0;
      flash('#FF3333');
      addToast(`LIQUIDATED! ${sym} closed at ${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}`, 'error', '💀');
      addFeedItem(`LIQUIDATED ${sym}`, '#FF3333', '💀');
    }).subscribe();

    // Lobby-wide sabotage feed
    const lc = supabase.channel(`lobby-${lobbyId}-sabotage`).on('broadcast', { event: 'sabotage' }, ({ payload }) => {
      const m = payload as Record<string, unknown>;
      const type = m.type as string;
      if (type === 'sabotage_launched') {
        const atkName = allTradersRef.current.find(t => t.id === m.attacker_id)?.name ?? (m.attacker_id === trader.id ? trader.name : '???');
        const tgtName = allTradersRef.current.find(t => t.id === m.target_id)?.name ?? (m.target_id === trader.id ? trader.name : '???');
        const weapon = ATTACKS.find(a => a.id === m.sabotage_type);
        addFeedItem(`${atkName} ${weapon?.icon ?? '⚡'} ${weapon?.name ?? '???'} → ${tgtName}`, '#F5A0D0', weapon?.icon ?? '⚡');
      }
      if (type === 'sabotage_hedged') { addFeedItem('Event BLOCKED by hedge!', '#00BFFF', '🛡'); }
      if (type === 'sabotage_stopped') { addFeedItem('Event redirected!', '#00BFFF', '🔄'); }
      if (type === 'defense_activated') {
        const tName = allTradersRef.current.find(t => t.id === m.trader_id)?.name ?? (m.trader_id === trader.id ? 'You' : '???');
        const def = DEFENSES.find(d => d.id === m.defense_type);
        addFeedItem(`${tName} activated ${def?.name ?? '???'}`, '#00BFFF', def?.icon ?? '🛡');
      }
    }).subscribe();

    const rc = supabase.channel(`c-${lobbyId}-r`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds' }, p => {
      const u = p.new as Record<string, unknown>;
      if (u.lobby_id === lobbyId || !u.lobby_id) {
        setRound(u as unknown as RoundData);
        if (u.status === 'frozen') setActiveOverlay('frozen');
        if (u.status === 'completed') {
          // Fetch final standings for round result
          fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${u.id}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (!d?.standings?.length) return;
              const winner = d.standings[0];
              const result: RoundResultData = {
                round_number: u.round_number as number,
                winner_name: winner.teamName ?? winner.trader.name,
                winner_return: winner.returnPct,
                eliminated_name: null,
              };
              setRoundResults(prev => [...prev, result]);
              setShowRoundResult(result);
              // If we're the winner, show winner overlay
              if (winner.trader.id === trader?.id) {
                setActiveOverlay('winner');
              }
              clearTimeout(roundResultTimerRef.current);
              roundResultTimerRef.current = setTimeout(() => setShowRoundResult(null), 8000);
            })
            .catch(() => {});
        }
      }
    }).subscribe();
    // Admin announcements + event alerts
    const ac = supabase.channel(`lobby-${lobbyId}`).on('broadcast', { event: 'announcement' }, ({ payload }) => {
      if (!payload?.message) return;
      flash('#F5A0D0');
      addToast(payload.message, payload.type === 'credit_grant' ? 'success' : 'info', payload.type === 'credit_grant' ? '💰' : '📢');
      addFeedItem(payload.message, '#F5A0D0', '📢');
    }).on('broadcast', { event: 'volatility_event' }, ({ payload }) => {
      if (!payload) return;
      const headline = (payload.headline as string) ?? `${(payload.type as string ?? 'EVENT').replace(/_/g, ' ').toUpperCase()} — ${(payload.asset as string ?? 'ALL').replace('USDT', '')}`;
      const dur = (payload.duration_seconds as number) ?? 60;
      flash('#FF3333');
      setEventAlert({ id: `ev-${Date.now()}`, headline, type: payload.type as string, asset: payload.asset as string | null, expiresAt: Date.now() + dur * 1000 });
      addToast(headline, 'attack', '⚡');
      addFeedItem(headline, '#FF3333', '⚡');
    }).subscribe();
    // Auto-admin events (game_over, elimination, round transitions)
    const aac = supabase.channel(`lobby-${lobbyId}-auto`).on('broadcast', { event: 'auto_admin' }, ({ payload }) => {
      if (!payload) return;
      if (payload.type === 'game_over') {
        const finalStandings = payload.final_standings as { name: string; return_pct: number; rank: number }[] | undefined;
        const traderName = trader?.name;
        const myStanding = finalStandings?.find(s => s.name === traderName);
        const total = finalStandings?.length ?? 0;
        const myFinalRank = myStanding?.rank ?? total + 1;
        setBattleEndData({
          rank: myFinalRank,
          totalPlayers: total,
          returnPct: myStanding?.return_pct ?? 0,
        });
        if (myFinalRank === 1) setWinStreak(prev => prev + 1);
      } else if (payload.type === 'elimination') {
        const announce = payload.announce as string | undefined;
        const eliminated = payload.eliminated as string[] | undefined;
        if (eliminated?.length) {
          flash('#FF3333');
          addToast(announce || `Eliminated: ${eliminated.join(', ')}`, 'attack', '💀');
          addFeedItem(announce || `${eliminated.join(', ')} eliminated`, '#FF3333', '💀');
        }
      } else if (payload.type === 'intermission') {
        const secs = payload.seconds as number;
        addToast(`Next round in ${secs}s`, 'info', '⏱');
        addFeedItem(`Intermission — ${secs}s`, '#F5A0D0', '⏱');
      } else if (payload.type === 'round_started') {
        const announce = payload.announce as string | undefined;
        addToast(announce || 'Round started!', 'success', '🔔');
        addFeedItem(announce || 'New round started', '#00FF88', '🔔');
      }
    }).on('broadcast', { event: 'bot_action' }, ({ payload }) => {
      if (!payload) return;
      const bot = payload.bot_name as string;
      if (payload.action === 'trade') {
        const dir = payload.direction === 'long' ? 'LONG' : 'SHORT';
        const sym = payload.symbol as string;
        const lev = payload.leverage as number;
        addFeedItem(`${bot} opened ${dir} ${sym} ${lev}x`, payload.direction === 'long' ? '#00FF88' : '#FF4466', payload.direction === 'long' ? '↑' : '↓');
      } else if (payload.action === 'close') {
        const pnl = payload.pnl as number;
        const color = pnl >= 0 ? '#00FF88' : '#FF4466';
        addFeedItem(`${bot} closed ${payload.symbol} ${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%`, color, '✕');
      } else if (payload.action === 'sabotage') {
        addFeedItem(`${bot} used sabotage!`, '#F5A0D0', '⚡');
      }
    }).subscribe();
    channelsRef.current = [pc, poc, sc, lc, rc, ac, aac];
    return () => { for (const c of channelsRef.current) supabase.removeChannel(c); channelsRef.current = []; };
  }, [lobbyId, trader, flash, addToast, addFeedItem]);

  useEffect(() => {
    if (!round || !lobbyId) return;
    const i = setInterval(async () => {
      try {
        const r = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${round.id}`);
        if (r.ok) {
          const data = (await r.json()).standings ?? [];
          // Track rank changes
          const newRanks: Record<string, number> = {};
          for (const s of data) newRanks[s.trader.id] = s.rank;
          setPrevRanks(prev => {
            // Only update if we have previous data
            if (Object.keys(prev).length > 0) return newRanks;
            return newRanks;
          });
          setPrevRanks(newRanks);
          setStandings(data);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(i);
  }, [round, lobbyId]);

  function addEffect(type: string, source: 'attack' | 'defense', dur: number) {
    const w = ATTACKS.find(a => a.id === type) ?? DEFENSES.find(d => d.id === type);
    setActiveEffects(p => [...p, { id: `${type}-${Date.now()}`, type, source, label: w?.name ?? type.replace(/_/g, ' ').toUpperCase(), expiresAt: Date.now() + dur * 1000, secondsRemaining: dur }]);
  }

  // ── Actions with feedback ──
  const openPosition = async (dir: 'long' | 'short' | 'spot', size: number) => {
    if (!trader || !round) return;
    setActionLoading('trade');
    const isSpot = dir === 'spot';
    const apiDir = isSpot ? 'long' : dir;
    const apiLev = isSpot ? 1 : leverage;
    try {
      const payload: Record<string, unknown> = { trader_id: trader.id, round_id: round.id, symbol: `${selectedSymbol}USDT`, direction: apiDir, size, leverage: apiLev, order_type: orderType };
      if (orderType === 'limit') payload.limit_price = parseFloat(limitPrice);
      if (orderType === 'stop_limit') { payload.stop_price = parseFloat(stopPrice); payload.limit_price = limitPrice ? parseFloat(limitPrice) : undefined; }
      if (orderType === 'trailing_stop') payload.trail_pct = parseFloat(trailPct);
      const r = await fetch(`/api/lobby/${lobbyId}/positions`, { method: 'POST', headers: getAuthHeaders(trader?.code), body: JSON.stringify(payload) });
      if (r.ok) {
        flash(isSpot ? '#00BFFF' : dir === 'long' ? '#00FF88' : '#FF3333');
        const otLabel = orderType === 'market' ? '' : ` [${orderType.replace('_', ' ').toUpperCase()}]`;
        const label = isSpot ? `SPOT BUY ${selectedSymbol}` : `${dir.toUpperCase()} ${selectedSymbol}`;
        addToast(`${label} · $${size.toLocaleString()}${isSpot ? '' : ` @ ${leverage}x`}${otLabel}`, 'success', isSpot ? '💰' : dir === 'long' ? '📈' : '📉');
        const pos = await r.json();
        if (pos?.id) setTradeFlashId(pos.id);
        clearTimeout(tradeFlashTimerRef.current);
        tradeFlashTimerRef.current = setTimeout(() => setTradeFlashId(null), 1200);
        setSelectedDirection(null);
        setLimitPrice(''); setStopPrice('');
      } else {
        const d = await r.json();
        if (d.error === 'LOCKED_OUT') { setIsLockedOut(true); setLockoutTime(d.remaining ?? 90); addToast('LOCKED OUT — can\'t trade!', 'error', '🔒'); }
        else if (d.error === 'ASSET_FROZEN') addToast(`${selectedSymbol} is FROZEN!`, 'error', '🔀');
        else addToast(d.error || 'Trade failed', 'error');
      }
    } catch { addToast('Network error', 'error'); }
    setActionLoading(null);
  };

  const closePosition = async (pid: string) => {
    setActionLoading(pid);
    try {
      const r = await fetch(`/api/lobby/${lobbyId}/positions`, { method: 'DELETE', headers: getAuthHeaders(trader?.code), body: JSON.stringify({ position_id: pid }) });
      if (r.ok) {
        const closed = await r.json();
        const pnl = closed?.realized_pnl ?? 0;
        if (pnl > 0) {
          const newStreak = winStreak + 1;
          setWinStreak(newStreak);
          if (newStreak >= 3) {
            addToast(`${newStreak} WINS IN A ROW! 🔥`, 'success', '🔥');
            addFeedItem(`${newStreak}x WIN STREAK`, '#00FF88', '🔥');
            flash('#00FF88');
          } else {
            addToast(`Closed +$${pnl.toFixed(0)}`, 'success', '✓');
          }
        } else {
          setWinStreak(0);
          addToast(`Closed ${pnl >= 0 ? '' : '-'}$${Math.abs(pnl).toFixed(0)}`, pnl >= 0 ? 'info' : 'error', '✕');
        }
      } else addToast('Failed to close', 'error');
    } catch { addToast('Network error', 'error'); }
    setActionLoading(null);
  };

  const launchAttack = async (attackId: string, targetId: string) => {
    if (!trader) return;
    const weapon = ATTACKS.find(a => a.id === attackId);
    setActionLoading(attackId);
    try {
      const r = await fetch(`/api/lobby/${lobbyId}/sabotage`, { method: 'POST', headers: getAuthHeaders(trader?.code), body: JSON.stringify({ attacker_id: trader.id, target_id: targetId, type: attackId }) });
      const d = await r.json();
      if (r.ok) {
        flash('#F5A0D0');
        const tgtName = allTraders.find(t => t.id === targetId)?.name ?? '???';
        // Always use server-provided balance if available
        if (d.credits_remaining !== undefined) setCredits(p => ({ ...p, balance: d.credits_remaining }));
        else setCredits(p => ({ ...p, balance: p.balance - weapon!.cost }));

        if (d.result === 'hedged') {
          addToast(`${weapon?.name} was HEDGED! +${d.refund}CR refund`, 'defense', '🛡');
          addFeedItem(`${weapon?.name} HEDGED by ${tgtName}!`, '#00BFFF', '🛡');
        } else if (d.result === 'stopped') {
          addToast(`${weapon?.name} BLOCKED & redirected!`, 'error', '🔄');
          addFeedItem(`${weapon?.name} redirected by ${tgtName}!`, '#00BFFF', '🔄');
        } else {
          addToast(`${weapon?.icon} ${weapon?.name} triggered on ${tgtName}! — ${weapon?.desc}`, 'attack', weapon?.icon);
          addFeedItem(`${weapon?.icon} ${weapon?.name} → ${tgtName}`, '#F5A0D0', weapon?.icon ?? '⚡');
        }
        setCooldownRemaining(45); // match server cooldown
      } else if (r.status === 429) {
        setCooldownRemaining(d.remainingSeconds ?? 180);
        addToast(`Cooldown: ${Math.ceil((d.remainingSeconds ?? 180) / 60)}m left`, 'error', '⏳');
      } else {
        addToast(d.error || 'Event failed', 'error');
      }
    } catch { addToast('Network error', 'error'); }
    setActionLoading(null);
  };

  const activateDefense = async (defId: string) => {
    if (!trader) return;
    const def = DEFENSES.find(x => x.id === defId);
    setActionLoading(defId);
    try {
      const r = await fetch(`/api/lobby/${lobbyId}/sabotage/defense`, { method: 'POST', headers: getAuthHeaders(trader?.code), body: JSON.stringify({ trader_id: trader.id, type: defId }) });
      if (r.ok) {
        const d = await r.json();
        flash('#00BFFF');
        addToast(`${def?.icon} ${def?.name} activated! — ${def?.desc}`, 'defense', def?.icon);
        addFeedItem(`${def?.icon} ${def?.name} activated!`, '#00BFFF', def?.icon ?? '🛡');
        if (d.credits_remaining !== undefined) setCredits(p => ({ ...p, balance: d.credits_remaining }));
        else setCredits(p => ({ ...p, balance: p.balance - def!.cost }));
        if (def?.duration) addEffect(defId, 'defense', def.duration);
        setDefenseCooldown(30); // 30s defense cooldown
      } else {
        const d = await r.json();
        if (r.status === 429) {
          setDefenseCooldown(d.remainingSeconds ?? 90);
          addToast(`Defense cooldown: ${Math.ceil((d.remainingSeconds ?? 90) / 60)}m left`, 'error', '⏳');
        } else {
          addToast(d.error || 'Defense failed', 'error');
        }
      }
    } catch { addToast('Network error', 'error'); }
    setActionLoading(null);
  };

  // ── Derived ──
  const openPos = positions.filter(p => p.status === 'open' || (!p.closed_at && !p.status));
  const closedPos = positions.filter(p => p.closed_at);
  const pendingPos = positions.filter(p => p.status === 'pending');
  const pv = calcPortfolioValue(startingBalance, openPos, closedPos, prices);
  const rp = calcReturnPct(pv, startingBalance);
  const myRank = standings.find(s => s.trader.id === trader?.id)?.rank ?? 0;
  const canTrade = round?.status === 'active' && !trader?.is_eliminated;
  const isUrgent = timeRemaining > 0 && timeRemaining < 30;
  const isTense = timeRemaining > 0 && timeRemaining < 60 && !isUrgent;
  const proximityGap = myRank > 1 && standings.length > 1
    ? Math.abs((standings.find(s => s.rank === myRank - 1)?.returnPct ?? 0) - rp)
    : null;
  const timeFmt = `${Math.floor(timeRemaining / 60)}:${(timeRemaining % 60).toString().padStart(2, '0')}`;
  const selectedPrice = prices[`${selectedSymbol}USDT`] ?? prices[`${selectedSymbol}USD`] ?? prices[selectedSymbol] ?? 0;
  // Show ALL Pyth assets in the picker (available_symbols only restricts trading, not viewing)
  const allSymbols = Object.keys(PYTH_FEEDS).map(s => s.replace('USD', ''));
  const frozen = round?.status === 'frozen';
  const canExec = selectedDirection && selectedSize > 0 && !isLockedOut && !frozen && openPos.length < 3 && (!frozenAsset || frozenAsset.replace('USDT', '') !== selectedSymbol) && round?.status === 'active';
  const execLabel = isLockedOut ? `BLACKED OUT ${Math.floor(lockoutTime/60)}:${(lockoutTime%60).toString().padStart(2,'0')}` : frozen ? 'FROZEN' : openPos.length >= 3 ? 'MAX POSITIONS' : !selectedDirection ? 'SELECT LONG, SPOT OR SHORT' : actionLoading === 'trade' ? 'EXECUTING...' : selectedDirection === 'spot' ? `BUY ${selectedSymbol}` : `${selectedDirection.toUpperCase()} ${selectedSymbol}`;
  const effectiveLev = selectedDirection === 'spot' ? 1 : leverage;
  const liqP = selectedPrice > 0 && selectedDirection && selectedDirection !== 'spot' ? (selectedDirection === 'long' ? selectedPrice * (1 - 1/leverage) : selectedPrice * (1 + 1/leverage)) : 0;

  // ── Chat slash command handler ──
  const handleChatCommand = useCallback((cmd: ChatCommand) => {
    const symbol = (cmd.args[0] || selectedSymbol).toUpperCase();
    const size = cmd.args[1] ? parseInt(cmd.args[1], 10) : selectedSize;

    switch (cmd.command) {
      case 'buy':
      case 'spot':
        setSelectedSymbol(symbol);
        openPosition('spot', size);
        addToast(`Spot buying ${symbol} — $${size}`, 'info', '💰');
        break;
      case 'long':
        setSelectedSymbol(symbol);
        openPosition('long', size);
        addToast(`Opening LONG ${symbol} — $${size}`, 'info', '📈');
        break;
      case 'short':
        setSelectedSymbol(symbol);
        openPosition('short', size);
        addToast(`Opening SHORT ${symbol} — $${size}`, 'info', '📉');
        break;
      case 'close':
        if (cmd.args[0]?.toLowerCase() === 'all') {
          for (const p of openPos) closePosition(p.id);
          addToast('Closing all positions', 'info', '✕');
        } else {
          const target = openPos.find(p => p.symbol.replace('USDT', '').replace('USD', '') === symbol);
          if (target) { closePosition(target.id); addToast(`Closing ${symbol}`, 'info', '✕'); }
          else addToast(`No open ${symbol} position`, 'error');
        }
        break;
      case 'balance':
        addToast(`Balance: $${Math.round(pv).toLocaleString()} · ${credits.balance} CR`, 'info', '💰');
        break;
      case 'rank':
        addToast(`Rank: #${myRank || '—'} · ${rp >= 0 ? '+' : ''}${rp.toFixed(1)}%`, 'info', '🏆');
        break;
      case 'positions':
      case 'pos':
        if (openPos.length === 0) { addToast('No open positions', 'info'); }
        else { openPos.forEach(p => addToast(`${p.direction.toUpperCase()} ${p.symbol.replace('USDT', '')} $${p.size} @ ${p.leverage}x`, 'info')); }
        break;
      default:
        addToast(`Unknown command: /${cmd.command}`, 'error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, selectedSize, openPos, pv, credits.balance, myRank, rp, addToast]);

  // ── P&L milestone celebrations ──
  useEffect(() => {
    const absRp = Math.abs(rp);
    const milestones = [50, 25, 10];
    for (const m of milestones) {
      if (absRp >= m && lastMilestone < m && prevRpRef.current !== 0) {
        setLastMilestone(m);
        if (rp > 0) {
          flash('#00FF88');
          addToast(`${m}% RETURN! YOU'RE ON FIRE`, 'success', m >= 50 ? '🔥' : m >= 25 ? '🚀' : '💪');
          addFeedItem(`HIT +${m}% RETURN!`, '#00FF88', m >= 50 ? '🔥' : '🚀');
        }
        break;
      }
    }
    prevRpRef.current = rp;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rp, lastMilestone]);

  // ── Rank change flash ──
  useEffect(() => {
    if (!trader) return;
    const myStanding = standings.find(s => s.trader.id === trader.id);
    const prev = prevRanks[trader.id];
    if (myStanding && prev && prev !== myStanding.rank) {
      if (myStanding.rank < prev) {
        setRankFlash('up');
        if (myStanding.rank === 1) {
          flash('#F5A0D0');
          addToast('YOU TOOK #1!', 'success', '👑');
          addFeedItem('TOOK THE LEAD!', '#F5A0D0', '👑');
        }
      } else {
        setRankFlash('down');
      }
      clearTimeout(rankFlashTimerRef.current);
      rankFlashTimerRef.current = setTimeout(() => setRankFlash(null), 1500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standings, trader, prevRanks]);

  // ── Loading / Error ──
  if (loading || error || trader?.is_eliminated) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
        <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}><div style={{ width: 8, height: 8, background: '#F5A0D0', animation: 'pulse 1s infinite' }} /><span style={{ ...B, fontSize: 24, color: '#999' }}>LOADING TERMINAL...</span></div>}
          {error && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}><span style={{ ...B, fontSize: 48, color: '#FF3333' }}>ACCESS DENIED</span><span style={{ ...S, fontSize: 14, color: '#999' }}>{error}</span></div>}
          {trader?.is_eliminated && <OverlayManager activeOverlay="eliminated" onClose={() => {}} trader={{ name: trader.name, avatar: '', returnPct: rp }} />}
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PANELS
  // ═══════════════════════════════════════════════════════════════════════════

  // Strategy presets — real trading strategies that auto-configure trades
  const STRATEGY_PRESETS: { id: string; label: string; desc: string; icon: string; color: string; trades: { symbol: string; direction: 'long' | 'short'; sizePct: number; levMultiplier: number }[] }[] = [
    { id: 'conservative', label: 'BLUE CHIP', desc: 'Equal-weight BTC+ETH+SOL, low leverage', icon: '🏦', color: '#00BFFF', trades: [
      { symbol: 'BTC', direction: 'long', sizePct: 33, levMultiplier: 0.25 },
      { symbol: 'ETH', direction: 'long', sizePct: 33, levMultiplier: 0.25 },
      { symbol: 'SOL', direction: 'long', sizePct: 34, levMultiplier: 0.25 },
    ]},
    { id: 'momentum', label: 'MOMENTUM', desc: 'Concentrated BTC long, high conviction', icon: '🚀', color: '#00FF88', trades: [
      { symbol: 'BTC', direction: 'long', sizePct: 60, levMultiplier: 0.5 },
      { symbol: 'ETH', direction: 'long', sizePct: 40, levMultiplier: 0.75 },
    ]},
    { id: 'hedge', label: 'HEDGED', desc: 'Long BTC + Short altcoin pair', icon: '🛡', color: '#F5A0D0', trades: [
      { symbol: 'BTC', direction: 'long', sizePct: 50, levMultiplier: 0.5 },
      { symbol: 'SOL', direction: 'short', sizePct: 50, levMultiplier: 0.5 },
    ]},
    { id: 'degen', label: 'DEGEN', desc: 'Max leverage memes, high risk/reward', icon: '🎰', color: '#FF3333', trades: [
      { symbol: 'DOGE', direction: 'long', sizePct: 34, levMultiplier: 1.0 },
      { symbol: 'SOL', direction: 'long', sizePct: 33, levMultiplier: 1.0 },
      { symbol: 'AVAX', direction: 'long', sizePct: 33, levMultiplier: 1.0 },
    ]},
  ];

  const executeStrategy = async (strategyId: string) => {
    if (!trader || !round || !canTrade || openPos.length > 0) return;
    const strat = STRATEGY_PRESETS.find(s => s.id === strategyId);
    if (!strat) return;
    setActionLoading('strategy');
    const maxLev = leverageTiers[leverageTiers.length - 1] ?? 50;
    for (const trade of strat.trades) {
      const tradeSize = Math.floor(pv * trade.sizePct / 100);
      if (tradeSize < 100) continue;
      const tradeLev = leverageTiers.reduce((prev, curr) =>
        Math.abs(curr - maxLev * trade.levMultiplier) < Math.abs(prev - maxLev * trade.levMultiplier) ? curr : prev
      );
      try {
        const r = await fetch(`/api/lobby/${lobbyId}/positions`, {
          method: 'POST',
          headers: getAuthHeaders(trader.code),
          body: JSON.stringify({ trader_id: trader.id, round_id: round.id, symbol: `${trade.symbol}USDT`, direction: trade.direction, size: tradeSize, leverage: tradeLev, order_type: 'market' }),
        });
        if (r.ok) {
          flash(trade.direction === 'long' ? '#00FF88' : '#FF3333');
          addToast(`${trade.direction.toUpperCase()} ${trade.symbol} · $${tradeSize.toLocaleString()} @ ${tradeLev}x`, 'success', trade.direction === 'long' ? '📈' : '📉');
        } else {
          const d = await r.json();
          if (d.error === 'LOCKED_OUT') { setIsLockedOut(true); break; }
          addToast(d.error || `Failed: ${trade.symbol}`, 'error');
        }
      } catch { addToast(`Network error: ${trade.symbol}`, 'error'); }
    }
    setActionLoading(null);
  };

  const ORDER_TYPES: { id: 'market' | 'limit' | 'stop_limit' | 'trailing_stop'; label: string }[] = [
    { id: 'market', label: 'MKT' },
    { id: 'limit', label: 'LIMIT' },
    { id: 'stop_limit', label: 'STOP' },
    { id: 'trailing_stop', label: 'TRAIL' },
  ];

  const pnlColor = rp >= 0 ? '#00FF88' : '#FF3333';
  const rankColor = myRank === 1 ? '#FFD700' : myRank === 2 ? '#C0C0C0' : myRank === 3 ? '#CD7F32' : '#F5A0D0';
  const orderPanel = (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* RANK HERO — Mario Kart position indicator */}
      <div style={{
        padding: '12px 14px', borderBottom: `2px solid ${rankColor}40`,
        background: `linear-gradient(180deg, ${pnlColor}06, transparent)`,
        animation: rankFlash === 'up' ? 'rankUpFlash 1.5s ease-out' : rankFlash === 'down' ? 'rankDownFlash 1.5s ease-out' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              ...B, fontSize: 48, lineHeight: 1, color: rankColor,
              textShadow: `0 0 16px ${rankColor}50`,
              animation: myRank === 1 ? 'glowPulse 3s ease-in-out infinite' : 'none',
              transition: 'all 400ms',
            }}>#{myRank || '—'}</span>
            <div>
              <span style={{ ...B, fontSize: 36, color: pnlColor, lineHeight: 1, display: 'block', textShadow: rp !== 0 ? `0 0 12px ${pnlColor}40` : 'none' }}>{rp >= 0 ? '+' : ''}{rp.toFixed(1)}%</span>
              <span style={{ ...M, fontSize: 13, color: '#666', marginTop: 3, display: 'block' }}>${pv.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {openPos.length} open</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ ...M, fontSize: 14, color: '#555' }}>{myRank}/{totalTraders}</span>
          </div>
        </div>
        {proximityGap !== null && proximityGap < 2 && myRank > 1 && (
          <div style={{ marginTop: 6, padding: '3px 8px', background: 'rgba(245,160,208,0.08)', border: '1px solid rgba(245,160,208,0.3)', animation: 'proximityPulse 1.5s infinite' }}>
            <span style={{ ...B, fontSize: 10, color: '#F5A0D0' }}>{proximityGap.toFixed(1)}% FROM #{myRank - 1}</span>
          </div>
        )}
      </div>
      {/* Direction: LONG / SPOT / SHORT */}
      <div style={{ display: 'flex', minHeight: 56, borderBottom: '1px solid #1A1A1A' }}>
        <button onClick={() => setSelectedDirection('long')} style={{ flex: 1, minHeight: 56, ...B, fontSize: 21, borderRadius: 0, background: selectedDirection === 'long' ? '#00FF88' : '#0D0D0D', color: selectedDirection === 'long' ? '#0A0A0A' : '#00FF88', border: 'none', borderBottom: selectedDirection === 'long' ? '3px solid #00FF88' : '3px solid transparent', cursor: 'pointer', transition: 'all 150ms' }}>LONG</button>
        <button onClick={() => setSelectedDirection('spot')} style={{ flex: 1, minHeight: 56, ...B, fontSize: 21, borderRadius: 0, background: selectedDirection === 'spot' ? '#00BFFF' : '#0D0D0D', color: selectedDirection === 'spot' ? '#0A0A0A' : '#00BFFF', border: 'none', borderLeft: '1px solid #1A1A1A', borderRight: '1px solid #1A1A1A', borderBottom: selectedDirection === 'spot' ? '3px solid #00BFFF' : '3px solid transparent', cursor: 'pointer', transition: 'all 150ms' }}>SPOT</button>
        <button onClick={() => setSelectedDirection('short')} style={{ flex: 1, minHeight: 56, ...B, fontSize: 21, borderRadius: 0, background: selectedDirection === 'short' ? '#FF3333' : '#0D0D0D', color: selectedDirection === 'short' ? '#FFF' : '#FF3333', border: 'none', borderBottom: selectedDirection === 'short' ? '3px solid #FF3333' : '3px solid transparent', cursor: 'pointer', transition: 'all 150ms' }}>SHORT</button>
      </div>
      {/* Strategy Presets — 2x2 grid */}
      {canTrade && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid #1A1A1A', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {STRATEGY_PRESETS.map(s => (
            <button key={s.id} onClick={() => executeStrategy(s.id)} disabled={actionLoading === 'strategy'}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 6px', minHeight: 44, background: '#0A0A0A', border: '1px solid #1A1A1A', borderTop: `3px solid ${s.color}`, borderRadius: 6, cursor: actionLoading === 'strategy' ? 'wait' : 'pointer', transition: 'all 150ms', gap: 6 }}>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
              <span style={{ ...B, fontSize: 15, color: '#FFF', lineHeight: 1 }}>{actionLoading === 'strategy' ? '...' : s.label}</span>
            </button>
          ))}
        </div>
      )}
      {/* Order type tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #1A1A1A' }}>
        {ORDER_TYPES.map(ot => (
          <button key={ot.id} onClick={() => setOrderType(ot.id)} style={{ minHeight: 44, ...B, fontSize: 15, background: orderType === ot.id ? '#1A1A1A' : 'transparent', color: orderType === ot.id ? '#F5A0D0' : '#555', border: 'none', borderBottom: orderType === ot.id ? '3px solid #F5A0D0' : '3px solid transparent', cursor: 'pointer', transition: 'all 100ms' }}>{ot.label}</button>
        ))}
      </div>
      {/* Conditional price inputs */}
      {orderType !== 'market' && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(orderType === 'limit' || orderType === 'stop_limit') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ ...B, fontSize: 10, color: '#777' }}>{orderType === 'stop_limit' ? 'LIMIT PRICE' : 'LIMIT PRICE'}</span>
                <button onClick={() => setLimitPrice(selectedPrice.toString())} style={{ ...M, fontSize: 9, color: '#F5A0D0', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>MKT</button>
              </div>
              <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} placeholder={fmtP(selectedPrice)}
                style={{ width: '100%', minHeight: 44, ...M, fontSize: 16, color: '#FFF', background: '#111', border: '1px solid #333', padding: '0 10px', outline: 'none', textAlign: 'right' }} />
            </div>
          )}
          {orderType === 'stop_limit' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ ...B, fontSize: 10, color: '#777' }}>STOP TRIGGER</span>
              </div>
              <input type="number" value={stopPrice} onChange={e => setStopPrice(e.target.value)} placeholder={fmtP(selectedPrice)}
                style={{ width: '100%', minHeight: 44, ...M, fontSize: 16, color: '#FF3333', background: '#111', border: '1px solid #333', padding: '0 10px', outline: 'none', textAlign: 'right' }} />
            </div>
          )}
          {orderType === 'trailing_stop' && (
            <div>
              <span style={{ ...B, fontSize: 10, color: '#777', display: 'block', marginBottom: 4 }}>TRAIL %</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {['1', '2', '5', '10', '15'].map(p => (
                  <button key={p} onClick={() => setTrailPct(p)} style={{ minHeight: 44, ...B, fontSize: 13, background: trailPct === p ? '#F5A0D0' : '#0D0D0D', color: trailPct === p ? '#0A0A0A' : '#555', border: trailPct === p ? 'none' : '1px solid #1A1A1A', cursor: 'pointer' }}>{p}%</button>
                ))}
              </div>
              <input type="number" value={trailPct} onChange={e => setTrailPct(e.target.value)} style={{ width: '100%', minHeight: 44, ...M, fontSize: 14, color: '#FFF', background: '#111', border: '1px solid #333', padding: '0 10px', outline: 'none', textAlign: 'right', marginTop: 6 }} />
              <span style={{ ...S, fontSize: 9, color: '#666', marginTop: 4, display: 'block' }}>Auto-closes when price drops {trailPct || '?'}% from peak</span>
            </div>
          )}
        </div>
      )}
      {/* Size */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1A1A1A' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ ...B, fontSize: 11, color: '#777' }}>SIZE</span>
          <span style={{ ...M, fontSize: 10, color: '#999' }}>BAL: ${pv.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
          {SIZES.map(s => (
            <button key={s} onClick={() => setSelectedSize(s)} style={{ minHeight: 34, ...B, fontSize: 13, borderRadius: 6, background: selectedSize === s ? '#1A1A1A' : '#0D0D0D', color: selectedSize === s ? '#FFF' : '#555', border: selectedSize === s ? '1px solid #F5A0D0' : '1px solid #111', cursor: 'pointer', transition: 'all 100ms' }}>
              ${s >= 1000 ? `${s/1000}K` : s}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginTop: 3 }}>
          {[10, 25, 50, 100].map(pct => (
            <button key={pct} onClick={() => setSelectedSize(Math.floor(pv * pct / 100))} style={{ minHeight: 28, ...B, fontSize: 11, borderRadius: 4, background: pct === 100 ? 'rgba(255,51,51,0.15)' : '#0D0D0D', color: pct === 100 ? '#FF3333' : '#444', border: pct === 100 ? '1px solid #FF3333' : '1px solid #111', cursor: 'pointer', transition: 'all 100ms' }}>
              {pct === 100 ? 'ALL IN' : `${pct}%`}
            </button>
          ))}
        </div>
      </div>
      {/* Leverage Slider — hidden for spot */}
      {selectedDirection !== 'spot' ? (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #1A1A1A' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ ...B, fontSize: 11, color: '#777' }}>LEVERAGE</span>
          <span style={{ ...M, fontSize: 16, color: '#F5A0D0', textShadow: leverage >= leverageTiers[leverageTiers.length - 1] ? '0 0 12px rgba(245,160,208,0.6)' : 'none' }}>{leverage}x</span>
        </div>
        {(() => {
          const minLev = leverageTiers[0] ?? 1;
          const maxLev = leverageTiers[leverageTiers.length - 1] ?? 50;
          const pct = maxLev > minLev ? ((leverage - minLev) / (maxLev - minLev)) * 100 : 0;
          const dangerZone = pct > 75;
          // Quick-pick buttons at key tiers
          const quickPicks = [...new Set([minLev, ...leverageTiers.filter(t => t <= maxLev), maxLev])].sort((a, b) => a - b).slice(0, 6);
          return (
            <>
              <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, background: '#1A1A1A', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: dangerZone ? 'linear-gradient(90deg, #F5A0D0, #FF3333)' : 'linear-gradient(90deg, #F5A0D060, #F5A0D0)', transition: 'width 50ms, background 200ms' }} />
                </div>
                <input type="range" min={minLev} max={maxLev} step={1} value={leverage}
                  onChange={(e) => setLeverage(parseInt(e.target.value))}
                  style={{ position: 'absolute', left: 0, right: 0, width: '100%', height: 20, opacity: 0, cursor: 'pointer', zIndex: 2, margin: 0 }} />
                <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)', width: 14, height: 14, borderRadius: 7, background: dangerZone ? '#FF3333' : '#F5A0D0', border: '1px solid rgba(255,255,255,0.3)', transition: 'left 50ms, background 200ms', pointerEvents: 'none' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                {quickPicks.map(v => (
                  <button key={v} onClick={() => setLeverage(v)} style={{ ...B, fontSize: 13, color: leverage === v ? '#F5A0D0' : '#444', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0', transition: 'color 100ms' }}>{v}x</button>
                ))}
              </div>
              {dangerZone && <div style={{ ...B, fontSize: 8, color: '#FF3333', textAlign: 'center', marginTop: 2, animation: 'pulse 1.5s infinite' }}>HIGH RISK</div>}
            </>
          );
        })()}
      </div>
      ) : (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #1A1A1A', background: 'rgba(0,191,255,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 3, height: 10, background: '#00BFFF', display: 'block' }} />
            <span style={{ ...B, fontSize: 10, color: '#00BFFF' }}>SPOT · 1x NO LEVERAGE</span>
          </div>
        </div>
      )}
      {/* Execute — directly under leverage */}
      <div style={{ padding: '10px 14px' }}>
        <button onClick={() => { if (canTrade && selectedDirection) openPosition(selectedDirection, selectedSize); }} disabled={!canExec || actionLoading === 'trade'}
          style={{
            width: '100%', minHeight: 40, ...B, fontSize: 16, borderRadius: 8,
            background: isLockedOut ? '#0D0D0D' : !selectedDirection ? '#111' : !canExec ? '#1A1A1A' : selectedDirection === 'spot' ? '#00BFFF' : selectedDirection === 'long' ? '#00FF88' : '#FF3333',
            color: isLockedOut ? '#FF3333' : !selectedDirection ? '#555' : !canExec ? '#333' : selectedDirection === 'short' ? '#FFF' : '#0A0A0A',
            border: isLockedOut ? '2px solid #FF3333' : !selectedDirection ? '2px solid #333' : canExec ? `2px solid ${selectedDirection === 'spot' ? '#00BFFF' : selectedDirection === 'long' ? '#00FF88' : '#FF3333'}` : '2px solid #1A1A1A',
            cursor: canExec ? 'pointer' : 'not-allowed',
            transition: 'all 150ms',
            animation: !selectedDirection && canTrade ? 'borderPulse 2s ease-in-out infinite' : 'none',
            boxShadow: canExec && selectedDirection ? `0 0 20px ${selectedDirection === 'spot' ? '#00BFFF40' : selectedDirection === 'long' ? '#00FF8840' : '#FF333340'}` : 'none',
          }}>
          {execLabel}
        </button>
        {/* Compact order summary */}
        {selectedDirection && selectedPrice > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ ...M, fontSize: 9, color: '#555' }}>{orderType.replace('_', ' ').toUpperCase()}</span>
            <span style={{ ...M, fontSize: 9, color: '#777' }}>${(selectedSize * effectiveLev).toLocaleString()} notional</span>
            {liqP > 0 && <span style={{ ...M, fontSize: 9, color: '#FF3333' }}>LIQ ${fmtP(liqP)}</span>}
          </div>
        )}
      </div>
      {/* Pending orders */}
      {pendingPos.length > 0 && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid #1A1A1A' }}>
          <span style={{ ...B, fontSize: 10, color: '#F5A0D0', marginBottom: 6, display: 'block' }}>PENDING ORDERS</span>
          {pendingPos.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', marginBottom: 4, background: '#0D0D0D', border: '1px solid #1A1A1A', borderLeft: '3px solid #F5A0D0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...B, fontSize: 11, color: p.direction === 'long' ? '#00FF88' : '#FF3333' }}>{p.direction === 'long' ? 'L' : 'S'}</span>
                <span style={{ ...B, fontSize: 11, color: '#FFF' }}>{p.symbol.replace('USDT', '')}</span>
                <span style={{ ...M, fontSize: 8, color: '#888' }}>{p.order_type?.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...M, fontSize: 10, color: '#F5A0D0' }}>
                  {p.limit_price ? `@${fmtP(p.limit_price)}` : p.trail_pct ? `${p.trail_pct}%` : ''}
                </span>
                <button onClick={() => closePosition(p.id)} style={{ ...B, fontSize: 9, color: '#FF3333', background: 'none', border: '1px solid #FF3333', padding: '2px 6px', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* LIVE LEADERBOARD — compact, bottom of right sidebar */}
      <div style={{ padding: '4px 8px', borderTop: '1px solid #1A1A1A' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#00FF88', animation: 'liveDot 2s ease-in-out infinite' }} />
            <span style={{ ...B, fontSize: 9, color: '#888' }}>LEADERBOARD</span>
          </div>
          <span style={{ ...M, fontSize: 8, color: '#555' }}>{standings.length}</span>
        </div>
        <div style={{ maxHeight: 120, overflowY: 'auto' }}>
          {standings.length === 0 ? (
            <div style={{ ...M, fontSize: 9, color: '#333', textAlign: 'center', padding: '6px 0' }}>Waiting for round...</div>
          ) : (
            standings.slice(0, 8).map((s, i) => {
              const isMe = s.trader.id === trader?.id;
              const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#555';
              return (
                <div key={s.trader.id} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px',
                  background: isMe ? 'rgba(245,160,208,0.08)' : 'transparent',
                  borderLeft: isMe ? '2px solid #F5A0D0' : '2px solid transparent',
                }}>
                  <span style={{ ...M, fontSize: 9, color: rankColor, width: 14, textAlign: 'right', fontWeight: 700 }}>
                    {s.rank}
                  </span>
                  <span style={{
                    ...S, fontSize: 9, color: isMe ? '#FFF' : '#777', flex: 1,
                    fontWeight: isMe ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.trader.name}{isMe ? ' (you)' : ''}
                  </span>
                  <span style={{
                    ...M, fontSize: 8, fontWeight: 700,
                    color: s.returnPct > 0 ? '#00FF88' : s.returnPct < 0 ? '#FF3333' : '#555',
                  }}>
                    {s.returnPct >= 0 ? '+' : ''}{s.returnPct.toFixed(1)}%
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  // Defense panel — BLUE/CYAN theme to distinguish from attacks
  const defensePanel = (
    <div style={{ padding: '4px 10px', borderBottom: '1px solid #1A1A1A' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 2, height: 10, background: '#00BFFF', display: 'block' }} />
          <span style={{ ...B, fontSize: 14, color: '#00BFFF' }}>DEFENSE</span>
        </div>
        <span style={{ ...M, fontSize: 12, color: '#00BFFF' }}>{credits.balance}CR</span>
      </div>

      {defenseCooldown > 0 && (
        <div style={{ marginBottom: 3, padding: '2px 6px', border: '1px solid rgba(0,191,255,0.3)', background: 'rgba(0,191,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...B, fontSize: 8, color: '#00BFFF' }}>RECHARGING</span>
          <span style={{ ...M, fontSize: 9, color: '#00BFFF' }}>{Math.floor(defenseCooldown / 60)}:{(defenseCooldown % 60).toString().padStart(2, '0')}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {DEFENSES.map(d => {
          const reqRank = d.unlockRank > 0 ? Math.min(d.unlockRank, Math.max(1, Math.floor(totalTraders / 2))) : 0;
          const locked = reqRank > 0 && (myRank === 0 || myRank > reqRank);
          const canAfford = !locked && credits.balance >= d.cost;
          const ok = canAfford && defenseCooldown === 0;
          const isLoading = actionLoading === d.id;
          return (
            <button key={d.id} className="weapon-card" onClick={() => !locked && ok && !isLoading && activateDefense(d.id)} disabled={locked || !ok || isLoading}
              title={d.desc}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 5px', minHeight: 32, background: locked ? '#0D0D0D' : isLoading ? 'rgba(0,191,255,0.1)' : '#0A0A0A', border: `1px solid ${locked ? '#1A1A1A' : '#1A1A1A'}`, borderLeft: `2px solid ${locked ? '#333' : canAfford ? '#00BFFF' : '#222'}`, borderRadius: 4, opacity: canAfford ? 1 : 0.6, cursor: locked ? 'not-allowed' : ok ? 'pointer' : 'not-allowed', transition: 'all 150ms', textAlign: 'left', WebkitTapHighlightColor: 'transparent', position: 'relative', overflow: 'hidden' }}>
              {locked && <div style={{ position: 'absolute', top: 1, right: 3, zIndex: 1 }}><span style={{ ...M, fontSize: 7, color: '#555', background: '#1A1A1A', padding: '0 4px', borderRadius: 2 }}>🔒{reqRank}</span></div>}
              <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center', filter: locked ? 'grayscale(1) brightness(0.5)' : 'none' }}>{d.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <span style={{ ...B, fontSize: 12, color: locked ? '#444' : '#FFF', lineHeight: 1 }}>{isLoading ? '...' : d.name}</span>
                  <span style={{ ...M, fontSize: 11, color: locked ? '#333' : canAfford ? '#00BFFF' : '#444', flexShrink: 0 }}>{d.cost}CR</span>
                </div>
                <span style={{ ...S, fontSize: 10, color: locked ? '#333' : '#666', lineHeight: 1.2, display: 'block', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.desc}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Market Events panel
  const arsenalPanel = (
    <div style={{ padding: '4px 10px', borderBottom: '1px solid #1A1A1A' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 2, height: 10, background: '#F5A0D0', display: 'block' }} />
          <span style={{ ...B, fontSize: 14, color: '#F5A0D0' }}>MARKET EVENTS</span>
        </div>
        <span style={{ ...M, fontSize: 12, color: '#F5A0D0' }}>{credits.balance}CR</span>
      </div>

      {/* Target indicator */}
      <div style={{ marginBottom: 3, padding: '2px 6px', border: `1px solid ${selectedTarget ? '#F5A0D0' : '#1A1A1A'}`, background: selectedTarget ? 'rgba(245,160,208,0.05)' : '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...S, fontSize: 11, color: '#999' }}>TARGET</span>
        {selectedTarget ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ ...B, fontSize: 12, color: '#F5A0D0' }}>{allTraders.find(t => t.id === selectedTarget)?.name ?? '???'}</span>
            <button onClick={() => setSelectedTarget(null)} style={{ ...S, fontSize: 8, color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}>x</button>
          </div>
        ) : (
          <span style={{ ...S, fontSize: 11, color: '#666', fontStyle: 'italic' }}>Tap a rival above</span>
        )}
      </div>

      {cooldownRemaining > 0 && (
        <div style={{ marginBottom: 3, padding: '2px 6px', border: '1px solid rgba(245,160,208,0.3)', background: 'rgba(245,160,208,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...B, fontSize: 8, color: '#F5A0D0' }}>RECHARGING</span>
          <span style={{ ...M, fontSize: 9, color: '#F5A0D0' }}>{Math.floor(cooldownRemaining / 60)}:{(cooldownRemaining % 60).toString().padStart(2, '0')}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {ATTACKS.map(a => {
          const reqRank = a.unlockRank > 0 ? Math.min(a.unlockRank, Math.max(1, Math.floor(totalTraders / 2))) : 0;
          const locked = reqRank > 0 && (myRank === 0 || myRank > reqRank);
          const canAfford = !locked && credits.balance >= a.cost;
          const ok = canAfford && !!selectedTarget && cooldownRemaining === 0;
          const isLoading = actionLoading === a.id;
          return (
            <button key={a.id} className="weapon-card" onClick={() => !locked && selectedTarget && ok && !isLoading && launchAttack(a.id, selectedTarget)} disabled={locked || !ok || isLoading}
              title={a.desc}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 5px', minHeight: 32, background: locked ? '#0D0D0D' : isLoading ? 'rgba(245,160,208,0.1)' : '#0A0A0A', border: `1px solid ${locked ? '#1A1A1A' : '#1A1A1A'}`, borderLeft: `2px solid ${locked ? '#333' : canAfford ? '#F5A0D0' : '#222'}`, borderRadius: 4, opacity: canAfford ? 1 : 0.6, cursor: locked ? 'not-allowed' : ok ? 'pointer' : 'not-allowed', transition: 'all 150ms', textAlign: 'left', WebkitTapHighlightColor: 'transparent', position: 'relative', overflow: 'hidden' }}>
              {locked && <div style={{ position: 'absolute', top: 1, right: 3, zIndex: 1 }}><span style={{ ...M, fontSize: 7, color: '#555', background: '#1A1A1A', padding: '0 4px', borderRadius: 2 }}>🔒{reqRank}</span></div>}
              <span style={{ fontSize: 16, flexShrink: 0, width: 22, textAlign: 'center', filter: locked ? 'grayscale(1) brightness(0.5)' : 'none' }}>{a.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <span style={{ ...B, fontSize: 12, color: locked ? '#444' : '#FFF', lineHeight: 1 }}>{isLoading ? '...' : a.name}</span>
                  <span style={{ ...M, fontSize: 11, color: locked ? '#333' : canAfford ? '#F5A0D0' : '#444', flexShrink: 0 }}>{a.cost}CR</span>
                </div>
                <span style={{ ...S, fontSize: 10, color: locked ? '#333' : '#666', lineHeight: 1.2, display: 'block', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.desc}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const roundHistoryPanel = roundResults.length > 0 ? (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid #1A1A1A' }}>
      <span style={{ ...B, fontSize: 14, color: '#666', display: 'block', marginBottom: 4 }}>ROUND HISTORY</span>
      {roundResults.map(r => (
        <div key={r.round_number} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid #0D0D0D' }}>
          <span style={{ ...B, fontSize: 13, color: '#777', width: 24 }}>R{r.round_number}</span>
          <span style={{ ...B, fontSize: 14, color: '#F5A0D0', flex: 1 }}>{r.winner_name}</span>
          <span style={{ ...M, fontSize: 13, color: '#00FF88' }}>+{r.winner_return?.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  ) : null;

  const leaderboardPanel = (
    <div style={{ padding: '6px 10px', borderBottom: '1px solid #1A1A1A' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ ...B, fontSize: 14, color: '#777' }}>STANDINGS</span>
        {myRank > 0 && <span style={{ ...M, fontSize: 12, color: '#F5A0D0' }}>#{myRank}/{totalTraders}</span>}
      </div>
      {standings.length === 0 ? (
        <div style={{ padding: '8px 0', textAlign: 'center' }}>
          <span style={{ ...B, fontSize: 11, color: '#222' }}>WAITING FOR ROUND...</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {standings.slice(0, 10).map(s => {
            const me = s.trader.id === trader?.id;
            const prev = prevRanks[s.trader.id];
            const rankDiff = prev ? prev - s.rank : 0;
            const healthPct = Math.max(0, Math.min(100, (s.portfolioValue / startingBalance) * 100));
            const isKO = healthPct <= 0 || s.returnPct <= -99;
            const barColor = isKO ? '#FF3333' : healthPct > 60 ? '#00FF88' : healthPct > 30 ? '#F5A0D0' : '#FF3333';
            const isTarget = selectedTarget === s.trader.id;
            const canTarget = !me && !isKO;
            return (
              <button
                key={s.rank}
                className="standing-row"
                onClick={() => canTarget && setSelectedTarget(isTarget ? null : s.trader.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px',
                  background: isTarget ? 'rgba(245,160,208,0.1)' : me ? 'rgba(245,160,208,0.03)' : '#0D0D0D',
                  border: isTarget ? '1px solid #F5A0D0' : '1px solid transparent',
                  borderLeft: me ? '2px solid #F5A0D0' : isTarget ? '2px solid #F5A0D0' : '2px solid transparent',
                  cursor: canTarget ? 'pointer' : me ? 'default' : 'not-allowed',
                  transition: 'all 150ms',
                  opacity: isKO && !me ? 0.4 : 1,
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <span style={{ ...B, fontSize: 13, color: s.rank === 1 ? '#FFD700' : s.rank === 2 ? '#C0C0C0' : s.rank === 3 ? '#CD7F32' : '#444', width: 22, flexShrink: 0 }}>#{s.rank}</span>
                    <span style={{ ...S, fontSize: 13, color: me ? '#F5A0D0' : isKO ? '#555' : '#FFF', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isKO ? 'line-through' : 'none' }}>
                      {s.teamName ?? s.trader.name}{me ? ' (YOU)' : ''}
                    </span>
                    {rankDiff > 0 && <span style={{ ...M, fontSize: 10, color: '#00FF88' }}>▲{rankDiff}</span>}
                    {rankDiff < 0 && <span style={{ ...M, fontSize: 10, color: '#FF3333' }}>▼{Math.abs(rankDiff)}</span>}
                    {isTarget && <span style={{ ...B, fontSize: 9, color: '#F5A0D0', padding: '0 3px', border: '1px solid #F5A0D0' }}>TGT</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isKO && <span style={{ ...B, fontSize: 10, color: '#FF3333' }}>KO</span>}
                    <span style={{ ...M, fontSize: 12, color: '#FFF' }}>${s.portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    <span style={{ ...M, fontSize: 11, color: s.returnPct >= 0 ? '#00FF88' : '#FF3333' }}>{s.returnPct >= 0 ? '+' : ''}{s.returnPct.toFixed(1)}%</span>
                  </div>
                </div>
                <div style={{ width: '100%', height: 3, background: '#1A1A1A', overflow: 'hidden' }}>
                  <div style={{
                    width: `${healthPct}%`, height: '100%',
                    background: isKO ? '#FF3333' : `linear-gradient(90deg, ${barColor}, ${healthPct > 60 ? '#00CC66' : healthPct > 30 ? '#D080B0' : '#CC0000'})`,
                    transition: 'width 600ms ease, background 400ms',
                  }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const pnlHero = (
    <div style={{ padding: '6px 10px', borderBottom: '1px solid #1A1A1A', background: `linear-gradient(180deg, ${pnlColor}06, transparent)`, animation: rankFlash === 'up' ? 'rankUpFlash 1.5s ease-out' : rankFlash === 'down' ? 'rankDownFlash 1.5s ease-out' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...B, fontSize: 28, color: rankColor, lineHeight: 1, textShadow: `0 0 12px ${rankColor}50`, animation: myRank === 1 ? 'glowPulse 3s ease-in-out infinite' : 'none' }}>#{myRank || '—'}</span>
          <div>
            <span style={{ ...B, fontSize: 22, color: pnlColor, lineHeight: 1, display: 'block', textShadow: rp !== 0 ? `0 0 10px ${pnlColor}40` : 'none' }}>{rp >= 0 ? '+' : ''}{rp.toFixed(1)}%</span>
            <span style={{ ...M, fontSize: 9, color: '#666', marginTop: 1, display: 'block' }}>${pv.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {openPos.length} open</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ ...M, fontSize: 9, color: '#555' }}>{myRank}/{totalTraders}</span>
        </div>
      </div>
      {proximityGap !== null && proximityGap < 2 && myRank > 1 && (
        <div style={{ marginTop: 4, padding: '2px 6px', background: 'rgba(245,160,208,0.08)', border: '1px solid rgba(245,160,208,0.3)', animation: 'proximityPulse 1.5s infinite' }}>
          <span style={{ ...B, fontSize: 9, color: '#F5A0D0' }}>{proximityGap.toFixed(1)}% FROM #{myRank - 1}</span>
        </div>
      )}
    </div>
  );

  const effectsBar = activeEffects.length > 0 ? (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid #1A1A1A' }}>
      <span style={{ ...B, fontSize: 9, color: '#666', display: 'block', marginBottom: 4 }}>ACTIVE EFFECTS</span>
      {activeEffects.map(e => {
        const c = e.source === 'attack' ? '#FF3333' : '#00BFFF';
        return (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', border: `1px solid ${c}`, background: `${c}08`, marginBottom: 3 }}>
            <span style={{ ...B, fontSize: 10, color: c }}>{e.label}</span>
            {e.expiresAt && e.secondsRemaining > 0 && <span style={{ ...M, fontSize: 10, color: c }}>{Math.floor(e.secondsRemaining/60)}:{(e.secondsRemaining%60).toString().padStart(2,'0')}</span>}
          </div>
        );
      })}
    </div>
  ) : null;

  // Live feed — horizontal scrolling news ticker
  const liveFeedTicker = feedItems.length > 0 ? (
    <div style={{ height: 28, display: 'flex', alignItems: 'center', borderBottom: '1px solid #1A1A1A', background: '#0D0D0D', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0, borderRight: '1px solid #1A1A1A' }}>
        <span style={{ width: 5, height: 5, background: '#F5A0D0', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
        <span style={{ ...B, fontSize: 10, color: '#F5A0D0' }}>LIVE</span>
      </div>
      <div className="live-feed-scroll" style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', maskImage: 'linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)' }}>
        <div style={{ display: 'inline-flex', gap: 24, animation: `tickerScroll ${Math.max(15, feedItems.length * 5)}s linear infinite`, paddingLeft: '100%' }}>
          {feedItems.slice(0, 10).map(f => (
            <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 12 }}>{f.icon}</span>
              <span style={{ ...S, fontSize: 12, color: f.color, whiteSpace: 'nowrap' }}>{f.text}</span>
              <span style={{ ...M, fontSize: 9, color: '#444' }}>{Math.floor((Date.now() - f.time) / 1000)}s</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  // Quick positions — compact cards for right sidebar
  const closeAllPositions = async () => {
    for (const p of openPos) await closePosition(p.id);
  };

  const quickPositions = openPos.length > 0 ? (
    <div style={{ padding: '4px 10px', borderBottom: '1px solid #1A1A1A' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ ...B, fontSize: 13, color: '#777' }}>POSITIONS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={closeAllPositions} style={{ ...B, fontSize: 8, color: '#FF3333', background: 'none', border: '1px solid #FF3333', padding: '1px 5px', cursor: 'pointer', letterSpacing: '0.05em' }}>CLOSE ALL</button>
          <span style={{ ...B, fontSize: 10, color: openPos.length >= 3 ? '#FF3333' : '#F5A0D0' }}>{openPos.length}/3</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {openPos.map(p => {
          const price = prices[p.symbol] ?? 0;
          const pnl = price > 0 ? (p.direction === 'long' ? (price - p.entry_price) / p.entry_price * p.size * p.leverage : (p.entry_price - price) / p.entry_price * p.size * p.leverage) : 0;
          const pct = p.size > 0 ? (pnl / p.size) * 100 : 0;
          const isLong = p.direction === 'long';
          const dc = isLong ? '#00FF88' : '#FF3333';
          const isClosing = actionLoading === p.id;
          const isTrail = p.order_type === 'trailing_stop';
          const liqPrice = getLiquidationPrice(p);
          const liqDist = price > 0 ? Math.abs(price - liqPrice) / price * 100 : 100;
          const nearLiq = liqDist < 10;
          const isNew = tradeFlashId === p.id;
          return (
            <div key={p.id} className={isNew ? 'trade-flash' : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', background: nearLiq ? 'rgba(255,51,51,0.12)' : `${dc}08`, borderLeft: `2px solid ${nearLiq ? '#FF3333' : dc}`, border: `1px solid ${nearLiq ? '#FF333344' : `${dc}22`}`, animation: nearLiq ? 'nearLiqPulse 1s infinite' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ ...B, fontSize: 11, color: dc }}>{isLong ? 'L' : 'S'}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ ...B, fontSize: 11, color: '#FFF' }}>{p.symbol.replace('USDT', '')}</span>
                    {isTrail && <span style={{ ...M, fontSize: 7, color: '#F5A0D0', background: '#F5A0D015', padding: '0 3px' }}>TRAIL</span>}
                  </div>
                  <span style={{ ...M, fontSize: 8, color: '#999', display: 'block' }}>{p.leverage}x · liq {fmtP(getLiquidationPrice(p))}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...M, fontSize: 11, color: pnl >= 0 ? '#00FF88' : '#FF3333' }}>{pnl >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                <button onClick={() => closePosition(p.id)} disabled={isClosing} style={{ ...B, fontSize: 9, padding: '3px 8px', minHeight: 24, background: '#1A1A1A', color: '#888', border: '1px solid #333', cursor: isClosing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{isClosing ? '...' : '✕'}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  // Bottom position strip — full width under chart, always visible & prominent
  const bottomPositionStrip = (
    <div style={{ borderTop: '2px solid #333', flexShrink: 0, background: '#0D0D0D', minHeight: 100 }}>
      <div style={{ padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', borderBottom: '1px solid #1A1A1A' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, background: openPos.length > 0 ? '#F5A0D0' : '#333', display: 'block' }} />
          <span style={{ ...B, fontSize: 15, color: openPos.length > 0 ? '#FFF' : '#555' }}>OPEN POSITIONS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {openPos.length > 0 && <button onClick={closeAllPositions} style={{ ...B, fontSize: 11, color: '#FF3333', background: 'none', border: '1px solid #FF3333', padding: '2px 10px', cursor: 'pointer', letterSpacing: '0.05em' }}>CLOSE ALL</button>}
          <span style={{ ...B, fontSize: 15, color: openPos.length >= 3 ? '#FF3333' : openPos.length > 0 ? '#F5A0D0' : '#333' }}>{openPos.length} / 3</span>
        </div>
      </div>
      {openPos.length === 0 ? (
        <div style={{ padding: '24px 20px', textAlign: 'center', background: 'linear-gradient(180deg, rgba(245,160,208,0.03), transparent)' }}>
          <span style={{ ...B, fontSize: 18, color: '#333' }}>NO OPEN POSITIONS</span>
          <br />
          <span style={{ ...S, fontSize: 12, color: '#1A1A1A', marginTop: 4, display: 'inline-block' }}>Select an asset and go LONG or SHORT</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {openPos.map(p => {
            const price = prices[p.symbol] ?? 0;
            const pnl = price > 0 ? (p.direction === 'long' ? (price - p.entry_price) / p.entry_price * p.size * p.leverage : (p.entry_price - price) / p.entry_price * p.size * p.leverage) : 0;
            const pct = p.size > 0 ? (pnl / p.size) * 100 : 0;
            const isLong = p.direction === 'long';
            const dc = isLong ? '#00FF88' : '#FF3333';
            const isClosing = actionLoading === p.id;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #1A1A1A', borderLeft: `4px solid ${dc}`, background: `${dc}08` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', ...B, fontSize: 14, background: dc, color: isLong ? '#0A0A0A' : '#FFF' }}>{isLong ? 'L' : 'S'}</span>
                  <div>
                    <span style={{ ...B, fontSize: 20, color: '#FFF', lineHeight: 1 }}>{p.symbol.replace('USDT', '')}</span>
                    <span style={{ ...M, fontSize: 11, color: '#666', display: 'block', marginTop: 2 }}>${p.size.toLocaleString()} @ {p.leverage}x · Entry ${fmtP(p.entry_price)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ ...M, fontSize: 22, color: pnl >= 0 ? '#00FF88' : '#FF3333', display: 'block', lineHeight: 1 }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}</span>
                    <span style={{ ...M, fontSize: 12, color: pnl >= 0 ? '#00FF88' : '#FF3333', marginTop: 2, display: 'block' }}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                  </div>
                  <button onClick={() => closePosition(p.id)} disabled={isClosing} style={{ ...B, fontSize: 13, padding: '7px 16px', background: isClosing ? '#111' : '#1A1A1A', color: isClosing ? '#333' : '#FFF', border: '1px solid #444', cursor: isClosing ? 'not-allowed' : 'pointer', transition: 'all 100ms' }}>{isClosing ? 'CLOSING...' : 'CLOSE'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Detailed positions for mobile / right column detail view
  const rightPositions = (
    <div style={{ borderTop: '2px solid #333', flexShrink: 0, background: '#0A0A0A' }}>
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1A1A1A' }}>
        <span style={{ ...B, fontSize: 14, color: openPos.length > 0 ? '#FFF' : '#444' }}>OPEN POSITIONS</span>
        <span style={{ ...B, fontSize: 14, color: openPos.length >= 3 ? '#FF3333' : openPos.length > 0 ? '#F5A0D0' : '#333' }}>{openPos.length}/3</span>
      </div>
      {openPos.length === 0 ? (
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          <span style={{ ...B, fontSize: 14, color: '#1A1A1A' }}>NO POSITIONS</span>
          <br />
          <span style={{ ...S, fontSize: 10, color: '#1A1A1A', marginTop: 4, display: 'inline-block' }}>Open a trade above</span>
        </div>
      ) : openPos.map(p => {
        const price = prices[p.symbol] ?? 0;
        const pnl = price > 0 ? (p.direction === 'long' ? (price - p.entry_price) / p.entry_price * p.size * p.leverage : (p.entry_price - price) / p.entry_price * p.size * p.leverage) : 0;
        const pct = p.size > 0 ? (pnl / p.size) * 100 : 0;
        const isLong = p.direction === 'long';
        const dc = isLong ? '#00FF88' : '#FF3333';
        const isClosing = actionLoading === p.id;
        return (
          <div key={p.id} style={{ padding: '12px 16px', borderTop: '1px solid #111', borderLeft: `4px solid ${dc}`, background: `${dc}08` }}>
            {/* Row 1: Symbol + Close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', ...B, fontSize: 13, background: dc, color: isLong ? '#0A0A0A' : '#FFF' }}>{isLong ? 'L' : 'S'}</span>
                <div>
                  <span style={{ ...B, fontSize: 18, color: '#FFF', display: 'block', lineHeight: 1 }}>{p.symbol.replace('USDT', '')}</span>
                  <span style={{ ...M, fontSize: 10, color: '#999' }}>${p.size.toLocaleString()} @ {p.leverage}x</span>
                </div>
              </div>
              <button onClick={() => closePosition(p.id)} disabled={isClosing} style={{ ...B, fontSize: 12, padding: '8px 16px', minHeight: 44, background: isClosing ? '#111' : '#1A1A1A', color: isClosing ? '#333' : '#FFF', border: '1px solid #333', cursor: isClosing ? 'not-allowed' : 'pointer', transition: 'all 100ms' }}>{isClosing ? 'CLOSING...' : 'CLOSE'}</button>
            </div>
            {/* Row 2: Entry + P&L */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <span style={{ ...S, fontSize: 9, color: '#666', display: 'block' }}>ENTRY</span>
                <span style={{ ...M, fontSize: 12, color: '#888' }}>${fmtP(p.entry_price)}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ ...M, fontSize: 22, color: pnl >= 0 ? '#00FF88' : '#FF3333', display: 'block', lineHeight: 1 }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}</span>
                <span style={{ ...M, fontSize: 12, color: pnl >= 0 ? '#00FF88' : '#FF3333' }}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const priceHero = (
    <div className="price-hero" style={{ padding: '10px 16px', display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0, borderBottom: '1px solid #111', flexWrap: 'wrap' }}>
      <span className="price-hero-value" style={{ ...M, fontSize: 44, fontWeight: 700, color: '#FFF', lineHeight: 1, textShadow: '0 0 30px rgba(255,255,255,0.1)', letterSpacing: '-0.02em' }}>${fmtP(selectedPrice)}</span>
      <span style={{ ...B, fontSize: 20, color: '#555' }}>{selectedSymbol}/USD</span>
      {selectedPrice > 0 && <span style={{ ...M, fontSize: 13, color: '#F5A0D0', marginLeft: 'auto', animation: 'breathe 2s ease-in-out infinite' }}>LIVE</span>}
    </div>
  );

  const isSymbolAllowed = (_s: string) => true; // All symbols visible in picker
  const activeCore = CORE_ASSETS.filter(isSymbolAllowed);
  const moreSymbols = allSymbols.filter(s => !activeCore.includes(s));
  const _fbm = getFeedsByMarket();
  const groupedAssets: { label: string; items: string[] }[] = MARKET_TYPES
    .map(mt => ({
      label: mt.label,
      items: _fbm[mt.key].map(f => f.symbol).filter(s => isSymbolAllowed(s) && !activeCore.includes(s)),
    }))
    .filter(g => g.items.length > 0);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button, select, input { border-radius: 0 !important; outline: none; }
        button:hover:not(:disabled) { filter: brightness(1.15); }
        button:active:not(:disabled) { transform: scale(0.97); }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideIn { from{transform:translateX(120%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes slideOut { from{transform:translateX(0);opacity:1} to{transform:translateX(120%);opacity:0} }
        @keyframes flashFade { 0%{opacity:0.3} 100%{opacity:0} }
        @keyframes glowPulse { 0%,100%{text-shadow:0 0 8px currentColor} 50%{text-shadow:0 0 24px currentColor, 0 0 48px currentColor} }
        @keyframes borderPulse { 0%,100%{border-color:rgba(245,160,208,0.3)} 50%{border-color:rgba(245,160,208,0.8)} }
        @keyframes breathe { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes rankUp { 0%{transform:translateY(4px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes tickerScroll { 0%{transform:translateX(0)} 100%{transform:translateX(-100%)} }
        @keyframes urgentPulse { 0%,100%{background:rgba(255,51,51,0.05)} 50%{background:rgba(255,51,51,0.15)} }
        @keyframes liveDot { 0%,100%{box-shadow:0 0 4px #F5A0D0,0 0 8px #F5A0D0} 50%{box-shadow:0 0 8px #F5A0D0,0 0 20px #F5A0D0,0 0 40px rgba(245,160,208,0.3)} }
        @keyframes barGlow { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.3)} }
        @keyframes ctaPulse { 0%,100%{box-shadow:0 0 0 0 rgba(245,160,208,0.4)} 70%{box-shadow:0 0 0 12px rgba(245,160,208,0)} }
        @keyframes entryShine { 0%{left:-100%} 100%{left:200%} }
        @keyframes popIn { 0%{transform:scale(0.8);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes attackShake { 0%,100%{transform:translateX(0)} 10%,30%,50%,70%,90%{transform:translateX(-2px)} 20%,40%,60%,80%{transform:translateX(2px)} }
        @keyframes tradePopIn { 0%{transform:scale(0.85) translateX(20px);opacity:0} 50%{transform:scale(1.03) translateX(0);opacity:1} 100%{transform:scale(1) translateX(0);opacity:1} }
        @keyframes rankUpFlash { 0%{background:rgba(0,255,136,0.2)} 100%{background:transparent} }
        @keyframes rankDownFlash { 0%{background:rgba(255,51,51,0.15)} 100%{background:transparent} }
        @keyframes nearLiqPulse { 0%,100%{border-color:rgba(255,51,51,0.3)} 50%{border-color:rgba(255,51,51,0.9)} }
        @keyframes proximityPulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes heartbeat { 0%{transform:scale(1)} 14%{transform:scale(1.05)} 28%{transform:scale(1)} 42%{transform:scale(1.05)} 70%{transform:scale(1)} }
        @keyframes streakGlow { 0%,100%{text-shadow:0 0 8px rgba(0,255,136,0.5)} 50%{text-shadow:0 0 24px rgba(0,255,136,0.8), 0 0 48px rgba(0,255,136,0.4)} }
        @keyframes countdownTick { 0%{transform:scale(1.08)} 100%{transform:scale(1)} }
        .weapon-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important; }
        .weapon-card:active { transform: scale(0.97); }
        .standing-row:hover { background: rgba(245,160,208,0.06) !important; }
        .position-card { transition: all 200ms ease; }
        .position-card:hover { background: rgba(255,255,255,0.03) !important; }
        .trade-flash { animation: tradePopIn 400ms ease-out; }
        .price-ticker-scroll::-webkit-scrollbar { display: none; }
        @media (max-width: 767px) {
          .top-bar { padding: 0 6px !important; min-height: 36px !important; }
          .top-bar-logo { height: 28px !important; }
          .top-bar-lobby-name { display: none !important; }
          .top-bar-user { display: none !important; }
          .top-bar-pnl { font-size: 10px !important; }
          .price-hero { padding: 6px 12px !important; }
          .price-hero-value { font-size: 28px !important; }
        }
      `}</style>

      {/* Screen flash overlay */}
      {flashColor && (
        <div style={{ position: 'fixed', inset: 0, background: flashColor, zIndex: 9999, pointerEvents: 'none', animation: 'flashFade 300ms ease-out forwards' }} />
      )}

      {/* Scanlines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px)', backgroundSize: '2px 2px', pointerEvents: 'none', zIndex: 998 }} />

      {/* Overlays */}
      <OverlayManager activeOverlay={activeOverlay} onClose={() => setActiveOverlay(null)} trader={{ name: trader?.name ?? '', avatar: trader?.avatar_url ?? '', returnPct: rp }} />
      <BattleEndOverlay
        visible={!!battleEndData}
        rank={battleEndData?.rank ?? 0}
        totalPlayers={battleEndData?.totalPlayers ?? 0}
        returnPct={battleEndData?.returnPct ?? 0}
        lobbyId={lobbyId}
        onRematch={async () => {
          setBattleEndData(null);
          const pid = trader?.profile_id ?? '';
          if (!pid) return;
          const r = await fetch('/api/lobbies/practice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile_id: pid, display_name: trader?.name }),
          });
          if (r.ok) {
            const d = await r.json();
            window.location.href = `/lobby/${d.lobby_id}/trade?code=${d.code}`;
          }
        }}
        onViewRecap={() => { setBattleEndData(null); window.location.href = `/lobby/${lobbyId}/recap`; }}
        onBackToDashboard={() => { window.location.href = '/dashboard'; }}
      />

      <div style={{ height: '100dvh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* EVENT ALERT BAR */}
        {eventAlert && (
          <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, borderBottom: '2px solid #FF3333', background: 'linear-gradient(90deg, rgba(255,51,51,0.12), rgba(245,160,208,0.08), rgba(255,51,51,0.12))', flexShrink: 0, animation: 'pulse 1.5s infinite' }}>
            <span style={{ ...B, fontSize: 14, color: '#FF3333' }}>⚡ {eventAlert.headline}</span>
            <span style={{ ...M, fontSize: 12, color: '#FF3333' }}>{Math.max(0, Math.ceil((eventAlert.expiresAt - Date.now()) / 1000))}s</span>
          </div>
        )}

        {/* ROUND RESULT BANNER */}
        {showRoundResult && (
          <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, borderBottom: '2px solid #F5A0D0', background: 'linear-gradient(90deg, rgba(245,160,208,0.08), rgba(0,255,136,0.05), rgba(245,160,208,0.08))', flexShrink: 0 }}>
            <span style={{ ...B, fontSize: 14, color: '#F5A0D0' }}>ROUND {showRoundResult.round_number} COMPLETE</span>
            <span style={{ ...B, fontSize: 18, color: '#FFF' }}>{showRoundResult.winner_name}</span>
            <span style={{ ...M, fontSize: 16, color: '#00FF88' }}>+{showRoundResult.winner_return?.toFixed(1)}%</span>
          </div>
        )}



        {/* TOP BAR */}
        <div className="top-bar" style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', borderBottom: '2px solid #1A1A1A', background: 'linear-gradient(180deg, #111, #0D0D0D)', flexShrink: 0, gap: 6, flexWrap: 'nowrap', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1 }}>
            <img src="/brand/logo-main.png" alt="Battle Trade" className="top-bar-logo" style={{ height: 56, width: 'auto', flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="top-bar-lobby-name" style={{ ...B, fontSize: 12, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lobbyName || 'LOBBY'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ ...B, fontSize: 13, color: round?.status === 'active' ? '#F5A0D0' : '#444', padding: '3px 8px', background: round?.status === 'active' ? 'rgba(245,160,208,0.08)' : 'transparent', border: '1px solid rgba(245,160,208,0.15)' }}>R{round?.round_number ?? '-'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: `2px solid ${isUrgent ? '#FF3333' : isTense ? '#FF333380' : round?.status === 'active' ? '#333' : '#1A1A1A'}`, animation: isUrgent ? 'urgentPulse 0.5s infinite' : isTense ? 'urgentPulse 1.5s infinite' : 'none' }}>
              <span style={{ ...M, fontSize: 18, fontWeight: 700, color: isUrgent ? '#FF3333' : isTense ? '#FF8866' : round?.status === 'active' ? '#FFF' : '#444', padding: '2px 10px', textShadow: isUrgent ? '0 0 16px #FF3333, 0 0 32px rgba(255,51,51,0.6)' : isTense ? '0 0 8px rgba(255,136,102,0.4)' : round?.status === 'active' ? '0 0 10px rgba(255,255,255,0.1)' : 'none', letterSpacing: '0.05em', animation: isUrgent ? 'heartbeat 1s infinite' : 'none' }}>{round?.status === 'active' ? timeFmt : '--:--'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 1 }}>
            <span className="top-bar-pnl" style={{ ...M, fontSize: 12, color: rp >= 0 ? '#00FF88' : '#FF3333', textShadow: `0 0 8px ${rp >= 0 ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,51,0.3)'}`, whiteSpace: 'nowrap' }}>{rp >= 0 ? '+' : ''}{rp.toFixed(1)}%</span>
            <button onClick={() => setShowPurchaseModal(true)} style={{ ...M, fontSize: 10, color: '#F5A0D0', padding: '3px 8px', background: 'rgba(245,160,208,0.08)', border: '1px solid rgba(245,160,208,0.2)', borderRadius: 6, cursor: 'pointer', transition: 'all 150ms', whiteSpace: 'nowrap', minHeight: 30 }}>{credits.balance}CR</button>
            {/* Wallet balance health bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#111', border: `1px solid ${rp >= 0 ? '#00FF8833' : '#FF333333'}`, borderRadius: 6, minHeight: 30, flexShrink: 0 }}>
              <span style={{ ...M, fontSize: 11, fontWeight: 700, color: '#FFF', whiteSpace: 'nowrap' }}>${pv.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <div style={{ width: 40, height: 5, background: '#1A1A1A', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${Math.max(0, Math.min(100, (pv / startingBalance) * 100))}%`, height: '100%', borderRadius: 3, background: pv >= startingBalance * 0.6 ? '#00FF88' : pv >= startingBalance * 0.3 ? '#F5A0D0' : '#FF3333', transition: 'width 500ms' }} />
              </div>
            </div>
            {/* Lobby rank (small) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px', minHeight: 26, flexShrink: 0, background: `${rankColor}08`, border: `1px solid ${rankColor}25`, borderRadius: 6, animation: rankFlash === 'up' ? 'rankUpFlash 1.5s ease-out' : rankFlash === 'down' ? 'rankDownFlash 1.5s ease-out' : 'none' }}>
              <span style={{ ...B, fontSize: 14, color: rankColor }}>#{myRank || '—'}</span>
              <span style={{ ...M, fontSize: 8, color: '#444' }}>/{totalTraders}</span>
            </div>
            {/* Win streak (compact) */}
            {winStreak >= 2 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: 'rgba(255,136,0,0.1)', border: '1px solid rgba(255,136,0,0.25)', borderRadius: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10 }}>🔥</span>
                <span style={{ ...B, fontSize: 10, color: '#FF8800' }}>{winStreak}</span>
              </div>
            )}
            {/* Account + Global Rank */}
            <div className="top-bar-user" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ width: 6, height: 6, background: '#F5A0D0', display: 'block', animation: 'liveDot 2s ease-in-out infinite', flexShrink: 0 }} />
              <span style={{ ...B, fontSize: 11, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>{trader?.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 4, background: globalRank ? 'rgba(245,160,208,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${globalRank ? '#F5A0D030' : '#22222280'}` }}>
                <span style={{ ...S, fontSize: 7, color: '#777', textTransform: 'uppercase', letterSpacing: '0.04em' }}>WORLD</span>
                <span style={{ ...B, fontSize: 13, color: globalRank ? '#F5A0D0' : '#444' }}>#{globalRank || '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ASSET DROPDOWN — mobile only, desktop version inside center column */}
        <div ref={assetDropdownRef} className="md:hidden" style={{ position: 'relative', minHeight: 36, borderBottom: '1px solid #1A1A1A', flexShrink: 0, background: '#0D0D0D' }}>
          {/* Trigger — asset selector + scrollable price ticker */}
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 36 }}>
            <button
              onClick={() => { setShowMoreAssets(!showMoreAssets); setAssetSearch(''); setAssetTab('all'); setTimeout(() => assetSearchRef.current?.focus(), 50); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', minHeight: 36, ...B, fontSize: 14, color: '#FFF', background: showMoreAssets ? 'rgba(245,160,208,0.06)' : 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            >
              <span style={{ width: 7, height: 7, background: '#F5A0D0', display: 'block', boxShadow: '0 0 6px rgba(245,160,208,0.5)', flexShrink: 0, borderRadius: 2 }} />
              <span style={{ ...B, fontSize: 15, color: '#FFF' }}>{selectedSymbol}</span>
              <span style={{ ...M, fontSize: 13, color: '#F5A0D0' }}>${selectedPrice > 100 ? selectedPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : fmtP(selectedPrice)}</span>
              <span style={{ ...S, fontSize: 11, color: '#555', transition: 'transform 150ms', transform: showMoreAssets ? 'rotate(180deg)' : 'none' }}>▼</span>
            </button>
            {/* Horizontal scrollable price ticker for core assets */}
            <div className="price-ticker-scroll" style={{ flex: 1, display: 'flex', gap: 0, overflowX: 'auto', paddingRight: 4, minWidth: 0, WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {CORE_ASSETS.filter(s => s !== selectedSymbol).slice(0, 8).map(sym => {
                const md = marketData[sym];
                const chg = md?.change24h;
                return (
                  <button key={sym} onClick={() => setSelectedSymbol(sym)} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, minHeight: 30 }}>
                    <span style={{ ...B, fontSize: 11, color: '#666' }}>{sym}</span>
                    {chg !== null && chg !== undefined && <span style={{ ...M, fontSize: 9, color: chg >= 0 ? '#00FF88' : '#FF3333' }}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}%</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dropdown panel */}
          {showMoreAssets && (
            <>
              {/* Backdrop to close on click outside */}
              <div onClick={() => setShowMoreAssets(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 480, display: 'flex', flexDirection: 'column', background: '#0A0A0A', border: '1px solid #333', borderTop: '2px solid #F5A0D0', boxShadow: '0 12px 48px rgba(0,0,0,0.9)' }}>
                {/* Search input */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
                  <input
                    ref={assetSearchRef}
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value.toUpperCase())}
                    placeholder="SEARCH ASSETS..."
                    style={{ width: '100%', ...M, fontSize: 16, color: '#FFF', background: '#111', border: '1px solid #222', padding: '10px 12px', minHeight: 44, outline: 'none' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setShowMoreAssets(false);
                      if (e.key === 'Enter') {
                        const match = allSymbols.find(s => s.startsWith(assetSearch));
                        if (match) { setSelectedSymbol(match); setShowMoreAssets(false); }
                      }
                    }}
                  />
                </div>
                {/* Category tabs */}
                {!assetSearch && (
                  <div style={{ display: 'flex', borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
                    <button
                      onClick={() => setAssetTab('all')}
                      style={{ flex: 1, padding: '8px 0', ...B, fontSize: 13, letterSpacing: '0.08em', color: assetTab === 'all' ? '#0A0A0A' : '#666', background: assetTab === 'all' ? '#F5A0D0' : 'transparent', border: 'none', borderBottom: assetTab === 'all' ? '2px solid #F5A0D0' : '2px solid transparent', cursor: 'pointer' }}
                    >ALL</button>
                    {MARKET_TYPES.map(mt => {
                      const count = _fbm[mt.key].filter(f => isSymbolAllowed(f.symbol)).length;
                      return (
                        <button
                          key={mt.key}
                          onClick={() => setAssetTab(mt.key)}
                          style={{ flex: 1, padding: '8px 0', ...B, fontSize: 13, letterSpacing: '0.08em', color: assetTab === mt.key ? '#0A0A0A' : '#666', background: assetTab === mt.key ? '#F5A0D0' : 'transparent', border: 'none', borderBottom: assetTab === mt.key ? '2px solid #F5A0D0' : '2px solid transparent', cursor: 'pointer' }}
                        >{mt.label} <span style={{ ...M, fontSize: 9, color: assetTab === mt.key ? '#0A0A0A' : '#444' }}>{count}</span></button>
                      );
                    })}
                  </div>
                )}
                {/* Fear & Greed banner */}
                {fearGreed.value !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '5px 12px', borderBottom: '1px solid #1A1A1A', background: '#0D0D0D', flexShrink: 0 }}>
                    <span style={{ ...S, fontSize: 9, color: '#666' }}>MARKET SENTIMENT</span>
                    <span style={{ ...B, fontSize: 14, color: fearGreed.value! > 60 ? '#00FF88' : fearGreed.value! > 40 ? '#FFD700' : '#FF3333', textShadow: `0 0 8px ${fearGreed.value! > 60 ? 'rgba(0,255,136,0.3)' : fearGreed.value! > 40 ? 'rgba(255,215,0,0.3)' : 'rgba(255,51,51,0.3)'}` }}>
                      {fearGreed.value} — {fearGreed.label?.toUpperCase()}
                    </span>
                    <div style={{ width: 60, height: 4, background: '#1A1A1A', overflow: 'hidden' }}>
                      <div style={{ width: `${fearGreed.value}%`, height: '100%', background: fearGreed.value! > 60 ? '#00FF88' : fearGreed.value! > 40 ? '#FFD700' : '#FF3333' }} />
                    </div>
                  </div>
                )}
                {/* Column headers */}
                <div style={{ display: 'flex', padding: '4px 12px', borderBottom: '1px solid #111', flexShrink: 0 }}>
                  <span style={{ ...S, fontSize: 9, color: '#444', flex: 1, textTransform: 'uppercase' }}>ASSET</span>
                  <span style={{ ...S, fontSize: 9, color: '#444', width: 80, textAlign: 'right', textTransform: 'uppercase' }}>PRICE</span>
                  <span style={{ ...S, fontSize: 9, color: '#444', width: 52, textAlign: 'right', textTransform: 'uppercase' }}>24H</span>
                  <span style={{ ...S, fontSize: 9, color: '#444', width: 52, textAlign: 'right', textTransform: 'uppercase' }}>VOL</span>
                  <span style={{ ...S, fontSize: 9, color: '#444', width: 52, textAlign: 'right', textTransform: 'uppercase' }}>L/S</span>
                </div>
                {/* Scrollable asset list */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(() => {
                    // Build filtered list based on tab + search
                    let items: string[];
                    if (assetSearch) {
                      items = allSymbols.filter(s => s.includes(assetSearch) || (PYTH_FEEDS[`${s}USD`]?.label ?? '').toUpperCase().includes(assetSearch));
                    } else if (assetTab === 'all') {
                      items = allSymbols;
                    } else {
                      items = _fbm[assetTab as keyof typeof _fbm]?.map(f => f.symbol).filter(isSymbolAllowed) ?? [];
                    }
                    if (items.length === 0) {
                      return <div style={{ padding: 24, textAlign: 'center', ...M, fontSize: 12, color: '#444' }}>NO ASSETS FOUND</div>;
                    }
                    return items.map(sym => {
                      const p = prices[`${sym}USDT`] ?? prices[`${sym}USD`] ?? 0;
                      const feed = PYTH_FEEDS[`${sym}USD`];
                      const md = marketData[sym];
                      const chg = md?.change24h;
                      const vol = md?.volume24h;
                      const lr = md?.longRatio;
                      const isSel = sym === selectedSymbol;
                      const chgColor = chg === null || chg === undefined ? '#444' : chg >= 0 ? '#00FF88' : '#FF3333';
                      const fmtVol = (v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toFixed(0);
                      return (
                        <button
                          key={sym}
                          onClick={() => { setSelectedSymbol(sym); setShowMoreAssets(false); setAssetSearch(''); }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '7px 12px', background: isSel ? 'rgba(245,160,208,0.08)' : 'transparent', border: 'none', borderBottom: '1px solid #111', borderLeft: isSel ? '3px solid #F5A0D0' : '3px solid transparent', cursor: 'pointer', transition: 'background 100ms' }}
                        >
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ width: 6, height: 6, background: isSel ? '#F5A0D0' : feed?.market === 'rwa' ? '#FFD700' : '#555', flexShrink: 0 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ ...B, fontSize: 14, color: isSel ? '#F5A0D0' : '#FFF', lineHeight: 1 }}>{sym}</span>
                              {feed && <span style={{ ...S, fontSize: 9, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{feed.label}</span>}
                            </div>
                          </div>
                          <span style={{ ...M, fontSize: 11, color: isSel ? '#F5A0D0' : '#888', width: 80, textAlign: 'right', flexShrink: 0 }}>
                            {p > 0 ? `$${p > 100 ? p.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p < 0.01 ? p.toFixed(6) : p.toFixed(2)}` : '—'}
                          </span>
                          <span style={{ ...M, fontSize: 10, fontWeight: 700, color: chgColor, width: 52, textAlign: 'right', flexShrink: 0 }}>
                            {chg !== null && chg !== undefined ? `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%` : '—'}
                          </span>
                          <span style={{ ...M, fontSize: 9, color: '#555', width: 52, textAlign: 'right', flexShrink: 0 }}>
                            {vol ? `$${fmtVol(vol)}` : '—'}
                          </span>
                          <div style={{ width: 52, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                            {lr !== null && lr !== undefined ? (
                              <>
                                <div style={{ width: 36, height: 3, background: '#FF3333', overflow: 'hidden', display: 'flex' }}>
                                  <div style={{ width: `${(lr * 100)}%`, height: '100%', background: '#00FF88' }} />
                                </div>
                                <span style={{ ...M, fontSize: 8, color: lr > 0.5 ? '#00FF88' : '#FF3333' }}>{(lr * 100).toFixed(0)}L</span>
                              </>
                            ) : <span style={{ ...M, fontSize: 9, color: '#333' }}>—</span>}
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* ═══ DESKTOP (>= 768px) ═══ */}
          <div className="hidden md:flex" style={{ flex: 1, overflow: 'hidden' }}>
            {/* LEFT: P&L + Standings + Positions + Feed + History + Arsenal + Camera */}
            <div style={{ width: 310, flexShrink: 0, borderRight: '1px solid #1A1A1A', display: 'flex', flexDirection: 'column', background: '#0A0A0A', overflow: 'hidden' }}>
              {/* Top fixed: Effects */}
              <div style={{ flexShrink: 0 }}>
                {effectsBar}
              </div>
              {/* Scrollable: Standings → Positions → Feed → History → Arsenal + Defense */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
                {leaderboardPanel}
                {quickPositions}
                {roundHistoryPanel}
                {arsenalPanel}
                {defensePanel}
              </div>
              {/* Bottom: Live Feed */}
              <div style={{ flexShrink: 0, borderTop: '1px solid #1A1A1A', maxHeight: 160, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid #111' }}>
                  <span style={{ width: 5, height: 5, background: '#F5A0D0', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                  <span style={{ ...B, fontSize: 11, color: '#F5A0D0' }}>LIVE FEED</span>
                </div>
                {feedItems.length === 0 ? (
                  <div style={{ padding: '12px 10px', ...S, fontSize: 11, color: '#333', fontStyle: 'italic' }}>Waiting for action...</div>
                ) : feedItems.slice(0, 8).map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderBottom: '1px solid #0D0D0D' }}>
                    <span style={{ fontSize: 12 }}>{f.icon}</span>
                    <span style={{ ...S, fontSize: 11, color: f.color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.text}</span>
                    <span style={{ ...M, fontSize: 9, color: '#555', flexShrink: 0 }}>{Math.floor((Date.now() - f.time) / 1000)}s</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CENTER: Ticker + Chart + Order Book + Full Position Strip */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0A0A0A', overflow: 'hidden' }}>
              {/* Desktop ticker bar + dropdown */}
              <div ref={assetDropdownRef} className="hidden md:flex" style={{ position: 'relative', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', minHeight: 48, borderBottom: '1px solid #1A1A1A', background: '#0D0D0D', padding: '0 4px' }}>
                  <button
                    onClick={() => { setShowMoreAssets(!showMoreAssets); setAssetSearch(''); setAssetTab('all'); setTimeout(() => assetSearchRef.current?.focus(), 50); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', minHeight: 48, ...B, fontSize: 20, color: '#FFF', background: showMoreAssets ? 'rgba(245,160,208,0.06)' : 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <span style={{ width: 10, height: 10, background: '#F5A0D0', display: 'block', boxShadow: '0 0 8px rgba(245,160,208,0.5)', flexShrink: 0, borderRadius: 2 }} />
                    <span style={{ ...B, fontSize: 20, color: '#FFF' }}>{selectedSymbol}</span>
                    <span style={{ ...M, fontSize: 16, color: '#F5A0D0' }}>${selectedPrice > 100 ? selectedPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : fmtP(selectedPrice)}</span>
                    <span style={{ ...S, fontSize: 13, color: '#555', transition: 'transform 150ms', transform: showMoreAssets ? 'rotate(180deg)' : 'none' }}>▼</span>
                  </button>
                  <div style={{ flex: 1, display: 'flex', gap: 2, overflowX: 'auto', paddingRight: 8, minWidth: 0, scrollbarWidth: 'none' }}>
                    {CORE_ASSETS.filter(s => s !== selectedSymbol).map(sym => {
                      const p = prices[`${sym}USDT`] ?? prices[`${sym}USD`] ?? prices[sym] ?? 0;
                      const md = marketData[sym];
                      const chg = md?.change24h;
                      return (
                        <button key={sym} onClick={() => setSelectedSymbol(sym)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, minHeight: 42 }}>
                          <span style={{ ...B, fontSize: 14, color: '#888' }}>{sym}</span>
                          {p > 0 && <span style={{ ...M, fontSize: 12, color: '#666' }}>${p > 100 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : fmtP(p)}</span>}
                          {chg !== null && chg !== undefined && <span style={{ ...M, fontSize: 11, color: chg >= 0 ? '#00FF88' : '#FF3333' }}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}%</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Desktop asset dropdown panel */}
                {showMoreAssets && (
                  <>
                    <div onClick={() => setShowMoreAssets(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
                    <div style={{ position: 'absolute', top: '100%', left: 0, width: 480, zIndex: 50, maxHeight: 520, display: 'flex', flexDirection: 'column', background: '#0A0A0A', border: '1px solid #333', borderTop: '2px solid #F5A0D0', boxShadow: '0 12px 48px rgba(0,0,0,0.9)' }}>
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
                        <input
                          ref={assetSearchRef}
                          value={assetSearch}
                          onChange={(e) => setAssetSearch(e.target.value.toUpperCase())}
                          placeholder="SEARCH ASSETS..."
                          style={{ width: '100%', ...M, fontSize: 16, color: '#FFF', background: '#111', border: '1px solid #222', padding: '10px 12px', minHeight: 44, outline: 'none' }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setShowMoreAssets(false);
                            if (e.key === 'Enter') {
                              const match = allSymbols.find(s => s.startsWith(assetSearch));
                              if (match) { setSelectedSymbol(match); setShowMoreAssets(false); }
                            }
                          }}
                        />
                      </div>
                      {!assetSearch && (
                        <div style={{ display: 'flex', borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
                          <button onClick={() => setAssetTab('all')} style={{ flex: 1, padding: '8px 0', ...B, fontSize: 13, color: assetTab === 'all' ? '#0A0A0A' : '#666', background: assetTab === 'all' ? '#F5A0D0' : 'transparent', border: 'none', borderBottom: assetTab === 'all' ? '2px solid #F5A0D0' : '2px solid transparent', cursor: 'pointer' }}>ALL</button>
                          {MARKET_TYPES.map(mt => (
                            <button key={mt.key} onClick={() => setAssetTab(mt.key)} style={{ flex: 1, padding: '8px 0', ...B, fontSize: 13, color: assetTab === mt.key ? '#0A0A0A' : '#666', background: assetTab === mt.key ? '#F5A0D0' : 'transparent', border: 'none', borderBottom: assetTab === mt.key ? '2px solid #F5A0D0' : '2px solid transparent', cursor: 'pointer' }}>{mt.label}</button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', padding: '4px 12px', borderBottom: '1px solid #111', flexShrink: 0 }}>
                        <span style={{ ...S, fontSize: 9, color: '#444', flex: 1 }}>ASSET</span>
                        <span style={{ ...S, fontSize: 9, color: '#444', width: 80, textAlign: 'right' }}>PRICE</span>
                        <span style={{ ...S, fontSize: 9, color: '#444', width: 52, textAlign: 'right' }}>24H</span>
                        <span style={{ ...S, fontSize: 9, color: '#444', width: 52, textAlign: 'right' }}>VOL</span>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        {(() => {
                          let items: string[];
                          if (assetSearch) {
                            items = allSymbols.filter(s => s.includes(assetSearch) || (PYTH_FEEDS[`${s}USD`]?.label ?? '').toUpperCase().includes(assetSearch));
                          } else if (assetTab === 'all') {
                            items = allSymbols;
                          } else {
                            items = _fbm[assetTab as keyof typeof _fbm]?.map(f => f.symbol).filter(isSymbolAllowed) ?? [];
                          }
                          if (items.length === 0) return <div style={{ padding: 24, textAlign: 'center', ...M, fontSize: 12, color: '#444' }}>NO ASSETS FOUND</div>;
                          return items.map(sym => {
                            const p = prices[`${sym}USDT`] ?? prices[`${sym}USD`] ?? 0;
                            const feed = PYTH_FEEDS[`${sym}USD`];
                            const md = marketData[sym];
                            const chg = md?.change24h;
                            const vol = md?.volume24h;
                            const isSel = sym === selectedSymbol;
                            const chgColor = chg === null || chg === undefined ? '#444' : chg >= 0 ? '#00FF88' : '#FF3333';
                            const fmtVol = (v: number) => v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toFixed(0);
                            return (
                              <button key={sym} onClick={() => { setSelectedSymbol(sym); setShowMoreAssets(false); setAssetSearch(''); }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '7px 12px', background: isSel ? 'rgba(245,160,208,0.08)' : 'transparent', border: 'none', borderBottom: '1px solid #111', borderLeft: isSel ? '3px solid #F5A0D0' : '3px solid transparent', cursor: 'pointer', transition: 'background 100ms' }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  <span style={{ width: 6, height: 6, background: isSel ? '#F5A0D0' : feed?.market === 'rwa' ? '#FFD700' : '#555', flexShrink: 0 }} />
                                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <span style={{ ...B, fontSize: 14, color: isSel ? '#F5A0D0' : '#FFF', lineHeight: 1 }}>{sym}</span>
                                    {feed && <span style={{ ...S, fontSize: 9, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{feed.label}</span>}
                                  </div>
                                </div>
                                <span style={{ ...M, fontSize: 11, color: isSel ? '#F5A0D0' : '#888', width: 80, textAlign: 'right', flexShrink: 0 }}>
                                  {p > 0 ? `$${p > 100 ? p.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p < 0.01 ? p.toFixed(6) : p.toFixed(2)}` : '—'}
                                </span>
                                <span style={{ ...M, fontSize: 10, fontWeight: 700, color: chgColor, width: 52, textAlign: 'right', flexShrink: 0 }}>
                                  {chg !== null && chg !== undefined ? `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%` : '—'}
                                </span>
                                <span style={{ ...M, fontSize: 9, color: '#555', width: 52, textAlign: 'right', flexShrink: 0 }}>
                                  {vol ? `$${fmtVol(vol)}` : '—'}
                                </span>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ flex: 1 }}>{priceHero}</div>
                <button onClick={() => setShowOrderBook(!showOrderBook)} style={{ ...B, fontSize: 9, color: showOrderBook ? '#F5A0D0' : '#555', background: showOrderBook ? 'rgba(245,160,208,0.08)' : 'transparent', border: '1px solid #1A1A1A', padding: '4px 10px', marginRight: 8, cursor: 'pointer', minHeight: 28, transition: 'all 100ms' }}>
                  {showOrderBook ? 'HIDE BOOK' : 'BOOK'}
                </button>
              </div>
              <div style={{ flex: 1, display: 'flex', minHeight: 300, overflow: 'hidden' }}>
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  <TradingViewChart symbol={selectedSymbol} />
                </div>
                {/* Order Book Panel */}
                {showOrderBook && (
                  <div style={{ width: 200, flexShrink: 0, borderLeft: '1px solid #1A1A1A', display: 'flex', flexDirection: 'column', background: '#0A0A0A', overflow: 'hidden' }}>
                    <div style={{ padding: '6px 10px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ ...B, fontSize: 10, color: '#777' }}>ORDER BOOK</span>
                      <span style={{ ...M, fontSize: 8, color: '#555' }}>HYPERLIQUID</span>
                    </div>
                    {/* Column headers */}
                    <div style={{ display: 'flex', padding: '3px 10px', borderBottom: '1px solid #111' }}>
                      <span style={{ ...S, fontSize: 8, color: '#444', flex: 1 }}>PRICE</span>
                      <span style={{ ...S, fontSize: 8, color: '#444', width: 50, textAlign: 'right' }}>SIZE</span>
                      <span style={{ ...S, fontSize: 8, color: '#444', width: 50, textAlign: 'right' }}>TOTAL</span>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      {/* Asks (reversed — lowest at bottom) */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden' }}>
                        {orderBook ? (
                          [...orderBook.asks].reverse().slice(0, 8).map((a, i) => {
                            const maxTotal = orderBook.asks[orderBook.asks.length - 1]?.total ?? 1;
                            const depthPct = ((a.total ?? a.size) / maxTotal) * 100;
                            return (
                              <div key={`a-${i}`} style={{ display: 'flex', padding: '1px 10px', position: 'relative', minHeight: 18 }}>
                                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${depthPct}%`, background: 'rgba(255,51,51,0.08)' }} />
                                <span style={{ ...M, fontSize: 10, color: '#FF3333', flex: 1, position: 'relative' }}>{fmtP(a.price)}</span>
                                <span style={{ ...M, fontSize: 9, color: '#FF333388', width: 50, textAlign: 'right', position: 'relative' }}>{a.size < 1 ? a.size.toFixed(3) : a.size.toFixed(1)}</span>
                                <span style={{ ...M, fontSize: 9, color: '#FF333355', width: 50, textAlign: 'right', position: 'relative' }}>{(a.total ?? a.size) < 1 ? (a.total ?? a.size).toFixed(3) : (a.total ?? a.size).toFixed(1)}</span>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ padding: 12, textAlign: 'center', ...M, fontSize: 10, color: '#333' }}>Loading...</div>
                        )}
                      </div>
                      {/* Spread */}
                      {orderBook && (
                        <div style={{ padding: '4px 10px', borderTop: '1px solid #1A1A1A', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0D0D0D' }}>
                          <span style={{ ...M, fontSize: 12, fontWeight: 700, color: '#FFF' }}>${fmtP(orderBook.midPrice)}</span>
                          <span style={{ ...M, fontSize: 9, color: '#F5A0D0' }}>SPR {orderBook.spreadPct.toFixed(3)}%</span>
                        </div>
                      )}
                      {/* Bids */}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        {orderBook ? (
                          orderBook.bids.slice(0, 8).map((b, i) => {
                            const maxTotal = orderBook.bids[Math.min(7, orderBook.bids.length - 1)]?.total ?? 1;
                            const depthPct = ((b.total ?? b.size) / maxTotal) * 100;
                            return (
                              <div key={`b-${i}`} style={{ display: 'flex', padding: '1px 10px', position: 'relative', minHeight: 18 }}>
                                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${depthPct}%`, background: 'rgba(0,255,136,0.08)' }} />
                                <span style={{ ...M, fontSize: 10, color: '#00FF88', flex: 1, position: 'relative' }}>{fmtP(b.price)}</span>
                                <span style={{ ...M, fontSize: 9, color: '#00FF8888', width: 50, textAlign: 'right', position: 'relative' }}>{b.size < 1 ? b.size.toFixed(3) : b.size.toFixed(1)}</span>
                                <span style={{ ...M, fontSize: 9, color: '#00FF8855', width: 50, textAlign: 'right', position: 'relative' }}>{(b.total ?? b.size) < 1 ? (b.total ?? b.size).toFixed(3) : (b.total ?? b.size).toFixed(1)}</span>
                              </div>
                            );
                          })
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Bottom: Open Positions */}
              {bottomPositionStrip}
            </div>

            {/* RIGHT: Quick Positions + Order Entry + Chat Toggle */}
            <div style={{ width: 310, flexShrink: 0, borderLeft: '1px solid #1A1A1A', display: 'flex', flexDirection: 'column', background: '#0A0A0A', overflow: 'hidden' }}>
              {/* Positions strip (compact, fixed) */}
              <div style={{ flexShrink: 0, maxHeight: 120, overflowY: 'auto' }}>
                {quickPositions}
              </div>
              {/* Order entry (scrollable) */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
                {orderPanel}
              </div>
              {/* Chat toggle button — fixed at bottom of right column */}
              <button
                onClick={() => setShowChat(!showChat)}
                style={{
                  ...B, fontSize: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 16px', background: showChat ? 'rgba(245,160,208,0.1)' : '#111',
                  color: showChat ? '#F5A0D0' : '#666', border: 'none', borderTop: '1px solid #1A1A1A',
                  cursor: 'pointer', transition: 'all 200ms',
                }}
              >
                <span style={{ fontSize: 14 }}>💬</span>
                <span>{showChat ? 'HIDE CHAT' : 'OPEN CHAT'}</span>
              </button>
            </div>

            {/* CHAT SLIDE-OUT — slides in from right */}
            <div style={{
              width: showChat ? 320 : 0, flexShrink: 0, overflow: 'hidden',
              borderLeft: showChat ? '1px solid #1A1A1A' : 'none',
              transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex', flexDirection: 'column', background: '#0A0A0A',
            }}>
              {showChat && (
                <>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ ...B, fontSize: 14, color: '#FFF' }}>LOBBY CHAT</span>
                    <button onClick={() => setShowChat(false)} style={{ ...B, fontSize: 10, color: '#555', background: 'none', border: '1px solid #333', padding: '2px 8px', cursor: 'pointer' }}>✕</button>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    {trader ? (
                      <LobbyChat lobbyId={lobbyId} userId={trader.id} userName={trader.name} userRole="competitor" bottomPanel onCommand={handleChatCommand} />
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center' }}>
                        <span style={{ ...S, fontSize: 12, color: '#333' }}>Join to chat</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ═══ MOBILE (< 768px) ═══ */}
          <div className="flex md:hidden" style={{ flex: 1, flexDirection: 'column', overflow: 'hidden' }}>

            {/* Mobile P&L strip + positions — compact always-visible header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', borderBottom: '1px solid #1A1A1A', background: '#0D0D0D', flexShrink: 0, gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ ...B, fontSize: 18, color: rankColor, lineHeight: 1 }}>#{myRank || '—'}</span>
                <span style={{ ...M, fontSize: 16, fontWeight: 700, color: rp >= 0 ? '#00FF88' : '#FF3333' }}>{rp >= 0 ? '+' : ''}{rp.toFixed(1)}%</span>
                <span style={{ ...M, fontSize: 11, color: '#666' }}>${Math.round(pv).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {/* Inline position pills */}
                {openPos.slice(0, 3).map(pos => {
                  const cp = prices[pos.symbol] ?? prices[pos.symbol.replace('USDT', 'USD')] ?? 0;
                  const pnl = cp > 0 && pos.entry_price > 0
                    ? pos.direction === 'long'
                      ? ((cp - pos.entry_price) / pos.entry_price) * pos.size * pos.leverage
                      : ((pos.entry_price - cp) / pos.entry_price) * pos.size * pos.leverage
                    : 0;
                  const dc = pos.direction === 'long' ? '#00FF88' : '#FF3333';
                  const sym = pos.symbol.replace('USDT', '').replace('USD', '');
                  return (
                    <div key={pos.id} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 6px', background: `${dc}0A`, border: `1px solid ${dc}30`, borderRadius: 4, flexShrink: 0 }}>
                      <span style={{ ...B, fontSize: 9, color: dc }}>{pos.direction === 'long' ? 'L' : 'S'}</span>
                      <span style={{ ...M, fontSize: 9, color: '#AAA' }}>{sym}</span>
                      <span style={{ ...M, fontSize: 9, fontWeight: 700, color: pnl >= 0 ? '#00FF88' : '#FF3333' }}>{pnl >= 0 ? '+' : ''}{(pos.size > 0 ? (pnl / pos.size) * 100 : 0).toFixed(0)}%</span>
                    </div>
                  );
                })}
                <button onClick={() => setShowPurchaseModal(true)} style={{ ...M, fontSize: 9, color: '#F5A0D0', padding: '2px 5px', background: 'rgba(245,160,208,0.08)', border: '1px solid rgba(245,160,208,0.2)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}>{credits.balance}CR</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, background: '#0A0A0A', WebkitOverflowScrolling: 'touch' }}>
              {mobileTab === 'chart' && (
                <>
                  <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: '1px solid #111', flexShrink: 0 }}>
                    <span style={{ ...M, fontSize: 28, fontWeight: 700, color: '#FFF', lineHeight: 1, letterSpacing: '-0.02em' }}>${fmtP(selectedPrice)}</span>
                    <span style={{ ...B, fontSize: 14, color: '#555' }}>{selectedSymbol}/USD</span>
                    {selectedPrice > 0 && <span style={{ ...M, fontSize: 11, color: '#F5A0D0', marginLeft: 'auto', animation: 'breathe 2s ease-in-out infinite' }}>LIVE</span>}
                  </div>
                  <div style={{ height: 'calc(100vh - 300px)', minHeight: 250, maxHeight: 480, position: 'relative' }}>
                    <TradingViewChart symbol={selectedSymbol} />
                  </div>
                  {rightPositions}
                </>
              )}
              {mobileTab === 'trade' && (
                <>
                  {/* Direction — the most important choice, right at top */}
                  <div style={{ display: 'flex', minHeight: 48, flexShrink: 0 }}>
                    {(['long', 'spot', 'short'] as const).map(dir => {
                      const c = dir === 'long' ? '#00FF88' : dir === 'short' ? '#FF3333' : '#00BFFF';
                      const sel = selectedDirection === dir;
                      return (
                        <button key={dir} onClick={() => setSelectedDirection(dir)} style={{ flex: 1, minHeight: 48, ...B, fontSize: 18, background: sel ? c : '#0D0D0D', color: sel ? (dir === 'short' ? '#FFF' : '#0A0A0A') : c, border: 'none', borderBottom: sel ? `3px solid ${c}` : '3px solid #1A1A1A', borderRight: dir !== 'short' ? '1px solid #1A1A1A' : 'none', cursor: 'pointer' }}>{dir.toUpperCase()}</button>
                      );
                    })}
                  </div>
                  {/* Size + Leverage in one compact section */}
                  <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid #1A1A1A' }}>
                    {/* Size as % of balance — single row of pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ ...B, fontSize: 10, color: '#555', width: 32, flexShrink: 0 }}>SIZE</span>
                      <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                        {[
                          { label: '$500', val: 500 }, { label: '$1K', val: 1000 },
                          { label: '$2K', val: 2000 }, { label: '25%', val: Math.floor(pv * 0.25) },
                          { label: '50%', val: Math.floor(pv * 0.5) }, { label: 'MAX', val: Math.floor(pv) },
                        ].map(s => (
                          <button key={s.label} onClick={() => setSelectedSize(s.val)} style={{
                            flex: 1, minHeight: 32, ...B, fontSize: 11, borderRadius: 6,
                            background: selectedSize === s.val ? '#1A1A1A' : 'transparent',
                            color: selectedSize === s.val ? '#FFF' : s.label === 'MAX' ? '#FF3333' : '#555',
                            border: selectedSize === s.val ? '1px solid #F5A0D0' : '1px solid #1A1A1A',
                            cursor: 'pointer',
                          }}>{s.label}</button>
                        ))}
                      </div>
                    </div>
                    {/* Leverage — inline row, hidden for spot */}
                    {selectedDirection !== 'spot' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ ...B, fontSize: 10, color: '#555', width: 32, flexShrink: 0 }}>LEV</span>
                        <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                          {leverageTiers.map(v => (
                            <button key={v} onClick={() => setLeverage(v)} style={{
                              flex: 1, minHeight: 32, ...B, fontSize: 12, borderRadius: 6,
                              background: leverage === v ? '#F5A0D0' : 'transparent',
                              color: leverage === v ? '#0A0A0A' : '#555',
                              border: leverage === v ? 'none' : '1px solid #1A1A1A',
                              cursor: 'pointer',
                            }}>{v}x</button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ ...B, fontSize: 10, color: '#555', width: 32 }}>LEV</span>
                        <span style={{ ...B, fontSize: 10, color: '#00BFFF' }}>1x SPOT</span>
                      </div>
                    )}
                  </div>
                  {/* Execute — the big action */}
                  <div style={{ padding: '8px 10px' }}>
                    {(() => {
                      const dc = selectedDirection === 'spot' ? '#00BFFF' : selectedDirection === 'long' ? '#00FF88' : '#FF3333';
                      return (
                        <button onClick={() => { if (canTrade && selectedDirection) openPosition(selectedDirection, selectedSize); }} disabled={!canExec || actionLoading === 'trade'}
                          style={{
                            width: '100%', minHeight: 50, ...B, fontSize: 17, borderRadius: 10,
                            background: isLockedOut ? '#0D0D0D' : !selectedDirection ? '#111' : !canExec ? '#1A1A1A' : dc,
                            color: isLockedOut ? '#FF3333' : !selectedDirection ? '#555' : !canExec ? '#333' : selectedDirection === 'short' ? '#FFF' : '#0A0A0A',
                            border: isLockedOut ? '2px solid #FF3333' : !selectedDirection ? '2px solid #222' : canExec ? `2px solid ${dc}` : '2px solid #1A1A1A',
                            cursor: canExec ? 'pointer' : 'not-allowed',
                            boxShadow: canExec && selectedDirection ? `0 0 16px ${dc}40` : 'none',
                          }}>
                          {execLabel}
                        </button>
                      );
                    })()}
                    {/* Order summary — tiny details */}
                    {selectedDirection && selectedPrice > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ ...M, fontSize: 8, color: '#555' }}>${selectedSize.toLocaleString()} · {effectiveLev}x · ${(selectedSize * effectiveLev).toLocaleString()} notional</span>
                        {liqP > 0 && <span style={{ ...M, fontSize: 8, color: '#FF3333' }}>LIQ ${fmtP(liqP)}</span>}
                      </div>
                    )}
                  </div>
                  {/* Open positions — always show if any */}
                  {openPos.length > 0 && (
                    <div style={{ borderTop: '1px solid #1A1A1A', padding: '6px 10px' }}>
                      <span style={{ ...B, fontSize: 9, color: '#666', marginBottom: 4, display: 'block' }}>OPEN ({openPos.length}/3)</span>
                      {openPos.map(pos => {
                        const cp = prices[pos.symbol] ?? prices[pos.symbol.replace('USDT', 'USD')] ?? 0;
                        const pnl = cp > 0 && pos.entry_price > 0
                          ? (pos.direction === 'long' ? 1 : -1) * ((cp - pos.entry_price) / pos.entry_price) * pos.size * pos.leverage
                          : 0;
                        const pnlPct = pos.size > 0 ? (pnl / pos.size) * 100 : 0;
                        const dc = pos.direction === 'long' ? '#00FF88' : '#FF3333';
                        return (
                          <div key={pos.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', marginBottom: 3, background: `${dc}06`, border: `1px solid ${dc}20`, borderRadius: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ ...B, fontSize: 10, color: dc }}>{pos.direction === 'long' ? 'L' : 'S'}</span>
                              <span style={{ ...B, fontSize: 11, color: '#FFF' }}>{pos.symbol.replace('USDT', '')}</span>
                              <span style={{ ...M, fontSize: 9, color: '#555' }}>${pos.size.toLocaleString()} · {pos.leverage}x</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ ...M, fontSize: 11, fontWeight: 700, color: pnl >= 0 ? '#00FF88' : '#FF3333' }}>{pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</span>
                              <button onClick={() => closePosition(pos.id)} style={{ ...B, fontSize: 9, color: '#FF3333', background: 'rgba(255,51,51,0.1)', border: '1px solid #FF333350', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', minHeight: 26 }}>CLOSE</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Strategy presets — only when no positions, as a scrollable row */}
                  {canTrade && openPos.length === 0 && (
                    <div style={{ padding: '6px 10px', borderTop: '1px solid #1A1A1A' }}>
                      <span style={{ ...B, fontSize: 9, color: '#444', marginBottom: 4, display: 'block' }}>OR ONE-TAP</span>
                      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                        {STRATEGY_PRESETS.map(s => (
                          <button key={s.id} onClick={() => executeStrategy(s.id)} disabled={actionLoading === 'strategy'}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', minHeight: 36, background: '#0A0A0A', border: `1px solid ${s.color}30`, borderRadius: 20, cursor: actionLoading === 'strategy' ? 'wait' : 'pointer', flexShrink: 0 }}>
                            <span style={{ fontSize: 14 }}>{s.icon}</span>
                            <span style={{ ...B, fontSize: 11, color: s.color }}>{actionLoading === 'strategy' ? '...' : s.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Pending orders — compact */}
                  {pendingPos.length > 0 && (
                    <div style={{ padding: '6px 10px', borderTop: '1px solid #1A1A1A' }}>
                      <span style={{ ...B, fontSize: 9, color: '#F5A0D0', marginBottom: 3, display: 'block' }}>PENDING</span>
                      {pendingPos.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', marginBottom: 2, background: '#0D0D0D', border: '1px solid #1A1A1A', borderLeft: '3px solid #F5A0D0', borderRadius: 4 }}>
                          <span style={{ ...B, fontSize: 10, color: p.direction === 'long' ? '#00FF88' : '#FF3333' }}>{p.direction === 'long' ? 'L' : 'S'} {p.symbol.replace('USDT', '')}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ ...M, fontSize: 9, color: '#F5A0D0' }}>{p.limit_price ? `@${fmtP(p.limit_price)}` : p.trail_pct ? `${p.trail_pct}%` : ''}</span>
                            <button onClick={() => closePosition(p.id)} style={{ ...B, fontSize: 8, color: '#FF3333', background: 'none', border: '1px solid #FF3333', padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {mobileTab === 'battle' && (
                <>
                  {effectsBar}
                  {arsenalPanel}
                  {defensePanel}
                  {roundHistoryPanel}
                </>
              )}
              {mobileTab === 'rank' && (
                <>
                  {/* Compact PnL summary for mobile rank tab */}
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #1A1A1A', background: `linear-gradient(180deg, ${pnlColor}06, transparent)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ ...B, fontSize: 32, color: rankColor, lineHeight: 1, textShadow: `0 0 12px ${rankColor}50` }}>#{myRank || '—'}</span>
                        <div>
                          <span style={{ ...B, fontSize: 24, color: pnlColor, lineHeight: 1, display: 'block' }}>{rp >= 0 ? '+' : ''}{rp.toFixed(1)}%</span>
                          <span style={{ ...M, fontSize: 10, color: '#666', display: 'block' }}>${pv.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {openPos.length} open</span>
                        </div>
                      </div>
                      <span style={{ ...M, fontSize: 10, color: '#555' }}>{myRank}/{totalTraders}</span>
                    </div>
                  </div>
                  {leaderboardPanel}
                </>
              )}
            </div>

            {/* Mobile nav — bottom tab bar */}
            <div style={{ display: 'flex', borderTop: '2px solid #1A1A1A', background: '#0D0D0D', flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              {([
                { key: 'chart' as const, label: 'CHART', icon: '📈' },
                { key: 'trade' as const, label: 'TRADE', icon: '⚡' },
                { key: 'battle' as const, label: 'EVENTS', icon: '🎯' },
                { key: 'rank' as const, label: 'RANK', icon: '🏆' },
              ]).map(t => {
                const isActive = mobileTab === t.key;
                const hasAlert = t.key === 'battle' && activeEffects.length > 0;
                const hasPositions = t.key === 'trade' && openPos.length > 0;
                return (
                  <button key={t.key} onClick={() => setMobileTab(t.key)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 50, background: isActive ? 'rgba(245,160,208,0.06)' : 'transparent', border: 'none', borderTop: isActive ? '2px solid #F5A0D0' : '2px solid transparent', cursor: 'pointer', position: 'relative', WebkitTapHighlightColor: 'transparent' }}>
                    <span style={{ fontSize: 18 }}>{t.icon}</span>
                    <span style={{ ...B, fontSize: 9, color: isActive ? '#F5A0D0' : '#555' }}>{t.label}</span>
                    {hasAlert && <span style={{ position: 'absolute', top: 4, right: '20%', width: 7, height: 7, background: '#FF3333', borderRadius: '50%', animation: 'pulse 1s infinite' }} />}
                    {hasPositions && !hasAlert && <span style={{ position: 'absolute', top: 4, right: '20%', width: 7, height: 7, background: '#F5A0D0', borderRadius: '50%', animation: 'pulse 2s infinite' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PURCHASE MODAL ═══ */}
      {showPurchaseModal && (
        <div onClick={() => setShowPurchaseModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#0A0A0A', border: '2px solid #F5A0D0', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ ...B, fontSize: 22, color: '#F5A0D0' }}>BUY CREDITS</span>
              <button onClick={() => setShowPurchaseModal(false)} style={{ ...M, fontSize: 18, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>X</button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {CREDIT_PACKAGES.map(pkg => {
                const tc = totalCredits(pkg);
                return (
                  <div key={pkg.id} style={{ border: pkg.popular ? '2px solid #F5A0D0' : '1px solid #222', background: pkg.popular ? 'rgba(245,160,208,0.04)' : '#111', padding: 14 }}>
                    {pkg.popular && <div style={{ ...B, fontSize: 10, color: '#F5A0D0', marginBottom: 6, letterSpacing: '0.1em' }}>MOST POPULAR</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <span style={{ ...B, fontSize: 20, color: '#FFF' }}>{pkg.label}</span>
                        {pkg.bonus_pct > 0 && <span style={{ ...M, fontSize: 11, color: '#00FF88', marginLeft: 8 }}>+{pkg.bonus_pct}% BONUS</span>}
                      </div>
                      <span style={{ ...M, fontSize: 16, color: '#F5A0D0' }}>${(pkg.price_usd / 100).toFixed(2)}</span>
                    </div>
                    <div style={{ ...M, fontSize: 10, color: '#555', marginBottom: 10 }}>{tc.toLocaleString()} credits total</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handlePurchase(pkg, 'stripe')}
                        disabled={purchaseLoading !== null}
                        style={{ flex: 1, ...B, fontSize: 13, color: '#FFF', background: '#1A1A1A', border: '1px solid #333', padding: '10px 0', minHeight: 44, cursor: purchaseLoading ? 'wait' : 'pointer', letterSpacing: '0.05em' }}
                      >
                        {purchaseLoading === `${pkg.id}-stripe` ? '...' : 'CARD / APPLE PAY'}
                      </button>
                      <button
                        onClick={() => handlePurchase(pkg, 'coinbase_commerce')}
                        disabled={purchaseLoading !== null}
                        style={{ flex: 1, ...B, fontSize: 13, color: '#FFF', background: '#1A1A1A', border: '1px solid #333', padding: '10px 0', minHeight: 44, cursor: purchaseLoading ? 'wait' : 'pointer', letterSpacing: '0.05em' }}
                      >
                        {purchaseLoading === `${pkg.id}-coinbase_commerce` ? '...' : 'CRYPTO'}
                      </button>
                    </div>
                  </div>
                );
              })}
              <div style={{ ...S, fontSize: 10, color: '#444', textAlign: 'center', padding: '4px 0' }}>
                Crypto: BTC, ETH, SOL, USDC, DOGE, LTC, MATIC, SHIB & more
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tutorial */}
      <TutorialOverlay key={showTutorial} role="player" lobbyId={lobbyId} />

      {/* Chat — now in bottom center panel on desktop */}
    </>
  );
}

// ===========================================================================
// TradingViewChart — Embedded TradingView Advanced Chart (free)
// ===========================================================================
// Auto-generate TradingView symbol map from Pyth feeds + manual overrides
const TV_OVERRIDES: Record<string, string> = {
  // Equities need explicit exchange prefix
  AAPL: 'NASDAQ:AAPL', TSLA: 'NASDAQ:TSLA', NVDA: 'NASDAQ:NVDA',
  MSFT: 'NASDAQ:MSFT', GOOG: 'NASDAQ:GOOGL', AMZN: 'NASDAQ:AMZN',
  META: 'NASDAQ:META', AMD: 'NASDAQ:AMD', COIN: 'NASDAQ:COIN',
  MSTR: 'NASDAQ:MSTR', GME: 'NYSE:GME', AMC: 'NYSE:AMC',
  INTC: 'NASDAQ:INTC', NFLX: 'NASDAQ:NFLX', PLTR: 'NASDAQ:PLTR', TSM: 'NYSE:TSM',
  SPY: 'AMEX:SPY', QQQ: 'NASDAQ:QQQ', GLD: 'AMEX:GLD', ARKK: 'AMEX:ARKK',
  // Commodities
  XAU: 'TVC:GOLD', XAG: 'TVC:SILVER',
};
const TV_SYMBOL_MAP: Record<string, string> = Object.fromEntries(
  Object.keys(PYTH_FEEDS).map(sym => {
    const short = sym.replace('USD', '');
    return [short, TV_OVERRIDES[short] ?? `BINANCE:${short}USDT`];
  })
);

function TradingViewChart({ symbol }: { symbol: string }) {
  const tvSymbol = encodeURIComponent(TV_SYMBOL_MAP[symbol] || `BINANCE:${symbol}USDT`);
  const src = `https://s.tradingview.com/widgetembed/?symbol=${tvSymbol}&interval=15&hidesidetoolbar=0&symboledit=0&saveimage=0&toolbarbg=0A0A0A&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=localhost&utm_medium=widget_new&utm_campaign=chart`;

  return (
    <iframe
      key={symbol}
      src={src}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#0A0A0A' }}
      allow="autoplay; fullscreen"
    />
  );
}
