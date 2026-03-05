import {
  deriveOddsFromStandings,
  recalcProbabilities,
  NotImplementedError,
  PolymarketProvider,
  KalshiProvider,
  OnChainProvider,
  getProvider,
} from '@/lib/prediction-markets';

// ---------------------------------------------------------------------------
// deriveOddsFromStandings — pure function tests (no Supabase)
// ---------------------------------------------------------------------------

describe('deriveOddsFromStandings', () => {
  const teams = [
    { id: 't1', name: 'Alpha', rank: 1, returnPct: 30 },
    { id: 't2', name: 'Beta', rank: 2, returnPct: 15 },
    { id: 't3', name: 'Gamma', rank: 3, returnPct: -5 },
    { id: 't4', name: 'Delta', rank: 4, returnPct: -10 },
  ];

  test('probabilities always sum to 1.0', () => {
    const outcomes = deriveOddsFromStandings(teams, 200, 600);
    const sum = outcomes.reduce((s, o) => s + o.probability, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  test('returns correct number of outcomes', () => {
    const outcomes = deriveOddsFromStandings(teams, 200, 600);
    expect(outcomes).toHaveLength(4);
  });

  test('returns empty array for empty teams', () => {
    const outcomes = deriveOddsFromStandings([], 200, 600);
    expect(outcomes).toHaveLength(0);
  });

  test('odds are inverse of probability', () => {
    const outcomes = deriveOddsFromStandings(teams, 200, 600);
    for (const o of outcomes) {
      expect(o.odds).toBeCloseTo(Math.round((1 / o.probability) * 10) / 10, 0);
    }
  });

  test('odds tighten as round progresses (late round more data-driven)', () => {
    // Early round — more uniform odds
    const early = deriveOddsFromStandings(teams, 590, 600);
    const earlySpread = Math.max(...early.map((o) => o.probability)) - Math.min(...early.map((o) => o.probability));

    // Late round — more divergent odds
    const late = deriveOddsFromStandings(teams, 10, 600);
    const lateSpread = Math.max(...late.map((o) => o.probability)) - Math.min(...late.map((o) => o.probability));

    // Late round should generally have larger spread (more opinionated odds)
    // This is probabilistic due to random factor, so we test over multiple runs
    let lateWins = 0;
    for (let i = 0; i < 50; i++) {
      const e = deriveOddsFromStandings(teams, 590, 600);
      const eSpread = Math.max(...e.map((o) => o.probability)) - Math.min(...e.map((o) => o.probability));
      const l = deriveOddsFromStandings(teams, 10, 600);
      const lSpread = Math.max(...l.map((o) => o.probability)) - Math.min(...l.map((o) => o.probability));
      if (lSpread > eSpread) lateWins++;
    }
    // Late round should have wider spread more often than not
    expect(lateWins).toBeGreaterThan(25);
  });

  test('each outcome has team_id and team_name', () => {
    const outcomes = deriveOddsFromStandings(teams, 200, 600);
    for (const o of outcomes) {
      expect(o.team_id).toBeTruthy();
      expect(o.team_name).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Provider stubs throw NotImplementedError
// ---------------------------------------------------------------------------

describe('provider stubs', () => {
  test('PolymarketProvider throws NotImplementedError', async () => {
    const provider = new PolymarketProvider();
    await expect(provider.getMarket('x')).rejects.toThrow(NotImplementedError);
    await expect(provider.placeBet({ bettor_id: '', market_id: '', outcome_id: '', amount_credits: 0 })).rejects.toThrow(NotImplementedError);
    await expect(provider.resolveMarket('x', 'y')).rejects.toThrow(NotImplementedError);
  });

  test('KalshiProvider throws NotImplementedError', async () => {
    const provider = new KalshiProvider();
    await expect(provider.getMarket('x')).rejects.toThrow(NotImplementedError);
    await expect(provider.placeBet({ bettor_id: '', market_id: '', outcome_id: '', amount_credits: 0 })).rejects.toThrow(NotImplementedError);
    await expect(provider.resolveMarket('x', 'y')).rejects.toThrow(NotImplementedError);
  });

  test('OnChainProvider throws NotImplementedError', async () => {
    const provider = new OnChainProvider();
    await expect(provider.getMarket('x')).rejects.toThrow(NotImplementedError);
    await expect(provider.placeBet({ bettor_id: '', market_id: '', outcome_id: '', amount_credits: 0 })).rejects.toThrow(NotImplementedError);
    await expect(provider.resolveMarket('x', 'y')).rejects.toThrow(NotImplementedError);
  });

  test('OnChainProvider has Monad testnet config', () => {
    const provider = new OnChainProvider();
    expect(provider.chainId).toBe(10143);
    expect(provider.contractAddress).toBe('0x0000000000000000000000000000000000000000');
  });

  test('OnChainProvider accepts custom contract address', () => {
    const provider = new OnChainProvider('0x1234567890abcdef1234567890abcdef12345678');
    expect(provider.contractAddress).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });
});

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

describe('getProvider', () => {
  test('returns MockProvider for mock', () => {
    const p = getProvider('mock');
    expect(p.constructor.name).toBe('MockProvider');
  });

  test('returns PolymarketProvider for polymarket', () => {
    const p = getProvider('polymarket');
    expect(p.constructor.name).toBe('PolymarketProvider');
  });

  test('returns KalshiProvider for kalshi', () => {
    const p = getProvider('kalshi');
    expect(p.constructor.name).toBe('KalshiProvider');
  });

  test('returns OnChainProvider for onchain', () => {
    const p = getProvider('onchain');
    expect(p.constructor.name).toBe('OnChainProvider');
  });
});
