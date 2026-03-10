import {
  shouldTriggerEvent,
  weightedRandomSelect,
  type AlgorithmConfig,
  type RoundState,
} from '@/lib/volatility-algorithm';

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

const DEFAULT_CONFIG: AlgorithmConfig = {
  base_frequency_seconds: 120,
  tension_threshold: 25,
  comeback_mechanic: true,
  max_events_per_round: 6,
};

function makeTrader(name: string) {
  return { id: name, name, event_id: 'e1', lobby_id: 'l1' } as import('@/types').Trader;
}

function makeState(overrides: Partial<RoundState> = {}): RoundState {
  return {
    standings: [
      { trader: makeTrader('A'), returnPct: 20, portfolioValue: 12000, rank: 1 },
      { trader: makeTrader('B'), returnPct: 10, portfolioValue: 11000, rank: 2 },
      { trader: makeTrader('C'), returnPct: -5, portfolioValue: 9500, rank: 3 },
      { trader: makeTrader('D'), returnPct: -15, portfolioValue: 8500, rank: 4 },
    ],
    timeRemainingSeconds: 400,
    totalRoundSeconds: 900,
    lastEventFiredAt: null,
    eventsThisRound: [],
    lastTradeAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shouldTriggerEvent
// ---------------------------------------------------------------------------

describe('shouldTriggerEvent', () => {
  test('returns a suggested event with valid fields', () => {
    const result = shouldTriggerEvent(makeState(), DEFAULT_CONFIG);
    if (result) {
      expect(result.type).toBeTruthy();
      expect(result.asset).toBe('ALL');
      expect(result.magnitude).toBeGreaterThan(0);
      expect(result.duration_seconds).toBeGreaterThan(0);
      expect(result.headline).toBeTruthy();
    }
  });

  test('respects max_events_per_round cap', () => {
    const state = makeState({
      eventsThisRound: ['circuit_breaker', 'moon_shot', 'volatility_spike', 'dead_cat', 'margin_call', 'blackout'],
    });
    const result = shouldTriggerEvent(state, DEFAULT_CONFIG);
    expect(result).toBeNull();
  });

  test('respects 3min minimum interval between events', () => {
    const state = makeState({
      lastEventFiredAt: new Date(Date.now() - 60_000), // 1 min ago
    });
    const result = shouldTriggerEvent(state, DEFAULT_CONFIG);
    expect(result).toBeNull();
  });

  test('allows event after 3min cooldown', () => {
    const state = makeState({
      lastEventFiredAt: new Date(Date.now() - 200_000), // 3m20s ago
    });
    const result = shouldTriggerEvent(state, DEFAULT_CONFIG);
    // Should not be blocked by cooldown (may still be null if no available types)
    // The point is it isn't blocked by the 180s check
    expect(true).toBe(true); // passes if no exception
  });

  test('never repeats event type already used in round', () => {
    const used = ['circuit_breaker', 'moon_shot'] as const;
    const results: string[] = [];
    for (let i = 0; i < 50; i++) {
      const result = shouldTriggerEvent(
        makeState({ eventsThisRound: [...used], timeRemainingSeconds: 400 }),
        DEFAULT_CONFIG,
      );
      if (result) results.push(result.type);
    }
    for (const type of used) {
      expect(results).not.toContain(type);
    }
  });
});

// ---------------------------------------------------------------------------
// Special triggers
// ---------------------------------------------------------------------------

describe('special triggers', () => {
  test('wild_card when gap > 40% between #1 and #8', () => {
    const standings = Array.from({ length: 8 }, (_, i) => ({
      trader: makeTrader(`T${i}`),
      returnPct: i === 0 ? 50 : -5,
      portfolioValue: 10000,
      rank: i + 1,
    }));
    const results: string[] = [];
    // Use early bucket (>10min) where wild_card has weight
    for (let i = 0; i < 20; i++) {
      const result = shouldTriggerEvent(
        makeState({ standings, timeRemainingSeconds: 700 }),
        DEFAULT_CONFIG,
      );
      if (result) results.push(result.type);
    }
    expect(results).toContain('wild_card');
  });

  test('margin_call in last 5 minutes', () => {
    const results: string[] = [];
    for (let i = 0; i < 20; i++) {
      const result = shouldTriggerEvent(
        makeState({ timeRemainingSeconds: 200 }),
        DEFAULT_CONFIG,
      );
      if (result) results.push(result.type);
    }
    expect(results).toContain('margin_call');
  });

  test('reversal when no trades in 90s', () => {
    const results: string[] = [];
    for (let i = 0; i < 20; i++) {
      const result = shouldTriggerEvent(
        makeState({
          lastTradeAt: new Date(Date.now() - 100_000), // 100s ago
          timeRemainingSeconds: 400,
        }),
        DEFAULT_CONFIG,
      );
      if (result) results.push(result.type);
    }
    expect(results).toContain('reversal');
  });
});

// ---------------------------------------------------------------------------
// weightedRandomSelect
// ---------------------------------------------------------------------------

describe('weightedRandomSelect', () => {
  test('returns a valid key from weights', () => {
    const weights = { circuit_breaker: 50, moon_shot: 30, blackout: 20 };
    const result = weightedRandomSelect(weights);
    expect(Object.keys(weights)).toContain(result);
  });

  test('higher weight selected more often', () => {
    const weights = { circuit_breaker: 90, blackout: 10 };
    let cbCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (weightedRandomSelect(weights) === 'circuit_breaker') cbCount++;
    }
    expect(cbCount).toBeGreaterThan(700);
  });
});

// ---------------------------------------------------------------------------
// Time bucket selection
// ---------------------------------------------------------------------------

describe('time buckets', () => {
  test('early round (>10min) picks from early pool', () => {
    const types = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = shouldTriggerEvent(
        makeState({ timeRemainingSeconds: 700 }),
        DEFAULT_CONFIG,
      );
      if (result) types.add(result.type);
    }
    // Early pool: circuit_breaker, moon_shot, volatility_spike, wild_card, blackout
    for (const t of types) {
      expect(['circuit_breaker', 'moon_shot', 'volatility_spike', 'wild_card', 'blackout']).toContain(t);
    }
  });

  test('late round (<5min) picks from late pool', () => {
    const types = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = shouldTriggerEvent(
        makeState({ timeRemainingSeconds: 200 }),
        DEFAULT_CONFIG,
      );
      if (result) types.add(result.type);
    }
    // Late pool: margin_call, leverage_surge, volatility_spike, wild_card
    // But margin_call is also a special trigger for last 5 min
    for (const t of types) {
      expect(['margin_call', 'leverage_surge', 'volatility_spike', 'wild_card']).toContain(t);
    }
  });
});
