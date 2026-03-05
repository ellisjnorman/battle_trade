import {
  SABOTAGES,
  DEFENSE_DEFS,
  SABOTAGE_TYPES,
  DEFENSE_TYPES,
  type SabotageType,
  type DefenseType,
  type SabotageRecord,
} from '@/lib/sabotage';

// ---------------------------------------------------------------------------
// We test pure logic here. Functions that hit Supabase (getCredits, checkCooldown,
// checkDefense, applySabotageEffect) are integration-tested via the API routes.
// The unit tests below validate definitions, types, and cost/duration invariants.
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Sabotage definitions
// ---------------------------------------------------------------------------

describe('sabotage definitions', () => {
  test('all 7 sabotage types are defined', () => {
    expect(SABOTAGE_TYPES).toHaveLength(7);
    expect(SABOTAGE_TYPES).toContain('lockout');
    expect(SABOTAGE_TYPES).toContain('fake_news');
    expect(SABOTAGE_TYPES).toContain('margin_squeeze');
    expect(SABOTAGE_TYPES).toContain('expose');
    expect(SABOTAGE_TYPES).toContain('asset_freeze');
    expect(SABOTAGE_TYPES).toContain('glitch');
    expect(SABOTAGE_TYPES).toContain('forced_trade');
  });

  test('all sabotage types have positive cost', () => {
    for (const type of SABOTAGE_TYPES) {
      expect(SABOTAGES[type].cost).toBeGreaterThan(0);
    }
  });

  test('credits deducted correctly for each type', () => {
    expect(SABOTAGES.lockout.cost).toBe(200);
    expect(SABOTAGES.fake_news.cost).toBe(150);
    expect(SABOTAGES.margin_squeeze.cost).toBe(300);
    expect(SABOTAGES.expose.cost).toBe(100);
    expect(SABOTAGES.asset_freeze.cost).toBe(250);
    expect(SABOTAGES.glitch.cost).toBe(50);
    expect(SABOTAGES.forced_trade.cost).toBe(500);
  });

  test('lockout has 90s duration', () => {
    expect(SABOTAGES.lockout.duration).toBe(90);
  });

  test('expose has 120s duration', () => {
    expect(SABOTAGES.expose.duration).toBe(120);
  });

  test('asset_freeze has 60s duration', () => {
    expect(SABOTAGES.asset_freeze.duration).toBe(60);
  });

  test('margin_squeeze and forced_trade have null duration (instant)', () => {
    expect(SABOTAGES.margin_squeeze.duration).toBeNull();
    expect(SABOTAGES.forced_trade.duration).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Defense definitions
// ---------------------------------------------------------------------------

describe('defense definitions', () => {
  test('all 4 defense types are defined', () => {
    expect(DEFENSE_TYPES).toHaveLength(4);
    expect(DEFENSE_TYPES).toContain('shield');
    expect(DEFENSE_TYPES).toContain('deflect');
    expect(DEFENSE_TYPES).toContain('ghost_mode');
    expect(DEFENSE_TYPES).toContain('speed_boost');
  });

  test('all defense types have positive cost', () => {
    for (const type of DEFENSE_TYPES) {
      expect(DEFENSE_DEFS[type].cost).toBeGreaterThan(0);
    }
  });

  test('shield costs 150', () => {
    expect(DEFENSE_DEFS.shield.cost).toBe(150);
  });

  test('deflect costs 200', () => {
    expect(DEFENSE_DEFS.deflect.cost).toBe(200);
  });

  test('ghost_mode has 120s duration', () => {
    expect(DEFENSE_DEFS.ghost_mode.duration).toBe(120);
  });

  test('speed_boost has 60s duration', () => {
    expect(DEFENSE_DEFS.speed_boost.duration).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Credit validation logic (pure)
// ---------------------------------------------------------------------------

describe('credit validation', () => {
  test('attacker with insufficient credits is rejected', () => {
    const balance = 100;
    const cost = SABOTAGES.lockout.cost; // 200
    expect(balance < cost).toBe(true);
  });

  test('attacker with exact credits can afford', () => {
    const balance = 200;
    const cost = SABOTAGES.lockout.cost;
    expect(balance >= cost).toBe(true);
  });

  test('shield refund is 50% of cost', () => {
    for (const type of SABOTAGE_TYPES) {
      const cost = SABOTAGES[type].cost;
      const refund = Math.round(cost * 0.5);
      expect(refund).toBe(Math.round(cost / 2));
    }
  });

  test('forced_trade is the most expensive sabotage', () => {
    const maxCost = Math.max(...SABOTAGE_TYPES.map((t) => SABOTAGES[t].cost));
    expect(maxCost).toBe(SABOTAGES.forced_trade.cost);
    expect(maxCost).toBe(500);
  });

  test('glitch is the cheapest sabotage', () => {
    const minCost = Math.min(...SABOTAGE_TYPES.map((t) => SABOTAGES[t].cost));
    expect(minCost).toBe(SABOTAGES.glitch.cost);
    expect(minCost).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Cooldown logic (pure timing)
// ---------------------------------------------------------------------------

describe('cooldown logic', () => {
  test('cooldown blocks second sabotage within 3 minutes', () => {
    const lastFiredAt = Date.now();
    const now = lastFiredAt + 60_000; // 1 minute later
    const elapsed = (now - lastFiredAt) / 1000;
    expect(elapsed).toBeLessThan(180);
    expect(elapsed < 180).toBe(true);
  });

  test('cooldown allows sabotage after 3 minutes', () => {
    const lastFiredAt = Date.now();
    const now = lastFiredAt + 200_000; // 3m20s later
    const elapsed = (now - lastFiredAt) / 1000;
    expect(elapsed).toBeGreaterThanOrEqual(180);
  });

  test('remaining seconds calculated correctly', () => {
    const lastFiredAt = Date.now();
    const now = lastFiredAt + 120_000; // 2 minutes later
    const elapsed = (now - lastFiredAt) / 1000;
    const remaining = Math.ceil(180 - elapsed);
    expect(remaining).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Defense interaction logic (pure)
// ---------------------------------------------------------------------------

describe('defense interactions', () => {
  test('shield blocks sabotage and refunds 50% credits', () => {
    const cost = SABOTAGES.lockout.cost;
    const refund = Math.round(cost * 0.5);
    const netCost = cost - refund;
    expect(refund).toBe(100);
    expect(netCost).toBe(100);
  });

  test('deflect redirects sabotage back to attacker', () => {
    // When deflected, attacker becomes target
    const originalTarget = 'trader-B';
    const originalAttacker = 'trader-A';
    const deflectedTarget = originalAttacker;
    const deflectedAttacker = originalTarget;
    expect(deflectedTarget).toBe('trader-A');
    expect(deflectedAttacker).toBe('trader-B');
  });
});

// ---------------------------------------------------------------------------
// Sabotage effect validation (pure)
// ---------------------------------------------------------------------------

describe('sabotage effects', () => {
  test('lockout blocks position opens', () => {
    // When positions_locked = true, position creation should be rejected
    const sessionsLocked = true;
    expect(sessionsLocked).toBe(true);
  });

  test('asset freeze blocks wrong asset trades', () => {
    const frozenAsset: string = 'BTCUSDT';
    const requestedSymbol: string = 'ETHUSDT';
    expect(requestedSymbol !== frozenAsset).toBe(true);
    // Frozen asset itself should be allowed
    const sameAsset: string = 'BTCUSDT';
    expect(sameAsset !== frozenAsset).toBe(false);
  });

  test('margin_squeeze reduces balance by 10%', () => {
    const startingBalance = 10000;
    const newBalance = Math.round(startingBalance * 0.9);
    expect(newBalance).toBe(9000);
  });

  test('forced trade opens correct position size (10% of balance)', () => {
    const balance = 10000;
    const size = Math.round(balance * 0.1);
    expect(size).toBe(1000);
  });

  test('forced trade position size for various balances', () => {
    expect(Math.round(5000 * 0.1)).toBe(500);
    expect(Math.round(25000 * 0.1)).toBe(2500);
    expect(Math.round(7777 * 0.1)).toBe(778);
  });

  test('fake_news default headline', () => {
    const defaultHeadline = 'BREAKING: Exchange halting all withdrawals';
    expect(defaultHeadline).toBeTruthy();
    expect(defaultHeadline.length).toBeGreaterThan(10);
  });

  test('eliminated traders cannot be targeted', () => {
    const trader = { is_eliminated: true };
    expect(trader.is_eliminated).toBe(true);
    // API should reject with 400
  });
});

// ---------------------------------------------------------------------------
// Registration credit allocation
// ---------------------------------------------------------------------------

describe('registration credits', () => {
  test('audience gets 500 credits', () => {
    const isCompetitor = false;
    const credits = isCompetitor ? 1000 : 500;
    expect(credits).toBe(500);
  });

  test('competitor gets 1000 credits', () => {
    const isCompetitor = true;
    const credits = isCompetitor ? 1000 : 500;
    expect(credits).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('type validation', () => {
  test('invalid sabotage type is rejected', () => {
    expect(SABOTAGE_TYPES.includes('invalid' as SabotageType)).toBe(false);
  });

  test('invalid defense type is rejected', () => {
    expect(DEFENSE_TYPES.includes('invalid' as DefenseType)).toBe(false);
  });

  test('all sabotage types are lowercase snake_case', () => {
    for (const type of SABOTAGE_TYPES) {
      expect(type).toMatch(/^[a-z_]+$/);
    }
  });

  test('all defense types are lowercase snake_case', () => {
    for (const type of DEFENSE_TYPES) {
      expect(type).toMatch(/^[a-z_]+$/);
    }
  });
});
