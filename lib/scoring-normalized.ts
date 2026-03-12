/**
 * Normalized tournament scoring.
 *
 * Equalizes account sizes so a $5K account and a $500K account compete on
 * equal footing. Each participant gets a virtual allocation (e.g. $10K).
 * Real trade sizes are proportionally scaled.
 *
 * Example: Real account $50K, opens $10K position (20% of capital).
 * Virtual allocation $10K → scored as $2K position (20% of $10K).
 */

export interface RealTrade {
  symbol: string
  side: 'long' | 'short'
  size_usd: number        // actual position size in USD
  entry_price: number
  exit_price: number
  leverage: number
  pnl_usd: number         // realized PnL in USD
}

export interface NormalizedResult {
  virtual_size_usd: number
  virtual_pnl_usd: number
  return_pct: number
  capital_deployed_pct: number
}

/**
 * Normalize a single trade for tournament scoring.
 *
 * @param trade        The real trade executed on the trader's exchange
 * @param realEquity   Trader's total account equity at battle start
 * @param virtualAlloc Virtual allocation for the tournament (e.g. 10000)
 * @param leverageCap  Maximum leverage allowed (positions above this are scored at cap)
 */
export function normalizeTrade(
  trade: RealTrade,
  realEquity: number,
  virtualAlloc: number,
  leverageCap: number = 10,
): NormalizedResult {
  if (realEquity <= 0) {
    return { virtual_size_usd: 0, virtual_pnl_usd: 0, return_pct: 0, capital_deployed_pct: 0 }
  }

  // What % of the trader's real capital was this position?
  const capitalPct = trade.size_usd / realEquity

  // Scale to virtual allocation
  const virtualSize = capitalPct * virtualAlloc

  // Cap leverage for scoring
  const effectiveLeverage = Math.min(trade.leverage, leverageCap)
  const leverageRatio = effectiveLeverage / Math.max(trade.leverage, 1)

  // Scale PnL proportionally — if leverage was capped, PnL scales down too
  if (!trade.size_usd) {
    return { virtual_size_usd: 0, virtual_pnl_usd: 0, return_pct: 0, capital_deployed_pct: 0 }
  }
  const pnlRatio = (trade.pnl_usd / trade.size_usd) * leverageRatio
  const virtualPnl = virtualSize * pnlRatio

  return {
    virtual_size_usd: virtualSize,
    virtual_pnl_usd: virtualPnl,
    return_pct: virtualAlloc > 0 ? (virtualPnl / virtualAlloc) * 100 : 0,
    capital_deployed_pct: capitalPct * 100,
  }
}

/**
 * Score an entire battle for a trader with normalized accounting.
 *
 * @param trades       All trades executed during the battle window
 * @param realEquity   Trader's equity at battle start
 * @param virtualAlloc Virtual allocation (default $10K)
 * @param leverageCap  Max leverage (default 10x)
 */
export function scoreBattle(
  trades: RealTrade[],
  realEquity: number,
  virtualAlloc: number = 10000,
  leverageCap: number = 10,
): {
  total_virtual_pnl: number
  total_return_pct: number
  total_capital_deployed_pct: number
  trade_count: number
  normalized_trades: NormalizedResult[]
} {
  if (trades.length === 0) {
    return {
      total_virtual_pnl: 0,
      total_return_pct: 0,
      total_capital_deployed_pct: 0,
      trade_count: 0,
      normalized_trades: [],
    }
  }

  const normalized = trades.map(t => normalizeTrade(t, realEquity, virtualAlloc, leverageCap))

  const totalVirtualPnl = normalized.reduce((sum, n) => sum + n.virtual_pnl_usd, 0)
  const totalCapitalDeployed = normalized.reduce((sum, n) => sum + n.virtual_size_usd, 0)
  const capitalDeployedPct = virtualAlloc > 0 ? (totalCapitalDeployed / virtualAlloc) * 100 : 0

  return {
    total_virtual_pnl: totalVirtualPnl,
    total_return_pct: virtualAlloc > 0 ? (totalVirtualPnl / virtualAlloc) * 100 : 0,
    total_capital_deployed_pct: capitalDeployedPct,
    trade_count: trades.length,
    normalized_trades: normalized,
  }
}
