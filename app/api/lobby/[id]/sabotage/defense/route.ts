import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  DEFENSE_DEFS,
  DEFENSE_TYPES,
  type DefenseType,
  getCredits,
  deductCredits,
} from '@/lib/sabotage';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();
  const { trader_id, type } = body;

  if (!trader_id || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!DEFENSE_TYPES.includes(type as DefenseType)) {
    return NextResponse.json({ error: `Invalid defense type: ${type}` }, { status: 400 });
  }

  const defenseDef = DEFENSE_DEFS[type as DefenseType];

  // Check credits
  const balance = await getCredits(trader_id, lobbyId);
  if (balance < defenseDef.cost) {
    return NextResponse.json(
      { error: 'Insufficient credits', required: defenseDef.cost, balance },
      { status: 400 },
    );
  }

  await deductCredits(trader_id, lobbyId, defenseDef.cost);

  const expiresAt = defenseDef.duration
    ? new Date(Date.now() + defenseDef.duration * 1000).toISOString()
    : null;

  const { data: defense, error } = await supabase
    .from('defenses')
    .insert({
      lobby_id: lobbyId,
      trader_id,
      type,
      cost: defenseDef.cost,
      status: 'active',
      activated_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast to trader personal channel
  const traderChannel = supabase.channel(`trader-${trader_id}`);
  await traderChannel.send({
    type: 'broadcast',
    event: 'sabotage',
    payload: { type: 'defense_activated', defense_type: type },
  });

  // Broadcast to lobby feed
  const lobbyChannel = supabase.channel(`lobby-${lobbyId}-sabotage`);
  await lobbyChannel.send({
    type: 'broadcast',
    event: 'sabotage',
    payload: { type: 'defense_activated', trader_id, defense_type: type },
  });

  return NextResponse.json({ result: 'success', defense }, { status: 201 });
}
