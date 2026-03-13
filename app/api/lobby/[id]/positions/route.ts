import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { calcUnrealizedPnl } from '@/lib/pnl';
import { getLobbyConfig } from '@/lib/lobby';
import { getExecutor } from '@/lib/trade-executor';
import { authenticateTrader } from '@/lib/auth-guard';
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

  // Authenticate: verify caller owns this trader
  const [auth, config] = await Promise.all([
    authenticateTrader(request, lobbyId, trader_id),
    getLobbyConfig(lobbyId),
  ]);

  if (!auth.ok) return auth.response;
  const trader = auth.trader;

  if (!config) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  if (config.leverage_tiers?.length > 0 && !config.leverage_tiers.includes(leverage)) {
    return NextResponse.json(
      { error: `Leverage must be one of: ${config.leverage_tiers.join(', ')}` },
      { status: 400 },
    );
  }

  // Validate symbol against lobby config
  if (config.available_symbols?.length > 0 && !config.available_symbols.includes(symbol)) {
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

  // Fetch the created position to return full data (progressive fallback for schema cache)
  let position: Record<string, unknown> | null = null;
  const { data: p1, error: p1Err } = await supabase
    .from('positions')
    .select('id, trader_id, round_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, opened_at, closed_at, order_type, limit_price, stop_price, trail_pct, trail_peak, status')
    .eq('id', result.position_id)
    .single();
  if (!p1Err) {
    position = p1;
  } else {
    const { data: p2 } = await supabase
      .from('positions')
      .select('id, trader_id, round_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, opened_at, closed_at')
      .eq('id', result.position_id)
      .single();
    position = p2;
  }

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

  // Authenticate: verify caller owns this position's trader
  const auth = await authenticateTrader(request, lobbyId, posCheck.trader_id);
  if (!auth.ok) return auth.response;

  // Check if this is a pending limit order — cancel it directly
  let isPending = false;
  {
    const { data: p1 } = await supabase.from('positions').select('id').eq('id', position_id).eq('status', 'pending').single();
    if (p1) isPending = true;
  }

  if (isPending) {
    // Try update with status, fall back without
    let cancelled: Record<string, unknown> | null = null;
    const { data: c1, error: c1Err } = await supabase
      .from('positions')
      .update({ status: 'cancelled', closed_at: new Date().toISOString() })
      .eq('id', position_id)
      .select('id')
      .single();
    if (!c1Err) {
      cancelled = c1;
    } else {
      const { data: c2, error: c2Err } = await supabase
        .from('positions')
        .update({ closed_at: new Date().toISOString() })
        .eq('id', position_id)
        .select('id')
        .single();
      cancelled = c2;
      if (c2Err) return NextResponse.json({ error: c2Err.message }, { status: 500 });
    }
    return NextResponse.json(cancelled);
  }

  // Otherwise close an open position at market price
  // Try with status filter, fall back to closed_at filter only
  let position: Record<string, unknown> | null = null;
  {
    const { data: p1, error: e1 } = await supabase
      .from('positions')
      .select('id, trader_id, round_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, opened_at, closed_at')
      .eq('id', position_id)
      .is('closed_at', null)
      .single();
    if (!e1 && p1) position = p1;
  }

  if (!position) {
    return NextResponse.json({ error: 'Open position not found' }, { status: 404 });
  }

  const pos = position as unknown as Position;

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

  // Update with status if available, fall back without
  const closePayload: Record<string, unknown> = {
    exit_price: exitPrice,
    realized_pnl: realizedPnl,
    closed_at: new Date().toISOString(),
    status: 'closed',
  };

  let updated: Record<string, unknown> | null = null;
  const { data: u1, error: u1Err } = await supabase
    .from('positions')
    .update(closePayload)
    .eq('id', position_id)
    .select('id, exit_price, realized_pnl, closed_at')
    .single();

  if (!u1Err) {
    updated = u1;
  } else {
    const { status: _s, ...safePayload } = closePayload;
    const { data: u2, error: u2Err } = await supabase
      .from('positions')
      .update(safePayload)
      .eq('id', position_id)
      .select('id, exit_price, realized_pnl, closed_at')
      .single();
    if (u2Err) return NextResponse.json({ error: u2Err.message }, { status: 500 });
    updated = u2;
  }

  return NextResponse.json(updated);
}
