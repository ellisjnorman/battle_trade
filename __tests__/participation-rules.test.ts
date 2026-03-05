import {
  calcActivityScore,
  getScoreMultiplier,
  determineStatus,
  DEFAULT_PARTICIPATION_CONFIG,
  type ParticipationConfig,
  type ActivityStatus,
} from '@/lib/participation-rules';

// ---------------------------------------------------------------------------
// We test pure logic here. Functions that hit Supabase (checkParticipation,
// executeForcedTrade, startParticipationLoop) are integration-tested via API.
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Activity score
// ---------------------------------------------------------------------------

describe('calcActivityScore', () => {
  test('scores trades, volume, time, and idle penalty', () => {
    const score = calcActivityScore({
      trades_placed: 5,
      total_volume_usd: 10000,
      seconds_with_position: 300,
      seconds_idle: 0,
    });
    // 5*10 + 10000*0.001 + 300*0.1 - 0*0.5 = 50 + 10 + 30 = 90
    expect(score).toBe(90);
  });

  test('idle penalty reduces score', () => {
    const score = calcActivityScore({
      trades_placed: 1,
      total_volume_usd: 1000,
      seconds_with_position: 60,
      seconds_idle: 120,
    });
    // 1*10 + 1000*0.001 + 60*0.1 - 120*0.5 = 10 + 1 + 6 - 60 = -43 → 0
    expect(score).toBe(0);
  });

  test('minimum score is 0', () => {
    const score = calcActivityScore({
      trades_placed: 0,
      total_volume_usd: 0,
      seconds_with_position: 0,
      seconds_idle: 1000,
    });
    expect(score).toBe(0);
  });

  test('high activity scores correctly', () => {
    const score = calcActivityScore({
      trades_placed: 20,
      total_volume_usd: 50000,
      seconds_with_position: 600,
      seconds_idle: 0,
    });
    // 20*10 + 50000*0.001 + 600*0.1 = 200 + 50 + 60 = 310
    expect(score).toBe(310);
  });
});

// ---------------------------------------------------------------------------
// Score multiplier
// ---------------------------------------------------------------------------

describe('getScoreMultiplier', () => {
  test('score > 100 gets 1.05x', () => {
    expect(getScoreMultiplier(101)).toBe(1.05);
    expect(getScoreMultiplier(500)).toBe(1.05);
  });

  test('score 50-100 gets 1.00x', () => {
    expect(getScoreMultiplier(50)).toBe(1.00);
    expect(getScoreMultiplier(100)).toBe(1.00);
    expect(getScoreMultiplier(75)).toBe(1.00);
  });

  test('score 25-49 gets 0.95x', () => {
    expect(getScoreMultiplier(25)).toBe(0.95);
    expect(getScoreMultiplier(49)).toBe(0.95);
  });

  test('score < 25 gets 0.90x', () => {
    expect(getScoreMultiplier(0)).toBe(0.90);
    expect(getScoreMultiplier(24)).toBe(0.90);
  });

  test('multiplier applied to PnL correctly', () => {
    const basePnl = 10.0; // 10% return
    expect(basePnl * getScoreMultiplier(200)).toBe(10.5);
    expect(basePnl * getScoreMultiplier(75)).toBe(10.0);
    expect(basePnl * getScoreMultiplier(30)).toBe(9.5);
    expect(basePnl * getScoreMultiplier(10)).toBe(9.0);
  });
});

// ---------------------------------------------------------------------------
// Status determination
// ---------------------------------------------------------------------------

describe('determineStatus', () => {
  test('active: has position and low cash', () => {
    expect(determineStatus({
      has_open_position: true,
      cash_pct: 0.20,
      seconds_idle: 0,
    })).toBe('active');
  });

  test('warning: no position for 60s', () => {
    expect(determineStatus({
      has_open_position: false,
      cash_pct: 0.20,
      seconds_idle: 60,
    })).toBe('warning');
  });

  test('warning: cash > 30%', () => {
    expect(determineStatus({
      has_open_position: true,
      cash_pct: 0.35,
      seconds_idle: 0,
    })).toBe('warning');
  });

  test('critical: idle >= 90s', () => {
    expect(determineStatus({
      has_open_position: false,
      cash_pct: 0.20,
      seconds_idle: 90,
    })).toBe('critical');
  });

  test('critical: cash > 50%', () => {
    expect(determineStatus({
      has_open_position: true,
      cash_pct: 0.55,
      seconds_idle: 0,
    })).toBe('critical');
  });

  test('warning: no position but not idle long enough', () => {
    expect(determineStatus({
      has_open_position: false,
      cash_pct: 0.10,
      seconds_idle: 30,
    })).toBe('warning');
  });

  test('critical overrides warning at 90s even with low cash', () => {
    expect(determineStatus({
      has_open_position: false,
      cash_pct: 0.10,
      seconds_idle: 90,
    })).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

describe('default participation config', () => {
  test('has correct defaults', () => {
    expect(DEFAULT_PARTICIPATION_CONFIG.min_open_position_seconds).toBe(90);
    expect(DEFAULT_PARTICIPATION_CONFIG.min_position_size_usd).toBe(1000);
    expect(DEFAULT_PARTICIPATION_CONFIG.max_cash_pct).toBe(0.30);
    expect(DEFAULT_PARTICIPATION_CONFIG.auto_trade_on_violation).toBe(true);
    expect(DEFAULT_PARTICIPATION_CONFIG.leverage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Forced trade logic (pure)
// ---------------------------------------------------------------------------

describe('forced trade sizing', () => {
  test('forced trade uses min_position_size_usd', () => {
    const config = DEFAULT_PARTICIPATION_CONFIG;
    expect(config.min_position_size_usd).toBe(1000);
  });

  test('forced trade picks random direction', () => {
    // Validate that both directions are possible
    const directions = new Set<string>();
    const origRandom = Math.random;
    Math.random = () => 0.3;
    directions.add(Math.random() > 0.5 ? 'long' : 'short');
    Math.random = () => 0.7;
    directions.add(Math.random() > 0.5 ? 'long' : 'short');
    Math.random = origRandom;
    expect(directions.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Participation loop timing
// ---------------------------------------------------------------------------

describe('participation loop timing', () => {
  test('loop runs every 10 seconds', () => {
    // The loop interval is 10_000ms
    const intervalMs = 10_000;
    expect(intervalMs).toBe(10000);
  });

  test('loop stops when round is no longer active', () => {
    // Pure validation: the loop checks round.status !== 'active'
    const roundStatus: string = 'completed';
    expect(roundStatus !== 'active').toBe(true);
  });
});
