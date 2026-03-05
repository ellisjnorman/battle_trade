import type { Trader } from '@/types';
import { calcReturnPct } from './pnl';

export interface TraderStanding {
  trader: Trader;
  portfolioValue: number;
  returnPct: number;
  rank: number;
}

export function getRoundStandings(
  traders: Trader[],
  portfolioValues: Record<string, number>,
  startingBalance: number
): TraderStanding[] {
  const active = traders.filter((t) => !t.is_eliminated);

  const standings = active
    .map((trader) => {
      const portfolioValue = portfolioValues[trader.id] ?? startingBalance;
      const returnPct = calcReturnPct(portfolioValue, startingBalance);
      return { trader, portfolioValue, returnPct, rank: 0 };
    })
    .sort((a, b) => {
      if (b.returnPct !== a.returnPct) return b.returnPct - a.returnPct;
      return a.trader.name.localeCompare(b.trader.name);
    });

  standings.forEach((s, i) => {
    s.rank = i + 1;
  });

  return standings;
}
