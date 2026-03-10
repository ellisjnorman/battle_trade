import type { VolatilityEventType, ActiveEvent, AssetTarget } from './volatility-engine';
import type { TraderStanding } from './scoring';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlgorithmConfig {
  base_frequency_seconds: number;
  tension_threshold: number;
  comeback_mechanic: boolean;
  max_events_per_round: number;
}

export interface RoundState {
  standings: TraderStanding[];
  timeRemainingSeconds: number;
  totalRoundSeconds: number;
  lastEventFiredAt: Date | null;
  eventsThisRound: VolatilityEventType[];
  lastTradeAt: Date | null;
}

export interface SuggestedEvent {
  type: VolatilityEventType;
  asset: AssetTarget;
  magnitude: number;
  duration_seconds: number;
  headline: string;
}

// ---------------------------------------------------------------------------
// Probability weights by time bucket
// ---------------------------------------------------------------------------

const EARLY_WEIGHTS: Partial<Record<VolatilityEventType, number>> = {
  circuit_breaker: 30,
  moon_shot: 20,
  volatility_spike: 25,
  wild_card: 15,
  blackout: 10,
};

const MID_WEIGHTS: Partial<Record<VolatilityEventType, number>> = {
  moon_shot: 30,
  volatility_spike: 30,
  dead_cat: 20,
  reversal: 20,
};

const LATE_WEIGHTS: Partial<Record<VolatilityEventType, number>> = {
  margin_call: 40,
  leverage_surge: 30,
  volatility_spike: 20,
  wild_card: 10,
};

// ---------------------------------------------------------------------------
// Headline templates
// ---------------------------------------------------------------------------

const HEADLINES: Record<VolatilityEventType, string> = {
  circuit_breaker: 'CIRCUIT BREAKER INCOMING',
  moon_shot: 'TO THE MOON',
  volatility_spike: 'VOLATILITY SURGE DETECTED',
  dead_cat: 'DEAD CAT BOUNCE',
  margin_call: 'MARGIN CALL — BOTTOM TRADERS LIQUIDATED',
  leverage_surge: 'LEVERAGE UNLOCKED — ALL POSITIONS 2X',
  wild_card: 'WILD CARD — RANDOM TRADER GETS $2000',
  reversal: 'RANKINGS INVERTED FOR 60 SECONDS',
  blackout: 'TRADING LOCKED — NO NEW POSITIONS',
};

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

export function shouldTriggerEvent(
  state: RoundState,
  config: AlgorithmConfig,
): SuggestedEvent | null {
  const {
    standings,
    timeRemainingSeconds,
    totalRoundSeconds,
    lastEventFiredAt,
    eventsThisRound,
    lastTradeAt,
  } = state;

  // Cap max events
  if (eventsThisRound.length >= config.max_events_per_round) return null;

  // Minimum 3 minutes (180s) between events
  if (lastEventFiredAt) {
    const elapsed = (Date.now() - lastEventFiredAt.getTime()) / 1000;
    if (elapsed < 180) return null;
  }

  // Pick time bucket
  const weights = getTimeWeights(timeRemainingSeconds);

  // Filter out already-used types
  const available = filterUsedTypes(weights, eventsThisRound);
  if (Object.keys(available).length === 0) return null;

  // Check special triggers
  const specialType = checkSpecialTriggers(
    standings,
    timeRemainingSeconds,
    lastTradeAt,
    config,
    eventsThisRound,
  );

  let selectedType: VolatilityEventType;

  if (specialType && !eventsThisRound.includes(specialType) && available[specialType]) {
    selectedType = specialType;
  } else {
    selectedType = weightedRandomSelect(available);
  }

  const magnitude = calcMagnitude(selectedType, standings, config);
  const durationSec = calcDuration(selectedType);

  return {
    type: selectedType,
    asset: 'ALL',
    magnitude,
    duration_seconds: durationSec,
    headline: HEADLINES[selectedType],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeWeights(
  timeRemainingSeconds: number,
): Partial<Record<VolatilityEventType, number>> {
  if (timeRemainingSeconds > 600) return EARLY_WEIGHTS;
  if (timeRemainingSeconds > 300) return MID_WEIGHTS;
  return LATE_WEIGHTS;
}

function filterUsedTypes(
  weights: Partial<Record<VolatilityEventType, number>>,
  usedTypes: VolatilityEventType[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [type, weight] of Object.entries(weights)) {
    if (!usedTypes.includes(type as VolatilityEventType)) {
      out[type] = weight as number;
    }
  }
  return out;
}

export function weightedRandomSelect(
  weights: Record<string, number>,
): VolatilityEventType {
  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * totalWeight;
  for (const [type, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return type as VolatilityEventType;
  }
  return entries[entries.length - 1][0] as VolatilityEventType;
}

function checkSpecialTriggers(
  standings: TraderStanding[],
  timeRemainingSeconds: number,
  lastTradeAt: Date | null,
  config: AlgorithmConfig,
  eventsThisRound: VolatilityEventType[],
): VolatilityEventType | null {
  // Wild card: gap between #1 and #8 > 40%
  if (standings.length >= 8 && !eventsThisRound.includes('wild_card')) {
    const top = standings[0]?.returnPct ?? 0;
    const eighth = standings[7]?.returnPct ?? 0;
    if (top - eighth > 40) return 'wild_card';
  }

  // Margin call: only last 5 minutes
  if (timeRemainingSeconds <= 300 && !eventsThisRound.includes('margin_call')) {
    return 'margin_call';
  }

  // Reversal: no trades in last 90 seconds (engagement drop)
  if (lastTradeAt && !eventsThisRound.includes('reversal')) {
    const sinceLastTrade = (Date.now() - lastTradeAt.getTime()) / 1000;
    if (sinceLastTrade > 90) return 'reversal';
  }

  return null;
}

function calcMagnitude(
  type: VolatilityEventType,
  standings: TraderStanding[],
  config: AlgorithmConfig,
): number {
  const gap = standings.length >= 2
    ? Math.abs(standings[0].returnPct - standings[standings.length - 1].returnPct)
    : 10;

  const base = Math.min(gap / 100, 0.3);

  switch (type) {
    case 'circuit_breaker': return Math.max(0.05, base);
    case 'moon_shot': return Math.max(0.05, base);
    case 'volatility_spike': return Math.max(0.03, base * 0.8);
    case 'dead_cat': return Math.max(0.05, base);
    case 'margin_call': return Math.max(0.1, base * 1.5);
    case 'leverage_surge': return 1;
    case 'wild_card': return 1;
    case 'reversal': return 1;
    case 'blackout': return 1;
    default: return 0.1;
  }
}

function calcDuration(type: VolatilityEventType): number {
  switch (type) {
    case 'circuit_breaker': return 60;
    case 'moon_shot': return 60;
    case 'volatility_spike': return 60;
    case 'dead_cat': return 60;
    case 'margin_call': return 10;
    case 'leverage_surge': return 30;
    case 'wild_card': return 10;
    case 'reversal': return 60;
    case 'blackout': return 30;
    default: return 30;
  }
}
