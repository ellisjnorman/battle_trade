import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { chargeEntryFee, getEntryFee } from '@/lib/entry-fees';
import { parseBody, RegisterTraderSchema } from '@/lib/validation';
import type { LobbyConfig } from '@/types';
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
  const parsed = parseBody(RegisterTraderSchema, body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { display_name: trimmedName, handle: safeHandle, team_name: safeTeamName, wallet_address: safeWallet, wants_whitelist } = parsed.data;
  const { is_competitor, trading_assets, monthly_volume } = body;

  // Capture geo from Vercel/Cloudflare headers (works in production)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? null;
  const country = request.headers.get('x-vercel-ip-country')
    ?? request.headers.get('cf-ipcountry')
    ?? null;
  const city = request.headers.get('x-vercel-ip-city')
    ?? request.headers.get('cf-ipcity')
    ?? null;
  const region = request.headers.get('x-vercel-ip-country-region')
    ?? request.headers.get('cf-region')
    ?? null;

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

  // Use the actual UUID for all DB inserts
  const realLobbyId = lobby.id;

  // Find or create profile by handle
  let profileId: string | null = null;
  if (safeHandle) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('handle', safeHandle)
      .single();

    if (existing) {
      profileId = existing.id;
      // Update profile with new data + geo
      await supabase.from('profiles').update({
        is_active_trader: is_competitor !== false,
        trading_assets: trading_assets ?? null,
        monthly_volume: monthly_volume ?? null,
        wants_whitelist: wants_whitelist ?? false,
        ip_address: ip,
        country,
        city,
        region,
      }).eq('id', profileId);
    } else {
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({
          display_name: trimmedName,
          handle: safeHandle,
          credits: 0,
          is_active_trader: is_competitor !== false,
          trading_assets: trading_assets ?? null,
          monthly_volume: monthly_volume ?? null,
          wants_whitelist: wants_whitelist ?? false,
          ip_address: ip,
          country,
          city,
          region,
        })
        .select()
        .single();
      if (newProfile) profileId = newProfile.id;
    }
  } else {
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({
        display_name: trimmedName,
        credits: 0,
        is_active_trader: is_competitor !== false,
        trading_assets: trading_assets ?? null,
        monthly_volume: monthly_volume ?? null,
        wants_whitelist: wants_whitelist ?? false,
        ip_address: ip,
        country,
        city,
        region,
      })
      .select()
      .single();
    if (newProfile) profileId = newProfile.id;
  }

  // Get or create event_id from latest round
  const { data: latestRound } = await supabase
    .from('rounds')
    .select('event_id')
    .eq('lobby_id', realLobbyId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  const eventId = latestRound?.event_id ?? realLobbyId;

  // Generate unique code
  const code = generateCode();

  // Find or create team if team_name provided
  let teamId: string | null = null;
  if (safeTeamName && is_competitor !== false) {
    const { data: existingTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('name', safeTeamName)
      .eq('event_id', eventId)
      .single();

    if (existingTeam) {
      teamId = existingTeam.id;
    } else {
      const { data: newTeam } = await supabase
        .from('teams')
        .insert({ name: safeTeamName, event_id: eventId })
        .select()
        .single();
      if (newTeam) teamId = newTeam.id;
    }
  }

  // Create trader record
  const { data: trader, error: traderError } = await supabase
    .from('traders')
    .insert({
      name: trimmedName,
      code,
      lobby_id: realLobbyId,
      event_id: eventId,
      is_eliminated: false,
      wallet_address: safeWallet,
      avatar_url: null,
      team_id: teamId,
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
      lobby_id: realLobbyId,
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
      lobby_id: realLobbyId,
      trader_id: trader.id,
      balance: creditBalance,
      total_earned: creditBalance,
      total_spent: 0,
    });

  // Charge entry fee (if configured — skipped for IRL / free lobbies)
  const lobbyConfig = lobby.config as LobbyConfig;
  const entryFee = getEntryFee(lobbyConfig);
  let feeCharged = 0;
  let balanceAfterFee = creditBalance;
  if (entryFee > 0 && is_competitor !== false) {
    const feeResult = await chargeEntryFee({
      trader_id: trader.id,
      lobby_id: realLobbyId,
      config: lobbyConfig,
    });
    if (feeResult.error) {
      // Rollback: delete trader, session, and credit allocation
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
    feeCharged = entryFee;
    // Read back the actual balance after fee deduction
    const { data: updatedAlloc } = await supabase
      .from('credit_allocations')
      .select('balance')
      .eq('trader_id', trader.id)
      .eq('lobby_id', realLobbyId)
      .single();
    balanceAfterFee = updatedAlloc?.balance ?? (creditBalance - entryFee);
  }

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
      lobby_id: realLobbyId,
      lobby_name: lobby.name,
      display_name: trimmedName,
      handle: safeHandle,
      is_competitor: is_competitor !== false,
      credits: balanceAfterFee,
      entry_fee: feeCharged,
      trade_url: `${baseUrl}/lobby/${realLobbyId}/trade?code=${code}`,
      spectate_url: `${baseUrl}/lobby/${realLobbyId}/spectate?code=${code}`,
    },
    { status: 201 },
  );
}
