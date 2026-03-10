import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { MockProvider, createMarket } from '@/lib/prediction-markets';
import { checkAuth } from '@/app/api/lobby/[id]/admin/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  // Get the active round's market
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId)
    .in('status', ['active', 'frozen'])
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  const cacheHeaders = { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=5' };

  if (!activeRound) {
    return NextResponse.json({ market: null }, { headers: cacheHeaders });
  }

  const { data: market } = await supabase
    .from('prediction_markets')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('round_id', activeRound.id)
    .single();

  if (!market) {
    return NextResponse.json({ market: null }, { headers: cacheHeaders });
  }

  const provider = new MockProvider();
  const fullMarket = await provider.getMarket(market.id);

  return NextResponse.json({ market: fullMarket }, { headers: cacheHeaders });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: lobbyId } = await params;
  const body = await request.json();
  const { round_id } = body;

  if (!round_id) {
    return NextResponse.json({ error: 'Missing round_id' }, { status: 400 });
  }

  // Get teams for this lobby
  const { data: traders } = await supabase
    .from('traders')
    .select('team_id')
    .eq('lobby_id', lobbyId)
    .not('team_id', 'is', null);

  const teamIds = [...new Set((traders ?? []).map((t) => t.team_id).filter(Boolean))];

  let teams: Array<{ id: string; name: string }> = [];
  if (teamIds.length > 0) {
    const { data: teamRows } = await supabase
      .from('teams')
      .select('id, name')
      .in('id', teamIds);
    teams = (teamRows ?? []).map((t) => ({ id: t.id, name: t.name }));
  }

  if (teams.length === 0) {
    return NextResponse.json({ error: 'No teams found in lobby' }, { status: 400 });
  }

  const market = await createMarket(lobbyId, round_id, teams);

  return NextResponse.json({ market }, { status: 201 });
}
