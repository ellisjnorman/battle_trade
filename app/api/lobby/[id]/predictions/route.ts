import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createMarket } from '@/lib/prediction-markets';
import { checkAuthWithLobby, unauthorized } from '../admin/auth';

export const dynamic = 'force-dynamic';

/** GET — List all prediction markets for this lobby */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  const { data: markets, error } = await supabase
    .from('prediction_markets')
    .select('id, lobby_id, round_id, status, total_volume, rake_collected, created_at')
    .eq('lobby_id', lobbyId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch outcomes for each market, joined with team names
  const enriched = await Promise.all(
    (markets ?? []).map(async (market) => {
      const { data: outcomes } = await supabase
        .from('market_outcomes')
        .select('*, teams(name)')
        .eq('market_id', market.id);

      return {
        ...market,
        outcomes: (outcomes ?? []).map((o: Record<string, unknown>) => ({
          id: o.id,
          team_id: o.team_id,
          team_name: (o.teams as Record<string, string>)?.name ?? 'Unknown',
          probability: Number(o.probability),
          odds: Number(o.odds),
          volume: Number(o.volume),
        })),
      };
    }),
  );

  return NextResponse.json({ markets: enriched }, {
    headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' },
  });
}

/** POST — Create a new prediction market for the active round */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  if (!(await checkAuthWithLobby(request, lobbyId))) return unauthorized();

  let body: { teams: Array<{ id: string; name: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.teams || !Array.isArray(body.teams) || body.teams.length === 0) {
    return NextResponse.json({ error: 'teams array is required and must not be empty' }, { status: 400 });
  }

  // Find the active round for this lobby
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (!activeRound) {
    return NextResponse.json({ error: 'No active round found for this lobby' }, { status: 404 });
  }

  try {
    const market = await createMarket(lobbyId, activeRound.id, body.teams);
    return NextResponse.json({ market }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create market';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
