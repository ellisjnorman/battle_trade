import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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
    .select('id, is_eliminated')
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

  // SHIELD: block sabotage, refund 50%
  if (defense.shield) {
    const refund = Math.round(sabotageDef.cost * 0.5);
    await deductCredits(attacker_id, lobbyId, sabotageDef.cost);
    await addCredits(attacker_id, lobbyId, refund, 'shield_refund');

    // Consume the shield
    if (defense.shieldId) {
      await supabase
        .from('defenses')
        .update({ status: 'consumed' })
        .eq('id', defense.shieldId);
    }

    // Record sabotage as shielded
    const { data: sabotage } = await supabase
      .from('sabotages')
      .insert({
        lobby_id: lobbyId,
        attacker_id,
        target_id,
        type,
        cost: sabotageDef.cost,
        status: 'shielded',
        payload: payload ?? null,
        duration_seconds: sabotageDef.duration,
        fired_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Broadcast to both parties
    const targetChannel = supabase.channel(`trader-${target_id}`);
    await targetChannel.send({
      type: 'broadcast',
      event: 'sabotage',
      payload: { type: 'defense_result', result: 'shielded' },
    });

    const attackerChannel = supabase.channel(`trader-${attacker_id}`);
    await attackerChannel.send({
      type: 'broadcast',
      event: 'sabotage',
      payload: { type: 'defense_result', result: 'shielded', refund },
    });

    const lobbyChannel = supabase.channel(`lobby-${lobbyId}-sabotage`);
    await lobbyChannel.send({
      type: 'broadcast',
      event: 'sabotage',
      payload: { type: 'sabotage_shielded', target_id },
    });

    return NextResponse.json({ result: 'shielded', sabotage, refund }, { status: 200 });
  }

  // DEFLECT: redirect sabotage to attacker
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

    // Record sabotage as deflected
    const { data: sabotage } = await supabase
      .from('sabotages')
      .insert({
        lobby_id: lobbyId,
        attacker_id,
        target_id,
        type,
        cost: sabotageDef.cost,
        status: 'deflected',
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

    // Broadcast to both parties
    const targetChannel = supabase.channel(`trader-${target_id}`);
    await targetChannel.send({
      type: 'broadcast',
      event: 'sabotage',
      payload: { type: 'defense_result', result: 'deflected' },
    });

    const attackerChannel = supabase.channel(`trader-${attacker_id}`);
    await attackerChannel.send({
      type: 'broadcast',
      event: 'sabotage',
      payload: { type: 'sabotage_received', sabotage: deflectedSabotage },
    });

    const lobbyChannel = supabase.channel(`lobby-${lobbyId}-sabotage`);
    await lobbyChannel.send({
      type: 'broadcast',
      event: 'sabotage',
      payload: { type: 'sabotage_deflected', attacker_id, target_id },
    });

    return NextResponse.json({ result: 'deflected', sabotage }, { status: 200 });
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

  // Broadcast to target
  const targetChannel = supabase.channel(`trader-${target_id}`);
  await targetChannel.send({
    type: 'broadcast',
    event: 'sabotage',
    payload: { type: 'sabotage_received', sabotage: sabotageRecord },
  });

  return NextResponse.json({ result: 'success', sabotage: sabotageRecord }, { status: 201 });
}
