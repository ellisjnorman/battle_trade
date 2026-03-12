import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const viewerId = request.nextUrl.searchParams.get('viewer_id');

  try {
    // 1. Get full profile — this is the only required query
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, tr_score, rank_tier, total_wins, total_lobbies_played, badges, created_at')
      .eq('id', id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // 2-7: Run all optional enrichment queries in parallel
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [sessionsResult, heatmapResult, strategiesResult, followersResult, followingResult, isFollowingResult] = await Promise.all([
      Promise.resolve(supabase
        .from('sessions')
        .select('id, lobby_id, trader_id, final_rank, final_balance, starting_balance, created_at, traders!inner(profile_id), lobbies(name)')
        .eq('traders.profile_id', id)
        .order('created_at', { ascending: false })
        .limit(10))
        .then(r => r.data)
        .catch(() => null),
      Promise.resolve(supabase.from('daily_stats').select('date, lobbies_played, rounds, trades, avg_return, pnl').eq('trader_id', id).gte('date', ninetyDaysAgo.toISOString().split('T')[0]).order('date', { ascending: true }))
        .then(r => r.data)
        .catch(() => null),
      Promise.resolve(supabase.from('strategies').select('id, title, body, upvotes, tags, created_at').eq('author_id', id).order('upvotes', { ascending: false }))
        .then(r => r.data)
        .catch(() => null),
      Promise.resolve(supabase.from('follows').select('follower_id, profiles!follows_follower_id_fkey(id, display_name, avatar_url, rank_tier, tr_score)').eq('following_id', id))
        .then(r => (r.data ?? []).map((row: Record<string, unknown>) => { const p = row.profiles as { id: string; display_name: string; avatar_url: string | null; rank_tier: string; tr_score: number } | null; return p ?? null; }).filter(Boolean))
        .catch(() => [] as unknown[]),
      Promise.resolve(supabase.from('follows').select('following_id, profiles!follows_following_id_fkey(id, display_name, avatar_url, rank_tier, tr_score)').eq('follower_id', id))
        .then(r => (r.data ?? []).map((row: Record<string, unknown>) => { const p = row.profiles as { id: string; display_name: string; avatar_url: string | null; rank_tier: string; tr_score: number } | null; return p ?? null; }).filter(Boolean))
        .catch(() => [] as unknown[]),
      (viewerId && viewerId !== id)
        ? Promise.resolve(supabase.from('follows').select('id').eq('follower_id', viewerId).eq('following_id', id).maybeSingle()).then(r => !!r.data).catch(() => false)
        : Promise.resolve(false),
    ]);

    const matches = (sessionsResult ?? []).map((s: Record<string, unknown>) => ({
      id: s.id,
      lobby_id: s.lobby_id,
      lobby_name: (s.lobbies as unknown as { name: string })?.name ?? null,
      final_rank: s.final_rank,
      final_balance: s.final_balance,
      starting_balance: s.starting_balance,
      created_at: s.created_at,
    }));

    const heatmap = heatmapResult ?? [];
    const strategies = strategiesResult ?? [];
    const strategyStats = { count: strategies.length, total_upvotes: (strategies as { upvotes?: number }[]).reduce((sum, s) => sum + (s.upvotes ?? 0), 0) };
    const followers = followersResult;
    const following = followingResult;
    const isFollowing = isFollowingResult;

    return NextResponse.json({
      profile,
      matches,
      heatmap,
      strategies,
      strategy_stats: strategyStats,
      followers,
      following,
      is_following: isFollowing,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('GET /api/profile/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
