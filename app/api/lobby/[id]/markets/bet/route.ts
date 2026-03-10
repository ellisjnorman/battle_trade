import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateTraderInLobby } from '@/lib/validate-trader';
import { MockProvider } from '@/lib/prediction-markets';
import { parseBody, PlaceBetSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();
  const parsed = parseBody(PlaceBetSchema, { ...body, amount: body.amount_credits ?? body.amount });
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { bettor_id, outcome_id, amount: amount_credits } = parsed.data;

  // Verify bettor belongs to this lobby (trader or spectator)
  const bettor = await validateTraderInLobby(bettor_id, lobbyId);
  if (!bettor) {
    return NextResponse.json({ error: 'Invalid bettor' }, { status: 403 });
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
  const ch = supabase.channel(`lobby-${lobbyId}-markets`);
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await ch.send({ type: 'broadcast', event: 'market', payload: { type: 'odds_update', outcomes: fullMarket.outcomes } });
      setTimeout(() => supabase.removeChannel(ch), 500);
    }
  });

  return NextResponse.json(result, { status: 201 });
}
