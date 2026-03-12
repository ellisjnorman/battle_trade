import type { Trader } from '@/types';
import { calcReturnPct } from './pnl';

export interface TraderStanding {
  trader: Trader;
  portfolioValue: number;
  returnPct: number;
  rank: number;
}

/**
 * Compute sorted standings from pre-calculated portfolio values.
 * Filters to active (non-eliminated) traders, sorts by returnPct desc
 * with alphabetical tie-breaking, and assigns 1-indexed ranks.
 */
export function getRoundStandings(
  traders: Trader[],
  portfolioValues: Record<string, number>,
  startingBalance: number,
): TraderStanding[] {
  // Build standings array, filtering eliminated traders in the same pass
  const standings: TraderStanding[] = [];
  for (const trader of traders) {
    if (trader.is_eliminated) continue;
    const portfolioValue = portfolioValues[trader.id] ?? startingBalance;
    const returnPct = calcReturnPct(portfolioValue, startingBalance);
    standings.push({ trader, portfolioValue, returnPct, rank: 0 });
  }

  // Sort descending by return%, tie-break alphabetically
  standings.sort((a, b) => {
    if (b.returnPct !== a.returnPct) return b.returnPct - a.returnPct;
    return (a.trader.name ?? '').localeCompare(b.trader.name ?? '');
  });

  // Assign ranks in-place (single pass)
  for (let i = 0; i < standings.length; i++) {
    standings[i].rank = i + 1;
  }

  return standings;
}
