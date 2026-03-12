import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { suspendMarket, resumeMarket } from '@/lib/prediction-markets';
import { getPreset } from '@/lib/event-presets';
import { checkAuth } from '@/app/api/lobby/[id]/admin/auth';
import { logAdminAction } from '@/lib/audit';
import { parseBody, FireEventSchema } from '@/lib/validation';
import type { PresetEvent } from '@/lib/event-presets';

export const dynamic = 'force-dynamic';

/** Subscribe, send, then clean up */
function bc(channelName: string, event: string, payload: Record<string, unknown>) {
  const ch = supabase.channel(channelName);
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await ch.send({ type: 'broadcast', event, payload });
      setTimeout(() => supabase.removeChannel(ch), 500);
    }
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  const { data, error } = await supabase
    .from('volatility_events')
    .select('id, lobby_id, type, asset, magnitude, duration_seconds, headline, trigger_mode, fired_at, created_by')
    .eq('lobby_id', lobbyId)
    .order('fired_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=3, stale-while-revalidate=10' },
  });
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
  const { type, asset, magnitude, duration_seconds, headline, trigger_mode, created_by, preset_id } = body;

  // Preset execution: fire a chain of events with delay support
  if (preset_id) {
    const preset = getPreset(preset_id);
    if (!preset) {
      return NextResponse.json({ error: 'Unknown preset' }, { status: 400 });
    }

    const { data: activeRound } = await supabase
      .from('rounds')
      .select('id')
      .eq('lobby_id', lobbyId)
      .eq('status', 'active')
      .single();

    if (!activeRound) {
      return NextResponse.json({ error: 'No active round in this lobby' }, { status: 400 });
    }

    const firedEvents: unknown[] = [];

    for (const event of preset.events) {
      const delay = event.delay_seconds ?? 0;
      if (delay === 0) {
        const result = await fireEvent(lobbyId, event, preset.headline);
        firedEvents.push(result);
      } else {
        // Schedule delayed events
        setTimeout(() => fireEvent(lobbyId, event, preset.headline), delay * 1000);
        firedEvents.push({ type: event.type, delay_seconds: delay, scheduled: true });
      }
    }

    // Handle leverage_surge liquidation check
    const hasLeverageSurge = preset.events.some(e => e.type === 'leverage_surge');
    if (hasLeverageSurge) {
      await applyLeverageSurge(lobbyId);
    }

    return NextResponse.json({ preset_id, events_fired: firedEvents.length, events: firedEvents }, { status: 201 });
  }

  const parsed = parseBody(FireEventSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { type: validatedType, asset: validatedAsset, magnitude: validatedMagnitude, duration_seconds: validatedDuration, trigger_mode: validatedTriggerMode } = parsed.data;

  // Validate lobby has an active round
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('status', 'active')
    .single();

  if (!activeRound) {
    return NextResponse.json({ error: 'No active round in this lobby' }, { status: 400 });
  }

  // Create volatility event record
  const { data: eventRecord, error } = await supabase
    .from('volatility_events')
    .insert({
      lobby_id: lobbyId,
      type: validatedType,
      asset: validatedAsset ?? null,
      magnitude: validatedMagnitude ?? null,
      duration_seconds: validatedDuration ?? null,
      headline: headline ?? null,
      trigger_mode: validatedTriggerMode,
      fired_at: new Date().toISOString(),
      created_by: created_by ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast event_start to lobby channel
  bc(`lobby-${lobbyId}-events`, 'volatility', {
    type: 'event_start',
    event: eventRecord,
    secondsRemaining: validatedDuration ?? 60,
  });

  // If there's an active prediction market, suspend it during the event
  const { data: market } = await supabase
    .from('prediction_markets')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('status', 'open')
    .single();

  if (market) {
    await suspendMarket(market.id);
    bc(`lobby-${lobbyId}-events`, 'market', { type: 'market_suspended', reason: `Volatility event: ${validatedType}` });
  }

  // Schedule event completion
  if (validatedDuration && validatedDuration > 0) {
    setTimeout(async () => {
      bc(`lobby-${lobbyId}-events`, 'volatility', { type: 'event_complete', event: eventRecord });
      if (market) {
        await resumeMarket(market.id);
        bc(`lobby-${lobbyId}-events`, 'market', { type: 'market_resumed' });
      }
    }, (validatedDuration ?? 60) * 1000);
  }

  // Handle leverage_surge: double position sizes and check liquidations
  if (validatedType === 'leverage_surge') {
    await applyLeverageSurge(lobbyId);
  }

  logAdminAction(lobbyId, 'fire_event', { type: validatedType, asset: validatedAsset });

  return NextResponse.json(eventRecord, { status: 201 });
}

// ---------------------------------------------------------------------------
// Fire a single event (used by preset chain execution)
// ---------------------------------------------------------------------------

async function fireEvent(lobbyId: string, event: PresetEvent, headline: string) {
  const assetMap: Record<string, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', ALL: 'ALL' };
  const resolvedAsset = assetMap[event.asset] ?? event.asset;

  const { data: record, error } = await supabase
    .from('volatility_events')
    .insert({
      lobby_id: lobbyId,
      type: event.type,
      asset: resolvedAsset,
      magnitude: event.magnitude,
      duration_seconds: event.duration_seconds,
      headline,
      trigger_mode: 'manual',
      fired_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Broadcast
  bc(`lobby-${lobbyId}-events`, 'volatility', {
    type: 'event_start',
    event: record,
    secondsRemaining: event.duration_seconds,
  });

  // Schedule completion
  if (event.duration_seconds > 0) {
    setTimeout(() => {
      bc(`lobby-${lobbyId}-events`, 'volatility', { type: 'event_complete', event: record });
    }, event.duration_seconds * 1000);
  }

  // Handle leverage_surge inline
  if (event.type === 'leverage_surge') {
    await applyLeverageSurge(lobbyId);
  }

  return record;
}

// ---------------------------------------------------------------------------
// Leverage surge: double position sizes, then check liquidations
// ---------------------------------------------------------------------------

async function applyLeverageSurge(lobbyId: string) {
  // Get active round
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('status', 'active')
    .single();

  if (!round) return;

  // Get all open positions in this round
  const { data: positions } = await supabase
    .from('positions')
    .select('id, trader_id, symbol, direction, size, leverage, entry_price')
    .eq('round_id', round.id)
    .is('closed_at', null);

  if (!positions || positions.length === 0) return;

  // Double all position sizes (parallel)
  await Promise.all(
    positions.map((pos) =>
      supabase
        .from('positions')
        .update({ size: pos.size * 2 })
        .eq('id', pos.id)
        .then()
    )
  );

  // Broadcast the surge
  bc(`lobby-${lobbyId}-events`, 'volatility', { type: 'leverage_surge_applied', positions_affected: positions.length });

  // Check liquidations after surge
  const { data: prices } = await supabase.from('prices').select('symbol, price');
  if (!prices) return;

  const priceMap: Record<string, number> = {};
  for (const p of prices) priceMap[p.symbol] = p.price;

  // Check liquidations and close in parallel
  const liquidationUpdates: PromiseLike<unknown>[] = [];
  for (const pos of positions) {
    const currentPrice = priceMap[pos.symbol];
    if (!currentPrice) continue;

    // After doubling size, effective leverage doubles too
    const effectiveLeverage = pos.leverage * 2;
    const liqPrice = pos.direction === 'long'
      ? pos.entry_price * (1 - 1 / effectiveLeverage)
      : pos.entry_price * (1 + 1 / effectiveLeverage);

    const isLiquidated = pos.direction === 'long'
      ? currentPrice <= liqPrice
      : currentPrice >= liqPrice;

    if (isLiquidated) {
      // Force close at current price
      const pnl = pos.direction === 'long'
        ? (currentPrice - pos.entry_price) / pos.entry_price * pos.size * 2 * pos.leverage
        : (pos.entry_price - currentPrice) / pos.entry_price * pos.size * 2 * pos.leverage;

      liquidationUpdates.push(
        supabase
          .from('positions')
          .update({
            closed_at: new Date().toISOString(),
            exit_price: currentPrice,
            realized_pnl: pnl,
          })
          .eq('id', pos.id)
          .then()
      );
    }
  }
  if (liquidationUpdates.length > 0) {
    await Promise.all(liquidationUpdates);
  }
}
