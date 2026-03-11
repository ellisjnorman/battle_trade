import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** Get lobbies created by a specific profile */
export async function GET(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get('profile_id');
  if (!profileId) {
    return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 });
  }

  const sb = getServerSupabase();

  const { data: lobbies, error } = await sb
    .from('lobbies')
    .select('id, name, format, status, invite_code, config, created_at')
    .eq('created_by', profileId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get player counts
  if (lobbies && lobbies.length > 0) {
    const ids = lobbies.map(l => l.id);
    const { data: sessions } = await sb
      .from('sessions')
      .select('lobby_id, is_competitor')
      .in('lobby_id', ids);

    const counts: Record<string, { players: number; spectators: number }> = {};
    for (const s of sessions ?? []) {
      if (!counts[s.lobby_id]) counts[s.lobby_id] = { players: 0, spectators: 0 };
      if (s.is_competitor) counts[s.lobby_id].players++;
      else counts[s.lobby_id].spectators++;
    }

    const result = lobbies.map(l => ({
      ...l,
      player_count: counts[l.id]?.players ?? 0,
      spectator_count: counts[l.id]?.spectators ?? 0,
    }));

    return NextResponse.json({ lobbies: result });
  }

  return NextResponse.json({ lobbies: [] });
}
