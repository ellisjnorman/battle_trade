import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { authenticateProfile } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/lobbies/cleanup?profile_id=xxx
 * Deletes all lobbies created by this profile that are in 'waiting' status.
 * Also cleans up associated traders, sessions, credit_allocations.
 */
export async function DELETE(request: NextRequest) {
  const profileId = request.nextUrl.searchParams.get('profile_id');
  if (!profileId) {
    return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 });
  }

  // Authenticate: verify caller owns this profile
  const auth = await authenticateProfile(request);
  if (!auth.ok) return auth.response;
  if (auth.profileId !== profileId) {
    return NextResponse.json({ error: 'Cannot clean up lobbies for another user' }, { status: 403 });
  }

  const sb = getServerSupabase();

  // Find all waiting lobbies by this creator
  const { data: lobbies } = await sb
    .from('lobbies')
    .select('id, name, status')
    .eq('created_by', profileId)
    .in('status', ['waiting', 'active']);

  if (!lobbies || lobbies.length === 0) {
    return NextResponse.json({ deleted: 0, message: 'No lobbies to clean up' });
  }

  const lobbyIds = lobbies.map(l => l.id);

  // Clean up in order: credit_allocations → positions → sessions → traders → rounds → lobbies
  await sb.from('credit_allocations').delete().in('lobby_id', lobbyIds);
  await sb.from('positions').delete().in('round_id',
    (await sb.from('rounds').select('id').in('lobby_id', lobbyIds)).data?.map(r => r.id) ?? []
  );
  await sb.from('sessions').delete().in('lobby_id', lobbyIds);
  await sb.from('traders').delete().in('lobby_id', lobbyIds);
  await sb.from('rounds').delete().in('lobby_id', lobbyIds);
  await sb.from('lobbies').delete().in('id', lobbyIds);

  return NextResponse.json({
    deleted: lobbies.length,
    names: lobbies.map(l => l.name),
  });
}
