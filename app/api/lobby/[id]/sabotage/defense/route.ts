import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateTraderInLobby } from '@/lib/validate-trader';
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

  // Verify trader belongs to this lobby
  const trader = await validateTraderInLobby(trader_id, lobbyId);
  if (!trader) {
    return NextResponse.json({ error: 'Invalid trader' }, { status: 403 });
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

  // UNFREEZE: immediately clear lockout + asset freeze from session & expire active sabotages
  if (type === 'unfreeze') {
    await supabase
      .from('sessions')
      .update({ positions_locked: false, frozen_asset: null })
      .eq('trader_id', trader_id)
      .eq('lobby_id', lobbyId);

    await supabase
      .from('sabotages')
      .update({ status: 'expired' })
      .eq('target_id', trader_id)
      .eq('lobby_id', lobbyId)
      .eq('status', 'active')
      .in('type', ['lockout', 'asset_freeze']);

    // Mark the unfreeze defense as consumed (instant use)
    await supabase
      .from('defenses')
      .update({ status: 'consumed' })
      .eq('id', defense.id);
  }

  const remainingBalance = await getCredits(trader_id, lobbyId);

  // Fire-and-forget broadcast to trader personal channel + lobby feed
  const bc = (name: string, event: string, payload: Record<string, unknown>) => {
    const ch = supabase.channel(name);
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event, payload }).catch(() => {});
        setTimeout(() => supabase.removeChannel(ch), 200);
      }
    });
    setTimeout(() => supabase.removeChannel(ch), 2000);
  };
  bc(`t-${trader_id}`, 'sabotage', { type: 'defense_activated', defense_type: type });
  bc(`lobby-${lobbyId}-sabotage`, 'sabotage', { type: 'defense_activated', trader_id, trader_name: trader.name, defense_type: type });

  return NextResponse.json({ result: 'success', defense, credits_remaining: remainingBalance }, { status: 201 });
}
