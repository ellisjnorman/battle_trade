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
      .select('*')
      .eq('id', id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // 2. Get last 10 match sessions with lobby name (optional — sessions table may not exist)
    let matches: Array<{ id: string; lobby_id: string; lobby_name: string | null; final_rank: number | null; final_balance: number | null; starting_balance: number | null; created_at: string }> = [];
    try {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, lobby_id, final_rank, final_balance, starting_balance, created_at, lobbies(name)')
        .eq('trader_id', id)
        .order('created_at', { ascending: false })
        .limit(10);
      matches = (sessions ?? []).map((s) => ({
        id: s.id,
        lobby_id: s.lobby_id,
        lobby_name: (s.lobbies as unknown as { name: string })?.name ?? null,
        final_rank: s.final_rank,
        final_balance: s.final_balance,
        starting_balance: s.starting_balance,
        created_at: s.created_at,
      }));
    } catch { /* table may not exist */ }

    // 3-7: Optional enrichment — gracefully degrade if tables don't exist
    let heatmap: unknown[] = [];
    let strategies: unknown[] = [];
    let strategyStats = { count: 0, total_upvotes: 0 };
    let followers: unknown[] = [];
    let following: unknown[] = [];
    let isFollowing = false;

    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const { data } = await supabase.from('daily_stats').select('date, lobbies_played, rounds, trades, avg_return, pnl').eq('trader_id', id).gte('date', ninetyDaysAgo.toISOString().split('T')[0]).order('date', { ascending: true });
      heatmap = data ?? [];
    } catch { /* optional */ }

    try {
      const { data } = await supabase.from('strategies').select('id, title, body, upvotes, tags, created_at').eq('author_id', id).order('upvotes', { ascending: false });
      strategies = data ?? [];
      strategyStats = { count: (data ?? []).length, total_upvotes: (data ?? []).reduce((sum: number, s: { upvotes?: number }) => sum + (s.upvotes ?? 0), 0) };
    } catch { /* optional */ }

    try {
      const { data: fr } = await supabase.from('follows').select('follower_id, profiles!follows_follower_id_fkey(id, display_name, avatar_url, rank_tier, tr_score)').eq('following_id', id);
      followers = (fr ?? []).map((r) => { const p = r.profiles as unknown as { id: string; display_name: string; avatar_url: string | null; rank_tier: string; tr_score: number } | null; return p ?? null; }).filter(Boolean);
      const { data: fg } = await supabase.from('follows').select('following_id, profiles!follows_following_id_fkey(id, display_name, avatar_url, rank_tier, tr_score)').eq('follower_id', id);
      following = (fg ?? []).map((r) => { const p = r.profiles as unknown as { id: string; display_name: string; avatar_url: string | null; rank_tier: string; tr_score: number } | null; return p ?? null; }).filter(Boolean);
      if (viewerId && viewerId !== id) {
        const { data: fc } = await supabase.from('follows').select('id').eq('follower_id', viewerId).eq('following_id', id).maybeSingle();
        isFollowing = !!fc;
      }
    } catch { /* optional */ }

    return NextResponse.json({
      profile,
      matches,
      heatmap,
      strategies,
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
