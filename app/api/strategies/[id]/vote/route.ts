import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { recalcAndSave } from '@/lib/reputation';
import { authenticateProfile } from '@/lib/auth-guard';

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

    // Authenticate: verify caller owns this profile
    const auth = await authenticateProfile(request);
    if (!auth.ok) return auth.response;
    if (auth.profileId !== voter_id) {
      return NextResponse.json({ error: 'Cannot vote as another user' }, { status: 403 });
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
        console.error('[vote/DELETE]', deleteErr.message);
        return NextResponse.json({ error: 'Failed to remove vote' }, { status: 500 });
      }
      voted = false;
    } else {
      // Upvote: insert the vote
      const { error: insertErr } = await supabase
        .from('strategy_votes')
        .insert({ strategy_id: strategyId, voter_id });

      if (insertErr) {
        console.error('[vote/INSERT]', insertErr.message);
        return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
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
      console.error('[vote/UPDATE]', updateErr.message);
      return NextResponse.json({ error: 'Failed to update vote count' }, { status: 500 });
    }

    // Creator rewards: award 5 credits per upvote to strategy author
    if (voted) {
      const { data: strategy } = await supabase
        .from('strategies')
        .select('author_id')
        .eq('id', strategyId)
        .single();

      if (strategy?.author_id && strategy.author_id !== voter_id) {
        // Award base credits (5 per upvote) + milestone bonuses
        const milestones: Record<number, number> = { 10: 50, 25: 100, 50: 200, 100: 500 };
        const bonus = milestones[upvotes] ?? 0;
        const totalReward = 5 + bonus;

        const { data: prof } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', strategy.author_id)
          .single();

        if (prof) {
          await supabase
            .from('profiles')
            .update({ credits: (prof.credits ?? 0) + totalReward })
            .eq('id', strategy.author_id);
        }
      }
    }

    // Recalc TR for strategy author (strategy/community score changes) — fire-and-forget
    const { data: stratForRecalc } = await supabase
      .from('strategies')
      .select('author_id')
      .eq('id', strategyId)
      .single();

    if (stratForRecalc?.author_id) {
      recalcAndSave(stratForRecalc.author_id).catch(() => {});
    }

    return NextResponse.json({ voted, upvotes });
  } catch (err) {
    console.error('POST /api/strategies/[id]/vote error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
