import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createMarket } from '@/lib/prediction-markets';
import { startPriceFeed } from '@/lib/prices';
import { checkAuth, unauthorized } from '../../auth';

// Track if price feed is already running
let priceFeedStarted = false;

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;
  const body = await request.json();
  const { round_id } = body;

  if (!round_id) {
    return NextResponse.json({ error: 'Missing round_id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('rounds')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .eq('id', round_id)
    .eq('lobby_id', lobbyId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-create prediction market for this round
  try {
    const { data: traders } = await supabase
      .from('traders')
      .select('team_id')
      .eq('lobby_id', lobbyId)
      .not('team_id', 'is', null);

    const teamIds = [...new Set((traders ?? []).map((t) => t.team_id).filter(Boolean))];
    if (teamIds.length > 0) {
      const { data: teamRows } = await supabase
        .from('teams')
        .select('id, name')
        .in('id', teamIds);
      const teams = (teamRows ?? []).map((t) => ({ id: t.id, name: t.name }));
      if (teams.length > 0) {
        await createMarket(lobbyId, round_id, teams);
      }
    }
  } catch {
    // Market creation is best-effort
  }

  // Start price feed if not already running
  if (!priceFeedStarted) {
    startPriceFeed();
    priceFeedStarted = true;
  }

  // Participation enforcement disabled — let traders trade at their own pace
  // To re-enable, uncomment below:
  // try {
  //   const prevCleanup = getCleanup(lobbyId);
  //   if (prevCleanup) prevCleanup();
  //   const cleanup = await startParticipationLoop(lobbyId, round_id);
  //   setCleanup(lobbyId, cleanup);
  // } catch {
  //   // Participation loop is best-effort
  // }

  // Broadcast round start
  try {
    const channel = supabase.channel(`lobby-${lobbyId}`);
    await channel.send({
      type: 'broadcast',
      event: 'round_start',
      payload: { type: 'round_start', round: data },
    });
  } catch {
    // Broadcast is best-effort
  }

  return NextResponse.json({ action: 'start_round', round: data });
}
