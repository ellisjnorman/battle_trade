import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getProvider } from '@/lib/prediction-markets';

export const dynamic = 'force-dynamic';

/** POST — Place a bet on an outcome */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; marketId: string }> },
) {
  const { marketId } = await params;

  let body: { bettor_id: string; outcome_id: string; amount_credits: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { bettor_id, outcome_id, amount_credits } = body;

  if (!bettor_id || !outcome_id || !amount_credits) {
    return NextResponse.json(
      { error: 'bettor_id, outcome_id, and amount_credits are required' },
      { status: 400 },
    );
  }

  if (typeof amount_credits !== 'number' || amount_credits <= 0) {
    return NextResponse.json(
      { error: 'amount_credits must be a positive number' },
      { status: 400 },
    );
  }

  try {
    const provider = getProvider('mock');
    const result = await provider.placeBet({
      bettor_id,
      market_id: marketId,
      outcome_id,
      amount_credits,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Bet failed — market may be closed or insufficient credits', result },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to place bet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET — List all bets for this market */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; marketId: string }> },
) {
  const { marketId } = await params;

  const { data: bets, error } = await supabase
    .from('bets')
    .select('*')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bets: bets ?? [] });
}
