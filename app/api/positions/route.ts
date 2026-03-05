import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { calcUnrealizedPnl } from '@/lib/pnl';
import type { Position } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { trader_id, round_id, symbol, direction, size, leverage } = body;

  if (!trader_id || !round_id || !symbol || !direction || !size || !leverage) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (direction !== 'long' && direction !== 'short') {
    return NextResponse.json({ error: 'Direction must be long or short' }, { status: 400 });
  }

  if (leverage < 1 || leverage > 100) {
    return NextResponse.json({ error: 'Leverage must be between 1 and 100' }, { status: 400 });
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

export async function DELETE(request: NextRequest) {
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
