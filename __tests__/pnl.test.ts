import { calcUnrealizedPnl, calcPortfolioValue, calcReturnPct } from '@/lib/pnl';
import type { Position } from '@/types';

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    trader_id: 'trader-1',
    round_id: 'round-1',
    symbol: 'BTCUSDT',
    direction: 'long',
    size: 1000,
    leverage: 1,
    entry_price: 50000,
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
    ...overrides,
  };
}

describe('calcUnrealizedPnl', () => {
  // Formula: direction * ((currentPrice - entryPrice) / entryPrice) * size_usd * leverage

  test('long position in profit', () => {
    // 10% price increase on $2000 position, 1x leverage = $200
    const pos = makePosition({ direction: 'long', size: 2000, leverage: 1, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 55000)).toBe(200);
  });

  test('long position in loss', () => {
    // 10% price decrease on $1000 position, 1x leverage = -$100
    const pos = makePosition({ direction: 'long', size: 1000, leverage: 1, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 45000)).toBe(-100);
  });

  test('short position in profit', () => {
    // 10% price decrease on $1000 short, 1x leverage = $100
    const pos = makePosition({ direction: 'short', size: 1000, leverage: 1, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 45000)).toBe(100);
  });

  test('short position in loss', () => {
    // 10% price increase on $1000 short, 1x leverage = -$100
    const pos = makePosition({ direction: 'short', size: 1000, leverage: 1, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 55000)).toBe(-100);
  });

  test('with leverage multiplier', () => {
    // 2% price increase on $1000 position, 10x leverage = $200
    const pos = makePosition({ direction: 'long', size: 1000, leverage: 10, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 51000)).toBe(200);
  });

  test('max leverage (100x) edge case', () => {
    // 2% price increase on $500 position, 100x leverage = $1000
    const pos = makePosition({ direction: 'long', size: 500, leverage: 100, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 51000)).toBe(1000);
  });

  test('max leverage short in profit', () => {
    // 2% price decrease on $500 short, 100x leverage = $1000
    const pos = makePosition({ direction: 'short', size: 500, leverage: 100, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 49000)).toBe(1000);
  });

  test('zero price change returns zero', () => {
    const pos = makePosition({ direction: 'long', size: 5000, leverage: 20, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 50000)).toBe(0);
  });

  test('pending position returns zero', () => {
    const pos = makePosition({ status: 'pending', size: 5000, leverage: 10, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 60000)).toBe(0);
  });
});

describe('calcPortfolioValue', () => {
  test('no positions returns starting balance', () => {
    expect(calcPortfolioValue(10000, [], [], {})).toBe(10000);
  });

  test('with closed position realized PnL', () => {
    const closed = makePosition({ realized_pnl: 500, closed_at: '2026-01-01T01:00:00Z' });
    expect(calcPortfolioValue(10000, [], [closed], {})).toBe(10500);
  });

  test('with open position unrealized PnL', () => {
    // 4% increase on $1000 position = $40 unrealized
    const open = makePosition({ direction: 'long', size: 1000, leverage: 1, entry_price: 50000 });
    const prices = { BTCUSDT: 52000 };
    expect(calcPortfolioValue(10000, [open], [], prices)).toBe(10040);
  });

  test('with both open and closed positions', () => {
    // 6% increase on $1000 = $60 unrealized, -$1000 realized
    const open = makePosition({ direction: 'long', size: 1000, leverage: 1, entry_price: 50000 });
    const closed = makePosition({ realized_pnl: -1000, closed_at: '2026-01-01T01:00:00Z' });
    const prices = { BTCUSDT: 53000 };
    expect(calcPortfolioValue(10000, [open], [closed], prices)).toBe(9060);
  });

  test('open position with missing price is skipped', () => {
    const open = makePosition({ symbol: 'XYZUSDT', direction: 'long', size: 1000, leverage: 1, entry_price: 100 });
    expect(calcPortfolioValue(10000, [open], [], {})).toBe(10000);
  });

  test('multiple open positions across symbols', () => {
    // BTC: 2% up on $1000 = $20
    // ETH: 3.33% down on $2000 short at 2x = -1 * (-3.33%) * 2000 * 2 = $133.33
    const btcPos = makePosition({ symbol: 'BTCUSDT', direction: 'long', size: 1000, leverage: 1, entry_price: 50000 });
    const ethPos = makePosition({ id: 'pos-2', symbol: 'ETHUSDT', direction: 'short', size: 2000, leverage: 2, entry_price: 3000 });
    const prices = { BTCUSDT: 51000, ETHUSDT: 2900 };
    // BTC PnL: 1 * (1000/50000) * 1000 * 1 = 20
    // ETH PnL: -1 * (-100/3000) * 2000 * 2 = 133.33
    // total: 10000 + 20 + 133.33 = 10153.33
    const result = calcPortfolioValue(10000, [btcPos, ethPos], [], prices);
    expect(result).toBeCloseTo(10153.33, 1);
  });
});

describe('calcReturnPct', () => {
  test('positive return', () => {
    expect(calcReturnPct(11000, 10000)).toBe(10);
  });

  test('negative return', () => {
    expect(calcReturnPct(8000, 10000)).toBe(-20);
  });

  test('zero return', () => {
    expect(calcReturnPct(10000, 10000)).toBe(0);
  });

  test('zero starting balance returns 0', () => {
    expect(calcReturnPct(5000, 0)).toBe(0);
  });

  test('complete loss', () => {
    expect(calcReturnPct(0, 10000)).toBe(-100);
  });
});
