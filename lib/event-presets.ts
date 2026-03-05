// ---------------------------------------------------------------------------
// DJ Booth presets for the Battle Trade admin panel
// Each preset maps to one or more VolatilityEvent engine types
// Verified against lib/volatility-engine.ts applyPriceModifier() and mechanical effects
// ---------------------------------------------------------------------------

import type { AssetTarget } from './volatility-engine';

export type EventType =
  | 'flash_crash'
  | 'moon_shot'
  | 'volatility_spike'
  | 'dead_cat'
  | 'margin_call'
  | 'leverage_surge'
  | 'wild_card'
  | 'reversal'
  | 'lockout'

export interface PresetEvent {
  type: EventType
  asset: AssetTarget | 'BTC' | 'ETH' | 'SOL'
  magnitude: number
  duration_seconds: number
  delay_seconds?: number
}

export interface EventPreset {
  id: string
  name: string
  emoji: string
  category: 'crash' | 'pump' | 'chaos' | 'punish' | 'comeback' | 'drama'
  headline: string
  events: PresetEvent[]
  timing: 'early' | 'mid' | 'late' | 'any'
  narrative: string
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

export const PRESETS: EventPreset[] = [
  // ── CRASH ──────────────────────────────────────────────────────────────
  {
    id: 'alien_invasion',
    name: 'ALIEN INVASION',
    emoji: '🛸',
    category: 'crash',
    headline: 'EXTRATERRESTRIAL CONTACT CONFIRMED — MARKETS SUSPENDED GLOBALLY',
    events: [
      { type: 'flash_crash', asset: 'ALL', magnitude: 0.18, duration_seconds: 30 },
      { type: 'lockout', asset: 'ALL', magnitude: 0, duration_seconds: 30 },
    ],
    timing: 'any',
    narrative: 'All assets flash crash 18%. Then 30 seconds nobody can trade.',
  },
  {
    id: 'nuke_drop',
    name: 'NUKE DROP',
    emoji: '💣',
    category: 'crash',
    headline: 'NUCLEAR LAUNCH DETECTED — EMERGENCY CIRCUIT BREAKER ACTIVATED',
    events: [
      { type: 'lockout', asset: 'ALL', magnitude: 0, duration_seconds: 60 },
      { type: 'volatility_spike', asset: 'BTCUSDT', magnitude: 0.12, duration_seconds: 45, delay_seconds: 60 },
    ],
    timing: 'any',
    narrative: '60s nobody can trade. Then BTC goes haywire for 45s.',
  },
  {
    id: 'fed_surprise',
    name: 'FED SURPRISE',
    emoji: '🏦',
    category: 'crash',
    headline: 'EMERGENCY RATE HIKE +300BPS — POWELL GOES FULL VOLCKER',
    events: [
      { type: 'flash_crash', asset: 'ALL', magnitude: 0.12, duration_seconds: 30 },
    ],
    timing: 'early',
    narrative: 'Clean -12% across the board.',
  },
  {
    id: 'black_monday',
    name: 'BLACK MONDAY',
    emoji: '📉',
    category: 'crash',
    headline: 'CIRCUIT BREAKERS TRIGGERED — S&P DOWN 7% AT OPEN',
    events: [
      { type: 'flash_crash', asset: 'BTCUSDT', magnitude: 0.20, duration_seconds: 45 },
      { type: 'flash_crash', asset: 'ETHUSDT', magnitude: 0.22, duration_seconds: 45 },
      { type: 'flash_crash', asset: 'SOLUSDT', magnitude: 0.25, duration_seconds: 45 },
      { type: 'lockout', asset: 'ALL', magnitude: 0, duration_seconds: 20 },
    ],
    timing: 'early',
    narrative: 'BTC -20%, ETH -22%, SOL -25%. Then 20s halt.',
  },
  {
    id: 'dead_cat',
    name: 'DEAD CAT BOUNCE',
    emoji: '🐈',
    category: 'crash',
    headline: 'BTC RECOVERING OFF LOWS — ANALYSTS: WORST IS OVER',
    events: [
      { type: 'dead_cat', asset: 'BTCUSDT', magnitude: 0.14, duration_seconds: 60 },
    ],
    timing: 'mid',
    narrative: 'Drops 14%, recovers to -5.6%, then craters to -18.2%. Classic trap.',
  },
  {
    id: 'bear_trap',
    name: 'BEAR TRAP',
    emoji: '🐻',
    category: 'crash',
    headline: 'CRYPTO WINTER CONFIRMED — ANALYSTS: $10K BTC INEVITABLE',
    events: [
      { type: 'flash_crash', asset: 'BTCUSDT', magnitude: 0.08, duration_seconds: 20 },
      { type: 'moon_shot', asset: 'BTCUSDT', magnitude: 0.18, duration_seconds: 60, delay_seconds: 20 },
    ],
    timing: 'mid',
    narrative: '-8% tricks into shorting. Then +18% pump. Shorts get liquidated.',
  },
  {
    id: 'flash_rug',
    name: 'FLASH RUG',
    emoji: '🔪',
    category: 'crash',
    headline: 'PROTOCOL EXPLOITED — $800M DRAINED. TOKEN GOES TO ZERO.',
    events: [
      { type: 'flash_crash', asset: 'SOLUSDT', magnitude: 0.30, duration_seconds: 45 },
    ],
    timing: 'any',
    narrative: 'SOL -30% while BTC/ETH stay flat. Tests concentration risk.',
  },

  // ── PUMP ───────────────────────────────────────────────────────────────
  {
    id: 'to_the_moon',
    name: 'TO THE MOON',
    emoji: '🌙',
    category: 'pump',
    headline: 'SPOT BTC ETF INFLOWS HIT $10B SINGLE DAY',
    events: [
      { type: 'moon_shot', asset: 'BTCUSDT', magnitude: 0.15, duration_seconds: 60 },
    ],
    timing: 'mid',
    narrative: 'BTC pumps 15% over 60 seconds. Shorts get wrecked.',
  },
  {
    id: 'solana_summer',
    name: 'SOLANA SUMMER',
    emoji: '☀️',
    category: 'pump',
    headline: 'VISA INTEGRATES SOLANA FOR ALL CONSUMER PAYMENTS',
    events: [
      { type: 'moon_shot', asset: 'SOLUSDT', magnitude: 0.22, duration_seconds: 60 },
    ],
    timing: 'mid',
    narrative: 'SOL moons +22% while BTC/ETH stay flat.',
  },
  {
    id: 'pepe_season',
    name: 'PEPE SEASON',
    emoji: '🐸',
    category: 'pump',
    headline: 'PEPE OVERTAKES ETH MARKET CAP — FUNDAMENTALS ARE DEAD',
    events: [
      { type: 'moon_shot', asset: 'SOLUSDT', magnitude: 0.20, duration_seconds: 45 },
      { type: 'flash_crash', asset: 'ETHUSDT', magnitude: 0.10, duration_seconds: 30 },
    ],
    timing: 'mid',
    narrative: 'SOL +20%, ETH -10% simultaneously. Alt rotation live.',
  },
  {
    id: 'korean_premium',
    name: 'KIMCHI PREMIUM',
    emoji: '🇰🇷',
    category: 'pump',
    headline: 'KOREAN EXCHANGES 40% PREMIUM — KIMCHI PREMIUM RETURNS',
    events: [
      { type: 'moon_shot', asset: 'ALL', magnitude: 0.12, duration_seconds: 45 },
    ],
    timing: 'early',
    narrative: '+12% across all assets. Rising tide lifts all boats.',
  },

  // ── CHAOS ──────────────────────────────────────────────────────────────
  {
    id: 'volatility_storm',
    name: 'VOLATILITY STORM',
    emoji: '⛈️',
    category: 'chaos',
    headline: 'OPTIONS MARKET IMPLODING — IV HITS 400%',
    events: [
      { type: 'volatility_spike', asset: 'BTCUSDT', magnitude: 0.08, duration_seconds: 90 },
      { type: 'volatility_spike', asset: 'ETHUSDT', magnitude: 0.10, duration_seconds: 90 },
    ],
    timing: 'any',
    narrative: '90 seconds of BTC and ETH oscillating wildly.',
  },
  {
    id: 'degen_casino',
    name: 'DEGEN CASINO',
    emoji: '🎰',
    category: 'chaos',
    headline: 'ALL POSITIONS INSTANTLY 2X LEVERAGED — WELCOME TO THE CASINO',
    events: [
      { type: 'leverage_surge', asset: 'ALL', magnitude: 2, duration_seconds: 0 },
    ],
    timing: 'late',
    narrative: 'Every open position doubles exposure. PnL moves 2x in both directions.',
  },
  {
    id: 'algo_malfunction',
    name: 'ALGO MALFUNCTION',
    emoji: '🌀',
    category: 'chaos',
    headline: 'TRADING ALGO MALFUNCTION — PRICES UNHINGED FOR 2 MINUTES',
    events: [
      { type: 'volatility_spike', asset: 'ALL', magnitude: 0.15, duration_seconds: 120 },
    ],
    timing: 'any',
    narrative: '2 full minutes of ±15% oscillation on all three assets.',
  },

  // ── PUNISH ─────────────────────────────────────────────────────────────
  {
    id: 'margin_massacre',
    name: 'MARGIN MASSACRE',
    emoji: '💀',
    category: 'punish',
    headline: 'FORCED LIQUIDATIONS CASCADE — BOTTOM TRADERS MARGIN CALLED',
    events: [
      { type: 'margin_call', asset: 'ALL', magnitude: 0.20, duration_seconds: 0 },
    ],
    timing: 'late',
    narrative: 'Bottom 3 traders lose 20% of their balance instantly.',
  },
  {
    id: 'sec_crackdown',
    name: 'SEC CRACKDOWN',
    emoji: '⚖️',
    category: 'punish',
    headline: 'SEC FILES EMERGENCY INJUNCTION — ALL CRYPTO EXCHANGES HALT',
    events: [
      { type: 'lockout', asset: 'ALL', magnitude: 0, duration_seconds: 45 },
      { type: 'flash_crash', asset: 'ALL', magnitude: 0.10, duration_seconds: 30 },
    ],
    timing: 'any',
    narrative: 'Crash + lockout simultaneously. Existing positions bleed.',
  },
  {
    id: 'exchange_hack',
    name: 'EXCHANGE HACK',
    emoji: '💻',
    category: 'punish',
    headline: 'BINANCE EXPLOITED — $2B DRAINED. WITHDRAWALS SUSPENDED.',
    events: [
      { type: 'flash_crash', asset: 'ALL', magnitude: 0.15, duration_seconds: 30 },
      { type: 'margin_call', asset: 'ALL', magnitude: 0.10, duration_seconds: 0, delay_seconds: 1 },
    ],
    timing: 'mid',
    narrative: '-15% price + bottom 3 lose another 10%. Double hit.',
  },

  // ── COMEBACK ───────────────────────────────────────────────────────────
  {
    id: 'mystery_airdrop',
    name: 'MYSTERY AIRDROP',
    emoji: '🎁',
    category: 'comeback',
    headline: 'ANONYMOUS WHALE AIRDROPPING $2,000 TO RANDOM COMPETITORS',
    events: [
      { type: 'wild_card', asset: 'ALL', magnitude: 2000, duration_seconds: 0 },
      { type: 'wild_card', asset: 'ALL', magnitude: 2000, duration_seconds: 0, delay_seconds: 3 },
      { type: 'wild_card', asset: 'ALL', magnitude: 2000, duration_seconds: 0, delay_seconds: 6 },
    ],
    timing: 'mid',
    narrative: 'Three random traders each get $2,000 injected.',
  },
  {
    id: 'wealth_transfer',
    name: 'WEALTH TRANSFER',
    emoji: '💸',
    category: 'comeback',
    headline: 'WHALE REDISTRIBUTION EVENT — TOP TRADER BEING TAXED',
    events: [
      { type: 'margin_call', asset: 'ALL', magnitude: 0.15, duration_seconds: 0 },
      { type: 'wild_card', asset: 'ALL', magnitude: 2000, duration_seconds: 0, delay_seconds: 1 },
    ],
    timing: 'late',
    narrative: 'Bottom 3 lose 15%, then random trader gets $2,000.',
  },

  // ── DRAMA ──────────────────────────────────────────────────────────────
  {
    id: 'regime_change',
    name: 'REGIME CHANGE',
    emoji: '🔄',
    category: 'drama',
    headline: 'MARKET STRUCTURE INVERTED — BEARS ARE NOW WINNING',
    events: [
      { type: 'reversal', asset: 'ALL', magnitude: 0, duration_seconds: 90 },
    ],
    timing: 'mid',
    narrative: 'Leaderboard flips for 90 seconds. Pure crowd confusion.',
  },
  {
    id: 'last_chance',
    name: 'LAST CHANCE',
    emoji: '⏰',
    category: 'drama',
    headline: 'FINAL POSITIONS LOCKING — ALL TRADES CLOSE IN 60 SECONDS',
    events: [
      { type: 'lockout', asset: 'ALL', magnitude: 0, duration_seconds: 60 },
    ],
    timing: 'late',
    narrative: '60s lockout. Forces traders to manage existing risk only.',
  },
  {
    id: 'rebalance_event',
    name: 'INDEX REBALANCE',
    emoji: '⚖️',
    category: 'drama',
    headline: 'MASSIVE INDEX REBALANCE — $50B IN FORCED SELLING AND BUYING',
    events: [
      { type: 'flash_crash', asset: 'ETHUSDT', magnitude: 0.10, duration_seconds: 40 },
      { type: 'moon_shot', asset: 'BTCUSDT', magnitude: 0.08, duration_seconds: 40 },
    ],
    timing: 'mid',
    narrative: 'ETH -10%, BTC +8% simultaneously. Rewards diversification.',
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getPreset(id: string): EventPreset | undefined {
  return PRESETS.find(p => p.id === id);
}

export function getPresetsByCategory(category: EventPreset['category']): EventPreset[] {
  return PRESETS.filter(p => p.category === category);
}

export function getPresetsByTiming(timing: EventPreset['timing']): EventPreset[] {
  return PRESETS.filter(p => p.timing === timing || p.timing === 'any');
}

export const PRESET_CATEGORIES: EventPreset['category'][] = ['crash', 'pump', 'chaos', 'punish', 'comeback', 'drama'];
