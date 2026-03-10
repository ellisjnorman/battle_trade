import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Quick spectator join — no registration form needed.
 * Creates a minimal trader record (spectator role) and returns the ID + credits.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json().catch(() => ({}));
  const displayName = (body.display_name as string)?.trim().slice(0, 32) || `Fan_${Math.random().toString(36).slice(2, 6)}`;

  const sb = getServerSupabase();

  // Verify lobby exists
  const { data: lobby } = await sb
    .from('lobbies')
    .select('id, name, config')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  // Create or find profile
  const { data: profile } = await sb
    .from('profiles')
    .insert({ display_name: displayName })
    .select('id')
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Could not create profile' }, { status: 500 });
  }

  // Generate unique code
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();

  // Create trader as spectator
  const { data: trader, error: traderErr } = await sb
    .from('traders')
    .insert({
      profile_id: profile.id,
      lobby_id: lobbyId,
      name: displayName,
      code,
      is_competitor: false,
    })
    .select('id, code')
    .single();

  if (traderErr || !trader) {
    return NextResponse.json({ error: 'Could not create spectator' }, { status: 500 });
  }

  // Create session
  const config = lobby.config as Record<string, unknown> | null;
  const startingBalance = Number(config?.starting_balance ?? 10000);

  await sb.from('sessions').insert({
    trader_id: trader.id,
    lobby_id: lobbyId,
    starting_balance: startingBalance,
  });

  // Grant 500 spectator credits
  await sb.from('credit_allocations').insert({
    trader_id: trader.id,
    lobby_id: lobbyId,
    balance: 500,
    total_earned: 500,
    total_spent: 0,
  });

  return NextResponse.json({
    trader_id: trader.id,
    code: trader.code,
    display_name: displayName,
    credits: 500,
    lobby_name: lobby.name,
  });
}
