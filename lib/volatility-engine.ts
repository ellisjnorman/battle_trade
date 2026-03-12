// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const VOLATILITY_EVENT_TYPES = [
  'circuit_breaker',
  'moon_shot',
  'volatility_spike',
  'dead_cat',
  'margin_call',
  'leverage_surge',
  'wild_card',
  'blackout',
  'reversal',
] as const;

export type VolatilityEventType = (typeof VOLATILITY_EVENT_TYPES)[number];

export type EventStatus = 'pending' | 'active' | 'complete';

export type AssetTarget = 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT' | 'ALL';

export interface ActiveEvent {
  id: string;
  lobby_id: string;
  type: VolatilityEventType;
  status: EventStatus;
  asset: AssetTarget;
  magnitude: number;
  duration_seconds: number;
  direction?: 'up' | 'down' | 'random';
  headline?: string;
  trigger_mode: 'manual' | 'scheduled' | 'algorithmic';
  triggered_at: number | null;
  completed_at: number | null;
  created_at: number;
}

export interface PriceModifier {
  multiplier: number;
  offset: number;
  clamp_leverage?: number;
  lock_trading?: boolean;
  reverse_direction?: boolean;
}

export interface LobbyStandingsGap {
  lobby_id: string;
  topReturnPct: number;
  bottomReturnPct: number;
  gap: number;
  traderCount: number;
  roundElapsedPct: number;
}

export interface AlgoConfig {
  gap_threshold: number;
  time_window_start: number;
  time_window_end: number;
  cooldown_ms: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Price modifier function — exact math per event type
// ---------------------------------------------------------------------------

export function applyPriceModifier(
  basePrice: number,
  event: ActiveEvent,
  secondsElapsed: number,
): number {
  const mag = event.magnitude;

  switch (event.type) {
    case 'circuit_breaker':
      return basePrice * (1 - mag);

    case 'moon_shot':
      return basePrice * (1 + (mag * Math.min(secondsElapsed, 60) / 60));

    case 'volatility_spike':
      return basePrice * (1 + Math.sin(secondsElapsed * 0.8) * mag);

    case 'dead_cat': {
      if (secondsElapsed <= 30) {
        return basePrice * (1 - mag);
      } else if (secondsElapsed <= 45) {
        return basePrice * (1 - mag * 0.4);
      } else {
        return basePrice * (1 - mag * 1.3);
      }
    }

    // These types don't modify price
    case 'margin_call':
    case 'leverage_surge':
    case 'wild_card':
    case 'reversal':
    case 'blackout':
      return basePrice;

    default:
      return basePrice;
  }
}

// Legacy compat — used by old tests through the VolatilityEngine class
export function applyModifier(basePrice: number, modifier: PriceModifier): number {
  const modified = basePrice * modifier.multiplier + modifier.offset;
  return Math.max(0, modified);
}

// ---------------------------------------------------------------------------
// Event definitions — buildModifier for backward compat with VolatilityEngine
// ---------------------------------------------------------------------------

export interface EventDefinition {
  type: VolatilityEventType;
  default_duration_ms: number;
  buildModifier(basePrice: number, intensity: number): PriceModifier;
}

export const EVENT_DEFINITIONS: Record<VolatilityEventType, EventDefinition> = {
  circuit_breaker: {
    type: 'circuit_breaker',
    default_duration_ms: 60_000,
    buildModifier: (_base, intensity) => ({
      multiplier: 1 - 0.15 * intensity,
      offset: 0,
    }),
  },
  moon_shot: {
    type: 'moon_shot',
    default_duration_ms: 60_000,
    buildModifier: (_base, intensity) => ({
      multiplier: 1 + 0.20 * intensity,
      offset: 0,
    }),
  },
  volatility_spike: {
    type: 'volatility_spike',
    default_duration_ms: 60_000,
    buildModifier: (_base, intensity) => {
      const swing = (Math.random() > 0.5 ? 1 : -1) * 0.10 * intensity;
      return { multiplier: 1 + swing, offset: 0 };
    },
  },
  dead_cat: {
    type: 'dead_cat',
    default_duration_ms: 60_000,
    buildModifier: (_base, intensity) => ({
      multiplier: 1 - 0.12 * intensity,
      offset: 0,
    }),
  },
  margin_call: {
    type: 'margin_call',
    default_duration_ms: 30_000,
    buildModifier: (_base, intensity) => ({
      multiplier: 1 - 0.08 * intensity,
      offset: 0,
      clamp_leverage: 1,
    }),
  },
  leverage_surge: {
    type: 'leverage_surge',
    default_duration_ms: 30_000,
    buildModifier: () => ({
      multiplier: 1,
      offset: 0,
      clamp_leverage: 100,
    }),
  },
  wild_card: {
    type: 'wild_card',
    default_duration_ms: 8_000,
    buildModifier: (_base, intensity) => {
      const swing = (Math.random() - 0.5) * 0.30 * intensity;
      return { multiplier: 1 + swing, offset: 0 };
    },
  },
  blackout: {
    type: 'blackout',
    default_duration_ms: 30_000,
    buildModifier: () => ({
      multiplier: 1,
      offset: 0,
      lock_trading: true,
    }),
  },
  reversal: {
    type: 'reversal',
    default_duration_ms: 60_000,
    buildModifier: () => ({
      multiplier: 1,
      offset: 0,
      reverse_direction: true,
    }),
  },
};

// ---------------------------------------------------------------------------
// VolatilityEngine — one instance per lobby
// ---------------------------------------------------------------------------

export class VolatilityEngine {
  readonly lobby_id: string;

  private events: Map<string, ActiveEvent> = new Map();
  private activeEvent: ActiveEvent | null = null;
  private activeEvents: Map<string, ActiveEvent> = new Map(); // keyed by asset or 'ALL'
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private eventTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private algoConfig: AlgoConfig;
  private lastAutoTrigger: number = 0;
  private basePrices: Record<string, number> = {};
  private idCounter: number = 0;
  private firedTypes: Set<VolatilityEventType> = new Set();
  private positionsLocked: boolean = false;

  private broadcastFn: (lobbyId: string, payload: Record<string, unknown>) => Promise<void>;

  constructor(
    lobby_id: string,
    opts?: {
      algoConfig?: Partial<AlgoConfig>;
      broadcastFn?: (lobbyId: string, payload: Record<string, unknown>) => Promise<void>;
    },
  ) {
    this.lobby_id = lobby_id;
    this.algoConfig = {
      gap_threshold: 25,
      time_window_start: 0.2,
      time_window_end: 0.9,
      cooldown_ms: 180_000,
      enabled: false,
      ...opts?.algoConfig,
    };
    this.broadcastFn = opts?.broadcastFn ?? defaultBroadcast;
  }

  // ----- public: price middleware ------------------------------------------

  getModifiedPrice(asset: string, basePrice: number): number {
    this.basePrices[asset] = basePrice;

    // Check concurrent per-asset events first
    let price = basePrice;
    for (const ev of this.activeEvents.values()) {
      if (ev.status !== 'active') continue;
      if (ev.asset !== 'ALL' && ev.asset !== asset) continue;
      const elapsed = ev.triggered_at ? (Date.now() - ev.triggered_at) / 1000 : 0;
      price = applyPriceModifier(price, ev, elapsed);
    }
    if (this.activeEvents.size > 0) return price;

    // Legacy single-event fallback
    if (!this.activeEvent || this.activeEvent.status !== 'active') {
      return basePrice;
    }
    if (this.activeEvent.asset !== 'ALL' && this.activeEvent.asset !== asset) {
      return basePrice;
    }
    const elapsed = this.activeEvent.triggered_at
      ? (Date.now() - this.activeEvent.triggered_at) / 1000
      : 0;
    return applyPriceModifier(basePrice, this.activeEvent, elapsed);
  }

  getModifiedPrices(rawPrices: Record<string, number>): Record<string, number> {
    this.basePrices = { ...rawPrices };
    const out: Record<string, number> = {};

    // Apply all concurrent active events
    if (this.activeEvents.size > 0) {
      for (const [sym, price] of Object.entries(rawPrices)) {
        let modified = price;
        for (const ev of this.activeEvents.values()) {
          if (ev.status !== 'active') continue;
          if (ev.asset !== 'ALL' && ev.asset !== sym) continue;
          const elapsed = ev.triggered_at ? (Date.now() - ev.triggered_at) / 1000 : 0;
          modified = applyPriceModifier(modified, ev, elapsed);
        }
        out[sym] = modified;
      }
      return out;
    }

    // Legacy single-event fallback
    if (!this.activeEvent || this.activeEvent.status !== 'active') {
      return { ...rawPrices };
    }
    const mod = this.activeEvent;
    for (const [sym, price] of Object.entries(rawPrices)) {
      if (mod.asset === 'ALL' || mod.asset === sym) {
        const elapsed = mod.triggered_at ? (Date.now() - mod.triggered_at) / 1000 : 0;
        out[sym] = applyPriceModifier(price, mod, elapsed);
      } else {
        out[sym] = price;
      }
    }
    return out;
  }

  getActiveModifier(): PriceModifier | null {
    if (!this.activeEvent || this.activeEvent.status !== 'active') return null;
    const def = EVENT_DEFINITIONS[this.activeEvent.type];
    return def.buildModifier(50000, this.activeEvent.magnitude);
  }

  getActiveEvent(): ActiveEvent | null {
    return this.activeEvent;
  }

  getAllEvents(): ActiveEvent[] {
    return Array.from(this.events.values());
  }

  isPositionsLocked(): boolean {
    return this.positionsLocked;
  }

  getFiredTypes(): VolatilityEventType[] {
    return Array.from(this.firedTypes);
  }

  // ----- public: manual trigger -------------------------------------------

  triggerEvent(
    type: VolatilityEventType,
    asset: AssetTarget | string = 'ALL',
    magnitude: number = 0.1,
    durationMs?: number,
    opts?: { headline?: string; trigger_mode?: 'manual' | 'scheduled' | 'algorithmic' },
  ): ActiveEvent {
    const def = EVENT_DEFINITIONS[type];
    const duration = durationMs ?? def.default_duration_ms;

    const event: ActiveEvent = {
      id: `ve_${this.lobby_id}_${++this.idCounter}`,
      lobby_id: this.lobby_id,
      type,
      status: 'pending',
      asset: asset as AssetTarget,
      magnitude: Math.min(Math.max(magnitude, 0), 1),
      duration_seconds: Math.round(duration / 1000),
      headline: opts?.headline,
      trigger_mode: opts?.trigger_mode ?? 'manual',
      triggered_at: null,
      completed_at: null,
      created_at: Date.now(),
    };

    this.events.set(event.id, event);
    this.firedTypes.add(type);
    this.activateEvent(event);
    return event;
  }

  // ----- public: algorithmic mode -----------------------------------------

  evaluateAlgoTrigger(standings: LobbyStandingsGap): ActiveEvent | null {
    if (!this.algoConfig.enabled) return null;
    if (this.activeEvent?.status === 'active') return null;

    const now = Date.now();
    if (now - this.lastAutoTrigger < this.algoConfig.cooldown_ms) return null;

    const { roundElapsedPct, gap } = standings;
    if (roundElapsedPct < this.algoConfig.time_window_start) return null;
    if (roundElapsedPct > this.algoConfig.time_window_end) return null;
    if (gap < this.algoConfig.gap_threshold) return null;

    const type = pickAlgoEventType(standings, this.firedTypes);
    if (!type) return null;

    const intensity = Math.min(gap / 100, 1);
    this.lastAutoTrigger = now;
    return this.triggerEvent(type, 'ALL', intensity, undefined, {
      trigger_mode: 'algorithmic',
    });
  }

  setAlgoConfig(config: Partial<AlgoConfig>) {
    Object.assign(this.algoConfig, config);
  }

  getAlgoConfig(): AlgoConfig {
    return { ...this.algoConfig };
  }

  // ----- public: lifecycle ------------------------------------------------

  cancelActiveEvent() {
    // Cancel all active events
    for (const ev of Array.from(this.activeEvents.values())) {
      if (ev.status === 'active') this.completeEvent(ev);
    }
    if (this.activeEvent && this.activeEvent.status === 'active') {
      this.completeEvent(this.activeEvent);
    }
  }

  destroy() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    for (const timer of this.eventTimers.values()) {
      clearTimeout(timer);
    }
    this.eventTimers.clear();
    this.activeEvent = null;
    this.activeEvents.clear();
    this.events.clear();
    this.firedTypes.clear();
    this.positionsLocked = false;
  }

  // ----- internal ---------------------------------------------------------

  private activateEvent(event: ActiveEvent) {
    // For concurrent events, don't cancel existing ones — add to the map
    event.status = 'active';
    event.triggered_at = Date.now();
    this.activeEvent = event;
    this.activeEvents.set(event.id, event);

    if (event.type === 'blackout') {
      this.positionsLocked = true;
    }

    this.broadcastFn(this.lobby_id, {
      type: 'event_start',
      event: serializeEvent(event),
      secondsRemaining: event.duration_seconds,
    }).catch(err => console.error('[volatility-engine] broadcast event_start failed:', err));

    // Per-event timer
    if (event.duration_seconds > 0) {
      const timer = setTimeout(() => {
        this.completeEvent(event);
      }, event.duration_seconds * 1000);
      this.eventTimers.set(event.id, timer);
    } else {
      // Instant events (duration 0) complete immediately after applying
      // but stay in activeEvents briefly for the broadcast
      setTimeout(() => this.completeEvent(event), 100);
    }
  }

  private completeEvent(event: ActiveEvent) {
    event.status = 'complete';
    event.completed_at = Date.now();

    this.activeEvents.delete(event.id);
    if (this.activeEvent?.id === event.id) {
      this.activeEvent = null;
    }

    const timer = this.eventTimers.get(event.id);
    if (timer) {
      clearTimeout(timer);
      this.eventTimers.delete(event.id);
    }

    if (event.type === 'blackout') {
      // Only unlock if no other lockout is active
      const hasOtherLockout = Array.from(this.activeEvents.values()).some(e => e.type === 'blackout' && e.status === 'active');
      if (!hasOtherLockout) {
        this.positionsLocked = false;
      }
    }

    this.broadcastFn(this.lobby_id, {
      type: 'event_complete',
      event: serializeEvent(event),
    }).catch(err => console.error('[volatility-engine] broadcast event_complete failed:', err));
  }
}

// ---------------------------------------------------------------------------
// Algo event picker — respects no-repeat rule
// ---------------------------------------------------------------------------

function pickAlgoEventType(
  standings: LobbyStandingsGap,
  firedTypes: Set<VolatilityEventType>,
): VolatilityEventType | null {
  const { gap, roundElapsedPct, traderCount } = standings;

  let candidates: VolatilityEventType[];

  if (roundElapsedPct > 0.7 && gap > 40) {
    candidates = ['circuit_breaker', 'margin_call', 'leverage_surge'];
  } else if (gap > 35) {
    candidates = ['reversal', 'volatility_spike', 'dead_cat'];
  } else if (traderCount > 10) {
    candidates = ['volatility_spike', 'wild_card', 'blackout'];
  } else {
    candidates = ['wild_card', 'dead_cat', 'moon_shot'];
  }

  // Filter out already-fired types
  const available = candidates.filter((t) => !firedTypes.has(t));
  if (available.length === 0) return null;
  return available[0];
}

// ---------------------------------------------------------------------------
// Supabase Realtime broadcast
// ---------------------------------------------------------------------------

async function defaultBroadcast(lobbyId: string, payload: Record<string, unknown>) {
  const { supabase } = await import('./supabase');
  const channel = supabase.channel(`lobby-${lobbyId}-events`);
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      channel.send({ type: 'broadcast', event: 'volatility', payload }).catch(() => {});
      setTimeout(() => supabase.removeChannel(channel), 500);
    }
  });
  // Fallback: remove channel regardless after 3s
  setTimeout(() => supabase.removeChannel(channel), 3000);
}

function serializeEvent(event: ActiveEvent): Record<string, unknown> {
  return {
    id: event.id,
    lobby_id: event.lobby_id,
    type: event.type,
    status: event.status,
    asset: event.asset,
    magnitude: event.magnitude,
    duration_seconds: event.duration_seconds,
    headline: event.headline,
    trigger_mode: event.trigger_mode,
    triggered_at: event.triggered_at,
    completed_at: event.completed_at,
    created_at: event.created_at,
  };
}
