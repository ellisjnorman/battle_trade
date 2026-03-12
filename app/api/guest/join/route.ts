import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { getEntryFee, chargeEntryFee } from '@/lib/entry-fees';
import type { LobbyConfig } from '@/types';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function generateCode(): string {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();
}

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const lobbyId = typeof body.lobby_id === 'string' ? body.lobby_id.trim() : '';
  const guestId = typeof body.guest_id === 'string' ? body.guest_id.trim() : '';
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim().slice(0, 30) : '';
  const isCompetitor = body.is_competitor !== false;

  if (!lobbyId || !guestId || !displayName) {
    return NextResponse.json(
      { error: 'Missing required fields: lobby_id, guest_id, display_name' },
      { status: 400 },
    );
  }

  // UUID format check for guest_id
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(guestId)) {
    return NextResponse.json({ error: 'Invalid guest_id format' }, { status: 400 });
  }

  // Verify lobby exists — try UUID first, then invite code
  let { data: lobby } = await supabase
    .from('lobbies')
    .select('id, name, config')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    const { data: byCode } = await supabase
      .from('lobbies')
      .select('id, name, config')
      .eq('invite_code', lobbyId.toUpperCase())
      .single();
    lobby = byCode;
  }

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  const realLobbyId = lobby.id;

  // Check if this guest already has a profile (by guest_id stored in metadata)
  // We use the guest_id as a stable identifier stored in the profile's auth_user_id field
  // with a "guest:" prefix to distinguish from real Privy IDs
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', guestId)
    .eq('is_guest', true)
    .maybeSingle();

  let profileId: string;

  if (existingProfile) {
    profileId = existingProfile.id;

    // Check if already registered in this lobby
    const { data: existingTrader } = await supabase
      .from('traders')
      .select('id, is_competitor, code')
      .eq('profile_id', profileId)
      .eq('lobby_id', realLobbyId)
      .maybeSingle();

    if (existingTrader) {
      return NextResponse.json({
        trader_id: existingTrader.id,
        lobby_id: realLobbyId,
        profile_id: profileId,
        already_registered: true,
      }, { status: 200 });
    }
  } else {
    // Create guest profile
    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        auth_user_id: guestId,
        display_name: displayName,
        is_guest: true,
        credits: 0,
      })
      .select('id')
      .single();

    if (profileError || !newProfile) {
      return NextResponse.json(
        { error: profileError?.message ?? 'Failed to create guest profile' },
        { status: 500 },
      );
    }

    profileId = newProfile.id;
  }

  // Get event_id from latest round
  const { data: latestRound } = await supabase
    .from('rounds')
    .select('event_id')
    .eq('lobby_id', realLobbyId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const eventId = latestRound?.event_id ?? realLobbyId;
  const code = generateCode();

  // Create trader record
  const { data: trader, error: traderError } = await supabase
    .from('traders')
    .insert({
      name: displayName,
      code,
      lobby_id: realLobbyId,
      event_id: eventId,
      is_eliminated: false,
      is_competitor: isCompetitor,
      profile_id: profileId,
    })
    .select('id')
    .single();

  if (traderError || !trader) {
    return NextResponse.json(
      { error: traderError?.message ?? 'Failed to create trader' },
      { status: 500 },
    );
  }

  // Create session
  const startingBalance =
    (lobby.config as Record<string, unknown>)?.starting_balance as number ?? 10000;

  const { error: sessionError } = await supabase
    .from('sessions')
    .insert({
      trader_id: trader.id,
      lobby_id: realLobbyId,
      starting_balance: startingBalance,
    });

  if (sessionError) {
    // Rollback trader
    await supabase.from('traders').delete().eq('id', trader.id);
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // Create credit allocation
  const creditBalance = isCompetitor ? 1000 : 500;

  await supabase
    .from('credit_allocations')
    .insert({
      lobby_id: realLobbyId,
      trader_id: trader.id,
      balance: creditBalance,
      total_earned: creditBalance,
      total_spent: 0,
    });

  // Charge entry fee if configured
  const lobbyConfig = lobby.config as LobbyConfig;
  const entryFee = getEntryFee(lobbyConfig);

  if (entryFee > 0 && isCompetitor) {
    const feeResult = await chargeEntryFee({
      trader_id: trader.id,
      lobby_id: realLobbyId,
      config: lobbyConfig,
    });
    if (feeResult.error) {
      // Rollback everything
      await supabase.from('credit_allocations').delete().eq('trader_id', trader.id).eq('lobby_id', realLobbyId);
      await supabase.from('sessions').delete().eq('trader_id', trader.id).eq('lobby_id', realLobbyId);
      await supabase.from('traders').delete().eq('id', trader.id);
      return NextResponse.json({
        error: feeResult.error,
        insufficient_credits: true,
        entry_fee: entryFee,
        balance: creditBalance,
      }, { status: 400 });
    }
  }

  // Update profile credits
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', profileId)
    .single();

  await supabase
    .from('profiles')
    .update({ credits: (profile?.credits ?? 0) + creditBalance })
    .eq('id', profileId);

  return NextResponse.json(
    {
      trader_id: trader.id,
      lobby_id: realLobbyId,
      profile_id: profileId,
    },
    { status: 201 },
  );
}
