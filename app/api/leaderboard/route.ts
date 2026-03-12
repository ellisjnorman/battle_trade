import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Lightweight top-5 leaderboard for dashboard sidebar */
export async function GET() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, tr_score, rank_tier, total_wins')
    .order('tr_score', { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ leaderboard: [] }, { status: 200 });
  }

  return NextResponse.json({ leaderboard: data ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  });
}
