// Battle Trade Shared Types

export interface BroadcastTrader {
  id: string
  name: string
  rank: number
  return: number
  balance: number
  isEliminated: boolean
  activity: 'active' | 'idle' | 'danger'
  positions: BroadcastPosition[]
  sabotagesActive: BroadcastSabotage[]
  credits: number
}

export interface BroadcastPosition {
  id: string
  asset: 'BTC' | 'ETH' | 'SOL'
  direction: 'LONG' | 'SHORT'
  size: number
  leverage: number
  entryPrice: number
  currentPnl: number
  currentPnlPercent: number
}

export interface BroadcastSabotage {
  id: string
  type: 'LOCKOUT' | 'GHOST' | 'REVERSAL'
  from: string
  to: string
  cost: number
  remainingTime: number
  timestamp: Date
}

export interface SabotageEvent {
  id: string
  from: string
  to: string
  type: string
  cost: number
  timestamp: Date
}

export interface PredictionMarketEntry {
  traderId: string
  traderName: string
  odds: number
  totalBets: number
}

export interface VolatilityEvent {
  type: 'FLASH_CRASH' | 'MOON_SHOT' | 'LOCKOUT' | 'WHALE_DUMP'
  asset?: 'BTC' | 'ETH' | 'SOL'
  impact?: number
  scheduledAt?: Date
}

export interface BroadcastPrice {
  asset: 'BTC' | 'ETH' | 'SOL'
  price: number
  change24h: number
}

export interface LobbyState {
  id: string
  name: string
  round: number
  totalRounds: number
  timeRemaining: number
  status: 'PRE_SHOW' | 'ACTIVE' | 'BETWEEN_ROUNDS' | 'ELIMINATION' | 'CHAMPION'
  traders: BroadcastTrader[]
  prices: BroadcastPrice[]
  predictionMarket: PredictionMarketEntry[]
  sabotageEvents: SabotageEvent[]
  currentEvent?: VolatilityEvent
  nextEvent?: { type: string; timeUntil: number }
  winner?: BroadcastTrader
}

// Mock data generator for demos
export function generateMockData(): LobbyState {
  const traders: BroadcastTrader[] = [
    { id: '1', name: 'WOLFPACK', rank: 1, return: 42.2, balance: 14220, isEliminated: false, activity: 'active', positions: [{ id: 'p1', asset: 'BTC', direction: 'LONG', size: 5000, leverage: 5, entryPrice: 97442, currentPnl: 840, currentPnlPercent: 16.8 }], sabotagesActive: [], credits: 450 },
    { id: '2', name: 'VEGA', rank: 2, return: 31.8, balance: 13180, isEliminated: false, activity: 'active', positions: [{ id: 'p2', asset: 'ETH', direction: 'SHORT', size: 3000, leverage: 3, entryPrice: 3842, currentPnl: 520, currentPnlPercent: 17.3 }], sabotagesActive: [], credits: 320 },
    { id: '3', name: 'IRON HANDS', rank: 3, return: 24.5, balance: 12450, isEliminated: false, activity: 'idle', positions: [], sabotagesActive: [{ id: 's1', type: 'LOCKOUT', from: 'ANONYMOUS', to: 'IRON HANDS', cost: 200, remainingTime: 47, timestamp: new Date() }], credits: 180 },
    { id: '4', name: 'ANONYMOUS', rank: 4, return: 18.2, balance: 11820, isEliminated: false, activity: 'active', positions: [{ id: 'p3', asset: 'SOL', direction: 'LONG', size: 2000, leverage: 4, entryPrice: 142.5, currentPnl: 180, currentPnlPercent: 9.0 }], sabotagesActive: [], credits: 520 },
    { id: '5', name: 'DEGEN PRIME', rank: 5, return: 8.4, balance: 10840, isEliminated: false, activity: 'danger', positions: [], sabotagesActive: [], credits: 90 },
    { id: '6', name: 'PAPER HANDS', rank: 6, return: -2.1, balance: 9790, isEliminated: false, activity: 'idle', positions: [], sabotagesActive: [], credits: 150 },
    { id: '7', name: 'WHALE HUNTER', rank: 7, return: -8.7, balance: 9130, isEliminated: false, activity: 'idle', positions: [], sabotagesActive: [], credits: 200 },
    { id: '8', name: 'MOON BOY', rank: 8, return: -15.3, balance: 8470, isEliminated: true, activity: 'idle', positions: [], sabotagesActive: [], credits: 0 },
  ]

  const prices: BroadcastPrice[] = [
    { asset: 'BTC', price: 97442.18, change24h: 0.12 },
    { asset: 'ETH', price: 3842.55, change24h: -0.45 },
    { asset: 'SOL', price: 142.87, change24h: 2.34 },
  ]

  const predictionMarket: PredictionMarketEntry[] = [
    { traderId: '1', traderName: 'WOLFPACK', odds: 2.4, totalBets: 520 },
    { traderId: '2', traderName: 'VEGA', odds: 3.1, totalBets: 380 },
    { traderId: '4', traderName: 'ANONYMOUS', odds: 5.8, totalBets: 340 },
  ]

  const sabotageEvents: SabotageEvent[] = [
    { id: 'se1', from: 'ANONYMOUS', to: 'WOLFPACK', type: 'LOCKOUT', cost: 200, timestamp: new Date(Date.now() - 30000) },
    { id: 'se2', from: 'VEGA', to: 'IRON HANDS', type: 'GHOST', cost: 150, timestamp: new Date(Date.now() - 120000) },
    { id: 'se3', from: 'WOLFPACK', to: 'DEGEN PRIME', type: 'REVERSAL', cost: 300, timestamp: new Date(Date.now() - 240000) },
    { id: 'se4', from: 'IRON HANDS', to: 'VEGA', type: 'LOCKOUT', cost: 200, timestamp: new Date(Date.now() - 360000) },
  ]

  return {
    id: 'demo-lobby',
    name: 'GENESIS CUP',
    round: 2,
    totalRounds: 3,
    timeRemaining: 873, // 14:33
    status: 'ACTIVE',
    traders,
    prices,
    predictionMarket,
    sabotageEvents,
    nextEvent: { type: 'FLASH CRASH', timeUntil: 134 },
  }
}
