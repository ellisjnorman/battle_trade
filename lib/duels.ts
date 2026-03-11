// ---------------------------------------------------------------------------
// Duel System — 1v1 matchmaking and direct challenges
// ---------------------------------------------------------------------------
// Handles queue-based matchmaking (BTR score proximity) and direct challenges.
// When a duel starts, it creates a private lobby and kicks off auto-admin.
// ---------------------------------------------------------------------------

import { getServerSupabase } from '@/lib/supabase-server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DuelDuration = 15 | 30 | 60 | 240;

const VALID_DURATIONS: readonly number[] = [15, 30, 60, 240];

export interface DuelChallenge {
  id: string;
  challenger_id: string;
  opponent_id: string | null;
  duration_minutes: DuelDuration;
  status: 'pending' | 'accepted' | 'active' | 'completed' | 'expired' | 'declined';
  lobby_id: string | null;
  winner_id: string | null;
  created_at: string;
}

export interface QueueEntry {
  profile_id: string;
  btr_score: number;
  duration_minutes: DuelDuration;
  queued_at: string;
}

// Max BTR score gap for a match
const MATCH_BTR_RANGE = 200;

// Challenges expire after 5 minutes
const CHALLENGE_EXPIRY_MINUTES = 5;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isValidDuration(d: number): d is DuelDuration {
  return VALID_DURATIONS.includes(d);
}

// ---------------------------------------------------------------------------
// Queue operations
// ---------------------------------------------------------------------------

/** Enter the matchmaking queue. Upserts — re-queuing updates your entry. */
export async function enterQueue(
  profileId: string,
  btrScore: number,
  duration: DuelDuration,
): Promise<{ queued: true }> {
  if (!isValidDuration(duration)) {
    throw new Error(`Invalid duration: ${duration}. Must be one of ${VALID_DURATIONS.join(', ')}.`);
  }

  const sb = getServerSupabase();

  const { error } = await sb
    .from('duel_queue')
    .upsert(
      {
        profile_id: profileId,
        btr_score: btrScore,
        duration_minutes: duration,
        queued_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' },
    );

  if (error) throw new Error(`Failed to enter queue: ${error.message}`);
  return { queued: true };
}

/** Leave the matchmaking queue. No-op if not queued. */
export async function leaveQueue(profileId: string): Promise<void> {
  const sb = getServerSupabase();
  await sb.from('duel_queue').delete().eq('profile_id', profileId);
}

/**
 * Find a match for the given queue entry.
 * Looks for another player queued for the same duration within ±200 BTR score.
 * Returns the matched queue row or null.
 */
export async function findMatch(
  entry: QueueEntry,
): Promise<QueueEntry | null> {
  const sb = getServerSupabase();

  const lowerBound = entry.btr_score - MATCH_BTR_RANGE;
  const upperBound = entry.btr_score + MATCH_BTR_RANGE;

  // Find closest BTR opponent queued for the same duration, excluding self
  const { data, error } = await sb
    .from('duel_queue')
    .select('profile_id, btr_score, duration_minutes, queued_at')
    .eq('duration_minutes', entry.duration_minutes)
    .neq('profile_id', entry.profile_id)
    .gte('btr_score', lowerBound)
    .lte('btr_score', upperBound)
    .order('queued_at', { ascending: true })
    .limit(10);

  if (error || !data || data.length === 0) return null;

  // Pick the opponent closest in BTR score
  let best = data[0];
  let bestDiff = Math.abs(best.btr_score - entry.btr_score);

  for (let i = 1; i < data.length; i++) {
    const diff = Math.abs(data[i].btr_score - entry.btr_score);
    if (diff < bestDiff) {
      best = data[i];
      bestDiff = diff;
    }
  }

  return {
    profile_id: best.profile_id,
    btr_score: best.btr_score,
    duration_minutes: best.duration_minutes as DuelDuration,
    queued_at: best.queued_at,
  };
}

// ---------------------------------------------------------------------------
// Challenge operations
// ---------------------------------------------------------------------------

/** Create a direct challenge to a specific opponent. */
export async function createChallenge(
  challengerId: string,
  opponentId: string,
  duration: DuelDuration,
): Promise<DuelChallenge> {
  if (!isValidDuration(duration)) {
    throw new Error(`Invalid duration: ${duration}`);
  }

  if (challengerId === opponentId) {
    throw new Error('Cannot challenge yourself');
  }

  const sb = getServerSupabase();

  // Check for existing pending challenge between these two
  const { data: existing } = await sb
    .from('duels')
    .select('id')
    .eq('challenger_id', challengerId)
    .eq('opponent_id', opponentId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    throw new Error('You already have a pending challenge to this player');
  }

  const { data, error } = await sb
    .from('duels')
    .insert({
      challenger_id: challengerId,
      opponent_id: opponentId,
      duration_minutes: duration,
      status: 'pending',
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create challenge: ${error?.message}`);

  return data as DuelChallenge;
}

/** Accept a direct challenge. Returns the updated duel record. */
export async function acceptChallenge(
  challengeId: string,
  profileId: string,
): Promise<DuelChallenge> {
  const sb = getServerSupabase();

  // Fetch and validate
  const { data: duel, error: fetchErr } = await sb
    .from('duels')
    .select('*')
    .eq('id', challengeId)
    .single();

  if (fetchErr || !duel) throw new Error('Challenge not found');
  if (duel.status !== 'pending') throw new Error(`Challenge is ${duel.status}, cannot accept`);
  if (duel.opponent_id !== profileId) throw new Error('This challenge is not addressed to you');

  // Check expiry
  const createdAt = new Date(duel.created_at).getTime();
  const now = Date.now();
  if (now - createdAt > CHALLENGE_EXPIRY_MINUTES * 60 * 1000) {
    await sb.from('duels').update({ status: 'expired' }).eq('id', challengeId);
    throw new Error('Challenge has expired');
  }

  // Mark accepted
  const { data: updated, error: updateErr } = await sb
    .from('duels')
    .update({ status: 'accepted' })
    .eq('id', challengeId)
    .select()
    .single();

  if (updateErr || !updated) throw new Error(`Failed to accept challenge: ${updateErr?.message}`);

  return updated as DuelChallenge;
}

/** Decline a direct challenge. */
export async function declineChallenge(challengeId: string): Promise<void> {
  const sb = getServerSupabase();

  const { data: duel } = await sb
    .from('duels')
    .select('status')
    .eq('id', challengeId)
    .single();

  if (!duel) throw new Error('Challenge not found');
  if (duel.status !== 'pending') throw new Error(`Challenge is ${duel.status}, cannot decline`);

  await sb.from('duels').update({ status: 'declined' }).eq('id', challengeId);
}

// ---------------------------------------------------------------------------
// Duel lifecycle
// ---------------------------------------------------------------------------

/**
 * Start a duel: create a private lobby, register both players, kick off auto-admin.
 * Works for both matched queue duels and accepted direct challenges.
 */
export async function startDuel(challengeId: string): Promise<{ lobby_id: string }> {
  const sb = getServerSupabase();

  const { data: duel, error: fetchErr } = await sb
    .from('duels')
    .select('*')
    .eq('id', challengeId)
    .single();

  if (fetchErr || !duel) throw new Error('Duel not found');
  if (!['accepted', 'pending'].includes(duel.status)) {
    throw new Error(`Duel is ${duel.status}, cannot start`);
  }
  if (!duel.challenger_id || !duel.opponent_id) {
    throw new Error('Both players must be set before starting');
  }

  const duration: DuelDuration = duel.duration_minutes as DuelDuration;
  const roundDurationSeconds = duration * 60;
  const startingBalance = 10000;

  // Create private lobby
  const { data: lobby, error: lobbyErr } = await sb
    .from('lobbies')
    .insert({
      name: `Duel ${challengeId.slice(0, 8)}`,
      format: 'blitz',
      is_public: false,
      status: 'waiting',
      auto_admin: true,
      min_players: 2,
      auto_start_countdown: 5,
      config: {
        starting_balance: startingBalance,
        available_symbols: ['BTC', 'ETH', 'SOL'],
        leverage_tiers: [1, 2, 5, 10],
        volatility_engine: 'off',
        round_duration_seconds: roundDurationSeconds,
        scoring_mode: 'last_round',
        trade_execution_mode: 'paper_only',
      },
    })
    .select('id')
    .single();

  if (lobbyErr || !lobby) throw new Error(`Failed to create duel lobby: ${lobbyErr?.message}`);

  const lobbyId = lobby.id;

  // Register both players
  const playerIds = [duel.challenger_id, duel.opponent_id];

  for (const profileId of playerIds) {
    // Get profile display name
    const { data: profile } = await sb
      .from('profiles')
      .select('id, display_name')
      .eq('id', profileId)
      .single();

    const displayName = profile?.display_name ?? `Player ${profileId.slice(0, 6)}`;

    // Create trader record
    const { data: trader, error: traderErr } = await sb
      .from('traders')
      .insert({
        name: displayName,
        lobby_id: lobbyId,
        event_id: lobbyId,
        is_eliminated: false,
        profile_id: profileId,
        is_competitor: true,
      })
      .select('id')
      .single();

    if (traderErr || !trader) throw new Error(`Failed to register player: ${traderErr?.message}`);

    // Create session
    await sb.from('sessions').insert({
      trader_id: trader.id,
      lobby_id: lobbyId,
      starting_balance: startingBalance,
    });

    // Create credit allocation
    await sb.from('credit_allocations').insert({
      lobby_id: lobbyId,
      trader_id: trader.id,
      balance: 1000,
      total_earned: 1000,
      total_spent: 0,
    });
  }

  // Update duel record
  await sb
    .from('duels')
    .update({ status: 'active', lobby_id: lobbyId })
    .eq('id', challengeId);

  // Start auto-admin (fire and forget — it handles its own lifecycle)
  import('@/lib/auto-admin')
    .then(({ startAutoAdmin }) => startAutoAdmin(lobbyId))
    .catch(() => {});

  return { lobby_id: lobbyId };
}

/**
 * Complete a duel: read final standings from the lobby, determine winner,
 * update the duel record.
 */
export async function completeDuel(lobbyId: string): Promise<DuelChallenge> {
  const sb = getServerSupabase();

  // Find the duel for this lobby
  const { data: duel, error: fetchErr } = await sb
    .from('duels')
    .select('*')
    .eq('lobby_id', lobbyId)
    .eq('status', 'active')
    .single();

  if (fetchErr || !duel) throw new Error('Active duel not found for this lobby');

  // Get the latest round
  const { data: round } = await sb
    .from('rounds')
    .select('id, starting_balance')
    .eq('lobby_id', lobbyId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  if (!round) throw new Error('No round found for duel lobby');

  const startingBalance = round.starting_balance ?? 10000;

  // Get traders linked to challenger and opponent
  const { data: traders } = await sb
    .from('traders')
    .select('id, profile_id, is_eliminated')
    .eq('lobby_id', lobbyId);

  if (!traders || traders.length < 2) throw new Error('Insufficient traders in duel lobby');

  // Get positions and prices
  const { data: positions } = await sb
    .from('positions')
    .select('trader_id, size, leverage, entry_price, exit_price, direction, symbol, closed_at, realized_pnl')
    .eq('round_id', round.id);

  const { data: pricesData } = await sb.from('prices').select('symbol, price');
  const priceMap: Record<string, number> = {};
  for (const p of pricesData ?? []) priceMap[p.symbol] = p.price;

  // Calculate return % for each player
  const returnPcts: Record<string, number> = {};

  for (const trader of traders) {
    const traderPositions = (positions ?? []).filter(p => p.trader_id === trader.id);
    let pnl = 0;

    for (const pos of traderPositions) {
      if (pos.closed_at && pos.realized_pnl != null) {
        // Closed position — use realized PnL
        pnl += pos.realized_pnl;
      } else {
        // Open position — calculate unrealized
        const currentPrice = priceMap[pos.symbol] ?? pos.entry_price;
        const diff = pos.direction === 'long'
          ? (currentPrice - pos.entry_price) / pos.entry_price
          : (pos.entry_price - currentPrice) / pos.entry_price;
        pnl += diff * pos.size * pos.leverage;
      }
    }

    const returnPct = (pnl / startingBalance) * 100;
    returnPcts[trader.profile_id ?? ''] = returnPct;
  }

  const challengerReturn = returnPcts[duel.challenger_id] ?? 0;
  const opponentReturn = returnPcts[duel.opponent_id] ?? 0;

  // Determine winner (higher return %). Tie = challenger wins (first-mover advantage).
  let winnerId: string;
  if (challengerReturn >= opponentReturn) {
    winnerId = duel.challenger_id;
  } else {
    winnerId = duel.opponent_id;
  }

  // Update duel record
  const { data: updated, error: updateErr } = await sb
    .from('duels')
    .update({
      status: 'completed',
      winner_id: winnerId,
      challenger_return_pct: challengerReturn,
      opponent_return_pct: opponentReturn,
      completed_at: new Date().toISOString(),
    })
    .eq('id', duel.id)
    .select()
    .single();

  if (updateErr || !updated) throw new Error(`Failed to complete duel: ${updateErr?.message}`);

  return updated as DuelChallenge;
}

/**
 * Expire all pending challenges older than 5 minutes.
 * Intended to be called periodically (cron or on relevant API hits).
 */
export async function expireStaleChallenge(): Promise<number> {
  const sb = getServerSupabase();

  const cutoff = new Date(Date.now() - CHALLENGE_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await sb
    .from('duels')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('id');

  if (error) throw new Error(`Failed to expire stale challenges: ${error.message}`);

  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a matched duel from two queue entries.
 * Removes both from queue, creates a duel record, and starts the duel.
 */
export async function createMatchedDuel(
  entryA: QueueEntry,
  entryB: QueueEntry,
): Promise<{ duel_id: string; lobby_id: string }> {
  const sb = getServerSupabase();

  // Remove both from queue
  await sb.from('duel_queue').delete().eq('profile_id', entryA.profile_id);
  await sb.from('duel_queue').delete().eq('profile_id', entryB.profile_id);

  // Create duel record (challenger = whoever queued first)
  const aTime = new Date(entryA.queued_at).getTime();
  const bTime = new Date(entryB.queued_at).getTime();
  const challenger = aTime <= bTime ? entryA : entryB;
  const opponent = aTime <= bTime ? entryB : entryA;

  const { data: duel, error } = await sb
    .from('duels')
    .insert({
      challenger_id: challenger.profile_id,
      opponent_id: opponent.profile_id,
      duration_minutes: challenger.duration_minutes,
      status: 'accepted',
    })
    .select()
    .single();

  if (error || !duel) throw new Error(`Failed to create matched duel: ${error?.message}`);

  const { lobby_id } = await startDuel(duel.id);

  return { duel_id: duel.id, lobby_id };
}

/** Get the current queue position for a profile (1-indexed). */
export async function getQueuePosition(profileId: string): Promise<number> {
  const sb = getServerSupabase();

  // Get the entry for this profile
  const { data: entry } = await sb
    .from('duel_queue')
    .select('duration_minutes, queued_at')
    .eq('profile_id', profileId)
    .single();

  if (!entry) return 0;

  // Count how many people queued before this person for the same duration
  const { count } = await sb
    .from('duel_queue')
    .select('id', { count: 'exact', head: true })
    .eq('duration_minutes', entry.duration_minutes)
    .lte('queued_at', entry.queued_at);

  return count ?? 1;
}
