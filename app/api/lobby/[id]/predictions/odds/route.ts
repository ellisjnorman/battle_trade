import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { deriveOddsFromStandings } from '@/lib/prediction-markets';
import { getLobbyStandings } from '@/lib/lobby';

export const dynamic = 'force-dynamic';

/** GET — Derive live odds from current round standings */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  // Get the active round
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('lobby_id', lobbyId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (!activeRound) {
    return NextResponse.json({ error: 'No active round found' }, { status: 404 });
  }

  // Get standings for the active round
  const standings = await getLobbyStandings(lobbyId, activeRound.id);

  // Group traders by team
  const teamMap = new Map<string, { id: string; name: string; totalReturn: number; count: number; bestRank: number }>();

  for (const s of standings) {
    const teamId = s.trader.team_id;
    if (!teamId) continue;

    const existing = teamMap.get(teamId);
    if (existing) {
      existing.totalReturn += s.returnPct;
      existing.count += 1;
      existing.bestRank = Math.min(existing.bestRank, s.rank);
    } else {
      // Get team name
      const { data: team } = await supabase
        .from('teams')
        .select('name')
        .eq('id', teamId)
        .single();

      teamMap.set(teamId, {
        id: teamId,
        name: team?.name ?? 'Unknown',
        totalReturn: s.returnPct,
        count: 1,
        bestRank: s.rank,
      });
    }
  }

  const teams = Array.from(teamMap.values()).map((t) => ({
    id: t.id,
    name: t.name,
    rank: t.bestRank,
    returnPct: t.totalReturn / t.count,
  }));

  // Calculate time remaining
  const now = Date.now();
  const startTime = new Date(activeRound.start_time).getTime();
  const endTime = activeRound.end_time ? new Date(activeRound.end_time).getTime() : startTime + 3600_000;
  const totalRoundSeconds = Math.max((endTime - startTime) / 1000, 1);
  const timeRemainingSeconds = Math.max((endTime - now) / 1000, 0);

  const odds = deriveOddsFromStandings(teams, timeRemainingSeconds, totalRoundSeconds);

  return NextResponse.json({ odds, round_id: activeRound.id });
}
