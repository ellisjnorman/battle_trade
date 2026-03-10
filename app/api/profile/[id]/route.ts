import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    // 1. Get full profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // 2. Get last 10 match sessions with lobby name
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, lobby_id, final_rank, final_balance, starting_balance, created_at, lobbies(name)')
      .eq('trader_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    const matches = (sessions ?? []).map((s) => ({
      id: s.id,
      lobby_id: s.lobby_id,
      lobby_name: (s.lobbies as unknown as { name: string })?.name ?? null,
      final_rank: s.final_rank,
      final_balance: s.final_balance,
      starting_balance: s.starting_balance,
      created_at: s.created_at,
    }));

    // 3. Get daily stats for last 90 days (heatmap data)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split('T')[0];

    const { data: heatmap } = await supabase
      .from('daily_stats')
      .select('date, lobbies_played, rounds, trades, avg_return, pnl')
      .eq('trader_id', id)
      .gte('date', dateStr)
      .order('date', { ascending: true });

    // 4. Get strategy stats
    const { data: strategies } = await supabase
      .from('strategies')
      .select('id, upvotes')
      .eq('author_id', id);

    const strategyStats = {
      count: strategies?.length ?? 0,
      total_upvotes: (strategies ?? []).reduce((sum, s) => sum + (s.upvotes ?? 0), 0),
    };

    return NextResponse.json({
      profile,
      matches,
      heatmap: heatmap ?? [],
      strategy_stats: strategyStats,
    });
  } catch (err) {
    console.error('GET /api/profile/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
