import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { calcUnrealizedPnl } from '@/lib/pnl';
import { getLobbyConfig } from '@/lib/lobby';
import type { Position } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();
  const { trader_id, round_id, symbol, direction, size, leverage } = body;

  if (!trader_id || !round_id || !symbol || !direction || !size || !leverage) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (direction !== 'long' && direction !== 'short') {
    return NextResponse.json({ error: 'Direction must be long or short' }, { status: 400 });
  }

  // Validate leverage against lobby config
  const config = await getLobbyConfig(lobbyId);
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

  // Verify round belongs to this lobby
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('id', round_id)
    .eq('lobby_id', lobbyId)
    .single();

  if (!round) {
    return NextResponse.json({ error: 'Round not found in this lobby' }, { status: 404 });
  }

  const { data: priceRow, error: priceError } = await supabase
    .from('prices')
    .select('price')
    .eq('symbol', symbol)
    .single();

  if (priceError || !priceRow) {
    return NextResponse.json({ error: 'Price not available for symbol' }, { status: 404 });
  }

  const { data: position, error } = await supabase
    .from('positions')
    .insert({
      trader_id,
      round_id,
      symbol,
      direction,
      size,
      leverage,
      entry_price: priceRow.price,
      opened_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(position, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params; // acknowledge lobby scope
  const body = await request.json();
  const { position_id } = body;

  if (!position_id) {
    return NextResponse.json({ error: 'Missing position_id' }, { status: 400 });
  }

  const { data: position, error: fetchError } = await supabase
    .from('positions')
    .select('*')
    .eq('id', position_id)
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
    })
    .eq('id', position_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
