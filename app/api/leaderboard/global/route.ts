import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100);
  const minTr = parseInt(url.searchParams.get('min_tr') ?? '0');

  let query = supabase
    .from('profiles')
    .select('id, display_name, handle, avatar_url, tr_score, rank_tier, total_wins, win_rate, best_return, bio, total_lobbies_played')
    .order('tr_score', { ascending: false })
    .limit(limit);

  if (minTr > 0) {
    query = query.gte('tr_score', minTr);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ traders: data ?? [] });
}
