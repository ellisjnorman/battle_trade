import {
  PaperOnlyExecutor,
  PaperPlusOnchainExecutor,
  LiveExecutor,
  getExecutor,
  type TradeParams,
  type CloseParams,
  type SponsorApiConfig,
} from '@/lib/trade-executor';

// ---------------------------------------------------------------------------
// Mock Supabase — track calls by table name
// ---------------------------------------------------------------------------

type MockResult = { data: unknown; error: unknown; count?: number };

const mockResults: Record<string, MockResult[]> = {};
let callIndex: Record<string, number> = {};

function setMockResult(table: string, ...results: MockResult[]) {
  mockResults[table] = results;
  callIndex[table] = 0;
}

function getNextResult(table: string): MockResult {
  const results = mockResults[table] ?? [{ data: null, error: null }];
  const idx = callIndex[table] ?? 0;
  callIndex[table] = idx + 1;
  return results[idx] ?? results[results.length - 1];
}

const makeChain = (table: string) => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  let lastSelectHadCount = false;
  chain.select = jest.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
    lastSelectHadCount = !!(opts?.count);
    return chain;
  });
  chain.eq = jest.fn().mockImplementation(self);
  chain.is = jest.fn().mockImplementation(() => {
    if (lastSelectHadCount) {
      // Count query — return { count } directly
      const r = getNextResult(table);
      return r;
    }
    // Normal filter chain (e.g. .is('closed_at', null))
    return chain;
  });
  chain.insert = jest.fn().mockImplementation(self);
  chain.update = jest.fn().mockImplementation(self);
  chain.single = jest.fn().mockImplementation(() => {
    return Promise.resolve(getNextResult(table));
  });
  return chain;
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => makeChain(table)),
  },
}));

jest.mock('@/lib/pnl', () => ({
  calcUnrealizedPnl: jest.fn().mockReturnValue(100),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockResults).forEach((k) => delete mockResults[k]);
  callIndex = {};
});

// ---------------------------------------------------------------------------
// PaperOnlyExecutor
// ---------------------------------------------------------------------------

describe('PaperOnlyExecutor', () => {
  const executor = new PaperOnlyExecutor();

  const baseParams: TradeParams = {
    lobby_id: 'lobby-1',
    trader_id: 'trader-1',
    round_id: 'round-1',
    asset: 'BTCUSDT',
    direction: 'long',
    size_usd: 1000,
    entry_price: 50000,
    leverage: 2,
  };

  test('rejects locked out trader', async () => {
    setMockResult('sessions', {
      data: { positions_locked: true, frozen_asset: null },
      error: null,
    });

    const result = await executor.execute(baseParams);
    expect(result.success).toBe(false);
    expect(result.error).toBe('LOCKED_OUT');
  });

  test('rejects frozen asset trade', async () => {
    setMockResult('sessions', {
      data: { positions_locked: false, frozen_asset: 'ETHUSDT' },
      error: null,
    });

    const result = await executor.execute({
      ...baseParams,
      asset: 'BTCUSDT',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('ASSET_FROZEN');
  });

  test('rejects when max positions reached', async () => {
    setMockResult('sessions', {
      data: { positions_locked: false, frozen_asset: null },
      error: null,
    });
    setMockResult('positions', { data: null, error: null, count: 3 });

    const result = await executor.execute(baseParams);
    expect(result.success).toBe(false);
    expect(result.error).toBe('MAX_POSITIONS_REACHED');
  });

  test('skips sabotage checks for forced trades', async () => {
    setMockResult('positions',
      { data: null, error: null, count: 0 },
      { data: { id: 'pos-forced' }, error: null },
    );

    const result = await executor.execute({ ...baseParams, is_forced: true });
    expect(result.success).toBe(true);
    expect(result.position_id).toBe('pos-forced');
  });

  test('successful position creation', async () => {
    setMockResult('sessions', {
      data: { positions_locked: false, frozen_asset: null },
      error: null,
    });
    setMockResult('positions',
      { data: null, error: null, count: 0 },
      { data: { id: 'pos-new' }, error: null },
    );

    const result = await executor.execute(baseParams);
    expect(result.success).toBe(true);
    expect(result.position_id).toBe('pos-new');
  });

  test('closePosition calculates PnL and updates', async () => {
    setMockResult('positions',
      {
        data: {
          id: 'pos-1',
          symbol: 'BTCUSDT',
          direction: 'long',
          size: 1000,
          leverage: 2,
          entry_price: 50000,
          closed_at: null,
        },
        error: null,
      },
      { data: null, error: null }, // update result
    );

    const result = await executor.closePosition({
      position_id: 'pos-1',
      exit_price: 51000,
      lobby_id: 'lobby-1',
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PaperPlusOnchainExecutor
// ---------------------------------------------------------------------------

describe('PaperPlusOnchainExecutor', () => {
  const sponsorApi: SponsorApiConfig = {
    base_url: 'https://api.sponsor.test',
    api_key: 'test-key',
    testnet: true,
  };

  test('succeeds even if external API fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    setMockResult('sessions', {
      data: { positions_locked: false, frozen_asset: null },
      error: null,
    });
    setMockResult('positions',
      { data: null, error: null, count: 0 },
      { data: { id: 'pos-ext' }, error: null },
    );

    const executor = new PaperPlusOnchainExecutor(sponsorApi);
    const result = await executor.execute({
      lobby_id: 'lobby-1',
      trader_id: 'trader-1',
      round_id: 'round-1',
      asset: 'BTCUSDT',
      direction: 'long',
      size_usd: 1000,
      entry_price: 50000,
      leverage: 2,
    });

    expect(result.success).toBe(true);
    expect(result.position_id).toBe('pos-ext');
    expect(result.external_tx_id).toBeUndefined();
  });

  test('includes external_tx_id when API succeeds', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tx_id: 'tx-abc123' }),
    });

    setMockResult('sessions', {
      data: { positions_locked: false, frozen_asset: null },
      error: null,
    });
    setMockResult('positions',
      { data: null, error: null, count: 0 },
      { data: { id: 'pos-ext2' }, error: null },
    );

    const executor = new PaperPlusOnchainExecutor(sponsorApi);
    const result = await executor.execute({
      lobby_id: 'lobby-1',
      trader_id: 'trader-1',
      round_id: 'round-1',
      asset: 'BTCUSDT',
      direction: 'long',
      size_usd: 1000,
      entry_price: 50000,
      leverage: 2,
    });

    expect(result.success).toBe(true);
    expect(result.external_tx_id).toBe('tx-abc123');
  });
});

// ---------------------------------------------------------------------------
// LiveExecutor
// ---------------------------------------------------------------------------

describe('LiveExecutor', () => {
  test('is an instance of TradeExecutor', () => {
    const executor = new LiveExecutor();
    expect(executor).toBeDefined();
    expect(typeof executor.execute).toBe('function');
    expect(typeof executor.closePosition).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe('getExecutor', () => {
  test('defaults to PaperOnlyExecutor', () => {
    const executor = getExecutor({});
    expect(executor).toBeInstanceOf(PaperOnlyExecutor);
  });

  test('returns PaperOnlyExecutor for paper_only', () => {
    const executor = getExecutor({ trade_execution_mode: 'paper_only' });
    expect(executor).toBeInstanceOf(PaperOnlyExecutor);
  });

  test('returns PaperPlusOnchainExecutor with sponsor config', () => {
    const executor = getExecutor({
      trade_execution_mode: 'paper_plus_onchain',
      sponsor_api: { base_url: 'https://api.test', api_key: 'key', testnet: true },
    });
    expect(executor).toBeInstanceOf(PaperPlusOnchainExecutor);
  });

  test('returns PaperOnlyExecutor for paper_plus_onchain without sponsor config', () => {
    const executor = getExecutor({ trade_execution_mode: 'paper_plus_onchain' });
    expect(executor).toBeInstanceOf(PaperOnlyExecutor);
  });

  test('returns LiveExecutor for live mode', () => {
    const executor = getExecutor({ trade_execution_mode: 'live' });
    expect(executor).toBeInstanceOf(LiveExecutor);
  });
});
