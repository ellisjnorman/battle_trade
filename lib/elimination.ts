import { calcUnrealizedPnl } from './pnl';
import type { Position } from '@/types';

// ---------------------------------------------------------------------------
// Elimination engine — auto-detect when a trader's portfolio hits 0
// ---------------------------------------------------------------------------

export interface EliminationResult {
  trader_id: string;
  trader_name: string;
  lobby_id: string;
  final_portfolio_value: number;
}

/**
 * Check all non-eliminated traders in a lobby and eliminate any whose total
 * portfolio value (starting balance + realized PnL + unrealized PnL) has
 * dropped to 0 or below.
 */
export async function checkAndEliminate(lobbyId: string): Promise<EliminationResult[]> {
  const { getServerSupabase } = await import('./supabase-server');
  const supabase = getServerSupabase();

  // 1. Get active/frozen rounds for this lobby
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId)
    .in('status', ['active', 'frozen']);

  if (!rounds || rounds.length === 0) return [];

  const roundIds = rounds.map(r => r.id);

  // 2. Get non-eliminated traders for this lobby
  const { data: traders } = await supabase
    .from('traders')
    .select('id, name, lobby_id')
    .eq('lobby_id', lobbyId)
    .eq('is_eliminated', false);

  if (!traders || traders.length === 0) return [];

  // 3. Get sessions (starting balances) for these traders
  const traderIds = traders.map(t => t.id);
  const { data: sessions } = await supabase
    .from('sessions')
    .select('trader_id, starting_balance')
    .eq('lobby_id', lobbyId)
    .in('trader_id', traderIds);

  const sessionMap: Record<string, number> = {};
  for (const s of sessions ?? []) {
    sessionMap[s.trader_id] = s.starting_balance;
  }

  // 4. Get ALL positions (open + closed) in active rounds for these traders
  const { data: allPositions } = await supabase
    .from('positions')
    .select('*')
    .in('round_id', roundIds)
    .in('trader_id', traderIds);

  if (!allPositions) return [];

  const positions = allPositions as Position[];

  // 5. Get current prices for all symbols with open positions
  const openPositions = positions.filter(p => p.status === 'open' && !p.closed_at);
  const symbols = [...new Set(openPositions.map(p => p.symbol))];

  const prices: Record<string, number> = {};
  if (symbols.length > 0) {
    const { data: priceRows } = await supabase
      .from('prices')
      .select('symbol, price')
      .in('symbol', symbols);

    for (const p of priceRows ?? []) prices[p.symbol] = p.price;
  }

  // 6. Calculate portfolio value per trader and eliminate if <= 0
  const eliminated: EliminationResult[] = [];

  for (const trader of traders) {
    const startingBalance = sessionMap[trader.id] ?? 10000;
    const traderPositions = positions.filter(p => p.trader_id === trader.id);
    const closedPos = traderPositions.filter(p => p.closed_at !== null);
    const openPos = traderPositions.filter(p => p.status === 'open' && !p.closed_at);

    const realizedPnl = closedPos.reduce(
      (sum, p) => sum + (p.realized_pnl ?? 0),
      0,
    );

    const unrealizedPnl = openPos.reduce((sum, p) => {
      const price = prices[p.symbol];
      if (price === undefined) return sum;
      return sum + calcUnrealizedPnl(p, price);
    }, 0);

    const portfolioValue = startingBalance + realizedPnl + unrealizedPnl;

    if (portfolioValue > 0) continue;

    // --- Eliminate this trader ---

    // Mark trader as eliminated
    const { error: elimError } = await supabase
      .from('traders')
      .update({
        is_eliminated: true,
        eliminated_at: new Date().toISOString(),
      })
      .eq('id', trader.id)
      .eq('lobby_id', lobbyId);

    if (elimError) continue;

    // Close all their open positions at current price
    for (const pos of openPos) {
      const currentPrice = prices[pos.symbol];
      if (currentPrice === undefined) continue;

      const pnl = calcUnrealizedPnl(pos, currentPrice);
      await supabase
        .from('positions')
        .update({
          exit_price: currentPrice,
          realized_pnl: pnl,
          closed_at: new Date().toISOString(),
          status: 'stopped',
        })
        .eq('id', pos.id);
    }

    // Broadcast elimination to trader channel and lobby events channel
    try {
      const traderCh = supabase.channel(`t-${trader.id}`);
      traderCh.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await traderCh.send({
            type: 'broadcast',
            event: 'elimination',
            payload: {
              type: 'elimination',
              trader_id: trader.id,
              trader_name: trader.name,
              reason: 'portfolio_wiped',
              final_portfolio_value: portfolioValue,
            },
          });
          setTimeout(() => supabase.removeChannel(traderCh), 500);
        }
      });
      setTimeout(() => supabase.removeChannel(traderCh), 3000);
    } catch {
      // Broadcast is best-effort
    }

    try {
      const lobbyCh = supabase.channel(`lobby-${lobbyId}-events`);
      lobbyCh.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await lobbyCh.send({
            type: 'broadcast',
            event: 'elimination',
            payload: {
              type: 'elimination',
              trader_id: trader.id,
              trader_name: trader.name,
              reason: 'portfolio_wiped',
              final_portfolio_value: portfolioValue,
            },
          });
          setTimeout(() => supabase.removeChannel(lobbyCh), 500);
        }
      });
      setTimeout(() => supabase.removeChannel(lobbyCh), 3000);
    } catch {
      // Broadcast is best-effort
    }

    eliminated.push({
      trader_id: trader.id,
      trader_name: trader.name,
      lobby_id: lobbyId,
      final_portfolio_value: portfolioValue,
    });
  }

  return eliminated;
}
