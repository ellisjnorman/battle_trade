import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { calcUnrealizedPnl } from '@/lib/pnl';
import { getLobbyConfig } from '@/lib/lobby';
import { getExecutor } from '@/lib/trade-executor';
import { validateTraderInLobby } from '@/lib/validate-trader';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { parseBody, OpenPositionSchema } from '@/lib/validation';
import type { Position } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Rate limit: 30 trades per minute per IP
  const ip = getClientIp(request);
  const rl = rateLimit(`trade:${ip}`, 30);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { id: lobbyId } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const parsed = parseBody(OpenPositionSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { trader_id, round_id, symbol, direction, size, leverage, order_type, limit_price, stop_price, trail_pct } = parsed.data;

  // Verify trader + lobby config in parallel
  const [trader, config] = await Promise.all([
    validateTraderInLobby(trader_id, lobbyId),
    getLobbyConfig(lobbyId),
  ]);

  if (!trader) {
    return NextResponse.json({ error: 'Invalid trader for this lobby' }, { status: 403 });
  }

  if (!config) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  if (config.leverage_tiers.length > 0 && !config.leverage_tiers.includes(leverage)) {
    return NextResponse.json(
      { error: `Leverage must be one of: ${config.leverage_tiers.join(', ')}` },
      { status: 400 },
    );
  }

  // Validate symbol against lobby config
  if (config.available_symbols.length > 0 && !config.available_symbols.includes(symbol)) {
    return NextResponse.json(
      { error: `Symbol not available in this lobby` },
      { status: 400 },
    );
  }

  // Verify round + fetch price in parallel
  const [roundResult, priceResult] = await Promise.all([
    supabase
      .from('rounds')
      .select('id')
      .eq('id', round_id)
      .eq('lobby_id', lobbyId)
      .single(),
    supabase
      .from('prices')
      .select('price')
      .eq('symbol', symbol)
      .single(),
  ]);

  const { data: round } = roundResult;
  const { data: priceRow, error: priceError } = priceResult;

  if (!round) {
    return NextResponse.json({ error: 'Round not found in this lobby' }, { status: 404 });
  }

  if (priceError || !priceRow) {
    return NextResponse.json({ error: 'Price not available for symbol' }, { status: 404 });
  }

  // Execute via trade executor abstraction
  const executor = getExecutor(config);
  const result = await executor.execute({
    lobby_id: lobbyId,
    trader_id,
    round_id,
    asset: symbol,
    direction,
    size_usd: size,
    entry_price: priceRow.price,
    leverage,
    order_type: order_type || 'market',
    limit_price: limit_price ?? undefined,
    stop_price: stop_price ?? undefined,
    trail_pct: trail_pct ?? undefined,
  });

  if (!result.success) {
    if (result.error === 'LOCKED_OUT') {
      // Find remaining blackout time for client
      const { data: blackoutSabotage } = await supabase
        .from('sabotages')
        .select('expires_at')
        .eq('target_id', trader_id)
        .eq('lobby_id', lobbyId)
        .eq('type', 'blackout')
        .eq('status', 'active')
        .order('fired_at', { ascending: false })
        .limit(1)
        .single();

      const remaining = blackoutSabotage?.expires_at
        ? Math.ceil((new Date(blackoutSabotage.expires_at).getTime() - Date.now()) / 1000)
        : 0;

      return NextResponse.json(
        { error: 'LOCKED_OUT', remaining: Math.max(0, remaining) },
        { status: 403 },
      );
    }

    if (result.error === 'ASSET_FROZEN') {
      return NextResponse.json(
        { error: 'ASSET_FROZEN' },
        { status: 403 },
      );
    }

    if (result.error === 'MAX_POSITIONS_REACHED') {
      return NextResponse.json(
        { error: 'Maximum 3 open positions allowed' },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Fetch the created position to return full data
  const { data: position } = await supabase
    .from('positions')
    .select('id, trader_id, round_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, opened_at, closed_at, order_type, limit_price, stop_price, trail_pct, trail_peak, status')
    .eq('id', result.position_id)
    .single();

  return NextResponse.json(
    { ...position, external_tx_id: result.external_tx_id },
    { status: 201 },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const { position_id } = body;

  if (!position_id) {
    return NextResponse.json({ error: 'Missing position_id' }, { status: 400 });
  }

  // Verify the position's trader belongs to this lobby
  const { data: posCheck } = await supabase
    .from('positions')
    .select('trader_id, traders!inner(lobby_id)')
    .eq('id', position_id)
    .single();

  if (!posCheck || (posCheck.traders as unknown as { lobby_id: string })?.lobby_id !== lobbyId) {
    return NextResponse.json({ error: 'Position not found in this lobby' }, { status: 404 });
  }

  // Check if this is a pending limit order — cancel it directly
  const { data: pendingOrder } = await supabase
    .from('positions')
    .select('id')
    .eq('id', position_id)
    .eq('status', 'pending')
    .single();

  if (pendingOrder) {
    const { data: cancelled, error: cancelErr } = await supabase
      .from('positions')
      .update({ status: 'cancelled', closed_at: new Date().toISOString() })
      .eq('id', position_id)
      .select()
      .single();

    if (cancelErr) {
      return NextResponse.json({ error: cancelErr.message }, { status: 500 });
    }
    return NextResponse.json(cancelled);
  }

  // Otherwise close an open position at market price
  const { data: position, error: fetchError } = await supabase
    .from('positions')
    .select('id, trader_id, round_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, opened_at, closed_at, order_type, limit_price, stop_price, trail_pct, trail_peak, status')
    .eq('id', position_id)
    .eq('status', 'open')
    .is('closed_at', null)
    .single();

  if (fetchError || !position) {
    return NextResponse.json({ error: 'Open position not found' }, { status: 404 });
  }

  const pos = position as Position;

  const { data: priceRow, error: priceError } = await supabase
    .from('prices')
    .select('price')
    .eq('symbol', pos.symbol)
    .single();

  if (priceError || !priceRow) {
    return NextResponse.json({ error: 'Price not available for symbol' }, { status: 404 });
  }

  const exitPrice = priceRow.price;
  const realizedPnl = calcUnrealizedPnl(pos, exitPrice);

  const { data: updated, error: updateError } = await supabase
    .from('positions')
    .update({
      exit_price: exitPrice,
      realized_pnl: realizedPnl,
      closed_at: new Date().toISOString(),
      status: 'closed',
    })
    .eq('id', position_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
