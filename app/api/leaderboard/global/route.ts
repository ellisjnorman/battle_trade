import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { RankTier } from '@/types';

export const dynamic = 'force-dynamic';

const VALID_SORTS = ['tr_score', 'wins', 'win_rate', 'best_return', 'lobbies'] as const;
type SortMode = (typeof VALID_SORTS)[number];

const SORT_COLUMN: Record<SortMode, string> = {
  tr_score: 'tr_score',
  wins: 'total_wins',
  win_rate: 'win_rate',
  best_return: 'best_return',
  lobbies: 'total_lobbies_played',
};

const VALID_TIERS: RankTier[] = [
  'paper_hands',
  'retail',
  'swing_trader',
  'market_maker',
  'whale',
  'degen_king',
  'legendary',
];

const SELECT_FIELDS =
  'id, display_name, handle, avatar_url, tr_score, rank_tier, total_wins, win_rate, best_return, bio, total_lobbies_played';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // --- Parse params ---
  const sortParam = url.searchParams.get('sort') ?? 'tr_score';
  const sort: SortMode = VALID_SORTS.includes(sortParam as SortMode)
    ? (sortParam as SortMode)
    : 'tr_score';

  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  const minTr = parseInt(url.searchParams.get('min_tr') ?? '0', 10) || 0;

  const tierParam = url.searchParams.get('tier');
  const tiers: RankTier[] | null = tierParam
    ? (tierParam
        .split(',')
        .map((t) => t.trim() as RankTier)
        .filter((t) => VALID_TIERS.includes(t)))
    : null;

  const search = url.searchParams.get('q')?.trim() ?? null;
  const profileId = url.searchParams.get('profile_id') ?? null;

  // --- Build query ---
  let query = supabase
    .from('profiles')
    .select(SELECT_FIELDS, { count: 'exact' })
    .order(SORT_COLUMN[sort], { ascending: false })
    .range(offset, offset + limit - 1);

  if (minTr > 0) {
    query = query.gte('tr_score', minTr);
  }

  if (tiers && tiers.length > 0) {
    query = query.in('rank_tier', tiers);
  }

  if (search) {
    // Case-insensitive search on display_name or handle
    query = query.or(
      `display_name.ilike.%${search}%,handle.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // --- My rank (if requested) ---
  let myRank: { position: number; profile: Record<string, unknown> } | null = null;

  if (profileId) {
    // Count how many profiles rank above this player using the same sort column
    const col = SORT_COLUMN[sort];

    // First get the player's profile
    const { data: me, error: meErr } = await supabase
      .from('profiles')
      .select(SELECT_FIELDS)
      .eq('id', profileId)
      .single();

    if (!meErr && me) {
      const myValue = (me as Record<string, unknown>)[col] as number;

      // Count players with a strictly higher value
      const { count: above, error: countErr } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gt(col, myValue);

      if (!countErr && above !== null) {
        myRank = {
          position: above + 1,
          profile: me as Record<string, unknown>,
        };
      }
    }
  }

  return NextResponse.json({
    traders: data ?? [],
    total: count ?? 0,
    offset,
    limit,
    sort,
    ...(myRank ? { my_rank: myRank } : {}),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15' },
  });
}
