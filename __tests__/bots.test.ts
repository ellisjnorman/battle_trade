/**
 * Bot trading engine tests
 */

const mockFrom = jest.fn();
const mockRpc = jest.fn();

// Mock supabase-server
jest.mock('../lib/supabase-server', () => ({
  getServerSupabase: jest.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

// Mock supabase (browser client used by PaperOnlyExecutor)
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => {
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.insert = jest.fn().mockReturnValue(chain);
      chain.update = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.is = jest.fn().mockReturnValue(chain);
      chain.single = jest.fn().mockResolvedValue({ data: { id: 'pos-1' }, count: 0 });
      return chain;
    }),
  },
}));

import { tickBots } from '../lib/bots';

function makeChain(resolveValue: unknown = { data: null }) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.neq = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.not = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockResolvedValue(resolveValue);
  // For queries that don't call .single()
  chain.then = jest.fn((cb) => cb(resolveValue));
  return chain;
}

describe('Bot Trading Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should exit early when no bot traders found', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'traders') {
        return makeChain({ data: [] });
      }
      return makeChain();
    });

    await tickBots('lobby-1', 'round-1');
    // Verify traders table was queried
    expect(mockFrom).toHaveBeenCalledWith('traders');
    // Should not query prices since no bots
    const calls = mockFrom.mock.calls.map((c: string[]) => c[0]);
    expect(calls).not.toContain('prices');
  });

  it('should exit early when no prices available', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'traders') {
        const chain = makeChain({ data: [{ id: 'bot-1', name: 'SatoshiBot', is_eliminated: false }] });
        return chain;
      }
      if (table === 'prices') {
        return makeChain({ data: [] });
      }
      return makeChain();
    });

    await tickBots('lobby-1', 'round-1');
    const calls = mockFrom.mock.calls.map((c: string[]) => c[0]);
    expect(calls).toContain('traders');
    expect(calls).toContain('prices');
  });

  it('should query lobby config when bots and prices exist', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'traders') {
        return makeChain({ data: [{ id: 'bot-1', name: 'SatoshiBot', is_eliminated: false }] });
      }
      if (table === 'prices') {
        return makeChain({ data: [{ symbol: 'BTCUSDT', price: 50000 }] });
      }
      if (table === 'lobbies') {
        return makeChain({ data: { config: { available_symbols: ['BTCUSDT'], leverage_tiers: [5, 10] } } });
      }
      if (table === 'positions') {
        return makeChain({ data: [] });
      }
      return makeChain();
    });

    await tickBots('lobby-1', 'round-1');
    const calls = mockFrom.mock.calls.map((c: string[]) => c[0]);
    expect(calls).toContain('lobbies');
    expect(calls).toContain('positions');
  });
});
