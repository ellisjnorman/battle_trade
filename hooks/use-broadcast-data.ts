'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { calcPortfolioValue, calcReturnPct } from '@/lib/pnl'
import type { Position } from '@/types'
import type {
  LobbyState,
  BroadcastTrader,
  BroadcastPrice,
  PredictionMarketEntry,
  SabotageEvent,
  VolatilityEvent,
} from '@/lib/battle-trade-types'

// ---------------------------------------------------------------------------
// Raw DB row types
// ---------------------------------------------------------------------------

interface RawTrader {
  id: string
  name: string
  team_id: string | null
  avatar_url: string | null
  is_eliminated: boolean
  lobby_id: string | null
}

interface RawRound {
  id: string
  round_number: number
  status: string
  started_at: string | null
  duration_seconds: number
  starting_balance: number
  lobby_id?: string
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBroadcastData(lobbyId: string) {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(true)

  // Raw data
  const [lobbyName, setLobbyName] = useState('')
  const [lobbyStatus, setLobbyStatus] = useState<string>('waiting')
  const [currentRound, setCurrentRound] = useState<RawRound | null>(null)
  const [allRounds, setAllRounds] = useState<RawRound[]>([])
  const [rawTraders, setRawTraders] = useState<RawTrader[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [marketOutcomes, setMarketOutcomes] = useState<Array<{ team_id: string; odds: number; volume: number }>>([])
  const [volatilityEvent, setVolatilityEvent] = useState<{ type: string; asset: string; secondsRemaining: number } | null>(null)
  const [sabotageEvents, setSabotageEvents] = useState<SabotageEvent[]>([])
  const [timeRemaining, setTimeRemaining] = useState(0)

  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])

  // ---- Initial fetch ----
  const fetchAll = useCallback(async () => {
    const { data: lobby } = await supabase
      .from('lobbies')
      .select('name, status')
      .eq('id', lobbyId)
      .single()

    if (lobby) {
      setLobbyName(lobby.name)
      setLobbyStatus(lobby.status)
    }

    const { data: rounds } = await supabase
      .from('rounds')
      .select('id, round_number, status, started_at, duration_seconds, starting_balance, lobby_id')
      .eq('lobby_id', lobbyId)
      .order('round_number', { ascending: true })

    if (rounds) {
      setAllRounds(rounds)
      const active = rounds.find(r => r.status === 'active' || r.status === 'frozen')
        ?? rounds[rounds.length - 1]
      if (active) setCurrentRound(active)
    }

    const { data: traders } = await supabase
      .from('traders')
      .select('id, name, team_id, avatar_url, is_eliminated, lobby_id')
      .eq('lobby_id', lobbyId)

    if (traders) setRawTraders(traders as RawTrader[])

    const activeRound = (rounds ?? []).find(r => r.status === 'active' || r.status === 'frozen')
      ?? (rounds ?? [])[rounds?.length ? rounds.length - 1 : 0]

    if (activeRound) {
      const { data: pos } = await supabase
        .from('positions')
        .select('*')
        .eq('round_id', activeRound.id)
      if (pos) setPositions(pos as Position[])
    }

    const { data: priceRows } = await supabase.from('prices').select('symbol, price')
    if (priceRows) {
      const p: Record<string, number> = {}
      for (const row of priceRows) p[row.symbol] = row.price
      setPrices(p)
    }

    if (activeRound) {
      const { data: market } = await supabase
        .from('prediction_markets')
        .select('id')
        .eq('lobby_id', lobbyId)
        .eq('round_id', activeRound.id)
        .single()

      if (market) {
        const { data: outcomes } = await supabase
          .from('market_outcomes')
          .select('team_id, odds, volume')
          .eq('market_id', market.id)
        if (outcomes) setMarketOutcomes(outcomes)
      }
    }

    const { data: events } = await supabase
      .from('volatility_events')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('fired_at', { ascending: false })
      .limit(1)

    if (events && events.length > 0) {
      const ev = events[0]
      const firedAt = new Date(ev.fired_at).getTime()
      const elapsed = (Date.now() - firedAt) / 1000
      const remaining = (ev.duration_seconds ?? 60) - elapsed
      if (remaining > 0) {
        setVolatilityEvent({
          type: ev.type,
          asset: ev.asset ?? 'ALL',
          secondsRemaining: Math.ceil(remaining),
        })
      }
    }

    setLoading(false)
  }, [lobbyId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ---- Realtime subscriptions ----
  useEffect(() => {
    if (!lobbyId) return

    const posChannel = supabase.channel(`bc-${lobbyId}-positions`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPositions(prev => [...prev, payload.new as Position])
        } else if (payload.eventType === 'UPDATE') {
          setPositions(prev => prev.map(p => p.id === (payload.new as Position).id ? payload.new as Position : p))
        }
      })
      .subscribe()

    const priceChannel = supabase.channel(`bc-${lobbyId}-prices`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prices' }, (payload) => {
        const row = payload.new as { symbol: string; price: number }
        setPrices(prev => ({ ...prev, [row.symbol]: row.price }))
      })
      .subscribe()

    const traderChannel = supabase.channel(`bc-${lobbyId}-traders`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'traders' }, (payload) => {
        const updated = payload.new as RawTrader
        if (updated.lobby_id === lobbyId) {
          setRawTraders(prev => prev.map(t => t.id === updated.id ? updated : t))
        }
      })
      .subscribe()

    const roundChannel = supabase.channel(`bc-${lobbyId}-rounds`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, (payload) => {
        const updated = payload.new as RawRound
        if (updated.lobby_id === lobbyId || !updated.lobby_id) {
          setAllRounds(prev => {
            const idx = prev.findIndex(r => r.id === updated.id)
            if (idx >= 0) return prev.map(r => r.id === updated.id ? updated : r)
            return [...prev, updated]
          })
          if (updated.status === 'active' || updated.status === 'frozen') {
            setCurrentRound(updated)
          }
        }
      })
      .subscribe()

    const lobbyChannel = supabase.channel(`bc-${lobbyId}-lobby`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lobbies', filter: `id=eq.${lobbyId}` }, (payload) => {
        const updated = payload.new as { name: string; status: string }
        setLobbyStatus(updated.status)
      })
      .subscribe()

    const eventChannel = supabase.channel(`lobby-${lobbyId}-events`)
      .on('broadcast', { event: 'volatility' }, (payload) => {
        const msg = payload.payload as Record<string, unknown>
        if (msg.type === 'event_start') {
          const ev = msg.event as Record<string, unknown>
          setVolatilityEvent({
            type: (ev.type as string) ?? 'circuit_breaker',
            asset: (ev.asset as string) ?? 'ALL',
            secondsRemaining: (msg.secondsRemaining as number) ?? 60,
          })
        } else if (msg.type === 'event_complete') {
          setVolatilityEvent(null)
        }
      })
      .subscribe()

    const sabotageChannel = supabase.channel(`lobby-${lobbyId}-sabotage`)
      .on('broadcast', { event: 'sabotage' }, (payload) => {
        const msg = payload.payload as Record<string, unknown>
        if (msg.type === 'sabotage_received') {
          const ev: SabotageEvent = {
            id: `sab-${Date.now()}`,
            from: (msg.attacker_name as string) ?? 'UNKNOWN',
            to: (msg.target_name as string) ?? 'UNKNOWN',
            type: (msg.attack_id as string) ?? 'BLACKOUT',
            cost: (msg.cost as number) ?? 0,
            timestamp: new Date(),
          }
          setSabotageEvents(prev => [ev, ...prev].slice(0, 10))
        }
      })
      .subscribe()

    const marketChannel = supabase.channel(`lobby-${lobbyId}-markets`)
      .on('broadcast', { event: 'market' }, (payload) => {
        const msg = payload.payload as Record<string, unknown>
        if (msg.type === 'odds_update' && msg.outcomes) {
          setMarketOutcomes(msg.outcomes as Array<{ team_id: string; odds: number; volume: number }>)
        }
      })
      .subscribe()

    // Admin-fired event alerts (broadcast on lobby-{id} channel)
    const adminEventChannel = supabase.channel(`lobby-${lobbyId}`)
    adminEventChannel.on('broadcast', { event: 'volatility_event' }, (payload) => {
      const msg = payload.payload as Record<string, unknown>
      const dur = (msg.duration_seconds as number) ?? 60
      setVolatilityEvent({
        type: (msg.type as string) ?? 'circuit_breaker',
        asset: (msg.asset as string) ?? 'ALL',
        secondsRemaining: dur,
      })
    }).subscribe()

    const presenceChannel = supabase.channel(`lobby-${lobbyId}-presence`)
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        // presence sync — keep alive
      })
      .subscribe(async (status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    channelsRef.current = [posChannel, priceChannel, traderChannel, roundChannel, lobbyChannel, eventChannel, sabotageChannel, marketChannel, presenceChannel, adminEventChannel]

    return () => {
      for (const ch of channelsRef.current) {
        supabase.removeChannel(ch)
      }
      channelsRef.current = []
    }
  }, [lobbyId])

  // ---- Countdown timers ----
  useEffect(() => {
    const interval = setInterval(() => {
      // Round timer
      if (currentRound?.started_at && (currentRound.status === 'active' || currentRound.status === 'frozen')) {
        const startedAt = new Date(currentRound.started_at).getTime()
        const elapsed = (Date.now() - startedAt) / 1000
        const remaining = Math.max(0, currentRound.duration_seconds - elapsed)
        setTimeRemaining(Math.ceil(remaining))
      }

      // Event countdown
      setVolatilityEvent(prev => {
        if (!prev) return null
        const next = prev.secondsRemaining - 1
        if (next <= 0) return null
        return { ...prev, secondsRemaining: next }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [currentRound])

  // ---- Derive LobbyState ----
  const startingBalance = currentRound?.starting_balance ?? 10000

  const traders: BroadcastTrader[] = rawTraders.map((t, _i) => {
    const traderPositions = positions.filter(p => p.trader_id === t.id)
    const openPositions = traderPositions.filter(p => !p.closed_at)
    const closedPositions = traderPositions.filter(p => p.closed_at)
    const balance = calcPortfolioValue(startingBalance, openPositions, closedPositions, prices)
    const returnPct = calcReturnPct(balance, startingBalance)

    const broadcastPositions = openPositions.map(p => ({
      id: p.id,
      asset: p.symbol.replace('USDT', '') as 'BTC' | 'ETH' | 'SOL',
      direction: p.direction.toUpperCase() as 'LONG' | 'SHORT',
      size: p.size,
      leverage: p.leverage,
      entryPrice: p.entry_price,
      currentPnl: 0,
      currentPnlPercent: 0,
    }))

    return {
      id: t.id,
      name: t.name,
      rank: 0,
      return: returnPct,
      balance,
      isEliminated: t.is_eliminated,
      activity: (openPositions.length > 0 ? 'active' : 'idle') as 'active' | 'idle' | 'danger',
      positions: broadcastPositions,
      sabotagesActive: [],
      credits: 0,
    }
  })
    .sort((a, b) => b.return - a.return)
    .map((t, i) => ({ ...t, rank: i + 1 }))

  const broadcastPrices: BroadcastPrice[] = [
    { asset: 'BTC', price: prices['BTCUSDT'] ?? 0, change24h: 0 },
    { asset: 'ETH', price: prices['ETHUSDT'] ?? 0, change24h: 0 },
    { asset: 'SOL', price: prices['SOLUSDT'] ?? 0, change24h: 0 },
  ]

  // Map market outcomes to team names
  const predictionMarket: PredictionMarketEntry[] = marketOutcomes.map(o => {
    const trader = rawTraders.find(t => t.team_id === o.team_id || t.id === o.team_id)
    return {
      traderId: o.team_id,
      traderName: trader?.name ?? 'UNKNOWN',
      odds: o.odds,
      totalBets: o.volume,
    }
  }).sort((a, b) => a.odds - b.odds)

  // Map volatility event to broadcast type
  const currentEvent: VolatilityEvent | undefined = volatilityEvent
    ? {
        type: volatilityEvent.type.toUpperCase().includes('CIRCUIT') ? 'CIRCUIT_BREAKER'
          : volatilityEvent.type.toUpperCase().includes('MOON') ? 'MOON_SHOT'
          : volatilityEvent.type.toUpperCase().includes('BLACKOUT') ? 'BLACKOUT'
          : 'CIRCUIT_BREAKER',
        asset: (volatilityEvent.asset.replace('USDT', '') || 'BTC') as 'BTC' | 'ETH' | 'SOL',
        impact: 0,
      }
    : undefined

  const lobbyState: LobbyState = {
    id: lobbyId,
    name: lobbyName,
    round: currentRound?.round_number ?? 1,
    totalRounds: allRounds.length || 3,
    timeRemaining,
    status: lobbyStatus === 'waiting' ? 'PRE_SHOW'
      : lobbyStatus === 'completed' ? 'CHAMPION'
      : currentRound?.status === 'active' ? 'ACTIVE'
      : currentRound?.status === 'frozen' ? 'ELIMINATION'
      : 'BETWEEN_ROUNDS',
    traders,
    prices: broadcastPrices,
    predictionMarket,
    sabotageEvents,
    currentEvent,
    nextEvent: undefined,
    winner: traders[0],
  }

  return { lobbyState, loading, connected, lobbyStatus, currentRound, allRounds }
}
