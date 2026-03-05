import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();
  const { trader_id, is_competitor } = body;

  if (!trader_id) {
    return NextResponse.json({ error: 'Missing trader_id' }, { status: 400 });
  }

  // Verify lobby exists
  const { data: lobby } = await supabase
    .from('lobbies')
    .select('id, config')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  // Create session
  const startingBalance =
    (lobby.config as Record<string, unknown>)?.starting_balance as number ?? 10000;

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      trader_id,
      lobby_id: lobbyId,
      starting_balance: startingBalance,
    })
    .select()
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // Link trader to lobby
  await supabase
    .from('traders')
    .update({ lobby_id: lobbyId })
    .eq('id', trader_id);

  // Create credit allocation
  const creditBalance = is_competitor ? 1000 : 500;

  const { data: credits, error: creditError } = await supabase
    .from('credit_allocations')
    .insert({
      lobby_id: lobbyId,
      trader_id,
      balance: creditBalance,
      total_earned: creditBalance,
      total_spent: 0,
    })
    .select()
    .single();

  if (creditError) {
    return NextResponse.json({ error: creditError.message }, { status: 500 });
  }

  return NextResponse.json(
    { session, credits },
    { status: 201 },
  );
}
