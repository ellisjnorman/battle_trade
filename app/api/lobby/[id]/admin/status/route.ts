import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { calcPortfolioValue } from '@/lib/pnl';
import { getRoundStandings } from '@/lib/scoring';
import { checkParticipation } from '@/lib/participation-rules';
import type { Position, Trader } from '@/types';
import { checkAuth, unauthorized } from '../auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;

  // Get current/latest round
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  if (!round) {
    return NextResponse.json({ error: 'No rounds found' }, { status: 404 });
  }

  // Get all traders in lobby
  const { data: traders } = await supabase
    .from('traders')
    .select('*')
    .eq('lobby_id', lobbyId);

  if (!traders || traders.length === 0) {
    return NextResponse.json({ round, traders: [] });
  }

  // Get all positions for this round
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('round_id', round.id);

  // Get current prices
  const { data: prices } = await supabase.from('prices').select('*');
  const currentPrices: Record<string, number> = {};
  for (const p of prices ?? []) {
    currentPrices[p.symbol] = p.price;
  }

  // Get profiles for credits
  const traderIds = traders.map((t) => t.id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, credits')
    .in('id', traderIds);

  const creditsMap: Record<string, number> = {};
  for (const p of profiles ?? []) {
    creditsMap[p.id] = p.credits ?? 0;
  }

  // Calculate standings
  const allPositions = (positions ?? []) as Position[];
  const portfolioValues: Record<string, number> = {};

  for (const trader of traders as Trader[]) {
    const traderPositions = allPositions.filter((p) => p.trader_id === trader.id);
    const open = traderPositions.filter((p) => !p.closed_at);
    const closed = traderPositions.filter((p) => p.closed_at);
    portfolioValues[trader.id] = calcPortfolioValue(
      round.starting_balance,
      open,
      closed,
      currentPrices,
    );
  }

  const standings = getRoundStandings(traders as Trader[], portfolioValues, round.starting_balance);

  // Build activity statuses (parallel)
  const activityStatuses = await Promise.all(
    (traders as Trader[]).map((trader) =>
      checkParticipation(trader.id, lobbyId, round.id).catch(() => null),
    ),
  );

  const activityMap: Record<string, unknown> = {};
  for (let i = 0; i < traders.length; i++) {
    activityMap[traders[i].id] = activityStatuses[i];
  }

  // Combine everything
  const traderDetails = standings.map((standing) => {
    const traderPositions = allPositions.filter((p) => p.trader_id === standing.trader.id);
    const openPositions = traderPositions.filter((p) => !p.closed_at);

    return {
      trader_id: standing.trader.id,
      name: standing.trader.name,
      team_id: standing.trader.team_id ?? null,
      is_eliminated: standing.trader.is_eliminated,
      balance: standing.portfolioValue,
      rank: standing.rank,
      return_pct: standing.returnPct,
      open_positions: openPositions,
      activity_status: activityMap[standing.trader.id] ?? null,
      credits: creditsMap[standing.trader.id] ?? 0,
    };
  });

  // Add eliminated traders not in standings
  const standingIds = new Set(traderDetails.map((t) => t.trader_id));
  const eliminated = (traders as Trader[])
    .filter((t) => !standingIds.has(t.id))
    .map((t) => ({
      trader_id: t.id,
      name: t.name,
      team_id: t.team_id ?? null,
      is_eliminated: true,
      balance: portfolioValues[t.id] ?? round.starting_balance,
      rank: null as number | null,
      return_pct: 0,
      open_positions: allPositions.filter((p) => p.trader_id === t.id && !p.closed_at),
      activity_status: activityMap[t.id] ?? null,
      credits: creditsMap[t.id] ?? 0,
    }));

  return NextResponse.json({
    round,
    traders: [...traderDetails, ...eliminated],
  });
}
