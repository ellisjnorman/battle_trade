import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  calculateBTR,
  getBTRBreakdown,
  applyDecay,
  qualifiesForLeaderboard,
  qualifiesForCopyTrading,
  type BattleResult,
} from '@/lib/btr';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SessionRow {
  id: string;
  lobby_id: string;
  trader_id: string;
  starting_balance: number;
  final_balance: number | null;
  final_rank: number | null;
  is_eliminated: boolean;
  created_at: string;
  traders: {
    id: string;
    lobby_id: string | null;
  } | null;
  lobbies: {
    id: string;
    status: string;
    config: {
      available_symbols?: string[];
    };
  } | null;
}

interface PositionRow {
  id: string;
  trader_id: string;
  symbol: string;
  direction: 'long' | 'short';
  size: number;
  leverage: number;
  entry_price: number;
  exit_price: number | null;
  realized_pnl: number | null;
  opened_at: string;
  closed_at: string | null;
  status: string;
}

/**
 * Build a BattleResult from a completed session and its closed positions.
 * Each session in a completed lobby counts as one "battle".
 */
function buildBattleResult(
  session: SessionRow,
  positions: PositionRow[],
  profileId: string,
): BattleResult | null {
  const startBal = session.starting_balance;
  const finalBal = session.final_balance;
  if (finalBal === null || startBal === 0) return null;

  const returnPct = ((finalBal - startBal) / startBal) * 100;

  // Won = finished rank 1 in the lobby
  const won = session.final_rank === 1;

  // Compute max drawdown from positions:
  // Simulate chronological PnL curve and find the worst peak-to-trough drop
  const closedPositions = positions
    .filter((p) => p.closed_at !== null && p.realized_pnl !== null)
    .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());

  let cumulativePnl = 0;
  let peak = 0;
  let maxDrawdownPct = 0;

  for (const pos of closedPositions) {
    cumulativePnl += pos.realized_pnl!;
    const currentReturnPct = (cumulativePnl / startBal) * 100;

    if (currentReturnPct > peak) {
      peak = currentReturnPct;
    }

    const drawdown = currentReturnPct - peak;
    if (drawdown < maxDrawdownPct) {
      maxDrawdownPct = drawdown;
    }
  }

  // Asset volatility: approximate from intra-battle price movement of positions
  // Use the average absolute return per position as a proxy for volatility
  const posReturns = closedPositions
    .filter((p) => p.entry_price > 0 && p.exit_price !== null)
    .map((p) => Math.abs(((p.exit_price! - p.entry_price) / p.entry_price) * 100));

  const assetVolatility =
    posReturns.length > 0
      ? posReturns.reduce((s, v) => s + v, 0) / posReturns.length
      : 1; // default 1% if no position data

  return {
    id: session.id,
    lobby_id: session.lobby_id,
    profile_id: profileId,
    return_pct: returnPct,
    won,
    max_drawdown_pct: maxDrawdownPct,
    asset_volatility: assetVolatility,
    created_at: session.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET /api/btr/[profileId]
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const { profileId } = await params;

  if (!profileId) {
    return NextResponse.json({ error: 'Missing profileId' }, { status: 400 });
  }

  // 1. Find all traders associated with this profile, then fetch their sessions
  const { data: traders } = await supabase
    .from('traders')
    .select('id, lobby_id')
    .eq('profile_id', profileId);

  let allSessions: SessionRow[] = [];

  if (traders && traders.length > 0) {
    const traderIds = traders.map((t) => t.id);

    const { data: traderSessions, error: tsErr } = await supabase
      .from('sessions')
      .select(`
        id,
        lobby_id,
        trader_id,
        starting_balance,
        final_balance,
        final_rank,
        is_eliminated,
        created_at,
        traders!inner ( id, lobby_id ),
        lobbies!inner ( id, status, config )
      `)
      .in('trader_id', traderIds)
      .not('final_balance', 'is', null);

    if (!tsErr && traderSessions) {
      allSessions = traderSessions as unknown as SessionRow[];
    }
  }

  // Filter to only completed lobbies
  allSessions = allSessions.filter(
    (s) => s.lobbies && s.lobbies.status === 'completed',
  );

  if (allSessions.length === 0) {
    const emptyBreakdown = getBTRBreakdown([]);
    return NextResponse.json({
      btr: 0,
      breakdown: emptyBreakdown,
      rank: null,
      battles: 0,
      qualifies_leaderboard: false,
      qualifies_copy_trading: false,
    });
  }

  // 2. Fetch all closed positions for these sessions' traders
  const traderIds = [...new Set(allSessions.map((s) => s.trader_id))];

  const { data: allPositions, error: posErr } = await supabase
    .from('positions')
    .select(
      'id, trader_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, opened_at, closed_at, status',
    )
    .in('trader_id', traderIds)
    .eq('status', 'closed');

  if (posErr) {
    return NextResponse.json(
      { error: `Failed to fetch positions: ${posErr.message}` },
      { status: 500 },
    );
  }

  const positionsByTrader = new Map<string, PositionRow[]>();
  for (const pos of (allPositions ?? []) as PositionRow[]) {
    const existing = positionsByTrader.get(pos.trader_id) ?? [];
    existing.push(pos);
    positionsByTrader.set(pos.trader_id, existing);
  }

  // 3. Build battle results
  const battles: BattleResult[] = [];
  for (const session of allSessions) {
    const positions = positionsByTrader.get(session.trader_id) ?? [];
    const battle = buildBattleResult(session, positions, profileId);
    if (battle) battles.push(battle);
  }

  // Sort by date ascending for consistent processing
  battles.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  // 4. Calculate BTR
  let btr = calculateBTR(battles);
  const breakdown = getBTRBreakdown(battles);

  // Apply decay if inactive
  if (battles.length > 0) {
    const lastBattleDate = new Date(battles[battles.length - 1].created_at);
    btr = applyDecay(btr, lastBattleDate);
  }

  // Write computed BTR back to the profile for ranking consistency
  await supabase
    .from('profiles')
    .update({ elo_rating: btr, tr_score: btr })
    .eq('id', profileId);

  // 5. Determine global rank — count profiles with higher BTR
  //    We store BTR on profiles table as elo_rating for ranking purposes
  const { count: aboveCount, error: rankErr } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gt('elo_rating', btr);

  const rank = rankErr || aboveCount === null ? null : aboveCount + 1;

  // 6. Qualification checks
  const qualifiesLB = qualifiesForLeaderboard(battles);
  const qualifiesCT =
    rank !== null ? qualifiesForCopyTrading(btr, rank, battles) : false;

  return NextResponse.json({
    btr,
    breakdown,
    rank,
    battles: battles.length,
    qualifies_leaderboard: qualifiesLB,
    qualifies_copy_trading: qualifiesCT,
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  });
}
