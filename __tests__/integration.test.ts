/**
 * Integration tests for Battle Trade platform API routes.
 * Each test mocks Supabase responses to test critical user flows end-to-end.
 *
 * Mock strategy: We mock @/lib/supabase (anon client) and @/lib/supabase-server
 * (service-role client) at the module level. Each test sets up its own chain of
 * mock return values for `.from().select().eq()...` style calls.
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Supabase mock factory
// ---------------------------------------------------------------------------

type MockChain = {
  from: jest.Mock;
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  in: jest.Mock;
  gt: jest.Mock;
  not: jest.Mock;
  is: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  channel: jest.Mock;
  removeChannel: jest.Mock;
};

function createMockChain(): MockChain {
  const chain: MockChain = {} as MockChain;

  // Each method returns the chain for fluent API
  const methods: (keyof MockChain)[] = [
    'from', 'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'in', 'gt', 'not', 'is',
    'single', 'maybeSingle', 'order', 'limit',
  ];

  for (const method of methods) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }

  // Channel mocking for broadcasts
  chain.channel = jest.fn().mockReturnValue({
    subscribe: jest.fn((cb) => { cb('SUBSCRIBED'); return { unsubscribe: jest.fn() }; }),
    send: jest.fn().mockResolvedValue(undefined),
  });
  chain.removeChannel = jest.fn();

  return chain;
}

/**
 * Helper: configure the mock chain so that a specific sequence of
 * `.from(table)` calls return predetermined data.
 *
 * Usage:
 *   configureMock(mockChain, [
 *     { table: 'lobbies', method: 'single', result: { data: lobby, error: null } },
 *     { table: 'traders', method: 'single', result: { data: null, error: null } },
 *   ]);
 */
interface MockStep {
  table?: string;
  method: 'single' | 'maybeSingle' | 'select' | 'limit' | 'eq';
  result: { data?: unknown; error?: unknown; count?: number | null };
}

function configureMock(chain: MockChain, steps: MockStep[]) {
  let callIndex = 0;

  // Reset single/maybeSingle to return sequentially
  chain.single.mockImplementation(() => {
    while (callIndex < steps.length && steps[callIndex].method !== 'single') {
      callIndex++;
    }
    if (callIndex < steps.length) {
      const result = steps[callIndex].result;
      callIndex++;
      return Promise.resolve(result);
    }
    return Promise.resolve({ data: null, error: null });
  });

  chain.maybeSingle.mockImplementation(() => {
    while (callIndex < steps.length && steps[callIndex].method !== 'maybeSingle') {
      callIndex++;
    }
    if (callIndex < steps.length) {
      const result = steps[callIndex].result;
      callIndex++;
      return Promise.resolve(result);
    }
    return Promise.resolve({ data: null, error: null });
  });

  // For terminal calls that aren't single/maybeSingle (e.g. insert without .single())
  chain.insert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.neq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
}

/**
 * Simpler approach: mock from() to return a builder that resolves based on table name.
 */
function createTableMock(tableResults: Record<string, {
  select?: unknown;
  single?: unknown;
  maybeSingle?: unknown;
  insert?: unknown;
  update?: unknown;
  delete?: unknown;
  count?: number | null;
}>) {
  const mockClient = {
    channel: jest.fn().mockReturnValue({
      subscribe: jest.fn((cb: (status: string) => void) => { cb('SUBSCRIBED'); return { unsubscribe: jest.fn() }; }),
      send: jest.fn().mockResolvedValue(undefined),
    }),
    removeChannel: jest.fn(),
    from: jest.fn(),
  };

  mockClient.from.mockImplementation((table: string) => {
    const config = tableResults[table] ?? {};

    const builder: Record<string, jest.Mock> = {};
    const chainMethods = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'gt', 'not', 'is', 'order', 'limit'];

    for (const m of chainMethods) {
      builder[m] = jest.fn().mockReturnValue(builder);
    }

    // select with count option — create a special count-chain that resolves with count
    builder.select = jest.fn().mockImplementation((_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === 'exact') {
        const countResult = { data: null, count: config.count ?? 0, error: null };
        const countChain: Record<string, jest.Mock> = {};
        for (const cm of chainMethods) {
          countChain[cm] = jest.fn().mockResolvedValue(countResult);
        }
        return countChain;
      }
      return builder;
    });

    builder.single = jest.fn().mockResolvedValue(
      config.single ?? { data: null, error: null }
    );
    builder.maybeSingle = jest.fn().mockResolvedValue(
      config.maybeSingle ?? { data: null, error: null }
    );

    // For non-terminal calls that need resolution
    (builder as any).then = undefined; // Prevent auto-resolution

    return builder;
  });

  return mockClient;
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockSupabaseClient = createMockChain();

jest.mock('@/lib/supabase', () => ({
  supabase: new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      return (mockSupabaseClient as unknown as Record<string | symbol, unknown>)[prop];
    },
  }),
}));

const mockServerSupabaseClient = createMockChain();

jest.mock('@/lib/supabase-server', () => ({
  getServerSupabase: () =>
    new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        return (mockServerSupabaseClient as unknown as Record<string | symbol, unknown>)[prop];
      },
    }),
}));

// Mock validate-trader
jest.mock('@/lib/validate-trader', () => ({
  validateTraderInLobby: jest.fn(),
}));

// Mock lobby config
jest.mock('@/lib/lobby', () => ({
  getLobbyConfig: jest.fn(),
  getLobbyStandings: jest.fn(),
  getLobby: jest.fn(),
}));

// Mock trade executor
jest.mock('@/lib/trade-executor', () => ({
  getExecutor: jest.fn(),
}));

// Mock rate limiter to always allow
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn().mockReturnValue({ ok: true, remaining: 29 }),
  getClientIp: jest.fn().mockReturnValue('127.0.0.1'),
}));

// Mock entry-fees
jest.mock('@/lib/entry-fees', () => ({
  getEntryFee: jest.fn().mockReturnValue(0),
  chargeEntryFee: jest.fn().mockResolvedValue({ charged: false }),
  getEntryRakePct: jest.fn().mockReturnValue(20),
}));

// Mock sabotage
jest.mock('@/lib/sabotage', () => ({
  SABOTAGES: {
    blackout: { cost: 100, duration: 30 },
    freeze_asset: { cost: 150, duration: 60 },
    margin_call: { cost: 200, duration: null },
  },
  SABOTAGE_TYPES: ['blackout', 'freeze_asset', 'margin_call'],
  getCredits: jest.fn(),
  deductCredits: jest.fn(),
  addCredits: jest.fn(),
  checkCooldown: jest.fn(),
  checkDefense: jest.fn(),
  applySabotageEffect: jest.fn(),
}));

// Mock BTR
jest.mock('@/lib/btr', () => ({
  calculateBTR: jest.fn(),
  getBTRBreakdown: jest.fn(),
  applyDecay: jest.fn(),
  qualifiesForLeaderboard: jest.fn(),
  qualifiesForCopyTrading: jest.fn(),
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const UUID1 = '550e8400-e29b-41d4-a716-446655440001';
const UUID2 = '550e8400-e29b-41d4-a716-446655440002';
const UUID3 = '550e8400-e29b-41d4-a716-446655440003';
const UUID4 = '550e8400-e29b-41d4-a716-446655440004';
const LOBBY_ID = '550e8400-e29b-41d4-a716-446655440010';
const ROUND_ID = '550e8400-e29b-41d4-a716-446655440020';
const PROFILE_ID = '550e8400-e29b-41d4-a716-446655440030';

function makeRequest(url: string, body?: Record<string, unknown>, method = 'POST'): NextRequest {
  const init: RequestInit & { method: string } = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(new URL(url, 'http://localhost:3000'), init as any);
}

function resetAllMocks() {
  jest.clearAllMocks();

  // Reset chain methods to return chain by default
  const chainMethods: (keyof MockChain)[] = [
    'from', 'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'in', 'gt', 'not', 'is',
    'order', 'limit',
  ];
  for (const chain of [mockSupabaseClient, mockServerSupabaseClient]) {
    for (const method of chainMethods) {
      (chain[method] as jest.Mock).mockReturnValue(chain);
    }
    chain.single.mockResolvedValue({ data: null, error: null });
    chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  }
}

// ---------------------------------------------------------------------------
// 1. Join Lobby
// ---------------------------------------------------------------------------

describe('Join Lobby — POST /api/lobby/[id]/register', () => {
  let handler: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/lobby/[id]/register/route');
    handler = mod.POST;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('creates trader, session, and allocates credits on successful registration', async () => {
    const lobby = { id: LOBBY_ID, name: 'Test Battle', config: { starting_balance: 10000 } };
    const trader = { id: UUID1, name: 'TestTrader', code: 'ABC123' };
    const newProfile = { id: PROFILE_ID };

    // Mock sequence:
    // 1. lobbies.select.eq.single -> lobby found
    // 2. profiles.insert.select.single -> new profile created
    // 3. rounds.select.eq.order.limit.single -> no latest round
    // 4. traders.insert.select.single -> trader created
    // 5. sessions.insert -> success
    // 6. credit_allocations.insert -> success
    // 7. profiles.select.eq.single -> profile credits
    // 8. profiles.update.eq -> update credits

    let singleCallCount = 0;
    mockSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: lobby, error: null }); // lobby lookup
        case 2: return Promise.resolve({ data: newProfile, error: null }); // profile insert
        case 3: return Promise.resolve({ data: null, error: { code: 'PGRST116' } }); // no rounds
        case 4: return Promise.resolve({ data: trader, error: null }); // trader insert
        case 5: return Promise.resolve({ data: { credits: 0 }, error: null }); // profile credits
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    // sessions.insert (no .single) — resolves from the chain
    mockSupabaseClient.insert.mockReturnValue({
      ...mockSupabaseClient,
      select: mockSupabaseClient.select,
      error: null,
      then: (resolve: (val: unknown) => void) => resolve({ error: null }),
    });

    // Restore insert to return chain but with no error
    mockSupabaseClient.insert.mockImplementation(() => {
      return {
        select: jest.fn().mockReturnValue({
          single: mockSupabaseClient.single,
        }),
        error: null,
        then: undefined,
      };
    });

    // Need to re-mock insert to be both chainable and resolvable:
    // For insert().select().single() pattern AND insert() without .single()
    let insertCallCount = 0;
    mockSupabaseClient.insert.mockImplementation(() => {
      insertCallCount++;
      const result = {
        select: jest.fn().mockReturnValue({
          single: mockSupabaseClient.single,
          eq: jest.fn().mockReturnValue({
            single: mockSupabaseClient.single,
            maybeSingle: mockSupabaseClient.maybeSingle,
          }),
        }),
        error: null,
      };
      // For session insert (4th insert call), it's awaited directly
      if (insertCallCount === 3) {
        return { ...result, error: null } as unknown;
      }
      return result;
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/register`, {
      display_name: 'TestTrader',
      is_competitor: true,
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.trader_id).toBe(UUID1);
    expect(json.lobby_id).toBe(LOBBY_ID);
    expect(json.lobby_name).toBe('Test Battle');
    expect(json.display_name).toBe('TestTrader');
    expect(json.is_competitor).toBe(true);
    expect(json.credits).toBeDefined();
  });

  it('returns 404 when lobby not found', async () => {
    // Both UUID and invite_code lookups fail
    mockSupabaseClient.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const req = makeRequest(`http://localhost:3000/api/lobby/nonexistent/register`, {
      display_name: 'TestTrader',
    });

    const res = await handler(req, { params: Promise.resolve({ id: 'nonexistent' }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Lobby not found');
  });

  it('returns 400 for invalid display_name', async () => {
    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/register`, {
      display_name: '',
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    expect(res.status).toBe(400);
  });

  it('returns already registered trader if profile exists in lobby', async () => {
    const lobby = { id: LOBBY_ID, name: 'Test Battle', config: { starting_balance: 10000 } };
    const existingProfile = { id: PROFILE_ID };
    const existingTrader = { id: UUID1, code: 'XYZ789', is_competitor: true, name: 'Existing' };

    let singleCallCount = 0;
    mockSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: lobby, error: null }); // lobby lookup
        case 2: return Promise.resolve({ data: existingProfile, error: null }); // profile by handle
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: existingTrader, error: null,
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/register`, {
      display_name: 'TestTrader',
      handle: 'existing_handle',
      profile_id: PROFILE_ID,
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.already_registered).toBe(true);
    expect(json.trader_id).toBe(UUID1);
  });
});

// ---------------------------------------------------------------------------
// 2. Open Position
// ---------------------------------------------------------------------------

describe('Open Position — POST /api/lobby/[id]/positions', () => {
  let handler: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/lobby/[id]/positions/route');
    handler = mod.POST;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('creates position with correct fields', async () => {
    const { validateTraderInLobby } = require('@/lib/validate-trader');
    const { getLobbyConfig } = require('@/lib/lobby');
    const { getExecutor } = require('@/lib/trade-executor');

    validateTraderInLobby.mockResolvedValue({ id: UUID1, name: 'Trader1', lobby_id: LOBBY_ID, is_competitor: true });
    getLobbyConfig.mockResolvedValue({
      leverage_tiers: [5, 10, 20],
      available_symbols: ['BTC', 'ETH', 'SOL'],
      starting_balance: 10000,
    });

    const createdPosition = {
      id: UUID2,
      trader_id: UUID1,
      round_id: ROUND_ID,
      symbol: 'BTC',
      direction: 'long',
      size: 1000,
      leverage: 10,
      entry_price: 60000,
      status: 'open',
      opened_at: '2026-01-01T00:00:00Z',
    };

    getExecutor.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ success: true, position_id: UUID2 }),
    });

    // Mock round lookup + price lookup + position fetch
    let singleCallCount = 0;
    mockSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: { id: ROUND_ID }, error: null }); // round
        case 2: return Promise.resolve({ data: { price: 60000 }, error: null }); // price
        case 3: return Promise.resolve({ data: createdPosition, error: null }); // position fetch
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/positions`, {
      trader_id: UUID1,
      round_id: ROUND_ID,
      symbol: 'BTC',
      direction: 'long',
      size: 1000,
      leverage: 10,
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.id).toBe(UUID2);
    expect(json.symbol).toBe('BTC');
    expect(json.direction).toBe('long');
    expect(json.leverage).toBe(10);
    expect(json.entry_price).toBe(60000);
  });

  it('returns 403 for trader not in lobby', async () => {
    const { validateTraderInLobby } = require('@/lib/validate-trader');
    validateTraderInLobby.mockResolvedValue(null);

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/positions`, {
      trader_id: UUID1,
      round_id: ROUND_ID,
      symbol: 'BTC',
      direction: 'long',
      size: 1000,
      leverage: 10,
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Invalid trader for this lobby');
  });

  it('returns 400 for invalid leverage', async () => {
    const { validateTraderInLobby } = require('@/lib/validate-trader');
    const { getLobbyConfig } = require('@/lib/lobby');

    validateTraderInLobby.mockResolvedValue({ id: UUID1, name: 'Trader1', lobby_id: LOBBY_ID, is_competitor: true });
    getLobbyConfig.mockResolvedValue({
      leverage_tiers: [5, 10, 20],
      available_symbols: ['BTC', 'ETH', 'SOL'],
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/positions`, {
      trader_id: UUID1,
      round_id: ROUND_ID,
      symbol: 'BTC',
      direction: 'long',
      size: 1000,
      leverage: 50, // not in allowed tiers
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Leverage must be one of');
  });

  it('returns 400 for invalid symbol', async () => {
    const { validateTraderInLobby } = require('@/lib/validate-trader');
    const { getLobbyConfig } = require('@/lib/lobby');

    validateTraderInLobby.mockResolvedValue({ id: UUID1, name: 'Trader1', lobby_id: LOBBY_ID, is_competitor: true });
    getLobbyConfig.mockResolvedValue({
      leverage_tiers: [5, 10, 20],
      available_symbols: ['BTC', 'ETH'],
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/positions`, {
      trader_id: UUID1,
      round_id: ROUND_ID,
      symbol: 'DOGE',
      direction: 'long',
      size: 500,
      leverage: 5,
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Symbol not available in this lobby');
  });

  it('returns 400 for validation errors (negative size)', async () => {
    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/positions`, {
      trader_id: UUID1,
      round_id: ROUND_ID,
      symbol: 'BTC',
      direction: 'long',
      size: -100,
      leverage: 10,
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 3. Close Position
// ---------------------------------------------------------------------------

describe('Close Position — DELETE /api/lobby/[id]/positions', () => {
  let handler: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/lobby/[id]/positions/route');
    handler = mod.DELETE;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('closes open position with computed PnL', async () => {
    const openPosition = {
      id: UUID2,
      trader_id: UUID1,
      round_id: ROUND_ID,
      symbol: 'BTCUSDT',
      direction: 'long' as const,
      size: 1,
      leverage: 10,
      entry_price: 60000,
      exit_price: null,
      realized_pnl: null,
      opened_at: '2026-01-01T00:00:00Z',
      closed_at: null,
      order_type: 'market',
      limit_price: null,
      stop_price: null,
      trail_pct: null,
      trail_peak: null,
      status: 'open',
    };

    const closedPosition = {
      ...openPosition,
      exit_price: 62000,
      realized_pnl: 20000, // (62000-60000) * 1 * 10
      closed_at: '2026-01-01T01:00:00Z',
      status: 'closed',
    };

    let singleCallCount = 0;
    mockSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: { trader_id: UUID1, traders: { lobby_id: LOBBY_ID } }, error: null }); // lobby check
        case 2: return Promise.resolve({ data: null, error: { code: 'PGRST116' } }); // not pending
        case 3: return Promise.resolve({ data: openPosition, error: null }); // open position
        case 4: return Promise.resolve({ data: { price: 62000 }, error: null }); // price
        case 5: return Promise.resolve({ data: closedPosition, error: null }); // updated position
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/positions`, {
      position_id: UUID2,
    }, 'DELETE');

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.exit_price).toBe(62000);
    expect(json.realized_pnl).toBe(20000);
    expect(json.status).toBe('closed');
  });

  it('cancels pending limit order', async () => {
    const pendingOrder = {
      id: UUID2,
      status: 'pending',
      order_type: 'limit',
    };
    const cancelledOrder = {
      ...pendingOrder,
      status: 'cancelled',
      closed_at: '2026-01-01T00:00:00Z',
    };

    let singleCallCount = 0;
    mockSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: { trader_id: UUID1, traders: { lobby_id: LOBBY_ID } }, error: null }); // lobby check
        case 2: return Promise.resolve({ data: pendingOrder, error: null }); // pending found
        case 3: return Promise.resolve({ data: cancelledOrder, error: null }); // cancelled
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/positions`, {
      position_id: UUID2,
    }, 'DELETE');

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('cancelled');
  });

  it('returns 404 for non-existent position', async () => {
    mockSupabaseClient.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/positions`, {
      position_id: UUID2,
    }, 'DELETE');

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Position not found in this lobby');
  });

  it('returns 400 for missing position_id', async () => {
    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/positions`, {}, 'DELETE');

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Missing position_id');
  });
});

// ---------------------------------------------------------------------------
// 4. Leaderboard
// ---------------------------------------------------------------------------

describe('Leaderboard — GET /api/lobby/[id]/leaderboard', () => {
  let handler: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/lobby/[id]/leaderboard/route');
    handler = mod.GET;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('returns sorted standings with return percentages', async () => {
    const { getLobbyStandings } = require('@/lib/lobby');

    // Mock latest round lookup
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: { id: ROUND_ID },
      error: null,
    });

    getLobbyStandings.mockResolvedValue([
      {
        trader: { id: UUID1, name: 'Alice', team_id: null, is_eliminated: false },
        portfolioValue: 12000,
        returnPct: 20,
        rank: 1,
      },
      {
        trader: { id: UUID2, name: 'Bob', team_id: null, is_eliminated: false },
        portfolioValue: 10500,
        returnPct: 5,
        rank: 2,
      },
      {
        trader: { id: UUID3, name: 'Charlie', team_id: null, is_eliminated: false },
        portfolioValue: 8000,
        returnPct: -20,
        rank: 3,
      },
    ]);

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/leaderboard`, undefined, 'GET');

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.standings).toHaveLength(3);
    expect(json.standings[0].rank).toBe(1);
    expect(json.standings[0].returnPct).toBe(20);
    expect(json.standings[0].trader.name).toBe('Alice');
    expect(json.standings[1].rank).toBe(2);
    expect(json.standings[2].returnPct).toBe(-20);
  });

  it('returns empty standings when no rounds exist', async () => {
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116' },
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/leaderboard`, undefined, 'GET');

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.standings).toEqual([]);
  });

  it('enriches standings with team names', async () => {
    const { getLobbyStandings } = require('@/lib/lobby');
    const teamId = UUID4;

    mockSupabaseClient.single.mockResolvedValueOnce({
      data: { id: ROUND_ID },
      error: null,
    });

    getLobbyStandings.mockResolvedValue([
      {
        trader: { id: UUID1, name: 'Alice', team_id: teamId, is_eliminated: false },
        portfolioValue: 12000,
        returnPct: 20,
        rank: 1,
      },
    ]);

    // Mock teams lookup — this goes through the chain
    // The leaderboard route does supabase.from('teams').select('id, name').in('id', teamIds)
    // We need the chain to resolve when awaited
    const originalFrom = mockSupabaseClient.from;
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'teams') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: [{ id: teamId, name: 'Alpha Squad' }],
              error: null,
            }),
          }),
        };
      }
      return mockSupabaseClient;
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/leaderboard`, undefined, 'GET');

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.standings[0].teamName).toBe('Alpha Squad');

    // Restore
    mockSupabaseClient.from = originalFrom;
  });
});

// ---------------------------------------------------------------------------
// 5. Sabotage
// ---------------------------------------------------------------------------

describe('Sabotage — POST /api/lobby/[id]/sabotage', () => {
  let handler: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/lobby/[id]/sabotage/route');
    handler = mod.POST;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('deducts credits and creates sabotage record on success', async () => {
    const { validateTraderInLobby } = require('@/lib/validate-trader');
    const { getCredits, deductCredits, checkCooldown, checkDefense, applySabotageEffect } = require('@/lib/sabotage');

    validateTraderInLobby.mockResolvedValue({ id: UUID1, name: 'Attacker', lobby_id: LOBBY_ID, is_competitor: true });
    getCredits.mockResolvedValueOnce(500); // before deduction
    getCredits.mockResolvedValueOnce(400); // after deduction (remaining balance)
    deductCredits.mockResolvedValue(undefined);
    checkCooldown.mockResolvedValue({ onCooldown: false });
    checkDefense.mockResolvedValue({ shield: false, deflect: false });
    applySabotageEffect.mockResolvedValue(undefined);

    // Mock active round + target + sabotage insert
    let singleCallCount = 0;
    mockSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: { id: ROUND_ID }, error: null }); // active round
        case 2: return Promise.resolve({ data: { id: UUID2, name: 'Target', is_eliminated: false }, error: null }); // target
        case 3: return Promise.resolve({ data: { id: UUID3, type: 'blackout', status: 'active' }, error: null }); // sabotage record
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/sabotage`, {
      attacker_id: UUID1,
      target_id: UUID2,
      type: 'blackout',
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.result).toBe('success');
    expect(json.credits_remaining).toBe(400);
    expect(deductCredits).toHaveBeenCalledWith(UUID1, LOBBY_ID, 100);
    expect(applySabotageEffect).toHaveBeenCalled();
  });

  it('returns 400 for insufficient credits', async () => {
    const { validateTraderInLobby } = require('@/lib/validate-trader');
    const { getCredits, checkCooldown, checkDefense } = require('@/lib/sabotage');

    validateTraderInLobby.mockResolvedValue({ id: UUID1, name: 'Attacker', lobby_id: LOBBY_ID, is_competitor: true });
    getCredits.mockResolvedValue(50); // below blackout cost of 100
    checkCooldown.mockResolvedValue({ onCooldown: false });
    checkDefense.mockResolvedValue({ shield: false, deflect: false });

    // Mock active round + target
    let singleCallCount = 0;
    mockSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: { id: ROUND_ID }, error: null });
        case 2: return Promise.resolve({ data: { id: UUID2, name: 'Target', is_eliminated: false }, error: null });
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/sabotage`, {
      attacker_id: UUID1,
      target_id: UUID2,
      type: 'blackout',
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Insufficient credits');
    expect(json.required).toBe(100);
    expect(json.balance).toBe(50);
  });

  it('returns 400 when no active round', async () => {
    const { validateTraderInLobby } = require('@/lib/validate-trader');
    validateTraderInLobby.mockResolvedValue({ id: UUID1, name: 'Attacker', lobby_id: LOBBY_ID, is_competitor: true });

    mockSupabaseClient.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); // no active round

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/sabotage`, {
      attacker_id: UUID1,
      target_id: UUID2,
      type: 'blackout',
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('No active round');
  });

  it('returns 400 when targeting eliminated trader', async () => {
    const { validateTraderInLobby } = require('@/lib/validate-trader');
    validateTraderInLobby.mockResolvedValue({ id: UUID1, name: 'Attacker', lobby_id: LOBBY_ID, is_competitor: true });

    let singleCallCount = 0;
    mockSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: { id: ROUND_ID }, error: null }); // active round
        case 2: return Promise.resolve({ data: { id: UUID2, name: 'Target', is_eliminated: true }, error: null }); // eliminated target
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/sabotage`, {
      attacker_id: UUID1,
      target_id: UUID2,
      type: 'blackout',
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Cannot target eliminated trader');
  });

  it('returns 429 when on cooldown', async () => {
    const { validateTraderInLobby } = require('@/lib/validate-trader');
    const { getCredits, checkCooldown } = require('@/lib/sabotage');

    validateTraderInLobby.mockResolvedValue({ id: UUID1, name: 'Attacker', lobby_id: LOBBY_ID, is_competitor: true });
    getCredits.mockResolvedValue(500);
    checkCooldown.mockResolvedValue({ onCooldown: true, remainingSeconds: 15 });

    let singleCallCount = 0;
    mockSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: { id: ROUND_ID }, error: null });
        case 2: return Promise.resolve({ data: { id: UUID2, name: 'Target', is_eliminated: false }, error: null });
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/sabotage`, {
      attacker_id: UUID1,
      target_id: UUID2,
      type: 'blackout',
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBe('On cooldown');
    expect(json.remainingSeconds).toBe(15);
  });

  it('returns 400 for missing required fields', async () => {
    const req = makeRequest(`http://localhost:3000/api/lobby/${LOBBY_ID}/sabotage`, {
      attacker_id: UUID1,
      // missing target_id and type
    });

    const res = await handler(req, { params: Promise.resolve({ id: LOBBY_ID }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Missing required fields');
  });
});

// ---------------------------------------------------------------------------
// 6. Practice Mode
// ---------------------------------------------------------------------------

describe('Practice Mode — POST /api/lobbies/practice', () => {
  let handler: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/lobbies/practice/route');
    handler = mod.POST;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('creates lobby with auto_admin and registers bots', async () => {
    const lobbyId = LOBBY_ID;
    const humanTraderId = UUID1;

    let singleCallCount = 0;
    mockServerSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: { id: lobbyId }, error: null }); // lobby insert
        case 2: return Promise.resolve({ data: { id: humanTraderId }, error: null }); // human trader
        // Bot traders (default 3 bots)
        case 3: return Promise.resolve({ data: { id: UUID2 }, error: null });
        case 4: return Promise.resolve({ data: { id: UUID3 }, error: null });
        case 5: return Promise.resolve({ data: { id: UUID4 }, error: null });
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    // Insert without .single() (sessions, credit_allocations)
    mockServerSupabaseClient.insert.mockReturnValue({
      ...mockServerSupabaseClient,
      select: jest.fn().mockReturnValue({
        single: mockServerSupabaseClient.single,
      }),
      error: null,
    });

    const req = makeRequest('http://localhost:3000/api/lobbies/practice', {
      profile_id: PROFILE_ID,
      display_name: 'TestPlayer',
      bot_count: 3,
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.lobby_id).toBe(lobbyId);
    expect(json.trader_id).toBe(humanTraderId);
    expect(json.bot_count).toBe(3);
    expect(json.code).toBeDefined();
  });

  it('returns 400 when missing required fields', async () => {
    const req = makeRequest('http://localhost:3000/api/lobbies/practice', {
      display_name: 'TestPlayer',
      // missing profile_id
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('profile_id and display_name required');
  });

  it('clamps bot count to valid range', async () => {
    let singleCallCount = 0;
    mockServerSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      if (singleCallCount === 1) return Promise.resolve({ data: { id: LOBBY_ID }, error: null });
      return Promise.resolve({ data: { id: `uuid-${singleCallCount}` }, error: null });
    });

    mockServerSupabaseClient.insert.mockReturnValue({
      ...mockServerSupabaseClient,
      select: jest.fn().mockReturnValue({
        single: mockServerSupabaseClient.single,
      }),
      error: null,
    });

    const req = makeRequest('http://localhost:3000/api/lobbies/practice', {
      profile_id: PROFILE_ID,
      display_name: 'TestPlayer',
      bot_count: 100, // should be clamped to 7
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.bot_count).toBe(7);
  });

  it('returns 500 when lobby creation fails', async () => {
    mockServerSupabaseClient.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'DB error' },
    });

    const req = makeRequest('http://localhost:3000/api/lobbies/practice', {
      profile_id: PROFILE_ID,
      display_name: 'TestPlayer',
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('DB error');
  });
});

// ---------------------------------------------------------------------------
// 7. Quick Play
// ---------------------------------------------------------------------------

describe('Quick Play — POST /api/lobbies/quickplay', () => {
  let handler: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/lobbies/quickplay/route');
    handler = mod.POST;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('finds existing lobby with room and returns join action', async () => {
    const existingLobby = {
      id: LOBBY_ID,
      name: 'Open Battle',
      config: { entry_fee: 0 },
    };

    // Mock lobby search — .limit() resolves the lobby list
    mockServerSupabaseClient.limit.mockResolvedValueOnce({
      data: [existingLobby],
      error: null,
    });

    // Mock trader count — select({count}).eq().eq() chain
    // The route awaits the final .eq() in the count query.
    // We override .eq to track calls and resolve at the right time.
    let eqCount = 0;
    const origEq = mockServerSupabaseClient.eq;
    mockServerSupabaseClient.eq = jest.fn().mockImplementation((...args: unknown[]) => {
      eqCount++;
      // First 2 eq calls are from the lobby query (.eq('status').eq('is_public'))
      // Next 2 eq calls are from the trader count query (.eq('lobby_id').eq('is_competitor'))
      if (eqCount === 4) {
        // This is the terminal .eq('is_competitor', true) — resolve with count
        return Promise.resolve({ count: 3, data: null, error: null });
      }
      return mockServerSupabaseClient;
    });

    const req = makeRequest('http://localhost:3000/api/lobbies/quickplay', {
      profile_id: PROFILE_ID,
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.lobby_id).toBe(LOBBY_ID);
    expect(json.action).toBe('join');

    // Restore
    mockServerSupabaseClient.eq = origEq;
  });

  it('creates new lobby when none available', async () => {
    // No lobbies found
    mockServerSupabaseClient.limit.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    // New lobby created via .insert().select().single()
    mockServerSupabaseClient.single.mockResolvedValueOnce({
      data: { id: UUID1 },
      error: null,
    });

    const req = makeRequest('http://localhost:3000/api/lobbies/quickplay', {
      profile_id: PROFILE_ID,
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.lobby_id).toBe(UUID1);
    expect(json.action).toBe('created');
  });

  it('skips lobbies with entry fees', async () => {
    const paidLobby = {
      id: LOBBY_ID,
      name: 'Paid Battle',
      config: { entry_fee: 100 },
    };

    // Returns only a paid lobby
    mockServerSupabaseClient.limit.mockResolvedValueOnce({
      data: [paidLobby],
      error: null,
    });

    // Should skip paid and create new
    mockServerSupabaseClient.single.mockResolvedValueOnce({
      data: { id: UUID1 },
      error: null,
    });

    const req = makeRequest('http://localhost:3000/api/lobbies/quickplay', {});

    const res = await handler(req);
    const json = await res.json();

    expect(json.action).toBe('created');
  });
});

// ---------------------------------------------------------------------------
// 8. Guest Join
// ---------------------------------------------------------------------------

describe('Guest Join — POST /api/guest/join', () => {
  let handler: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/guest/join/route');
    handler = mod.POST;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('creates guest profile and registers trader', async () => {
    const guestId = UUID1;
    const lobby = { id: LOBBY_ID, name: 'Test Battle', config: { starting_balance: 10000 } };
    const newProfile = { id: PROFILE_ID };
    const newTrader = { id: UUID2 };

    let singleCallCount = 0;
    mockServerSupabaseClient.single.mockImplementation(() => {
      singleCallCount++;
      switch (singleCallCount) {
        case 1: return Promise.resolve({ data: lobby, error: null }); // lobby lookup
        case 2: return Promise.resolve({ data: newProfile, error: null }); // profile insert
        case 3: return Promise.resolve({ data: newTrader, error: null }); // trader insert
        case 4: return Promise.resolve({ data: { credits: 0 }, error: null }); // profile credits
        default: return Promise.resolve({ data: null, error: null });
      }
    });

    mockServerSupabaseClient.maybeSingle.mockImplementation(() => {
      // First call: no existing profile, second call: no latest round
      return Promise.resolve({ data: null, error: null });
    });

    // Non-single inserts
    mockServerSupabaseClient.insert.mockReturnValue({
      ...mockServerSupabaseClient,
      select: jest.fn().mockReturnValue({
        single: mockServerSupabaseClient.single,
      }),
      error: null,
    });

    const req = makeRequest('http://localhost:3000/api/guest/join', {
      lobby_id: LOBBY_ID,
      guest_id: guestId,
      display_name: 'GuestPlayer',
      is_competitor: true,
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.trader_id).toBe(UUID2);
    expect(json.lobby_id).toBe(LOBBY_ID);
    expect(json.profile_id).toBe(PROFILE_ID);
  });

  it('returns 400 when missing required fields', async () => {
    const req = makeRequest('http://localhost:3000/api/guest/join', {
      lobby_id: LOBBY_ID,
      // missing guest_id and display_name
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('Missing required fields');
  });

  it('returns 400 for invalid guest_id format', async () => {
    const req = makeRequest('http://localhost:3000/api/guest/join', {
      lobby_id: LOBBY_ID,
      guest_id: 'not-a-uuid',
      display_name: 'GuestPlayer',
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Invalid guest_id format');
  });

  it('returns 404 when lobby not found', async () => {
    mockServerSupabaseClient.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const req = makeRequest('http://localhost:3000/api/guest/join', {
      lobby_id: 'nonexistent-lobby-id',
      guest_id: UUID1,
      display_name: 'GuestPlayer',
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Lobby not found');
  });

  it('returns already_registered for existing guest in lobby', async () => {
    const lobby = { id: LOBBY_ID, name: 'Test Battle', config: { starting_balance: 10000 } };
    const existingProfile = { id: PROFILE_ID };
    const existingTrader = { id: UUID2, is_competitor: true, code: 'XYZ123' };

    mockServerSupabaseClient.single.mockResolvedValueOnce({ data: lobby, error: null });
    mockServerSupabaseClient.maybeSingle
      .mockResolvedValueOnce({ data: existingProfile, error: null }) // existing profile
      .mockResolvedValueOnce({ data: existingTrader, error: null }); // existing trader

    const req = makeRequest('http://localhost:3000/api/guest/join', {
      lobby_id: LOBBY_ID,
      guest_id: UUID1,
      display_name: 'GuestPlayer',
    });

    const res = await handler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.already_registered).toBe(true);
    expect(json.trader_id).toBe(UUID2);
  });
});

// ---------------------------------------------------------------------------
// 9. BTR Calculation
// ---------------------------------------------------------------------------

describe('BTR Calculation — GET /api/btr/[profileId]', () => {
  let handler: (req: NextRequest, ctx: { params: Promise<{ profileId: string }> }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/btr/[profileId]/route');
    handler = mod.GET;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('returns computed BTR with breakdown for player with history', async () => {
    const { calculateBTR, getBTRBreakdown, applyDecay, qualifiesForLeaderboard, qualifiesForCopyTrading } = require('@/lib/btr');

    const traders = [
      { id: UUID1, lobby_id: LOBBY_ID },
    ];

    const sessions = [
      {
        id: 'session-1',
        lobby_id: LOBBY_ID,
        trader_id: UUID1,
        starting_balance: 10000,
        final_balance: 15000,
        final_rank: 1,
        is_eliminated: false,
        created_at: '2026-01-01T00:00:00Z',
        traders: { id: UUID1, lobby_id: LOBBY_ID },
        lobbies: { id: LOBBY_ID, status: 'completed', config: {} },
      },
    ];

    const positions = [
      {
        id: 'pos-1',
        trader_id: UUID1,
        symbol: 'BTCUSDT',
        direction: 'long',
        size: 1,
        leverage: 10,
        entry_price: 60000,
        exit_price: 65000,
        realized_pnl: 5000,
        opened_at: '2026-01-01T00:00:00Z',
        closed_at: '2026-01-01T01:00:00Z',
        status: 'closed',
      },
    ];

    // Mock traders query
    const originalFrom = mockSupabaseClient.from;
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'traders') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: traders, error: null }),
          }),
        };
      }
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
            in: jest.fn().mockReturnValue({
              not: jest.fn().mockResolvedValue({ data: sessions, error: null }),
            }),
          }),
        };
      }
      if (table === 'positions') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: positions, error: null }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
          select: jest.fn().mockReturnValue({
            gt: jest.fn().mockResolvedValue({ count: 5, data: null, error: null }),
          }),
        };
      }
      return mockSupabaseClient;
    });

    const mockBreakdown = {
      win_rate: 80,
      sharpe: 65,
      consistency: 70,
      avg_roi: 75,
      max_drawdown: 85,
      battle_count: 30,
    };

    calculateBTR.mockReturnValue(1250);
    getBTRBreakdown.mockReturnValue(mockBreakdown);
    applyDecay.mockReturnValue(1250); // no decay
    qualifiesForLeaderboard.mockReturnValue(true);
    qualifiesForCopyTrading.mockReturnValue(false);

    const req = makeRequest(`http://localhost:3000/api/btr/${PROFILE_ID}`, undefined, 'GET');

    const res = await handler(req, { params: Promise.resolve({ profileId: PROFILE_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.btr).toBe(1250);
    expect(json.breakdown).toEqual(mockBreakdown);
    expect(json.battles).toBeGreaterThanOrEqual(1);
    expect(json.qualifies_leaderboard).toBe(true);
    expect(json.qualifies_copy_trading).toBe(false);
    expect(json.rank).toBe(6); // 5 profiles above + 1

    // Restore
    mockSupabaseClient.from = originalFrom;
  });

  it('returns zero BTR for player with no completed battles', async () => {
    const { getBTRBreakdown } = require('@/lib/btr');

    const emptyBreakdown = {
      win_rate: 0,
      sharpe: 0,
      consistency: 0,
      avg_roi: 0,
      max_drawdown: 0,
      battle_count: 0,
    };
    getBTRBreakdown.mockReturnValue(emptyBreakdown);

    // Mock traders query returning empty
    const originalFrom = mockSupabaseClient.from;
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'traders') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              not: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return mockSupabaseClient;
    });

    const req = makeRequest(`http://localhost:3000/api/btr/${PROFILE_ID}`, undefined, 'GET');

    const res = await handler(req, { params: Promise.resolve({ profileId: PROFILE_ID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.btr).toBe(0);
    expect(json.battles).toBe(0);
    expect(json.rank).toBeNull();
    expect(json.qualifies_leaderboard).toBe(false);
    expect(json.qualifies_copy_trading).toBe(false);

    mockSupabaseClient.from = originalFrom;
  });
});

// ---------------------------------------------------------------------------
// 10. Activity Feed
// ---------------------------------------------------------------------------

describe('Activity Feed — GET /api/activity', () => {
  let handler: () => Promise<Response>;

  beforeAll(async () => {
    const mod = await import('@/app/api/activity/route');
    handler = mod.GET;
  });

  beforeEach(() => {
    resetAllMocks();
  });

  it('returns real events from DB', async () => {
    const originalFrom = mockServerSupabaseClient.from;

    mockServerSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [
                    {
                      starting_balance: 10000,
                      final_balance: 15000,
                      traders: { name: 'Alice', lobby_id: LOBBY_ID, lobbies: { name: 'Grand Battle' } },
                    },
                    {
                      starting_balance: 10000,
                      final_balance: 7000,
                      traders: { name: 'Bob', lobby_id: LOBBY_ID, lobbies: { name: 'Grand Battle' } },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'sabotages') {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  {
                    type: 'blackout',
                    attacker: { name: 'Alice' },
                    target: { name: 'Bob' },
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'lobbies') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: 2,
              data: null,
              error: null,
            }),
          }),
        };
      }
      return mockServerSupabaseClient;
    });

    const res = await handler();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.events).toBeDefined();
    expect(Array.isArray(json.events)).toBe(true);
    expect(json.events.length).toBeGreaterThan(0);

    // Verify event content
    const events = json.events as string[];
    const hasReturnEvent = events.some((e) => e.includes('Alice') && e.includes('+50%'));
    const hasLossEvent = events.some((e) => e.includes('Bob') && e.includes('-30%'));
    const hasSabotageEvent = events.some((e) => e.includes('blackout'));
    const hasLiveCount = events.some((e) => e.includes('2 battles'));

    expect(hasReturnEvent).toBe(true);
    expect(hasLossEvent).toBe(true);
    expect(hasSabotageEvent).toBe(true);
    expect(hasLiveCount).toBe(true);

    mockServerSupabaseClient.from = originalFrom;
  });

  it('returns empty events when no activity exists', async () => {
    const originalFrom = mockServerSupabaseClient.from;

    mockServerSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'sabotages') {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'lobbies') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 0, data: null, error: null }),
          }),
        };
      }
      return mockServerSupabaseClient;
    });

    const res = await handler();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.events).toEqual([]);

    mockServerSupabaseClient.from = originalFrom;
  });

  it('filters out small return percentages (< 5%)', async () => {
    const originalFrom = mockServerSupabaseClient.from;

    mockServerSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: [
                    {
                      starting_balance: 10000,
                      final_balance: 10200, // +2%, should be filtered
                      traders: { name: 'SmallGains', lobby_id: LOBBY_ID, lobbies: { name: 'Battle' } },
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'sabotages') {
        return {
          select: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'lobbies') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ count: 0, data: null, error: null }),
          }),
        };
      }
      return mockServerSupabaseClient;
    });

    const res = await handler();
    const json = await res.json();

    expect(res.status).toBe(200);
    // The +2% event should be filtered out
    const events = json.events as string[];
    const hasSmallGains = events.some((e) => e.includes('SmallGains'));
    expect(hasSmallGains).toBe(false);

    mockServerSupabaseClient.from = originalFrom;
  });
});
