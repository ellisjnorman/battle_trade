import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BOT_NAMES = [
  'SatoshiBot', 'DeFi_Degen', 'WhaleWatch', 'AlgoTrader',
  'MoonShot_AI', 'BearHunter', 'LiquidityKing', 'VolBot',
];

// Difficulty presets: bot_count, round_duration, starting_balance, leverage_tiers
const DIFFICULTY_PRESETS: Record<string, {
  bot_count: number; round_duration: number; starting_balance: number;
  leverage_tiers: number[]; elimination_pct: number; label: string;
}> = {
  easy:   { bot_count: 2, round_duration: 180, starting_balance: 50000, leverage_tiers: [2, 5, 10], elimination_pct: 0, label: 'Easy' },
  medium: { bot_count: 4, round_duration: 120, starting_balance: 10000, leverage_tiers: [5, 10, 20], elimination_pct: 25, label: 'Medium' },
  hard:   { bot_count: 6, round_duration: 60, starting_balance: 5000, leverage_tiers: [10, 20, 50], elimination_pct: 50, label: 'Hard' },
  insane: { bot_count: 7, round_duration: 45, starting_balance: 2000, leverage_tiers: [20, 50, 100], elimination_pct: 50, label: 'Insane' },
};

function generateCode(): string {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();
}

/**
 * Progressive insert: tries full row, then strips columns on failure until bare minimum.
 * Returns { data, error } like supabase.
 */
async function insertTrader(
  sb: SupabaseClient,
  fullRow: Record<string, unknown>,
): Promise<{ data: { id: string } | null; error: string | null; errors?: string[] }> {
  // Attempt tiers: full → minus profile_id/event_id → minus code/is_competitor too
  const tiers = [
    fullRow,
    (() => { const { profile_id: _a, event_id: _b, ...r } = fullRow; return r; })(),
    (() => { const { profile_id: _a, event_id: _b, is_competitor: _c, ...r } = fullRow; return r; })(),
    (() => { const { profile_id: _a, event_id: _b, is_competitor: _c, code: _d, ...r } = fullRow; return r; })(),
  ];

  const errors: string[] = [];
  for (let i = 0; i < tiers.length; i++) {
    const { data, error } = await sb.from('traders').insert(tiers[i]).select('id').single();
    if (!error && data) return { data, error: null };
    const msg = `tier${i}[${Object.keys(tiers[i]).join(',')}]: ${error?.message ?? 'unknown'}`;
    errors.push(msg);
    console.error(`Trader insert ${msg}`);
  }
  return { data: null, error: 'All trader insert attempts failed', errors };
}

// Game modes — scoring and rule variations
const GAME_MODES: Record<string, { label: string; scoring_mode: string; elimination_pct_override?: number; desc: string }> = {
  classic:      { label: 'Classic', scoring_mode: 'best_round', desc: 'Best single-round return wins' },
  elimination:  { label: 'Elimination', scoring_mode: 'best_round', elimination_pct_override: 50, desc: 'Bottom 50% eliminated each round' },
  cumulative:   { label: 'Marathon', scoring_mode: 'cumulative', desc: 'Total return across all rounds' },
  last_round:   { label: 'Final Round', scoring_mode: 'last_round', desc: 'Only your last round counts' },
};

/**
 * POST /api/lobbies/practice
 * Creates a practice lobby with NPC bot traders + auto-admin.
 * Body: { profile_id, display_name, bot_count?, difficulty?, num_rounds?, round_duration?, game_mode? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile_id, display_name, bot_count: rawBotCount, difficulty: rawDifficulty, num_rounds: rawNumRounds, round_duration: rawRoundDuration, game_mode: rawGameMode } = body;

    if (!profile_id || !display_name) {
      return NextResponse.json({ error: 'profile_id and display_name required' }, { status: 400 });
    }

    const difficulty = rawDifficulty && DIFFICULTY_PRESETS[rawDifficulty] ? rawDifficulty : 'medium';
    const preset = DIFFICULTY_PRESETS[difficulty];
    const botCount = rawBotCount != null ? Math.min(Math.max(rawBotCount, 1), 7) : preset.bot_count;
    const numRounds = rawNumRounds != null ? Math.min(Math.max(Math.round(rawNumRounds), 1), 10) : 1;
    const roundDuration = rawRoundDuration != null ? Math.min(Math.max(Math.round(rawRoundDuration), 30), 900) : preset.round_duration;
    const gameMode = rawGameMode && GAME_MODES[rawGameMode] ? rawGameMode : 'classic';
    const gameModeConfig = GAME_MODES[gameMode];
    const sb = getServerSupabase();
    const inviteCode = crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase();

    // 1. Create practice lobby (try with auto_admin columns, fall back without)
    const lobbyRow: Record<string, unknown> = {
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
        starting_balance: preset.starting_balance,
        round_duration_seconds: roundDuration,
        lobby_duration_minutes: Math.max(10, Math.ceil(numRounds * roundDuration / 60) + 2),
        num_rounds: numRounds,
        entry_fee: 0,
        scoring_mode: gameModeConfig.scoring_mode,
        game_mode: gameMode,
        volatility_engine: 'algorithmic',
        credit_source: 'sponsor_funded',
        leverage_tiers: preset.leverage_tiers,
        is_practice: true,
        auto_admin: true,
        difficulty,
        elimination_pct: gameModeConfig.elimination_pct_override ?? preset.elimination_pct,
        rank_multiplier: difficulty === 'easy' ? 0.5 : difficulty === 'medium' ? 0.75 : difficulty === 'hard' ? 1.0 : 1.25,
        practice_rank_cap: 100,
      },
    };

    let { data: lobby, error: lobbyErr } = await sb
      .from('lobbies')
      .insert(lobbyRow)
      .select('id')
      .single();

    // If auto_admin/min_players/auto_start_countdown columns don't exist, retry without them
    if (lobbyErr) {
      console.error('Lobby insert error:', lobbyErr.message);
      const { auto_admin: _, min_players: _m, auto_start_countdown: _a, ...safeRow } = lobbyRow;
      const retry = await sb.from('lobbies').insert(safeRow).select('id').single();
      lobby = retry.data;
      lobbyErr = retry.error;
      if (lobbyErr) console.error('Lobby retry error:', lobbyErr.message);
    }

    if (lobbyErr || !lobby) {
      return NextResponse.json({ error: lobbyErr?.message ?? 'Failed to create lobby' }, { status: 500 });
    }

    const lobbyId = lobby.id;

    // 2. Register the human player (progressive fallback for missing columns)
    const humanCode = generateCode();
    const { data: humanTrader } = await insertTrader(sb, {
      name: display_name,
      code: humanCode,
      lobby_id: lobbyId,
      event_id: lobbyId,
      is_eliminated: false,
      is_competitor: true,
      profile_id,
    });

    if (humanTrader) {
      await sb.from('sessions').insert({
        trader_id: humanTrader.id,
        lobby_id: lobbyId,
        starting_balance: preset.starting_balance,
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
      const { data: bot } = await insertTrader(sb, {
        name: botName,
        code: botCode,
        lobby_id: lobbyId,
        event_id: lobbyId,
        is_eliminated: false,
        is_competitor: true,
        profile_id: null,
      });

      if (bot) {
        await sb.from('sessions').insert({
          trader_id: bot.id,
          lobby_id: lobbyId,
          starting_balance: preset.starting_balance,
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

    // 4. Create first round + start it immediately
    try {
      const roundRow: Record<string, unknown> = {
        lobby_id: lobbyId,
        round_number: 1,
        status: 'active',
        started_at: new Date().toISOString(),
        duration_seconds: roundDuration,
        starting_balance: preset.starting_balance,
        elimination_pct: gameModeConfig.elimination_pct_override ?? preset.elimination_pct,
      };
      let { error: roundErr } = await sb.from('rounds').insert({ ...roundRow, event_id: lobbyId });
      if (roundErr) {
        await sb.from('rounds').insert(roundRow);
      }

      await sb.from('lobbies').update({ status: 'active' }).eq('id', lobbyId);
    } catch (err) {
      console.error('Failed to create first round for practice lobby:', err);
    }

    // Seed initial prices so bots can trade immediately
    try {
      const seedPrices = [
        { symbol: 'BTCUSDT', price: 65000 + Math.random() * 2000 },
        { symbol: 'ETHUSDT', price: 3400 + Math.random() * 200 },
        { symbol: 'SOLUSDT', price: 140 + Math.random() * 20 },
      ];
      for (const p of seedPrices) {
        await sb.from('prices').upsert(
          { symbol: p.symbol, price: Math.round(p.price * 100) / 100, updated_at: new Date().toISOString() },
          { onConflict: 'symbol' },
        );
      }
    } catch (err) {
      console.error('Price seed failed (non-critical):', err);
    }

    // Note: auto-admin game loop is driven by the /tick endpoint polled by the trading terminal.
    // No need to start a long-running loop here (won't survive serverless function exit).

    return NextResponse.json({
      lobby_id: lobbyId,
      trader_id: humanTrader?.id,
      code: humanCode,
      bot_count: botCount,
      difficulty,
    }, { status: 201 });
  } catch (err) {
    console.error('POST /api/lobbies/practice error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
