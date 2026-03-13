import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leaderboard?period=daily|weekly|all
 * Returns top traders by score/performance for the given period.
 * - all: ordered by tr_score (all-time rank)
 * - daily: sessions from the last 24h, ordered by best return
 * - weekly: sessions from the last 7 days, ordered by best return
 */
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') ?? 'all';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '5', 10), 20);

  try {
    if (period === 'all') {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, tr_score, rank_tier, total_wins, total_lobbies_played')
        .order('tr_score', { ascending: false })
        .limit(limit);

      return NextResponse.json({ leaderboard: data ?? [], period }, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      });
    }

    // Daily or weekly — aggregate from sessions
    const cutoff = new Date();
    if (period === 'daily') cutoff.setHours(cutoff.getHours() - 24);
    else cutoff.setDate(cutoff.getDate() - 7);

    const { data: sessions } = await supabase
      .from('sessions')
      .select('trader_id, final_rank, final_balance, starting_balance, created_at')
      .gte('created_at', cutoff.toISOString())
      .not('final_balance', 'is', null);

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ leaderboard: [], period }, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      });
    }

    // Aggregate by trader: total return, wins, battles
    const agg: Record<string, { trader_id: string; totalReturn: number; wins: number; battles: number }> = {};
    for (const s of sessions) {
      if (!s.trader_id || s.starting_balance == null || s.final_balance == null) continue;
      if (!agg[s.trader_id]) agg[s.trader_id] = { trader_id: s.trader_id, totalReturn: 0, wins: 0, battles: 0 };
      const ret = ((s.final_balance - s.starting_balance) / s.starting_balance) * 100;
      agg[s.trader_id].totalReturn += ret;
      agg[s.trader_id].battles++;
      if (s.final_rank === 1) agg[s.trader_id].wins++;
    }

    const sorted = Object.values(agg).sort((a, b) => b.totalReturn - a.totalReturn).slice(0, limit);

    // Fetch profiles for these traders
    const traderIds = sorted.map(s => s.trader_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, tr_score, rank_tier')
      .in('id', traderIds);

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

    const leaderboard = sorted.map((s, i) => {
      const p = profileMap.get(s.trader_id);
      return {
        id: s.trader_id,
        rank: i + 1,
        display_name: p?.display_name ?? 'Unknown',
        avatar_url: p?.avatar_url ?? null,
        tr_score: p?.tr_score ?? 0,
        rank_tier: p?.rank_tier ?? 'paper_hands',
        return_pct: s.totalReturn,
        wins: s.wins,
        battles: s.battles,
      };
    });

    return NextResponse.json({ leaderboard, period }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return NextResponse.json({ leaderboard: [], period }, { status: 200 });
  }
}
