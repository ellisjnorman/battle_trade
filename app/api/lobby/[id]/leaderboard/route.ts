import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getLobbyStandings } from '@/lib/lobby';
import type { Trader } from '@/types';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10',
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  const roundId = request.nextUrl.searchParams.get('round_id');

  // If no round_id, get the latest round for this lobby
  let resolvedRoundId: string | null = roundId;
  if (!resolvedRoundId) {
    const { data: latestRound } = await supabase
      .from('rounds')
      .select('id')
      .eq('lobby_id', lobbyId)
      .order('round_number', { ascending: false })
      .limit(1)
      .single();

    if (!latestRound) {
      return NextResponse.json({ standings: [] }, { headers: CACHE_HEADERS });
    }
    resolvedRoundId = latestRound.id;
  }

  if (!resolvedRoundId) {
    return NextResponse.json({ standings: [] }, { headers: CACHE_HEADERS });
  }

  const standings = await getLobbyStandings(lobbyId, resolvedRoundId);

  // Collect unique team IDs for enrichment
  const teamIds: string[] = [];
  const seen = new Set<string>();
  for (const s of standings) {
    const tid = (s.trader as Trader).team_id;
    if (tid && !seen.has(tid)) {
      seen.add(tid);
      teamIds.push(tid);
    }
  }

  // Fetch team names in a single query (only if needed)
  let teamMap: Record<string, string> = {};
  if (teamIds.length > 0) {
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name')
      .in('id', teamIds);
    if (teams) {
      teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    }
  }

  const enriched = standings.map((s) => ({
    ...s,
    teamName: s.trader.team_id ? teamMap[s.trader.team_id] ?? null : null,
  }));

  return NextResponse.json({ standings: enriched }, { headers: CACHE_HEADERS });
}
