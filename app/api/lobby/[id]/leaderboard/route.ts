import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getLobbyStandings } from '@/lib/lobby';
import type { Trader } from '@/types';

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
      return NextResponse.json({ standings: [] });
    }
    resolvedRoundId = latestRound.id;
  }

  if (!resolvedRoundId) {
    return NextResponse.json({ standings: [] });
  }

  const standings = await getLobbyStandings(lobbyId, resolvedRoundId);

  // Enrich with team names
  const traders = standings.map((s) => s.trader);
  const teamIds = [...new Set(traders.map((t: Trader) => t.team_id).filter(Boolean))] as string[];
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

  const enriched = standings.map((s) => ({
    ...s,
    teamName: s.trader.team_id ? teamMap[s.trader.team_id] ?? null : null,
  }));

  return NextResponse.json({ standings: enriched });
}
