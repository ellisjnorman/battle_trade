import type { Position } from '@/types';

export function calcUnrealizedPnl(position: Position, currentPrice: number): number {
  if (position.entry_price === 0 || position.status === 'pending') return 0;
  const direction = position.direction === 'long' ? 1 : -1;
  const pctChange = (currentPrice - position.entry_price) / position.entry_price;
  return direction * pctChange * position.size * position.leverage;
}

export function calcPortfolioValue(
  startingBalance: number,
  openPositions: Position[],
  closedPositions: Position[],
  currentPrices: Record<string, number>
): number {
  const realizedPnl = closedPositions.reduce(
    (sum, p) => sum + (p.realized_pnl ?? 0),
    0
  );

  const unrealizedPnl = openPositions.reduce((sum, p) => {
    const price = currentPrices[p.symbol];
    if (price === undefined) return sum;
    return sum + calcUnrealizedPnl(p, price);
  }, 0);

  return startingBalance + realizedPnl + unrealizedPnl;
}

export function calcReturnPct(currentValue: number, startingBalance: number): number {
  if (startingBalance === 0) return 0;
  return ((currentValue - startingBalance) / startingBalance) * 100;
}
