import {
  VolatilityEngine,
  applyModifier,
  applyPriceModifier,
  EVENT_DEFINITIONS,
  VOLATILITY_EVENT_TYPES,
  type PriceModifier,
  type LobbyStandingsGap,
  type ActiveEvent,
  type VolatilityEventType,
} from '@/lib/volatility-engine';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEngine(overrides?: {
  algoConfig?: Partial<VolatilityEngine extends { getAlgoConfig(): infer R } ? R : never>;
}) {
  const broadcasts: Array<{ lobbyId: string; payload: Record<string, unknown> }> = [];
  const engine = new VolatilityEngine('lobby-1', {
    broadcastFn: async (lobbyId, payload) => {
      broadcasts.push({ lobbyId, payload });
    },
    algoConfig: overrides?.algoConfig,
  });
  return { engine, broadcasts };
}

function makeStandingsGap(overrides: Partial<LobbyStandingsGap> = {}): LobbyStandingsGap {
  return {
    lobby_id: 'lobby-1',
    topReturnPct: 30,
    bottomReturnPct: -5,
    gap: 35,
    traderCount: 20,
    roundElapsedPct: 0.5,
    ...overrides,
  };
}

const RAW_PRICES: Record<string, number> = {
  BTCUSDT: 60000,
  ETHUSDT: 3000,
  SOLUSDT: 150,
};

// ---------------------------------------------------------------------------
// applyModifier unit tests (legacy compat)
// ---------------------------------------------------------------------------

describe('applyModifier', () => {
  test('multiplier only', () => {
    expect(applyModifier(100, { multiplier: 0.85, offset: 0 })).toBe(85);
  });

  test('multiplier + offset', () => {
    expect(applyModifier(100, { multiplier: 1.1, offset: 5 })).toBeCloseTo(115);
  });

  test('clamps to zero for extreme crash', () => {
    expect(applyModifier(100, { multiplier: -0.5, offset: 0 })).toBe(0);
  });

  test('identity modifier', () => {
    expect(applyModifier(42000, { multiplier: 1, offset: 0 })).toBe(42000);
  });
});

// ---------------------------------------------------------------------------
// applyPriceModifier — exact math per event type
// ---------------------------------------------------------------------------

describe('applyPriceModifier', () => {
  function makeEvent(type: VolatilityEventType, magnitude: number = 0.15): ActiveEvent {
    return {
      id: 'test',
      lobby_id: 'lobby-1',
      type,
      status: 'active',
      asset: 'ALL',
      magnitude,
      duration_seconds: 60,
      trigger_mode: 'manual',
      triggered_at: Date.now(),
      completed_at: null,
      created_at: Date.now(),
    };
  }

  test('flash_crash reduces price by magnitude', () => {
    const event = makeEvent('circuit_breaker', 0.15);
    expect(applyPriceModifier(60000, event, 0)).toBe(60000 * 0.85);
    expect(applyPriceModifier(60000, event, 30)).toBe(60000 * 0.85);
  });

  test('moon_shot increases gradually over 60s', () => {
    const event = makeEvent('moon_shot', 0.2);
    expect(applyPriceModifier(60000, event, 0)).toBe(60000);
    expect(applyPriceModifier(60000, event, 30)).toBeCloseTo(60000 * (1 + 0.2 * 30 / 60));
    expect(applyPriceModifier(60000, event, 60)).toBeCloseTo(60000 * 1.2);
    // Caps at 60s
    expect(applyPriceModifier(60000, event, 120)).toBeCloseTo(60000 * 1.2);
  });

  test('volatility_spike oscillates within bounds', () => {
    const event = makeEvent('volatility_spike', 0.1);
    const prices: number[] = [];
    for (let t = 0; t < 60; t++) {
      prices.push(applyPriceModifier(60000, event, t));
    }
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    expect(minPrice).toBeGreaterThanOrEqual(60000 * 0.9);
    expect(maxPrice).toBeLessThanOrEqual(60000 * 1.1);
    // Should actually oscillate (not all the same)
    expect(maxPrice).toBeGreaterThan(minPrice);
  });

  test('dead_cat follows three-phase curve', () => {
    const event = makeEvent('dead_cat', 0.1);
    // Phase 1: 0-30s drop
    const phase1 = applyPriceModifier(60000, event, 15);
    expect(phase1).toBeCloseTo(60000 * (1 - 0.1));
    // Phase 2: 30-45s partial recovery
    const phase2 = applyPriceModifier(60000, event, 35);
    expect(phase2).toBeCloseTo(60000 * (1 - 0.1 * 0.4));
    // Phase 3: 45-60s harder drop
    const phase3 = applyPriceModifier(60000, event, 50);
    expect(phase3).toBeCloseTo(60000 * (1 - 0.1 * 1.3));
    // Phase 2 should be higher than Phase 1 (partial recovery)
    expect(phase2).toBeGreaterThan(phase1);
    // Phase 3 should be lowest
    expect(phase3).toBeLessThan(phase1);
  });

  test('non-price events return basePrice unchanged', () => {
    for (const type of ['margin_call', 'leverage_surge', 'wild_card', 'reversal', 'blackout'] as VolatilityEventType[]) {
      const event = makeEvent(type, 0.5);
      expect(applyPriceModifier(60000, event, 30)).toBe(60000);
    }
  });
});

// ---------------------------------------------------------------------------
// Event lifecycle: pending → active → complete
// ---------------------------------------------------------------------------

describe('event lifecycle', () => {
  test('triggerEvent creates event and activates it', () => {
    const { engine } = makeEngine();
    const event = engine.triggerEvent('circuit_breaker', 'BTCUSDT');

    expect(event.status).toBe('active');
    expect(event.triggered_at).not.toBeNull();
    expect(event.lobby_id).toBe('lobby-1');
    expect(event.type).toBe('circuit_breaker');
    expect(event.asset).toBe('BTCUSDT');
  });

  test('event auto-completes after duration', () => {
    const { engine } = makeEngine();
    const event = engine.triggerEvent('circuit_breaker', 'ALL', 0.1, 5000);

    expect(event.status).toBe('active');
    jest.advanceTimersByTime(5000);
    expect(event.status).toBe('complete');
    expect(event.completed_at).not.toBeNull();
    expect(engine.getActiveEvent()).toBeNull();
  });

  test('cancelActiveEvent completes immediately', () => {
    const { engine } = makeEngine();
    const event = engine.triggerEvent('moon_shot', 'ALL', 0.1, 60000);

    expect(event.status).toBe('active');
    engine.cancelActiveEvent();
    expect(event.status).toBe('complete');
    expect(engine.getActiveEvent()).toBeNull();
  });

  test('concurrent events: both stay active', () => {
    const { engine } = makeEngine();
    const first = engine.triggerEvent('circuit_breaker', 'ALL', 0.1, 60000);
    const second = engine.triggerEvent('moon_shot', 'ALL', 0.1, 60000);

    expect(first.status).toBe('active');
    expect(second.status).toBe('active');
    expect(engine.getActiveEvent()?.id).toBe(second.id);
  });

  test('getAllEvents returns all events', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('circuit_breaker');
    engine.triggerEvent('moon_shot');

    expect(engine.getAllEvents()).toHaveLength(2);
  });

  test('destroy clears everything', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('circuit_breaker');
    engine.destroy();

    expect(engine.getActiveEvent()).toBeNull();
    expect(engine.getAllEvents()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

describe('broadcast', () => {
  test('broadcasts on activation and completion', () => {
    const { engine, broadcasts } = makeEngine();
    engine.triggerEvent('circuit_breaker', 'ALL', 0.1, 3000);

    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].lobbyId).toBe('lobby-1');
    expect(broadcasts[0].payload.type).toBe('event_start');

    jest.advanceTimersByTime(3000);

    expect(broadcasts).toHaveLength(2);
    expect(broadcasts[1].payload.type).toBe('event_complete');
  });

  test('broadcast scoped to lobby_id', () => {
    const { engine, broadcasts } = makeEngine();
    engine.triggerEvent('blackout');

    expect(broadcasts[0].lobbyId).toBe('lobby-1');
    const payload = broadcasts[0].payload;
    const event = payload.event as Record<string, unknown>;
    expect(event.lobby_id).toBe('lobby-1');
  });
});

// ---------------------------------------------------------------------------
// Price middleware — getModifiedPrices
// ---------------------------------------------------------------------------

describe('getModifiedPrices', () => {
  test('returns raw prices when no active event', () => {
    const { engine } = makeEngine();
    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result).toEqual(RAW_PRICES);
  });

  test('applies modifier to targeted asset only', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('circuit_breaker', 'BTCUSDT', 0.1, 60000);

    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result.BTCUSDT).toBeLessThan(RAW_PRICES.BTCUSDT);
    expect(result.ETHUSDT).toBe(RAW_PRICES.ETHUSDT);
    expect(result.SOLUSDT).toBe(RAW_PRICES.SOLUSDT);
  });

  test('applies modifier to all assets with ALL', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('circuit_breaker', 'ALL', 0.1, 60000);

    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result.BTCUSDT).toBeLessThan(RAW_PRICES.BTCUSDT);
    expect(result.ETHUSDT).toBeLessThan(RAW_PRICES.ETHUSDT);
    expect(result.SOLUSDT).toBeLessThan(RAW_PRICES.SOLUSDT);
  });

  test('returns raw prices after event completes', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('circuit_breaker', 'ALL', 0.1, 3000);

    jest.advanceTimersByTime(3000);

    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result).toEqual(RAW_PRICES);
  });
});

// ---------------------------------------------------------------------------
// Each event type — modifier behaviour via ENGINE
// ---------------------------------------------------------------------------

describe('circuit_breaker via engine', () => {
  test('drops price by magnitude', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('circuit_breaker', 'ALL', 0.15, 60000);
    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result.BTCUSDT).toBeCloseTo(51000, -2);
  });

  test('magnitude 0 = no change', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('circuit_breaker', 'ALL', 0, 60000);
    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result.BTCUSDT).toBe(RAW_PRICES.BTCUSDT);
  });
});

describe('moon_shot via engine', () => {
  test('prices rise over time', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('moon_shot', 'ALL', 0.2, 60000);
    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result.BTCUSDT).toBeGreaterThanOrEqual(RAW_PRICES.BTCUSDT);
  });
});

describe('volatility_spike via engine', () => {
  test('price differs from base with oscillation', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('volatility_spike', 'BTCUSDT', 0.1, 60000);
    // Advance time so secondsElapsed > 0 for sin wave
    jest.advanceTimersByTime(2000);
    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result.BTCUSDT).not.toBe(RAW_PRICES.BTCUSDT);
    // ETH/SOL unaffected since targeted BTCUSDT only
    expect(result.ETHUSDT).toBe(RAW_PRICES.ETHUSDT);
    engine.destroy();
  });
});

describe('non-price events via engine', () => {
  test('leverage_surge: prices unchanged', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('leverage_surge', 'ALL', 0.5, 60000);
    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result).toEqual(RAW_PRICES);
  });

  test('reversal: prices unchanged but modifier has reverse flag', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('reversal', 'ALL', 0.5, 60000);
    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result).toEqual(RAW_PRICES);
    expect(engine.getActiveModifier()!.reverse_direction).toBe(true);
  });

  test('lockout: sets positionsLocked flag', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('blackout', 'ALL', 0.5, 60000);
    expect(engine.isPositionsLocked()).toBe(true);
    const result = engine.getModifiedPrices(RAW_PRICES);
    expect(result).toEqual(RAW_PRICES);
  });

  test('lockout: clears positionsLocked on complete', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('blackout', 'ALL', 0.5, 3000);
    expect(engine.isPositionsLocked()).toBe(true);
    jest.advanceTimersByTime(3000);
    expect(engine.isPositionsLocked()).toBe(false);
  });

  test('margin_call: getActiveModifier exposes clamp_leverage', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('margin_call', 'ALL', 0.5, 60000);
    const active = engine.getActiveModifier();
    expect(active).not.toBeNull();
    expect(active!.clamp_leverage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Algorithmic mode
// ---------------------------------------------------------------------------

describe('algorithmic mode', () => {
  test('does not fire when disabled', () => {
    const { engine } = makeEngine({ algoConfig: { enabled: false } });
    const result = engine.evaluateAlgoTrigger(makeStandingsGap());
    expect(result).toBeNull();
  });

  test('fires when enabled and conditions met', () => {
    const { engine } = makeEngine({
      algoConfig: { enabled: true, cooldown_ms: 0, gap_threshold: 25 },
    });
    const result = engine.evaluateAlgoTrigger(
      makeStandingsGap({ gap: 30, roundElapsedPct: 0.5 }),
    );
    expect(result).not.toBeNull();
    expect(result!.status).toBe('active');
  });

  test('does not fire before time window', () => {
    const { engine } = makeEngine({
      algoConfig: { enabled: true, cooldown_ms: 0, gap_threshold: 25, time_window_start: 0.3 },
    });
    const result = engine.evaluateAlgoTrigger(
      makeStandingsGap({ roundElapsedPct: 0.1, gap: 50 }),
    );
    expect(result).toBeNull();
  });

  test('does not fire after time window', () => {
    const { engine } = makeEngine({
      algoConfig: { enabled: true, cooldown_ms: 0, gap_threshold: 25, time_window_end: 0.8 },
    });
    const result = engine.evaluateAlgoTrigger(
      makeStandingsGap({ roundElapsedPct: 0.95, gap: 50 }),
    );
    expect(result).toBeNull();
  });

  test('does not fire below gap threshold', () => {
    const { engine } = makeEngine({
      algoConfig: { enabled: true, cooldown_ms: 0, gap_threshold: 40 },
    });
    const result = engine.evaluateAlgoTrigger(
      makeStandingsGap({ gap: 20, roundElapsedPct: 0.5 }),
    );
    expect(result).toBeNull();
  });

  test('respects cooldown (3min minimum)', () => {
    const { engine } = makeEngine({
      algoConfig: { enabled: true, cooldown_ms: 180000, gap_threshold: 25 },
    });

    const first = engine.evaluateAlgoTrigger(
      makeStandingsGap({ gap: 30, roundElapsedPct: 0.5 }),
    );
    expect(first).not.toBeNull();

    engine.cancelActiveEvent();

    const second = engine.evaluateAlgoTrigger(
      makeStandingsGap({ gap: 50, roundElapsedPct: 0.6 }),
    );
    expect(second).toBeNull();
  });

  test('does not fire while event already active', () => {
    const { engine } = makeEngine({
      algoConfig: { enabled: true, cooldown_ms: 0, gap_threshold: 25 },
    });
    engine.triggerEvent('circuit_breaker', 'ALL', 0.1, 60000);

    const result = engine.evaluateAlgoTrigger(
      makeStandingsGap({ gap: 50, roundElapsedPct: 0.5 }),
    );
    expect(result).toBeNull();
  });

  test('never repeats same event type in a round', () => {
    const { engine } = makeEngine({
      algoConfig: { enabled: true, cooldown_ms: 0, gap_threshold: 25 },
    });

    // Fire multiple events — each should be a different type
    const firedTypes: VolatilityEventType[] = [];
    for (let i = 0; i < 5; i++) {
      const result = engine.evaluateAlgoTrigger(
        makeStandingsGap({ gap: 45, roundElapsedPct: 0.5 + i * 0.05 }),
      );
      if (result) {
        firedTypes.push(result.type);
        engine.cancelActiveEvent();
        // Advance time past cooldown
        jest.advanceTimersByTime(1);
      }
    }

    // All fired types should be unique
    const uniqueTypes = new Set(firedTypes);
    expect(uniqueTypes.size).toBe(firedTypes.length);
  });

  test('picks flash_crash for late-round huge gap', () => {
    const { engine } = makeEngine({
      algoConfig: { enabled: true, cooldown_ms: 0, gap_threshold: 25 },
    });
    const result = engine.evaluateAlgoTrigger(
      makeStandingsGap({ gap: 45, roundElapsedPct: 0.8 }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('circuit_breaker');
  });

  test('picks reversal for large mid-round gap', () => {
    const { engine } = makeEngine({
      algoConfig: { enabled: true, cooldown_ms: 0, gap_threshold: 25 },
    });
    const result = engine.evaluateAlgoTrigger(
      makeStandingsGap({ gap: 38, roundElapsedPct: 0.4, traderCount: 5 }),
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('reversal');
  });

  test('setAlgoConfig updates configuration', () => {
    const { engine } = makeEngine();
    engine.setAlgoConfig({ enabled: true, gap_threshold: 50 });
    const config = engine.getAlgoConfig();
    expect(config.enabled).toBe(true);
    expect(config.gap_threshold).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Magnitude clamping
// ---------------------------------------------------------------------------

describe('magnitude clamping', () => {
  test('magnitude clamped to 0-1 range', () => {
    const { engine } = makeEngine();

    const low = engine.triggerEvent('circuit_breaker', 'ALL', -5, 60000);
    expect(low.magnitude).toBe(0);

    engine.cancelActiveEvent();

    const high = engine.triggerEvent('circuit_breaker', 'ALL', 10, 60000);
    expect(high.magnitude).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scoping to lobby_id
// ---------------------------------------------------------------------------

describe('lobby scoping', () => {
  test('events are scoped to lobby_id', () => {
    const b1: Array<{ lobbyId: string }> = [];
    const b2: Array<{ lobbyId: string }> = [];

    const engine1 = new VolatilityEngine('lobby-A', {
      broadcastFn: async (id) => { b1.push({ lobbyId: id }); },
    });
    const engine2 = new VolatilityEngine('lobby-B', {
      broadcastFn: async (id) => { b2.push({ lobbyId: id }); },
    });

    engine1.triggerEvent('circuit_breaker');
    engine2.triggerEvent('moon_shot');

    expect(b1).toHaveLength(1);
    expect(b1[0].lobbyId).toBe('lobby-A');
    expect(b2).toHaveLength(1);
    expect(b2[0].lobbyId).toBe('lobby-B');

    expect(engine1.getActiveEvent()!.type).toBe('circuit_breaker');
    expect(engine2.getActiveEvent()!.type).toBe('moon_shot');

    engine1.destroy();
    engine2.destroy();
  });

  test('event ids contain lobby_id', () => {
    const { engine } = makeEngine();
    const event = engine.triggerEvent('blackout');
    expect(event.id).toContain('lobby-1');
    engine.destroy();
  });
});

// ---------------------------------------------------------------------------
// All event types are defined
// ---------------------------------------------------------------------------

describe('event type coverage', () => {
  test('all 9 event types have definitions', () => {
    expect(VOLATILITY_EVENT_TYPES).toHaveLength(9);
    for (const type of VOLATILITY_EVENT_TYPES) {
      expect(EVENT_DEFINITIONS[type]).toBeDefined();
      expect(EVENT_DEFINITIONS[type].type).toBe(type);
      expect(EVENT_DEFINITIONS[type].default_duration_ms).toBeGreaterThan(0);
    }
  });

  test('all event types can be triggered', () => {
    const { engine } = makeEngine();
    for (const type of VOLATILITY_EVENT_TYPES) {
      const event = engine.triggerEvent(type, 'ALL', 0.5, 60000);
      expect(event.type).toBe(type);
      expect(event.status).toBe('active');
    }
    engine.destroy();
  });
});

// ---------------------------------------------------------------------------
// firedTypes tracking
// ---------------------------------------------------------------------------

describe('firedTypes tracking', () => {
  test('tracks all fired event types', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('circuit_breaker');
    engine.triggerEvent('moon_shot');
    engine.triggerEvent('blackout');

    const fired = engine.getFiredTypes();
    expect(fired).toContain('circuit_breaker');
    expect(fired).toContain('moon_shot');
    expect(fired).toContain('blackout');
    expect(fired).toHaveLength(3);
  });

  test('destroy clears firedTypes', () => {
    const { engine } = makeEngine();
    engine.triggerEvent('circuit_breaker');
    engine.destroy();
    expect(engine.getFiredTypes()).toHaveLength(0);
  });
});
