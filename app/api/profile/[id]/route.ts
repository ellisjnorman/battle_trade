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

    // 4. Get strategies authored by this user (full data for display)
    const { data: strategies } = await supabase
      .from('strategies')
      .select('id, title, body, upvotes, tags, created_at')
      .eq('author_id', id)
      .order('upvotes', { ascending: false });

    const strategyStats = {
      count: strategies?.length ?? 0,
      total_upvotes: (strategies ?? []).reduce((sum, s) => sum + (s.upvotes ?? 0), 0),
    };

    // 5. Get followers (profiles that follow this user)
    const { data: followerRows } = await supabase
      .from('follows')
      .select('follower_id, profiles!follows_follower_id_fkey(id, display_name, avatar_url, rank_tier, tr_score)')
      .eq('following_id', id);

    const followers = (followerRows ?? []).map((r) => {
      const p = r.profiles as unknown as { id: string; display_name: string; avatar_url: string | null; rank_tier: string; tr_score: number } | null;
      return p ? { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, rank_tier: p.rank_tier, tr_score: p.tr_score } : null;
    }).filter(Boolean);

    // 6. Get following (profiles this user follows)
    const { data: followingRows } = await supabase
      .from('follows')
      .select('following_id, profiles!follows_following_id_fkey(id, display_name, avatar_url, rank_tier, tr_score)')
      .eq('follower_id', id);

    const following = (followingRows ?? []).map((r) => {
      const p = r.profiles as unknown as { id: string; display_name: string; avatar_url: string | null; rank_tier: string; tr_score: number } | null;
      return p ? { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, rank_tier: p.rank_tier, tr_score: p.tr_score } : null;
    }).filter(Boolean);

    // 7. Check if viewer follows this profile
    let isFollowing = false;
    if (viewerId && viewerId !== id) {
      const { data: followCheck } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', viewerId)
        .eq('following_id', id)
        .maybeSingle();
      isFollowing = !!followCheck;
    }

    return NextResponse.json({
      profile,
      matches,
      heatmap: heatmap ?? [],
      strategies: strategies ?? [],
      strategy_stats: strategyStats,
      followers,
      following,
      is_following: isFollowing,
    });
  } catch (err) {
    console.error('GET /api/profile/[id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
