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
    .select('id, lobby_id, round_number, status, started_at, ended_at, duration_seconds')
    .eq('lobby_id', lobbyId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (!activeRound) {
    return NextResponse.json({ error: 'No active round found' }, { status: 404 });
  }

  // Get standings for the active round
  const standings = await getLobbyStandings(lobbyId, activeRound.id);

  // Batch load all team names upfront
  const allTeamIds = [...new Set(standings.map((s) => s.trader.team_id).filter(Boolean))] as string[];
  const teamNameMap = new Map<string, string>();
  if (allTeamIds.length > 0) {
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name')
      .in('id', allTeamIds);
    for (const t of teams ?? []) {
      teamNameMap.set(t.id, t.name);
    }
  }

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
      teamMap.set(teamId, {
        id: teamId,
        name: teamNameMap.get(teamId) ?? 'Unknown',
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
  const startTime = new Date(activeRound.started_at).getTime();
  const endTime = activeRound.ended_at ? new Date(activeRound.ended_at).getTime() : startTime + 3600_000;
  const totalRoundSeconds = Math.max((endTime - startTime) / 1000, 1);
  const timeRemainingSeconds = Math.max((endTime - now) / 1000, 0);

  const odds = deriveOddsFromStandings(teams, timeRemainingSeconds, totalRoundSeconds);

  return NextResponse.json({ odds, round_id: activeRound.id }, {
    headers: { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=5' },
  });
}
