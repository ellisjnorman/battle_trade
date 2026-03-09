'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { calcUnrealizedPnl, calcPortfolioValue, calcReturnPct } from '@/lib/pnl';
import { PYTH_FEEDS } from '@/lib/pyth-feeds';
import type { Position } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TraderData {
  id: string;
  name: string;
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

interface LobbyData {
  name: string;
  config: {
    starting_balance: number;
    available_symbols: string[];
    leverage_tiers: number[];
  };
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

interface SabotageAlert {
  id: string;
  type: string;
  message: string;
  timestamp: number;
}

interface FeedItem {
  id: string;
  text: string;
  color: string;
  timestamp: number;
}

type TradeDirection = 'long' | 'short';

// ---------------------------------------------------------------------------
// Fonts (inline styles for design system)
// ---------------------------------------------------------------------------

const bebas: React.CSSProperties = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' };
const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' };
const sans: React.CSSProperties = { fontFamily: "'DM Sans', sans-serif" };

// ---------------------------------------------------------------------------
// Asset Selector
// ---------------------------------------------------------------------------

const ASSET_CATEGORIES = [
  { key: 'crypto', label: 'CRYPTO' },
  { key: 'equity', label: 'STOCKS' },
  { key: 'commodity', label: 'RWA' },
] as const;

// Build grouped options from feed catalog (USDT suffixed for position compat)
const ASSET_OPTIONS = Object.entries(PYTH_FEEDS).map(([sym, feed]) => ({
  symbol: sym.replace('USD', 'USDT'), // e.g. BTCUSDT
  ticker: sym.replace('USD', ''),      // e.g. BTC
  label: feed.label,
  category: feed.category,
}));

function AssetSelector({ prices, selectedSymbol, onSelect }: {
  prices: Record<string, number>;
  selectedSymbol: string;
  onSelect: (sym: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = ASSET_OPTIONS.find(a => a.symbol === selectedSymbol);
  const price = prices[selectedSymbol];

  const filtered = ASSET_OPTIONS.filter(a => {
    if (catFilter && a.category !== catFilter) return false;
    if (filter) {
      const q = filter.toUpperCase();
      return a.ticker.includes(q) || a.label.toUpperCase().includes(q);
    }
    return true;
  });

  return (
    <div ref={dropdownRef} className="relative">
      {/* Selected asset button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border-2 px-[16px] py-[12px]"
        style={{
          borderColor: open ? '#F5A0D0' : '#333',
          backgroundColor: '#0D0D0D',
        }}
      >
        <div className="flex items-center gap-[12px]">
          <span style={bebas} className="text-[24px] text-white">
            {selected?.ticker ?? selectedSymbol.replace('USDT', '')}
          </span>
          <span style={sans} className="text-[12px] text-[#555]">
            {selected?.label ?? ''}
          </span>
        </div>
        <div className="flex items-center gap-[12px]">
          {price !== undefined && (
            <span style={mono} className="text-[20px] text-white">
              ${price.toLocaleString(undefined, { maximumFractionDigits: price > 100 ? 0 : price > 1 ? 2 : 6 })}
            </span>
          )}
          <span style={bebas} className="text-[16px] text-[#555]">
            {open ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full left-0 right-0 z-50 border-2 border-[#F5A0D0] mt-[-2px]"
          style={{ backgroundColor: '#0A0A0A', maxHeight: 400, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          {/* Search */}
          <div className="p-[8px] border-b border-[#1A1A1A]">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="SEARCH ASSETS..."
              autoFocus
              className="w-full bg-[#111] border border-[#333] text-white px-[12px] py-[8px] text-[13px] outline-none focus:border-[#F5A0D0]"
              style={mono}
            />
          </div>

          {/* Category tabs */}
          <div className="flex border-b border-[#1A1A1A]">
            <button
              onClick={() => setCatFilter(null)}
              className="flex-1 py-[8px] text-[12px]"
              style={{
                ...bebas,
                color: catFilter === null ? '#0A0A0A' : '#555',
                backgroundColor: catFilter === null ? '#F5A0D0' : 'transparent',
                border: 'none',
                letterSpacing: '0.08em',
              }}
            >
              ALL
            </button>
            {ASSET_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setCatFilter(cat.key)}
                className="flex-1 py-[8px] text-[12px]"
                style={{
                  ...bebas,
                  color: catFilter === cat.key ? '#0A0A0A' : '#555',
                  backgroundColor: catFilter === cat.key ? '#F5A0D0' : 'transparent',
                  border: 'none',
                  letterSpacing: '0.08em',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Asset list */}
          <div style={{ overflowY: 'auto', maxHeight: 300 }}>
            {filtered.map(asset => {
              const assetPrice = prices[asset.symbol];
              const isActive = asset.symbol === selectedSymbol;
              return (
                <button
                  key={asset.symbol}
                  onClick={() => { onSelect(asset.symbol); setOpen(false); setFilter(''); }}
                  className="w-full flex items-center justify-between px-[16px] py-[10px] border-b border-[#111]"
                  style={{
                    backgroundColor: isActive ? '#111' : 'transparent',
                    borderLeft: isActive ? '3px solid #F5A0D0' : '3px solid transparent',
                  }}
                >
                  <div className="flex items-center gap-[10px]">
                    <span style={bebas} className="text-[16px] text-white w-[60px] text-left">
                      {asset.ticker}
                    </span>
                    <span style={sans} className="text-[11px] text-[#555]">
                      {asset.label}
                    </span>
                    <span
                      className="text-[8px] px-[6px] py-[2px]"
                      style={{
                        ...sans,
                        color: '#444',
                        border: '1px solid #222',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {asset.category}
                    </span>
                  </div>
                  {assetPrice !== undefined && (
                    <span style={mono} className="text-[13px] text-[#888]">
                      ${assetPrice.toLocaleString(undefined, { maximumFractionDigits: assetPrice > 100 ? 0 : assetPrice > 1 ? 2 : 6 })}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-[16px] py-[24px] text-center">
                <span style={sans} className="text-[12px] text-[#333]">No assets found</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Position Card
// ---------------------------------------------------------------------------

function PositionCard({ position, currentPrice, onClose }: {
  position: Position;
  currentPrice: number | undefined;
  onClose: (id: string) => void;
}) {
  const pnl = currentPrice ? calcUnrealizedPnl(position, currentPrice) : 0;
  const isPositive = pnl >= 0;
  const label = position.symbol.replace('USDT', '');
  const dir = position.direction.toUpperCase();

  return (
    <div className="border border-[#1A1A1A] bg-[#0D0D0D] p-[12px] flex flex-col gap-[8px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[8px]">
          <span
            className="text-[10px] px-[8px] py-[4px]"
            style={{
              ...bebas,
              color: position.direction === 'long' ? '#00FF88' : '#FF3333',
              border: `1px solid ${position.direction === 'long' ? '#00FF88' : '#FF3333'}`,
            }}
          >
            {dir}
          </span>
          <span style={bebas} className="text-[18px] text-white">{label}</span>
          <span style={mono} className="text-[12px] text-[#555]">{position.leverage}x</span>
        </div>
        <button
          onClick={() => onClose(position.id)}
          className="text-[10px] text-[#FF3333] border border-[#FF3333] px-[8px] py-[4px]"
          style={bebas}
        >
          CLOSE
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span style={sans} className="text-[9px] text-[#444] uppercase">Entry</span>
          <span style={mono} className="text-[13px] text-[#888]">
            ${position.entry_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex flex-col">
          <span style={sans} className="text-[9px] text-[#444] uppercase">Size</span>
          <span style={mono} className="text-[13px] text-[#888]">
            ${position.size.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span style={sans} className="text-[9px] text-[#444] uppercase">PnL</span>
          <span
            style={mono}
            className="text-[16px]"
          >
            <span style={{ color: isPositive ? '#00FF88' : '#FF3333' }}>
              {isPositive ? '+' : ''}${pnl.toFixed(2)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade Panel
// ---------------------------------------------------------------------------

function TradePanel({ symbol, prices, leverageTiers, onSubmit, disabled }: {
  symbol: string;
  prices: Record<string, number>;
  leverageTiers: number[];
  onSubmit: (direction: TradeDirection, size: number, leverage: number) => void;
  disabled: boolean;
}) {
  const [size, setSize] = useState('1000');
  const [leverage, setLeverage] = useState(leverageTiers[0] ?? 5);
  const label = symbol.replace('USDT', '');
  const price = prices[symbol];

  const handleTrade = (direction: TradeDirection) => {
    const sizeNum = parseFloat(size);
    if (!sizeNum || sizeNum <= 0) return;
    onSubmit(direction, sizeNum, leverage);
  };

  return (
    <div className="border border-[#1A1A1A] bg-[#0D0D0D] p-[16px] flex flex-col gap-[12px]">
      <div className="flex items-center justify-between">
        <span style={bebas} className="text-[18px] text-white">{label}</span>
        {price && (
          <span style={mono} className="text-[20px] text-white">
            ${price.toLocaleString(undefined, { maximumFractionDigits: price > 100 ? 0 : 2 })}
          </span>
        )}
      </div>

      {/* Size input */}
      <div className="flex flex-col gap-[4px]">
        <span style={sans} className="text-[10px] text-[#444] uppercase">Size (USD)</span>
        <input
          type="number"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="bg-[#0A0A0A] border border-[#333] text-white px-[12px] py-[8px] text-[14px] outline-none focus:border-[#F5A0D0]"
          style={mono}
          disabled={disabled}
        />
      </div>

      {/* Quick size buttons */}
      <div className="flex gap-[8px]">
        {[500, 1000, 2000, 5000].map((v) => (
          <button
            key={v}
            onClick={() => setSize(String(v))}
            className="flex-1 border border-[#333] py-[4px] text-[11px] text-[#888] hover:border-[#555]"
            style={mono}
            disabled={disabled}
          >
            ${v.toLocaleString()}
          </button>
        ))}
      </div>

      {/* Leverage */}
      <div className="flex flex-col gap-[4px]">
        <span style={sans} className="text-[10px] text-[#444] uppercase">Leverage</span>
        <div className="flex gap-[8px]">
          {leverageTiers.map((lev) => (
            <button
              key={lev}
              onClick={() => setLeverage(lev)}
              className="flex-1 border py-[8px] text-[14px]"
              style={{
                ...bebas,
                borderColor: leverage === lev ? '#F5A0D0' : '#333',
                color: leverage === lev ? '#F5A0D0' : '#555',
                backgroundColor: leverage === lev ? '#111' : 'transparent',
              }}
              disabled={disabled}
            >
              {lev}X
            </button>
          ))}
        </div>
      </div>

      {/* LONG / SHORT */}
      <div className="flex gap-[8px]">
        <button
          onClick={() => handleTrade('long')}
          className="flex-1 py-[12px] text-[18px] text-[#0A0A0A] bg-[#00FF88] hover:opacity-90"
          style={bebas}
          disabled={disabled}
        >
          LONG
        </button>
        <button
          onClick={() => handleTrade('short')}
          className="flex-1 py-[12px] text-[18px] text-white bg-[#FF3333] hover:opacity-90"
          style={bebas}
          disabled={disabled}
        >
          SHORT
        </button>
      </div>

      {disabled && (
        <span style={sans} className="text-[11px] text-[#FF3333] text-center">
          TRADING DISABLED
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standings Mini
// ---------------------------------------------------------------------------

function StandingsMini({ standings, traderId }: { standings: StandingEntry[]; traderId: string }) {
  return (
    <div className="border border-[#1A1A1A] bg-[#0D0D0D] p-[12px] flex flex-col gap-[4px]">
      <span style={bebas} className="text-[14px] text-[#333]">STANDINGS</span>
      {standings.slice(0, 8).map((s) => {
        const isMe = s.trader.id === traderId;
        const isPositive = s.returnPct >= 0;
        return (
          <div
            key={s.trader.id}
            className="flex items-center justify-between py-[4px]"
            style={{
              borderLeft: isMe ? '2px solid #F5A0D0' : '2px solid transparent',
              paddingLeft: '8px',
            }}
          >
            <div className="flex items-center gap-[8px]">
              <span style={bebas} className="text-[14px] text-[#444] w-[20px]">{s.rank}</span>
              <span
                style={bebas}
                className="text-[14px]"
              >
                <span style={{ color: isMe ? '#F5A0D0' : 'white' }}>
                  {s.teamName ?? s.trader.name}
                </span>
              </span>
            </div>
            <span
              style={mono}
              className="text-[13px]"
            >
              <span style={{ color: isPositive ? '#00FF88' : '#FF3333' }}>
                {isPositive ? '+' : ''}{s.returnPct.toFixed(1)}%
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sabotage Alert Banner
// ---------------------------------------------------------------------------

function SabotageAlertBanner({ alert, onDismiss }: { alert: SabotageAlert; onDismiss: () => void }) {
  return (
    <div
      className="flex items-center justify-between px-[16px] py-[8px] border border-[#FF3333]"
      style={{ backgroundColor: 'rgba(255,51,51,0.08)' }}
    >
      <div className="flex items-center gap-[8px]">
        <span className="w-[8px] h-[8px] bg-[#FF3333] animate-pulse block" />
        <span style={bebas} className="text-[14px] text-[#FF3333]">
          {alert.type.replace(/_/g, ' ').toUpperCase()}
        </span>
        <span style={sans} className="text-[12px] text-[#888]">{alert.message}</span>
      </div>
      <button
        onClick={onDismiss}
        style={bebas}
        className="text-[11px] text-[#555] border border-[#333] px-[8px] py-[4px]"
      >
        DISMISS
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Credits Display
// ---------------------------------------------------------------------------

function CreditsDisplay({ credits }: { credits: CreditData }) {
  return (
    <div className="flex items-center gap-[8px]">
      <span style={sans} className="text-[10px] text-[#444] uppercase">Credits</span>
      <span style={mono} className="text-[14px] text-[#F5A0D0]">{credits.balance}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------

function ActivityFeed({ items }: { items: FeedItem[] }) {
  return (
    <div className="border border-[#1A1A1A] bg-[#0D0D0D] p-[12px] flex flex-col gap-[4px]">
      <span style={bebas} className="text-[14px] text-[#333]">ACTIVITY</span>
      {items.length === 0 && (
        <span style={sans} className="text-[11px] text-[#333]">No activity yet</span>
      )}
      {items.slice(0, 10).map((item) => (
        <div key={item.id} className="flex items-start gap-[8px] py-[4px]">
          <span style={mono} className="text-[10px] text-[#333] flex-shrink-0">
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span style={sans} className="text-[11px]">
            <span style={{ color: item.color }}>{item.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round Timer
// ---------------------------------------------------------------------------

function RoundTimer({ round }: { round: RoundData | null }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!round?.started_at) { setRemaining(0); return; }
    const calc = () => {
      const start = new Date(round.started_at!).getTime();
      const end = start + round.duration_seconds * 1000;
      return Math.max(0, Math.floor((end - Date.now()) / 1000));
    };
    setRemaining(calc());
    const interval = setInterval(() => setRemaining(calc()), 1000);
    return () => clearInterval(interval);
  }, [round]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isUrgent = remaining > 0 && remaining < 120;

  return (
    <div className="flex items-center gap-[8px]">
      <span style={bebas} className="text-[14px] text-[#444]">
        ROUND {round?.round_number ?? '—'}
      </span>
      <span
        style={mono}
        className="text-[24px]"
      >
        <span style={{ color: isUrgent ? '#FF3333' : 'white' }}>
          {mins}:{secs.toString().padStart(2, '0')}
        </span>
      </span>
      {round?.status === 'frozen' && (
        <span style={bebas} className="text-[11px] text-[#FF3333] border border-[#FF3333] px-[8px] py-[4px]">
          FROZEN
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main TradingTerminal
// ---------------------------------------------------------------------------

export default function TradingTerminal() {
  const { id: lobbyId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  // Core state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trader, setTrader] = useState<TraderData | null>(null);
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [round, setRound] = useState<RoundData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [credits, setCredits] = useState<CreditData>({ balance: 0, total_earned: 0, total_spent: 0 });
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');

  // UI state
  const [sabotageAlerts, setSabotageAlerts] = useState<SabotageAlert[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [trading, setTrading] = useState(false);

  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  // ---- Lookup trader by code ----
  const lookupTrader = useCallback(async () => {
    if (!code || !lobbyId) {
      setError('Missing trader code');
      setLoading(false);
      return;
    }

    // Lookup trader by name match (code was used at registration, trader record has the name)
    // We need to find the trader via session or credit_allocation in this lobby
    const { data: traders } = await supabase
      .from('traders')
      .select('id, name, lobby_id, is_eliminated, avatar_url')
      .eq('lobby_id', lobbyId);

    if (!traders || traders.length === 0) {
      setError('No traders found in this lobby');
      setLoading(false);
      return;
    }

    // For now, find trader by matching the code — since code isn't stored on trader,
    // use the first trader (in production, code maps to a session lookup)
    // Try to find via credit_allocations which links trader_id to lobby
    const { data: sessions } = await supabase
      .from('sessions')
      .select('trader_id')
      .eq('lobby_id', lobbyId);

    const traderIds = new Set((sessions ?? []).map(s => s.trader_id));
    const matchedTrader = traders.find(t => traderIds.has(t.id));

    if (!matchedTrader) {
      setError('Trader not found');
      setLoading(false);
      return;
    }

    setTrader(matchedTrader as TraderData);
    return matchedTrader as TraderData;
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
      const config = lobbyRow.config as Record<string, unknown>;
      setLobby({
        name: lobbyRow.name,
        config: {
          starting_balance: (config.starting_balance as number) ?? 10000,
          available_symbols: (config.available_symbols as string[]) ?? Object.keys(PYTH_FEEDS).map(s => s.replace('USD', 'USDT')),
          leverage_tiers: (config.leverage_tiers as number[]) ?? [2, 5, 10],
        },
      });
    }

    // Active round
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id, round_number, status, started_at, duration_seconds, starting_balance')
      .eq('lobby_id', lobbyId)
      .order('round_number', { ascending: false })
      .limit(1);

    const activeRound = rounds?.[0] ?? null;
    if (activeRound) setRound(activeRound as RoundData);

    // Positions
    if (activeRound) {
      const { data: pos } = await supabase
        .from('positions')
        .select('*')
        .eq('trader_id', traderData.id)
        .eq('round_id', activeRound.id);

      if (pos) setPositions(pos as Position[]);
    }

    // Prices
    const { data: priceRows } = await supabase.from('prices').select('symbol, price');
    if (priceRows) {
      const p: Record<string, number> = {};
      for (const row of priceRows) p[row.symbol] = row.price;
      setPrices(p);
      if (!p[selectedSymbol] && Object.keys(p).length > 0) {
        setSelectedSymbol(Object.keys(p)[0]);
      }
    }

    // Standings
    if (activeRound) {
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${activeRound.id}`);
        if (res.ok) {
          const data = await res.json();
          setStandings(data.standings ?? []);
        }
      } catch {
        // Non-critical
      }
    }

    // Credits
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/sabotage/credits?trader_id=${traderData.id}`);
      if (res.ok) {
        const data = await res.json();
        setCredits(data);
      }
    } catch {
      // Non-critical
    }

    setLoading(false);
  }, [lobbyId, selectedSymbol]);

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
          addFeedItem(`Opened ${(payload.new as Position).direction.toUpperCase()} ${(payload.new as Position).symbol.replace('USDT', '')}`, '#00FF88');
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Position;
          if (updated.closed_at) {
            setPositions(prev => prev.filter(p => p.id !== updated.id));
            const pnl = updated.realized_pnl ?? 0;
            addFeedItem(
              `Closed ${updated.symbol.replace('USDT', '')} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
              pnl >= 0 ? '#00FF88' : '#FF3333',
            );
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
        const sabotageType = (msg.sabotage_type as string) ?? (msg.defense_type as string) ?? sabType;

        setSabotageAlerts(prev => [{
          id: `sab-${Date.now()}`,
          type: sabotageType,
          message: getSabotageMessage(sabType, msg),
          timestamp: Date.now(),
        }, ...prev.slice(0, 4)]);

        addFeedItem(
          `${sabotageType.replace(/_/g, ' ').toUpperCase()} — ${getSabotageMessage(sabType, msg)}`,
          sabType.includes('defense') ? '#F5A0D0' : '#FF3333',
        );
      })
      .subscribe();

    // Round updates
    const roundChannel = supabase.channel(`cockpit-${lobbyId}-rounds`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds' }, (payload) => {
        const updated = payload.new as Record<string, unknown>;
        if (updated.lobby_id === lobbyId || !updated.lobby_id) {
          setRound(updated as unknown as RoundData);
          if (updated.status === 'frozen') {
            addFeedItem('ROUND FROZEN', '#FF3333');
          } else if (updated.status === 'completed') {
            addFeedItem('ROUND COMPLETE', '#F5A0D0');
          }
        }
      })
      .subscribe();

    channelsRef.current = [priceChannel, posChannel, sabotageChannel, roundChannel];

    return () => {
      for (const ch of channelsRef.current) {
        supabase.removeChannel(ch);
      }
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
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [round, lobbyId]);

  // ---- Helpers ----
  const addFeedItem = (text: string, color: string) => {
    setFeedItems(prev => [{
      id: `feed-${Date.now()}-${Math.random()}`,
      text,
      color,
      timestamp: Date.now(),
    }, ...prev.slice(0, 19)]);
  };

  function getSabotageMessage(type: string, msg: Record<string, unknown>): string {
    if (type === 'sabotage_received') {
      const sab = msg.sabotage as Record<string, unknown> | undefined;
      return `You've been hit with ${(sab?.type as string)?.replace(/_/g, ' ') ?? 'an attack'}!`;
    }
    if (type === 'defense_result') {
      return msg.result === 'shielded' ? 'Shield blocked the attack!' : 'Attack deflected back!';
    }
    if (type === 'defense_activated') {
      return `${(msg.defense_type as string)?.replace(/_/g, ' ')} activated`;
    }
    if (type === 'fake_news') {
      return (msg.headline as string) ?? 'Fake headline injected!';
    }
    return 'Sabotage event';
  }

  // ---- Trade actions ----
  const openPosition = async (direction: TradeDirection, size: number, leverage: number) => {
    if (!trader || !round || trading) return;
    setTrading(true);
    setTradeError(null);

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trader_id: trader.id,
          round_id: round.id,
          symbol: selectedSymbol,
          direction,
          size,
          leverage,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === 'LOCKED_OUT') {
          setTradeError(`Locked out! ${data.remaining}s remaining`);
        } else if (data.error === 'ASSET_FROZEN') {
          setTradeError('Asset is frozen by sabotage');
        } else {
          setTradeError(data.error ?? 'Trade failed');
        }
      }
    } catch {
      setTradeError('Network error');
    } finally {
      setTrading(false);
    }
  };

  const closePosition = async (positionId: string) => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/positions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_id: positionId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setTradeError(data.error ?? 'Close failed');
      }
    } catch {
      setTradeError('Network error');
    }
  };

  // ---- Portfolio calc ----
  const startingBalance = round?.starting_balance ?? lobby?.config.starting_balance ?? 10000;
  const openPositions = positions.filter(p => !p.closed_at);
  const closedPositions = positions.filter(p => p.closed_at);
  const portfolioValue = calcPortfolioValue(startingBalance, openPositions, closedPositions, prices);
  const returnPct = calcReturnPct(portfolioValue, startingBalance);
  const isPositive = returnPct >= 0;

  const canTrade = round?.status === 'active' && !trader?.is_eliminated;

  // ---- Loading ----
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-[16px]">
          <div className="w-[8px] h-[8px] bg-[#F5A0D0] animate-pulse" />
          <span style={bebas} className="text-[24px] text-[#555]">LOADING TERMINAL...</span>
        </div>
      </div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-[16px]">
          <span style={bebas} className="text-[32px] text-[#FF3333]">ERROR</span>
          <span style={sans} className="text-[14px] text-[#555]">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Top bar */}
      <div className="border-b border-[#1A1A1A] px-[16px] py-[8px] flex items-center justify-between">
        <div className="flex items-center gap-[16px]">
          <span style={bebas} className="text-[20px] text-[#F5A0D0]">
            {lobby?.name ?? 'BATTLE TRADE'}
          </span>
          <div className="w-[1px] h-[16px] bg-[#333]" />
          <span style={bebas} className="text-[16px] text-white">
            {trader?.name}
          </span>
          <CreditsDisplay credits={credits} />
        </div>
        <RoundTimer round={round} />
      </div>

      {/* Sabotage alerts */}
      {sabotageAlerts.map((alert) => (
        <SabotageAlertBanner
          key={alert.id}
          alert={alert}
          onDismiss={() => setSabotageAlerts(prev => prev.filter(a => a.id !== alert.id))}
        />
      ))}

      {/* Trade error */}
      {tradeError && (
        <div className="px-[16px] py-[8px] bg-[#0D0D0D] border-b border-[#FF3333]">
          <span style={sans} className="text-[12px] text-[#FF3333]">{tradeError}</span>
        </div>
      )}

      {/* Main layout */}
      <div className="flex h-[calc(100vh-48px)]">
        {/* Left: Portfolio + Positions */}
        <div className="w-[320px] flex-shrink-0 border-r border-[#1A1A1A] p-[16px] flex flex-col gap-[16px] overflow-y-auto">
          {/* Portfolio summary */}
          <div className="flex flex-col gap-[8px]">
            <span style={sans} className="text-[10px] text-[#444] uppercase">Portfolio Value</span>
            <span style={mono} className="text-[32px]">
              <span style={{ color: isPositive ? '#00FF88' : '#FF3333' }}>
                ${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </span>
            <span style={mono} className="text-[18px]">
              <span style={{ color: isPositive ? '#00FF88' : '#FF3333' }}>
                {isPositive ? '+' : ''}{returnPct.toFixed(1)}%
              </span>
            </span>
          </div>

          {/* Open positions */}
          <div className="flex flex-col gap-[8px]">
            <span style={bebas} className="text-[14px] text-[#333]">
              OPEN POSITIONS ({openPositions.length}/3)
            </span>
            {openPositions.length === 0 && (
              <span style={sans} className="text-[11px] text-[#333]">No open positions</span>
            )}
            {openPositions.map((pos) => (
              <PositionCard
                key={pos.id}
                position={pos}
                currentPrice={prices[pos.symbol]}
                onClose={closePosition}
              />
            ))}
          </div>

          {/* Standings */}
          <StandingsMini standings={standings} traderId={trader?.id ?? ''} />
        </div>

        {/* Center: Price + Trade */}
        <div className="flex-1 p-[16px] flex flex-col gap-[16px] overflow-y-auto">
          {/* Asset selector */}
          <AssetSelector prices={prices} selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />

          {/* Price display */}
          <div className="border border-[#1A1A1A] bg-[#0D0D0D] p-[24px] flex flex-col items-center gap-[8px]">
            <span style={bebas} className="text-[20px] text-[#444]">
              {selectedSymbol.replace('USDT', '')}
            </span>
            <span style={mono} className="text-[64px] text-white leading-none">
              ${(prices[selectedSymbol] ?? 0).toLocaleString(undefined, { maximumFractionDigits: (prices[selectedSymbol] ?? 0) > 100 ? 0 : (prices[selectedSymbol] ?? 0) > 1 ? 2 : 6 })}
            </span>
          </div>

          {/* Trade panel */}
          <TradePanel
            symbol={selectedSymbol}
            prices={prices}
            leverageTiers={lobby?.config.leverage_tiers ?? [2, 5, 10]}
            onSubmit={openPosition}
            disabled={!canTrade || trading}
          />
        </div>

        {/* Right: Activity feed */}
        <div className="w-[280px] flex-shrink-0 border-l border-[#1A1A1A] p-[16px] overflow-y-auto">
          <ActivityFeed items={feedItems} />
        </div>
      </div>
    </div>
  );
}
