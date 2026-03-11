'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { cachePrice, getAllCachedPrices } from './price-cache';
import type {
  Lobby,
  Position,
  Profile,
  Trader,
  Round,
} from '@/types';
import type { TraderStanding } from './scoring';
import { getRoundStandings } from './scoring';
import { calcPortfolioValue } from './pnl';

// ---------------------------------------------------------------------------
// useLobbies — real-time lobby list via postgres_changes
// ---------------------------------------------------------------------------

export function useLobbies() {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Initial fetch
    supabase
      .from('lobbies')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (mounted && data) {
          setLobbies(data as Lobby[]);
        }
        if (mounted) setLoading(false);
      });

    // Real-time subscription
    const channel = supabase
      .channel('lobbies-realtime')
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'lobbies' },
        (payload: { eventType: string; new: Lobby; old: { id: string } }) => {
          if (!mounted) return;
          setLobbies((prev) => {
            if (payload.eventType === 'INSERT') {
              return [payload.new, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((l) =>
                l.id === payload.new.id ? payload.new : l,
              );
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((l) => l.id !== payload.old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const live = lobbies.filter((l) => l.status === 'active');
  const open = lobbies.filter((l) => l.status === 'waiting');

  return { lobbies, live, open, loading };
}

// ---------------------------------------------------------------------------
// useProfile — fetch profile once, with manual refetch
// ---------------------------------------------------------------------------

export function useProfile(userId: string | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pastBattles, setPastBattles] = useState<
    Array<{ lobby_id: string; lobby_name: string; rank: number; return_pct: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setPastBattles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/profile/${userId}`);
      if (!res.ok) throw new Error('Profile fetch failed');
      const data = await res.json();
      setProfile(data.profile ?? null);
      setPastBattles(data.pastBattles ?? []);
    } catch {
      setProfile(null);
      setPastBattles([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, pastBattles, loading, refetch: fetchProfile };
}

// ---------------------------------------------------------------------------
// useLobbyPositions — real-time positions for a lobby/round
// ---------------------------------------------------------------------------

export function useLobbyPositions(lobbyId: string, roundId: string | null) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roundId) {
      setPositions([]);
      setLoading(false);
      return;
    }

    let mounted = true;

    // Initial fetch
    supabase
      .from('positions')
      .select('*')
      .eq('round_id', roundId)
      .then(({ data }) => {
        if (mounted && data) {
          setPositions(data as Position[]);
        }
        if (mounted) setLoading(false);
      });

    // Real-time subscription scoped to this round
    const channel = supabase
      .channel(`positions-${lobbyId}-${roundId}`)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'positions',
          filter: `round_id=eq.${roundId}`,
        },
        (payload: { eventType: string; new: Position; old: { id: string } }) => {
          if (!mounted) return;
          setPositions((prev) => {
            if (payload.eventType === 'INSERT') {
              return [...prev, payload.new];
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((p) =>
                p.id === payload.new.id ? payload.new : p,
              );
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((p) => p.id !== payload.old.id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [lobbyId, roundId]);

  return { positions, loading };
}

// ---------------------------------------------------------------------------
// useLeaderboard — real-time standings derived from traders + positions
// ---------------------------------------------------------------------------

export function useLeaderboard(lobbyId: string) {
  const [standings, setStandings] = useState<TraderStanding[]>([]);
  const [loading, setLoading] = useState(true);

  // Mutable refs so the recompute closure always has the latest data
  const tradersRef = useRef<Trader[]>([]);
  const roundRef = useRef<Round | null>(null);
  const positionsRef = useRef<Position[]>([]);
  const pricesRef = useRef<Record<string, number>>({});

  const recompute = useCallback(() => {
    const traders = tradersRef.current;
    const round = roundRef.current;
    const positions = positionsRef.current;
    const prices = pricesRef.current;

    if (!round || traders.length === 0) {
      setStandings([]);
      return;
    }

    const startingBalance = round.starting_balance;

    // Build portfolio values per trader
    const portfolioValues: Record<string, number> = {};
    for (const trader of traders) {
      const traderPositions = positions.filter((p) => p.trader_id === trader.id);
      const open = traderPositions.filter((p) => !p.closed_at);
      const closed = traderPositions.filter((p) => p.closed_at);
      portfolioValues[trader.id] = calcPortfolioValue(
        startingBalance,
        open,
        closed,
        prices,
      );
    }

    setStandings(getRoundStandings(traders, portfolioValues, startingBalance));
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      // Fetch active round for this lobby
      const { data: rounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('lobby_id', lobbyId)
        .in('status', ['active', 'frozen'])
        .order('round_number', { ascending: false })
        .limit(1);

      if (!mounted) return;

      const round = (rounds?.[0] as Round) ?? null;
      roundRef.current = round;

      if (!round) {
        setStandings([]);
        setLoading(false);
        return;
      }

      // Fetch traders and positions in parallel
      const [traderRes, posRes, priceRes] = await Promise.all([
        supabase.from('traders').select('*').eq('lobby_id', lobbyId),
        supabase.from('positions').select('*').eq('round_id', round.id),
        supabase.from('prices').select('symbol, price'),
      ]);

      if (!mounted) return;

      tradersRef.current = (traderRes.data as Trader[]) ?? [];
      positionsRef.current = (posRes.data as Position[]) ?? [];

      const priceMap: Record<string, number> = {};
      for (const row of (priceRes.data ?? []) as Array<{ symbol: string; price: number }>) {
        priceMap[row.symbol] = row.price;
      }
      pricesRef.current = priceMap;

      recompute();
      setLoading(false);
    }

    init();

    // Subscribe to trader changes for this lobby
    const tradersChannel = supabase
      .channel(`leaderboard-traders-${lobbyId}`)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'traders',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        (payload: { eventType: string; new: Trader; old: { id: string } }) => {
          if (!mounted) return;
          const prev = tradersRef.current;
          if (payload.eventType === 'INSERT') {
            tradersRef.current = [...prev, payload.new];
          } else if (payload.eventType === 'UPDATE') {
            tradersRef.current = prev.map((t) =>
              t.id === payload.new.id ? payload.new : t,
            );
          } else if (payload.eventType === 'DELETE') {
            tradersRef.current = prev.filter((t) => t.id !== payload.old.id);
          }
          recompute();
        },
      )
      .subscribe();

    // Subscribe to position changes for the active round
    // (round might not be set yet — we start the channel once we know the round id)
    let positionsChannel: ReturnType<typeof supabase.channel> | null = null;

    // Use a short delay to allow init() to set the round
    const timer = setTimeout(() => {
      const round = roundRef.current;
      if (!round || !mounted) return;

      positionsChannel = supabase
        .channel(`leaderboard-positions-${lobbyId}-${round.id}`)
        .on(
          'postgres_changes' as never,
          {
            event: '*',
            schema: 'public',
            table: 'positions',
            filter: `round_id=eq.${round.id}`,
          },
          (payload: { eventType: string; new: Position; old: { id: string } }) => {
            if (!mounted) return;
            const prev = positionsRef.current;
            if (payload.eventType === 'INSERT') {
              positionsRef.current = [...prev, payload.new];
            } else if (payload.eventType === 'UPDATE') {
              positionsRef.current = prev.map((p) =>
                p.id === payload.new.id ? payload.new : p,
              );
            } else if (payload.eventType === 'DELETE') {
              positionsRef.current = prev.filter((p) => p.id !== payload.old.id);
            }
            recompute();
          },
        )
        .subscribe();
    }, 0);

    // Subscribe to price changes so standings update with live prices
    const pricesChannel = supabase
      .channel(`leaderboard-prices-${lobbyId}`)
      .on(
        'postgres_changes' as never,
        { event: 'UPDATE', schema: 'public', table: 'prices' },
        (payload: { new: { symbol: string; price: number } }) => {
          if (!mounted) return;
          pricesRef.current = {
            ...pricesRef.current,
            [payload.new.symbol]: payload.new.price,
          };
          recompute();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      clearTimeout(timer);
      supabase.removeChannel(tradersChannel);
      supabase.removeChannel(pricesChannel);
      if (positionsChannel) supabase.removeChannel(positionsChannel);
    };
  }, [lobbyId, recompute]);

  return { standings, loading };
}

// ---------------------------------------------------------------------------
// usePrices — subscribe to prices table changes, cache to localStorage
// ---------------------------------------------------------------------------

export function usePrices() {
  const [prices, setPrices] = useState<Record<string, number>>(() => {
    // Seed from localStorage cache so we never show blanks on mount
    const cached = getAllCachedPrices();
    const map: Record<string, number> = {};
    for (const entry of cached) {
      map[entry.symbol] = entry.price;
    }
    return map;
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Initial fetch from prices table
    supabase
      .from('prices')
      .select('symbol, price')
      .then(({ data }) => {
        if (!mounted || !data) return;
        const map: Record<string, number> = {};
        for (const row of data as Array<{ symbol: string; price: number }>) {
          map[row.symbol] = row.price;
          cachePrice(row.symbol, row.price);
        }
        setPrices((prev) => ({ ...prev, ...map }));
      });

    // Real-time subscription
    const channel = supabase
      .channel('prices-realtime')
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'prices' },
        (payload: { new: { symbol: string; price: number } }) => {
          if (!mounted) return;
          const { symbol, price } = payload.new;
          if (symbol && typeof price === 'number') {
            setPrices((prev) => ({ ...prev, [symbol]: price }));
            cachePrice(symbol, price);
          }
        },
      )
      .subscribe((status: string) => {
        if (!mounted) return;
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { prices, connected };
}
