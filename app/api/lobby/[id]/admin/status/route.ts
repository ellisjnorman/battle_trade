import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { calcPortfolioValue } from '@/lib/pnl';
import { getRoundStandings } from '@/lib/scoring';
import { checkParticipation } from '@/lib/participation-rules';
import type { Position, Trader } from '@/types';
import { checkAuthWithLobby, unauthorized } from '../auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  if (!(await checkAuthWithLobby(request, lobbyId))) return unauthorized();

  // Get current/latest round
  const { data: round } = await supabase
    .from('rounds')
    .select('id, lobby_id, round_number, status, started_at, ended_at, duration_seconds, starting_balance')
    .eq('lobby_id', lobbyId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  // Fetch lobby config for admin panel
  const { data: lobbyRow } = await supabase
    .from('lobbies')
    .select('config, status, name')
    .eq('id', lobbyId)
    .single();

  if (!round) {
    return NextResponse.json({ error: 'No rounds found', lobby: lobbyRow ? { config: lobbyRow.config, status: lobbyRow.status, name: lobbyRow.name } : null }, { status: 404 });
  }

  // Get traders, positions, prices, and profiles in parallel
  // Try with profile_id, fall back without if column doesn't exist
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let traders: any[] | null = null;
  {
    const res = await supabase
      .from('traders')
      .select('id, name, lobby_id, team_id, is_eliminated, profile_id')
      .eq('lobby_id', lobbyId);
    if (res.error?.message?.includes('profile_id')) {
      const retry = await supabase
        .from('traders')
        .select('id, name, lobby_id, team_id, is_eliminated')
        .eq('lobby_id', lobbyId);
      traders = retry.data;
    } else {
      traders = res.data;
    }
  }

  if (!traders || traders.length === 0) {
    return NextResponse.json({ round, traders: [] });
  }

  const profileIds = traders.map((t) => (t as Record<string, unknown>).profile_id as string).filter(Boolean);

  const [positionsResult, pricesResult, profilesResult] = await Promise.all([
    supabase
      .from('positions')
      .select('id, trader_id, round_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, opened_at, closed_at, order_type, limit_price, stop_price, trail_pct, trail_peak, status')
      .eq('round_id', round.id),
    supabase.from('prices').select('symbol, price'),
    profileIds.length > 0
      ? supabase.from('profiles').select('id, credits').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string; credits: number }[] }),
  ]);

  const { data: positions } = positionsResult;
  const { data: prices } = pricesResult;
  const profiles = (profilesResult as { data: { id: string; credits: number }[] | null }).data;
  const currentPrices: Record<string, number> = {};
  for (const p of prices ?? []) {
    currentPrices[p.symbol] = p.price;
  }

  // Build profile credits lookup keyed by profile_id
  const profileCredits: Record<string, number> = {};
  for (const p of profiles ?? []) {
    profileCredits[p.id] = p.credits ?? 0;
  }
  // Map trader.id → credits via trader.profile_id
  const creditsMap: Record<string, number> = {};
  for (const t of traders) {
    const pid = (t as Record<string, unknown>).profile_id as string | null;
    creditsMap[t.id] = pid ? (profileCredits[pid] ?? 0) : 0;
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
    lobby: lobbyRow ? { config: lobbyRow.config, status: lobbyRow.status, name: lobbyRow.name } : null,
  });
}
