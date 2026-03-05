import { calcUnrealizedPnl, calcPortfolioValue, calcReturnPct } from '@/lib/pnl';
import type { Position } from '@/types';

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    trader_id: 'trader-1',
    round_id: 'round-1',
    symbol: 'BTCUSDT',
    direction: 'long',
    size: 1,
    leverage: 1,
    entry_price: 50000,
    exit_price: null,
    realized_pnl: null,
    opened_at: '2026-01-01T00:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

describe('calcUnrealizedPnl', () => {
  test('long position in profit', () => {
    const pos = makePosition({ direction: 'long', size: 2, leverage: 1, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 55000)).toBe(10000);
  });

  test('long position in loss', () => {
    const pos = makePosition({ direction: 'long', size: 1, leverage: 1, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 45000)).toBe(-5000);
  });

  test('short position in profit', () => {
    const pos = makePosition({ direction: 'short', size: 1, leverage: 1, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 45000)).toBe(5000);
  });

  test('short position in loss', () => {
    const pos = makePosition({ direction: 'short', size: 1, leverage: 1, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 55000)).toBe(-5000);
  });

  test('with leverage multiplier', () => {
    const pos = makePosition({ direction: 'long', size: 1, leverage: 10, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 51000)).toBe(10000);
  });

  test('max leverage (100x) edge case', () => {
    const pos = makePosition({ direction: 'long', size: 0.1, leverage: 100, entry_price: 50000 });
    // 1 * (51000 - 50000) * 0.1 * 100 = 10000
    expect(calcUnrealizedPnl(pos, 51000)).toBe(10000);
  });

  test('max leverage short in profit', () => {
    const pos = makePosition({ direction: 'short', size: 0.5, leverage: 100, entry_price: 50000 });
    // -1 * (49000 - 50000) * 0.5 * 100 = 50000
    expect(calcUnrealizedPnl(pos, 49000)).toBe(50000);
  });

  test('zero price change returns zero', () => {
    const pos = makePosition({ direction: 'long', size: 5, leverage: 20, entry_price: 50000 });
    expect(calcUnrealizedPnl(pos, 50000)).toBe(0);
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
    const open = makePosition({ direction: 'long', size: 1, leverage: 1, entry_price: 50000 });
    const prices = { BTCUSDT: 52000 };
    expect(calcPortfolioValue(10000, [open], [], prices)).toBe(12000);
  });

  test('with both open and closed positions', () => {
    const open = makePosition({ direction: 'long', size: 1, leverage: 1, entry_price: 50000 });
    const closed = makePosition({ realized_pnl: -1000, closed_at: '2026-01-01T01:00:00Z' });
    const prices = { BTCUSDT: 53000 };
    // 10000 + (-1000) + 3000 = 12000
    expect(calcPortfolioValue(10000, [open], [closed], prices)).toBe(12000);
  });

  test('open position with missing price is skipped', () => {
    const open = makePosition({ symbol: 'XYZUSDT', direction: 'long', size: 1, leverage: 1, entry_price: 100 });
    expect(calcPortfolioValue(10000, [open], [], {})).toBe(10000);
  });

  test('multiple open positions across symbols', () => {
    const btcPos = makePosition({ symbol: 'BTCUSDT', direction: 'long', size: 1, leverage: 1, entry_price: 50000 });
    const ethPos = makePosition({ id: 'pos-2', symbol: 'ETHUSDT', direction: 'short', size: 10, leverage: 2, entry_price: 3000 });
    const prices = { BTCUSDT: 51000, ETHUSDT: 2900 };
    // BTC: 1 * 1000 * 1 * 1 = 1000
    // ETH: -1 * (2900 - 3000) * 10 * 2 = 2000
    // total: 10000 + 1000 + 2000 = 13000
    expect(calcPortfolioValue(10000, [btcPos, ethPos], [], prices)).toBe(13000);
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
