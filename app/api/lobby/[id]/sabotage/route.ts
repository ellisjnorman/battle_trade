import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();
  const { type, target_trader_id, source_trader_id } = body;

  if (!type || !target_trader_id || !source_trader_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify both traders are in this lobby
  const { data: traders } = await supabase
    .from('traders')
    .select('id')
    .eq('lobby_id', lobbyId)
    .in('id', [target_trader_id, source_trader_id]);

  if (!traders || traders.length < 2) {
    return NextResponse.json({ error: 'Traders not found in this lobby' }, { status: 404 });
  }

  // Record the sabotage as a volatility event scoped to the lobby
  const { data, error } = await supabase
    .from('volatility_events')
    .insert({
      lobby_id: lobbyId,
      type: `sabotage_${type}`,
      trigger_mode: 'manual',
      fired_at: new Date().toISOString(),
      created_by: source_trader_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
