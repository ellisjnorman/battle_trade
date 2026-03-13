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
 * POST /api/lobby/[id]/backfill-bots
 * Adds NPC bot traders to an existing lobby.
 * Body: { bot_count?: number, admin_id: string }
 * Only the lobby creator (admin) can add bots.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  try {
    const body = await request.json();
    const { bot_count: rawBotCount, admin_id } = body;

    if (!admin_id) {
      return NextResponse.json({ error: 'admin_id required' }, { status: 400 });
    }

    const sb = getServerSupabase();

    // Verify lobby exists and caller is the creator
    const { data: lobby } = await sb
      .from('lobbies')
      .select('id, created_by, status, config')
      .eq('id', lobbyId)
      .single();

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    if (lobby.created_by !== admin_id) {
      return NextResponse.json({ error: 'Only the lobby creator can add bots' }, { status: 403 });
    }

    if (lobby.status !== 'waiting' && lobby.status !== 'active') {
      return NextResponse.json({ error: 'Lobby is not accepting players' }, { status: 400 });
    }

    // Get existing traders to avoid duplicate bot names
    const { data: existingTraders } = await sb
      .from('traders')
      .select('name')
      .eq('lobby_id', lobbyId);

    const existingNames = new Set((existingTraders ?? []).map(t => t.name));
    const availableNames = BOT_NAMES.filter(n => !existingNames.has(n));
    const botCount = Math.min(Math.max(rawBotCount ?? 3, 1), availableNames.length);
    const startingBalance = (lobby.config as Record<string, unknown>)?.starting_balance as number ?? 10000;

    const shuffled = [...availableNames].sort(() => Math.random() - 0.5);
    const botNames = shuffled.slice(0, botCount);
    const created: string[] = [];

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
          starting_balance: startingBalance,
        });
        await sb.from('credit_allocations').insert({
          lobby_id: lobbyId,
          trader_id: bot.id,
          balance: 1000,
          total_earned: 1000,
          total_spent: 0,
        });
        created.push(botName);
      }
    }

    return NextResponse.json({
      bots_added: created.length,
      bot_names: created,
    });
  } catch (err) {
    console.error('POST /api/lobby/[id]/backfill-bots error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
