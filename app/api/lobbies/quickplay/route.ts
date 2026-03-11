import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Quick Play — find an open lobby to join, or create one.
 * Returns the lobby ID to redirect to.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const profileId = body.profile_id;

  const sb = getServerSupabase();

  // 1. Find a waiting public lobby with room (< 8 players, free entry)
  const { data: lobbies } = await sb
    .from('lobbies')
    .select('id, name, config')
    .eq('status', 'waiting')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(10);

  if (lobbies && lobbies.length > 0) {
    // Filter to free lobbies and check player count
    for (const lobby of lobbies) {
      const fee = lobby.config?.entry_fee ?? 0;
      if (fee > 0) continue;

      const { count } = await sb
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('lobby_id', lobby.id)
        .eq('is_competitor', true);

      if ((count ?? 0) < 8) {
        return NextResponse.json({ lobby_id: lobby.id, action: 'join' });
      }
    }
  }

  // 2. No suitable lobby found — create a Quick Battle
  const invite_code = crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();

  const { data: newLobby, error } = await sb
    .from('lobbies')
    .insert({
      name: 'QUICK BATTLE',
      format: 'elimination',
      is_public: true,
      invite_code,
      created_by: profileId || null,
      config: {
        starting_balance: 10000,
        round_duration_seconds: 180,
        lobby_duration_minutes: 15,
        entry_fee: 0,
        scoring_mode: 'best_round',
        volatility_engine: 'algorithmic',
        credit_source: 'sponsor_funded',
        leverage_tiers: [5, 10, 20],
      },
      status: 'waiting',
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lobby_id: newLobby.id, action: 'created' });
}
