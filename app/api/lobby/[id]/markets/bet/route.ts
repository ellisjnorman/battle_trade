import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { MockProvider } from '@/lib/prediction-markets';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();
  const { bettor_id, outcome_id, amount_credits } = body;

  if (!bettor_id || !outcome_id || !amount_credits) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (amount_credits <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });
  }

  // Get active market for this lobby
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('status', 'active')
    .single();

  if (!activeRound) {
    return NextResponse.json({ error: 'No active round' }, { status: 400 });
  }

  const { data: market } = await supabase
    .from('prediction_markets')
    .select('id, status')
    .eq('lobby_id', lobbyId)
    .eq('round_id', activeRound.id)
    .single();

  if (!market) {
    return NextResponse.json({ error: 'No market for this round' }, { status: 404 });
  }

  if (market.status === 'suspended') {
    return NextResponse.json({ error: 'Market is suspended during volatility event' }, { status: 403 });
  }

  if (market.status !== 'open') {
    return NextResponse.json({ error: 'Market is not open for betting' }, { status: 403 });
  }

  const provider = new MockProvider();
  const result = await provider.placeBet({
    bettor_id,
    market_id: market.id,
    outcome_id,
    amount_credits,
  });

  if (!result.success) {
    return NextResponse.json({ error: 'Bet placement failed' }, { status: 400 });
  }

  // Broadcast odds update
  const fullMarket = await provider.getMarket(market.id);
  const channel = supabase.channel(`lobby-${lobbyId}-markets`);
  await channel.send({
    type: 'broadcast',
    event: 'market',
    payload: {
      type: 'odds_update',
      outcomes: fullMarket.outcomes,
    },
  });

  return NextResponse.json(result, { status: 201 });
}
