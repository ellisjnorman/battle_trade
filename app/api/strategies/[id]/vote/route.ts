import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: strategyId } = await params;

  try {
    const body = await request.json();
    const { voter_id } = body;

    if (!voter_id) {
      return NextResponse.json({ error: 'voter_id is required' }, { status: 400 });
    }

    // Check if vote already exists
    const { data: existing } = await supabase
      .from('strategy_votes')
      .select('id')
      .eq('strategy_id', strategyId)
      .eq('voter_id', voter_id)
      .maybeSingle();

    let voted: boolean;

    if (existing) {
      // Un-upvote: remove the vote
      const { error: deleteErr } = await supabase
        .from('strategy_votes')
        .delete()
        .eq('strategy_id', strategyId)
        .eq('voter_id', voter_id);

      if (deleteErr) {
        return NextResponse.json({ error: deleteErr.message }, { status: 500 });
      }
      voted = false;
    } else {
      // Upvote: insert the vote
      const { error: insertErr } = await supabase
        .from('strategy_votes')
        .insert({ strategy_id: strategyId, voter_id });

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      voted = true;
    }

    // Recount and update the strategy's upvotes
    const { count } = await supabase
      .from('strategy_votes')
      .select('id', { count: 'exact', head: true })
      .eq('strategy_id', strategyId);

    const upvotes = count ?? 0;

    const { error: updateErr } = await supabase
      .from('strategies')
      .update({ upvotes })
      .eq('id', strategyId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ voted, upvotes });
  } catch (err) {
    console.error('POST /api/strategies/[id]/vote error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
