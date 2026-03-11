import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const BOT_NAMES = [
  'SatoshiBot', 'DeFi_Degen', 'WhaleWatch', 'AlgoTrader',
  'MoonShot_AI', 'BearHunter', 'LiquidityKing', 'VolBot',
];

function generateCode(): string {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();
}

/**
 * POST /api/lobbies/practice
 * Creates a practice lobby with NPC bot traders + auto-admin.
 * Body: { profile_id, display_name, bot_count?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile_id, display_name, bot_count: rawBotCount } = body;

    if (!profile_id || !display_name) {
      return NextResponse.json({ error: 'profile_id and display_name required' }, { status: 400 });
    }

    const botCount = Math.min(Math.max(rawBotCount ?? 3, 1), 7);
    const sb = getServerSupabase();
    const inviteCode = crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();

    // 1. Create practice lobby with auto_admin
    const { data: lobby, error: lobbyErr } = await sb
      .from('lobbies')
      .insert({
        name: `${display_name}'s Practice`,
        format: 'elimination',
        is_public: false,
        invite_code: inviteCode,
        created_by: profile_id,
        auto_admin: true,
        min_players: 2,
        auto_start_countdown: 5,
        status: 'waiting',
        config: {
          starting_balance: 10000,
          round_duration_seconds: 120,
          lobby_duration_minutes: 10,
          entry_fee: 0,
          scoring_mode: 'best_round',
          volatility_engine: 'algorithmic',
          credit_source: 'sponsor_funded',
          leverage_tiers: [5, 10, 20],
          is_practice: true,
        },
      })
      .select('id')
      .single();

    if (lobbyErr || !lobby) {
      return NextResponse.json({ error: lobbyErr?.message ?? 'Failed to create lobby' }, { status: 500 });
    }

    const lobbyId = lobby.id;

    // 2. Register the human player
    const humanCode = generateCode();
    const { data: humanTrader } = await sb
      .from('traders')
      .insert({
        name: display_name,
        code: humanCode,
        lobby_id: lobbyId,
        event_id: lobbyId,
        is_eliminated: false,
        is_competitor: true,
        profile_id,
      })
      .select('id')
      .single();

    if (humanTrader) {
      await sb.from('sessions').insert({
        trader_id: humanTrader.id,
        lobby_id: lobbyId,
        starting_balance: 10000,
        is_competitor: true,
      });
      await sb.from('credit_allocations').insert({
        lobby_id: lobbyId,
        trader_id: humanTrader.id,
        balance: 1000,
        total_earned: 1000,
        total_spent: 0,
      });
    }

    // 3. Create NPC bot traders
    const shuffled = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const botNames = shuffled.slice(0, botCount);

    for (const botName of botNames) {
      const botCode = generateCode();
      const { data: bot } = await sb
        .from('traders')
        .insert({
          name: botName,
          code: botCode,
          lobby_id: lobbyId,
          event_id: lobbyId,
          is_eliminated: false,
          is_competitor: true,
          profile_id: null,
        })
        .select('id')
        .single();

      if (bot) {
        await sb.from('sessions').insert({
          trader_id: bot.id,
          lobby_id: lobbyId,
          starting_balance: 10000,
          is_competitor: true,
        });
        await sb.from('credit_allocations').insert({
          lobby_id: lobbyId,
          trader_id: bot.id,
          balance: 1000,
          total_earned: 1000,
          total_spent: 0,
        });
      }
    }

    // 4. Auto-start: update lobby to active and trigger auto-admin
    // The auto-admin will be triggered when the player loads the trade page
    // For now, just return the lobby — the trade page calls checkAutoStart on load

    return NextResponse.json({
      lobby_id: lobbyId,
      trader_id: humanTrader?.id,
      code: humanCode,
      bot_count: botCount,
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/lobbies/practice error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
