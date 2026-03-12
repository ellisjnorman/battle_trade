import { calcUnrealizedPnl } from './pnl';
import type { Position } from '@/types';

// ---------------------------------------------------------------------------
// Liquidation engine
// ---------------------------------------------------------------------------

/**
 * Maintenance margin ratio — position is liquidated when unrealized loss
 * exceeds this fraction of the initial margin (size * leverage notional).
 * At 1.0 = full margin wipeout. Default 0.9 gives a small buffer.
 */
const MAINTENANCE_RATIO = 0.9;

export interface LiquidationResult {
  position_id: string;
  trader_id: string;
  symbol: string;
  entry_price: number;
  exit_price: number;
  realized_pnl: number;
  leverage: number;
}

/** Check if a position should be liquidated at the given price */
export function shouldLiquidate(position: Position, currentPrice: number): boolean {
  // Initial margin = notional / leverage = size (since size is in USD)
  const margin = position.size;
  const unrealizedPnl = calcUnrealizedPnl(position, currentPrice);

  // Liquidate when loss exceeds maintenance margin
  return unrealizedPnl <= -(margin * MAINTENANCE_RATIO);
}

/** Calculate liquidation price for a position */
export function getLiquidationPrice(position: Position): number {
  const margin = position.size;
  const maxLoss = margin * MAINTENANCE_RATIO;

  // For long: liqPrice = entry - maxLoss / (size * leverage / entry)
  // Simplified: liqPrice = entry * (1 - MAINTENANCE_RATIO / leverage)
  if (position.direction === 'long') {
    return position.entry_price * (1 - MAINTENANCE_RATIO / position.leverage);
  }
  // For short: liqPrice = entry * (1 + MAINTENANCE_RATIO / leverage)
  return position.entry_price * (1 + MAINTENANCE_RATIO / position.leverage);
}

/**
 * Check all open positions in a lobby and liquidate any that are underwater.
 * Returns list of liquidated positions.
 */
export async function checkAndLiquidate(lobbyId: string): Promise<LiquidationResult[]> {
  const { getServerSupabase } = await import('./supabase-server');
  const supabase = getServerSupabase();

  // Get all open positions for this lobby
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId)
    .in('status', ['active', 'frozen']);

  if (!rounds || rounds.length === 0) return [];

  const roundIds = rounds.map(r => r.id);

  const { data: openPositions } = await supabase
    .from('positions')
    .select('*')
    .in('round_id', roundIds)
    .eq('status', 'open')
    .is('closed_at', null);

  if (!openPositions || openPositions.length === 0) return [];

  // Get current prices
  const symbols = [...new Set((openPositions as Position[]).map(p => p.symbol))];
  const { data: priceRows } = await supabase
    .from('prices')
    .select('symbol, price')
    .in('symbol', symbols);

  const prices: Record<string, number> = {};
  for (const p of priceRows ?? []) prices[p.symbol] = p.price;

  const liquidated: LiquidationResult[] = [];

  for (const pos of openPositions as Position[]) {
    const currentPrice = prices[pos.symbol];
    if (currentPrice === undefined) continue;

    if (!shouldLiquidate(pos, currentPrice)) continue;

    const realizedPnl = calcUnrealizedPnl(pos, currentPrice);

    // Force-close the position
    const { error } = await supabase
      .from('positions')
      .update({
        exit_price: currentPrice,
        realized_pnl: realizedPnl,
        closed_at: new Date().toISOString(),
        status: 'stopped',
      })
      .eq('id', pos.id);

    if (error) continue;

    // Broadcast liquidation to the trader
    try {
      const ch = supabase.channel(`t-${pos.trader_id}`);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.send({
            type: 'broadcast',
            event: 'liquidation',
            payload: {
              type: 'liquidation',
              position_id: pos.id,
              symbol: pos.symbol,
              direction: pos.direction,
              realized_pnl: realizedPnl,
            },
          });
          setTimeout(() => supabase.removeChannel(ch), 500);
        }
      });
      setTimeout(() => supabase.removeChannel(ch), 3000);
    } catch {
      // Broadcast is best-effort
    }

    liquidated.push({
      position_id: pos.id,
      trader_id: pos.trader_id,
      symbol: pos.symbol,
      entry_price: pos.entry_price,
      exit_price: currentPrice,
      realized_pnl: realizedPnl,
      leverage: pos.leverage,
    });
  }

  return liquidated;
}
