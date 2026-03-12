import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateTraderInLobby } from '@/lib/validate-trader';
import {
  SABOTAGES,
  SABOTAGE_TYPES,
  type SabotageType,
  type SabotageRecord,
  getCredits,
  deductCredits,
  addCredits,
  checkCooldown,
  checkDefense,
  applySabotageEffect,
} from '@/lib/sabotage';

export const dynamic = 'force-dynamic';

/** Fire-and-forget broadcast — subscribe, send, clean up quickly */
function broadcastEvent(channelName: string, event: string, payload: Record<string, unknown>) {
  const ch = supabase.channel(channelName);
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      ch.send({ type: 'broadcast', event, payload }).catch(() => {});
      setTimeout(() => supabase.removeChannel(ch), 200);
    }
  });
  // Failsafe cleanup
  setTimeout(() => supabase.removeChannel(ch), 2000);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();
  const { attacker_id, target_id, type, payload } = body;

  if (!attacker_id || !target_id || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (attacker_id === target_id) {
    return NextResponse.json({ error: 'Cannot sabotage yourself' }, { status: 400 });
  }

  // Verify attacker belongs to this lobby
  const attacker = await validateTraderInLobby(attacker_id, lobbyId);
  if (!attacker) {
    return NextResponse.json({ error: 'Invalid attacker' }, { status: 403 });
  }

  // Validate sabotage type
  if (!SABOTAGE_TYPES.includes(type as SabotageType)) {
    return NextResponse.json({ error: `Invalid sabotage type: ${type}` }, { status: 400 });
  }

  const sabotageDef = SABOTAGES[type as SabotageType];

  // Verify active round
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('status', 'active')
    .single();

  if (!activeRound) {
    return NextResponse.json({ error: 'No active round' }, { status: 400 });
  }

  // Verify target is in lobby and not eliminated
  const { data: target } = await supabase
    .from('traders')
    .select('id, name, is_eliminated')
    .eq('id', target_id)
    .eq('lobby_id', lobbyId)
    .single();

  if (!target) {
    return NextResponse.json({ error: 'Target not found in lobby' }, { status: 404 });
  }

  if (target.is_eliminated) {
    return NextResponse.json({ error: 'Cannot target eliminated trader' }, { status: 400 });
  }

  // Check attacker credits
  const balance = await getCredits(attacker_id, lobbyId);
  if (balance < sabotageDef.cost) {
    return NextResponse.json(
      { error: 'Insufficient credits', required: sabotageDef.cost, balance },
      { status: 400 },
    );
  }

  // Check cooldown
  const cooldown = await checkCooldown(attacker_id, lobbyId);
  if (cooldown.onCooldown) {
    return NextResponse.json(
      { error: 'On cooldown', remainingSeconds: cooldown.remainingSeconds },
      { status: 429 },
    );
  }

  // Check target defenses
  const defense = await checkDefense(target_id, lobbyId, type as SabotageType);

  // HEDGE: block sabotage, refund 50%
  if (defense.shield) {
    const refund = Math.round(sabotageDef.cost * 0.5);
    await deductCredits(attacker_id, lobbyId, sabotageDef.cost);
    await addCredits(attacker_id, lobbyId, refund, 'hedge_refund');

    // Consume the shield
    if (defense.shieldId) {
      await supabase
        .from('defenses')
        .update({ status: 'consumed' })
        .eq('id', defense.shieldId);
    }

    // Record sabotage as hedged
    const { data: sabotage } = await supabase
      .from('sabotages')
      .insert({
        lobby_id: lobbyId,
        attacker_id,
        target_id,
        type,
        cost: sabotageDef.cost,
        status: 'hedged',
        payload: payload ?? null,
        duration_seconds: sabotageDef.duration,
        fired_at: new Date().toISOString(),
      })
      .select()
      .single();

    const shieldBalance = await getCredits(attacker_id, lobbyId);

    // Broadcast to both parties + lobby
    broadcastEvent(`t-${target_id}`, 'sabotage', { type: 'defense_result', result: 'hedged', attacker_name: attacker.name });
    broadcastEvent(`t-${attacker_id}`, 'sabotage', { type: 'defense_result', result: 'hedged', refund });
    broadcastEvent(`lobby-${lobbyId}-sabotage`, 'sabotage', { type: 'sabotage_hedged', target_id, target_name: target.name, attacker_name: attacker.name, weapon_type: type });

    return NextResponse.json({ result: 'hedged', sabotage, refund, credits_remaining: shieldBalance }, { status: 200 });
  }

  // STOP-LOSS: redirect sabotage to attacker
  if (defense.deflect) {
    await deductCredits(attacker_id, lobbyId, sabotageDef.cost);

    // Consume the deflect
    if (defense.deflectId) {
      await supabase
        .from('defenses')
        .update({ status: 'consumed' })
        .eq('id', defense.deflectId);
    }

    const expiresAt = sabotageDef.duration
      ? new Date(Date.now() + sabotageDef.duration * 1000).toISOString()
      : null;

    // Record sabotage as stopped
    const { data: sabotage } = await supabase
      .from('sabotages')
      .insert({
        lobby_id: lobbyId,
        attacker_id,
        target_id,
        type,
        cost: sabotageDef.cost,
        status: 'stopped',
        payload: payload ?? null,
        duration_seconds: sabotageDef.duration,
        fired_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Apply sabotage back to attacker
    const deflectedSabotage: SabotageRecord = {
      id: sabotage?.id ?? '',
      lobby_id: lobbyId,
      attacker_id: target_id,
      target_id: attacker_id,
      type: type as SabotageType,
      cost: sabotageDef.cost,
      status: 'active',
      payload: payload ?? null,
      duration_seconds: sabotageDef.duration,
      fired_at: new Date().toISOString(),
      expires_at: expiresAt,
      sponsor_name: null,
    };
    await applySabotageEffect(deflectedSabotage, lobbyId);

    const deflectBalance = await getCredits(attacker_id, lobbyId);

    // Broadcast to both parties + lobby
    broadcastEvent(`t-${target_id}`, 'sabotage', { type: 'defense_result', result: 'stopped', attacker_name: attacker.name });
    broadcastEvent(`t-${attacker_id}`, 'sabotage', { type: 'sabotage_received', sabotage: deflectedSabotage as unknown as Record<string, unknown> });
    broadcastEvent(`lobby-${lobbyId}-sabotage`, 'sabotage', { type: 'sabotage_stopped', attacker_id, target_id, target_name: target.name, attacker_name: attacker.name, weapon_type: type });

    return NextResponse.json({ result: 'stopped', sabotage, credits_remaining: deflectBalance }, { status: 200 });
  }

  // NO DEFENSE: apply sabotage normally
  await deductCredits(attacker_id, lobbyId, sabotageDef.cost);

  const expiresAt = sabotageDef.duration
    ? new Date(Date.now() + sabotageDef.duration * 1000).toISOString()
    : null;

  const { data: sabotage } = await supabase
    .from('sabotages')
    .insert({
      lobby_id: lobbyId,
      attacker_id,
      target_id,
      type,
      cost: sabotageDef.cost,
      status: 'active',
      payload: payload ?? null,
      duration_seconds: sabotageDef.duration,
      fired_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .select()
    .single();

  const sabotageRecord: SabotageRecord = {
    id: sabotage?.id ?? '',
    lobby_id: lobbyId,
    attacker_id,
    target_id,
    type: type as SabotageType,
    cost: sabotageDef.cost,
    status: 'active',
    payload: payload ?? null,
    duration_seconds: sabotageDef.duration,
    fired_at: new Date().toISOString(),
    expires_at: expiresAt,
    sponsor_name: null,
  };

  await applySabotageEffect(sabotageRecord, lobbyId);

  const remainingBalance = await getCredits(attacker_id, lobbyId);

  // Broadcast to target and lobby
  broadcastEvent(`t-${target_id}`, 'sabotage', { type: 'sabotage_received', sabotage: sabotageRecord as unknown as Record<string, unknown>, attacker_name: attacker.name });
  broadcastEvent(`lobby-${lobbyId}-sabotage`, 'sabotage', { type: 'sabotage_received', sabotage: sabotageRecord as unknown as Record<string, unknown>, attacker_name: attacker.name, target_id, target_name: target.name, weapon_type: type });

  return NextResponse.json({ result: 'success', sabotage: sabotageRecord, credits_remaining: remainingBalance }, { status: 201 });
}
