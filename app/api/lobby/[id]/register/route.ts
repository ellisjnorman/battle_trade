import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function generateCode(): string {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();
  const { display_name, handle, is_competitor } = body;

  if (!display_name) {
    return NextResponse.json({ error: 'Missing display_name' }, { status: 400 });
  }

  // Verify lobby exists
  const { data: lobby } = await supabase
    .from('lobbies')
    .select('id, name, config')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  // Find or create profile by handle
  let profileId: string | null = null;
  if (handle) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('handle', handle)
      .single();

    if (existing) {
      profileId = existing.id;
    } else {
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({
          display_name,
          handle,
          credits: 0,
        })
        .select()
        .single();
      if (newProfile) profileId = newProfile.id;
    }
  } else {
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({
        display_name,
        credits: 0,
      })
      .select()
      .single();
    if (newProfile) profileId = newProfile.id;
  }

  // Get or create event_id from latest round
  const { data: latestRound } = await supabase
    .from('rounds')
    .select('event_id')
    .eq('lobby_id', lobbyId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  const eventId = latestRound?.event_id ?? lobbyId;

  // Generate unique code
  const code = generateCode();

  // Create trader record
  const { data: trader, error: traderError } = await supabase
    .from('traders')
    .insert({
      name: display_name,
      lobby_id: lobbyId,
      event_id: eventId,
      is_eliminated: false,
      wallet_address: null,
      avatar_url: null,
      team_id: null,
    })
    .select()
    .single();

  if (traderError || !trader) {
    return NextResponse.json({ error: traderError?.message ?? 'Failed to create trader' }, { status: 500 });
  }

  // Create session
  const startingBalance =
    (lobby.config as Record<string, unknown>)?.starting_balance as number ?? 10000;

  const { error: sessionError } = await supabase
    .from('sessions')
    .insert({
      trader_id: trader.id,
      lobby_id: lobbyId,
      starting_balance: startingBalance,
    });

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // Create credit allocation
  const creditBalance = is_competitor !== false ? 1000 : 500;

  await supabase
    .from('credit_allocations')
    .insert({
      lobby_id: lobbyId,
      trader_id: trader.id,
      balance: creditBalance,
      total_earned: creditBalance,
      total_spent: 0,
    });

  // Update profile credits
  if (profileId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', profileId)
      .single();

    await supabase
      .from('profiles')
      .update({ credits: (profile?.credits ?? 0) + creditBalance })
      .eq('id', profileId);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://battle.fyi';

  return NextResponse.json(
    {
      trader_id: trader.id,
      code,
      lobby_id: lobbyId,
      lobby_name: lobby.name,
      display_name,
      handle: handle ?? null,
      is_competitor: is_competitor !== false,
      credits: creditBalance,
      trade_url: `${baseUrl}/lobby/${lobbyId}/trade?code=${code}`,
      spectate_url: `${baseUrl}/lobby/${lobbyId}/spectate?code=${code}`,
    },
    { status: 201 },
  );
}
