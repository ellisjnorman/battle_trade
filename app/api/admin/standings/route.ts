import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { calcPortfolioValue } from '@/lib/pnl';
import { getRoundStandings } from '@/lib/scoring';
import type { Position, Trader } from '@/types';

function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return authHeader === password;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roundId = request.nextUrl.searchParams.get('round_id');
  if (!roundId) {
    return NextResponse.json({ error: 'Missing round_id' }, { status: 400 });
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', roundId)
    .single();

  if (!round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  }

  const { data: traders } = await supabase
    .from('traders')
    .select('*')
    .eq('event_id', round.event_id);

  if (!traders || traders.length === 0) {
    return NextResponse.json({ standings: [] });
  }

  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('round_id', roundId);

  const { data: prices } = await supabase.from('prices').select('*');

  const currentPrices: Record<string, number> = {};
  for (const p of prices ?? []) {
    currentPrices[p.symbol] = p.price;
  }

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
      currentPrices
    );
  }

  // Fetch team names
  const teamIds = [...new Set(traders.map((t: Trader) => t.team_id).filter(Boolean))];
  const teamMap: Record<string, string> = {};
  if (teamIds.length > 0) {
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name')
      .in('id', teamIds);
    for (const t of teams ?? []) {
      teamMap[t.id] = t.name;
    }
  }

  const standings = getRoundStandings(traders as Trader[], portfolioValues, round.starting_balance);

  const enriched = standings.map((s) => ({
    ...s,
    teamName: s.trader.team_id ? teamMap[s.trader.team_id] ?? null : null,
  }));

  return NextResponse.json({ standings: enriched });
}
