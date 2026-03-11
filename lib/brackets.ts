/**
 * Bracket elimination tournament state machine.
 *
 * N players are seeded (highest BTR vs lowest), and each round the top 50%
 * by return % advance. Rounds are timed trading sessions backed by the
 * existing `rounds` table. The bracket continues until a single winner remains.
 */

import { getServerSupabase } from '@/lib/supabase-server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BracketTournament {
  id: string;
  lobby_id: string;
  name: string;
  total_rounds: number;
  current_round: number;
  round_duration_minutes: number;
  status: 'registration' | 'active' | 'completed';
  entry_fee: number;
  prize_pool: number;
  sponsor: string | null;
  created_at: string;
}

export interface BracketSlot {
  id: string;
  tournament_id: string;
  round_number: number;
  position: number;
  profile_id: string | null;
  trader_id: string | null;
  return_pct: number | null;
  advanced: boolean;
}

export interface BracketRoundNode {
  round_number: number;
  slots: BracketSlot[];
}

export interface BracketState {
  tournament: BracketTournament;
  rounds: BracketRoundNode[];
  winner: BracketSlot | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round up to the nearest power of 2. */
function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new bracket tournament shell attached to a lobby.
 * Players register separately; seeding happens via `seedBracket`.
 */
export async function createBracket(
  lobbyId: string,
  name: string,
  roundDurationMinutes: number,
  entryFee: number,
): Promise<BracketTournament> {
  const sb = getServerSupabase();

  const { data, error } = await sb
    .from('bracket_tournaments')
    .insert({
      lobby_id: lobbyId,
      name,
      total_rounds: 0, // set during seeding
      current_round: 0,
      round_duration_minutes: roundDurationMinutes,
      entry_fee: entryFee,
      prize_pool: 0,
      status: 'registration',
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create bracket: ${error?.message ?? 'unknown'}`);
  }

  return data as BracketTournament;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/**
 * Seed the bracket with all traders in the lobby.
 *
 * - Fetches traders + their profile tr_score (BTR).
 * - Sorts by tr_score descending (ties broken randomly).
 * - Pads to the next power-of-2 with bye slots (profile_id = null).
 * - Creates round-1 slots in classic bracket order: 1v(N), 2v(N-1), etc.
 * - Sets total_rounds = log2(bracketSize).
 */
export async function seedBracket(tournamentId: string): Promise<BracketSlot[]> {
  const sb = getServerSupabase();

  // Load tournament
  const { data: tournament, error: tErr } = await sb
    .from('bracket_tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();

  if (tErr || !tournament) {
    throw new Error(`Tournament not found: ${tErr?.message ?? tournamentId}`);
  }

  if (tournament.status !== 'registration') {
    throw new Error('Tournament must be in registration to seed');
  }

  const lobbyId = tournament.lobby_id;

  // Fetch traders in this lobby that are not eliminated
  const { data: traders, error: trErr } = await sb
    .from('traders')
    .select('id, profile_id')
    .eq('lobby_id', lobbyId)
    .eq('is_eliminated', false);

  if (trErr) throw new Error(`Failed to load traders: ${trErr.message}`);
  if (!traders || traders.length < 2) {
    throw new Error('Need at least 2 players to seed a bracket');
  }

  // Load BTR scores for sorting
  const profileIds = traders
    .map((t) => t.profile_id)
    .filter((id): id is string => id != null);

  let scoreMap: Record<string, number> = {};
  if (profileIds.length > 0) {
    const { data: profiles } = await sb
      .from('profiles')
      .select('id, tr_score')
      .in('id', profileIds);

    for (const p of profiles ?? []) {
      scoreMap[p.id] = Number(p.tr_score ?? 0);
    }
  }

  // Sort traders by BTR desc; ties broken by random
  const sorted = [...traders].sort((a, b) => {
    const scoreA = a.profile_id ? (scoreMap[a.profile_id] ?? 0) : 0;
    const scoreB = b.profile_id ? (scoreMap[b.profile_id] ?? 0) : 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return Math.random() - 0.5;
  });

  // Pad to power of 2
  const bracketSize = nextPowerOf2(sorted.length);
  const totalRounds = Math.log2(bracketSize);

  // Build round 1 slots in classic seeding order: seed 1 vs seed N, seed 2 vs seed N-1, etc.
  // This ensures the top seeds meet only in the final.
  const seeded = buildClassicBracketOrder(sorted, bracketSize);

  // Update tournament with total_rounds and prize_pool
  const prizePool = tournament.entry_fee * sorted.length;
  await sb
    .from('bracket_tournaments')
    .update({
      total_rounds: totalRounds,
      prize_pool: prizePool,
    })
    .eq('id', tournamentId);

  // Delete any existing slots for this tournament (re-seed support)
  await sb.from('bracket_slots').delete().eq('tournament_id', tournamentId);

  // Insert round 1 slots
  const slotsToInsert = seeded.map((entry, idx) => ({
    tournament_id: tournamentId,
    round_number: 1,
    position: idx + 1,
    profile_id: entry?.profile_id ?? null,
    trader_id: entry?.trader_id ?? null,
    return_pct: null,
    advanced: false,
  }));

  const { data: inserted, error: insErr } = await sb
    .from('bracket_slots')
    .insert(slotsToInsert)
    .select();

  if (insErr) throw new Error(`Failed to insert slots: ${insErr.message}`);

  // Pre-create empty slots for all subsequent rounds
  const futureSlots: Array<{
    tournament_id: string;
    round_number: number;
    position: number;
    profile_id: null;
    trader_id: null;
    return_pct: null;
    advanced: false;
  }> = [];

  for (let round = 2; round <= totalRounds; round++) {
    const slotsInRound = bracketSize / Math.pow(2, round - 1);
    for (let pos = 1; pos <= slotsInRound; pos++) {
      futureSlots.push({
        tournament_id: tournamentId,
        round_number: round,
        position: pos,
        profile_id: null,
        trader_id: null,
        return_pct: null,
        advanced: false,
      });
    }
  }

  if (futureSlots.length > 0) {
    const { error: futErr } = await sb.from('bracket_slots').insert(futureSlots);
    if (futErr) throw new Error(`Failed to create future slots: ${futErr.message}`);
  }

  return (inserted ?? []) as BracketSlot[];
}

/**
 * Build classic bracket seeding order so top seeds are maximally separated.
 * For a bracket of size N, position the seeds so that seed 1 faces seed N,
 * seed 2 faces seed N-1, etc., arranged so top seeds only meet in late rounds.
 *
 * Returns an array of length `bracketSize` where null entries are byes.
 */
function buildClassicBracketOrder(
  sorted: Array<{ id: string; profile_id: string | null }>,
  bracketSize: number,
): Array<{ trader_id: string; profile_id: string | null } | null> {
  // Generate standard bracket positions for seeds 1..bracketSize
  const positions = generateBracketPositions(bracketSize);

  const result: Array<{ trader_id: string; profile_id: string | null } | null> =
    new Array(bracketSize).fill(null);

  for (let seed = 0; seed < bracketSize; seed++) {
    const pos = positions[seed]; // 0-indexed position in the bracket
    if (seed < sorted.length) {
      result[pos] = {
        trader_id: sorted[seed].id,
        profile_id: sorted[seed].profile_id ?? null,
      };
    }
    // else: leave null (bye)
  }

  return result;
}

/**
 * Standard bracket seeding algorithm.
 * Returns an array where index = seed (0-based), value = bracket position (0-based).
 * This ensures seed 0 is at the top and seed 1 at the bottom,
 * with subsequent seeds distributed to maximise separation.
 */
function generateBracketPositions(size: number): number[] {
  if (size === 1) return [0];

  let round = [0, 1];
  let currentSize = 2;

  while (currentSize < size) {
    const nextRound: number[] = [];
    for (const pos of round) {
      nextRound.push(pos);
      nextRound.push(currentSize * 2 - 1 - pos);
    }
    round = nextRound;
    currentSize *= 2;
  }

  return round;
}

// ---------------------------------------------------------------------------
// Start round
// ---------------------------------------------------------------------------

/**
 * Start the next round of the tournament.
 * - Moves tournament to 'active' if still in registration.
 * - Creates a new `rounds` row for the trading session.
 * - Auto-advances byes (slots with null profile_id that are paired with a real player).
 * - Increments current_round.
 *
 * Returns the ID of the newly created trading round.
 */
export async function startRound(tournamentId: string): Promise<string> {
  const sb = getServerSupabase();

  const { data: tournament, error: tErr } = await sb
    .from('bracket_tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();

  if (tErr || !tournament) {
    throw new Error(`Tournament not found: ${tErr?.message ?? tournamentId}`);
  }

  if (tournament.status === 'completed') {
    throw new Error('Tournament is already completed');
  }

  const nextRound = tournament.current_round + 1;
  if (nextRound > tournament.total_rounds) {
    throw new Error('All rounds have been played');
  }

  // Fetch slots for this round
  const { data: slots, error: sErr } = await sb
    .from('bracket_slots')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('round_number', nextRound)
    .order('position', { ascending: true });

  if (sErr || !slots) {
    throw new Error(`Failed to load slots: ${sErr?.message ?? 'unknown'}`);
  }

  // Auto-advance byes: for every pair (pos 1&2, 3&4, ...), if one side is null
  // and the other has a player, advance the player immediately.
  for (let i = 0; i < slots.length; i += 2) {
    const slotA = slots[i];
    const slotB = slots[i + 1];

    if (!slotA || !slotB) continue;

    const aIsPlayer = slotA.profile_id != null;
    const bIsPlayer = slotB.profile_id != null;

    if (aIsPlayer && !bIsPlayer) {
      // A advances automatically (bye)
      await sb
        .from('bracket_slots')
        .update({ advanced: true, return_pct: 0 })
        .eq('id', slotA.id);

      // Place into next round
      if (nextRound < tournament.total_rounds) {
        await placeInNextRound(
          sb,
          tournamentId,
          nextRound + 1,
          Math.ceil((slotA.position) / 2),
          slotA.profile_id!,
          slotA.trader_id,
        );
      }
    } else if (!aIsPlayer && bIsPlayer) {
      // B advances automatically (bye)
      await sb
        .from('bracket_slots')
        .update({ advanced: true, return_pct: 0 })
        .eq('id', slotB.id);

      if (nextRound < tournament.total_rounds) {
        await placeInNextRound(
          sb,
          tournamentId,
          nextRound + 1,
          Math.ceil((slotB.position) / 2),
          slotB.profile_id!,
          slotB.trader_id,
        );
      }
    }
    // Both null (double bye) or both filled — handled naturally
  }

  // Create a trading round in the rounds table
  const durationSeconds = tournament.round_duration_minutes * 60;

  const { data: lobby } = await sb
    .from('lobbies')
    .select('config')
    .eq('id', tournament.lobby_id)
    .single();

  const startingBalance = Number(
    (lobby?.config as Record<string, unknown>)?.starting_balance ?? 10000,
  );

  const { data: tradingRound, error: rErr } = await sb
    .from('rounds')
    .insert({
      lobby_id: tournament.lobby_id,
      event_id: tournament.lobby_id,
      round_number: nextRound,
      status: 'active',
      started_at: new Date().toISOString(),
      starting_balance: startingBalance,
      duration_seconds: durationSeconds,
      elimination_pct: 50, // bracket always eliminates 50%
    })
    .select()
    .single();

  if (rErr || !tradingRound) {
    throw new Error(`Failed to create trading round: ${rErr?.message ?? 'unknown'}`);
  }

  // Update tournament state
  const newStatus = tournament.status === 'registration' ? 'active' : tournament.status;
  await sb
    .from('bracket_tournaments')
    .update({ current_round: nextRound, status: newStatus })
    .eq('id', tournamentId);

  return tradingRound.id;
}

// ---------------------------------------------------------------------------
// Complete round
// ---------------------------------------------------------------------------

/**
 * Complete the current round:
 * 1. Fetch all active (non-bye) matchups for this round.
 * 2. Calculate return % from trading positions.
 * 3. In each pair, the player with higher return % advances.
 * 4. Place winners into next-round slots.
 * 5. If this was the final round, mark tournament completed.
 */
export async function completeRound(tournamentId: string): Promise<void> {
  const sb = getServerSupabase();

  const { data: tournament, error: tErr } = await sb
    .from('bracket_tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();

  if (tErr || !tournament) {
    throw new Error(`Tournament not found: ${tErr?.message ?? tournamentId}`);
  }

  if (tournament.status !== 'active') {
    throw new Error('Tournament is not active');
  }

  const roundNum = tournament.current_round;

  // End the trading round
  const { data: tradingRound } = await sb
    .from('rounds')
    .select('id')
    .eq('lobby_id', tournament.lobby_id)
    .eq('round_number', roundNum)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (tradingRound) {
    await sb
      .from('rounds')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', tradingRound.id);
  }

  // Get round slots
  const { data: slots } = await sb
    .from('bracket_slots')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('round_number', roundNum)
    .order('position', { ascending: true });

  if (!slots || slots.length === 0) {
    throw new Error(`No slots found for round ${roundNum}`);
  }

  // Compute return % for each player using position data
  const returnPcts = await computeReturnPcts(
    sb,
    tournament.lobby_id,
    tradingRound?.id ?? null,
    slots,
  );

  // Update return_pct on each slot
  for (const slot of slots) {
    if (slot.profile_id == null) continue; // bye — already handled
    if (slot.advanced) continue; // already advanced from bye processing

    const pct = returnPcts[slot.trader_id ?? slot.profile_id] ?? 0;
    await sb
      .from('bracket_slots')
      .update({ return_pct: pct })
      .eq('id', slot.id);
  }

  // Advance winners from each pair
  await advancePlayers(tournamentId, roundNum);

  // Check completion
  if (roundNum >= tournament.total_rounds) {
    await sb
      .from('bracket_tournaments')
      .update({ status: 'completed' })
      .eq('id', tournamentId);
  }
}

// ---------------------------------------------------------------------------
// Advance players
// ---------------------------------------------------------------------------

/**
 * For each matchup pair in the given round, advance the player with the
 * higher return %. In case of a tie, the higher-seeded player (lower position)
 * wins.
 */
export async function advancePlayers(
  tournamentId: string,
  roundNumber: number,
): Promise<void> {
  const sb = getServerSupabase();

  const { data: tournament } = await sb
    .from('bracket_tournaments')
    .select('total_rounds')
    .eq('id', tournamentId)
    .single();

  if (!tournament) throw new Error('Tournament not found');

  const { data: slots } = await sb
    .from('bracket_slots')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('round_number', roundNumber)
    .order('position', { ascending: true });

  if (!slots) return;

  for (let i = 0; i < slots.length; i += 2) {
    const slotA = slots[i];
    const slotB = slots[i + 1];

    if (!slotA || !slotB) continue;

    // Skip if either was already advanced (bye processing)
    if (slotA.advanced || slotB.advanced) continue;

    // Determine winner
    let winner: typeof slotA;
    let loser: typeof slotA;

    const retA = slotA.return_pct ?? -Infinity;
    const retB = slotB.return_pct ?? -Infinity;

    if (slotA.profile_id == null && slotB.profile_id == null) {
      // Both byes — skip
      continue;
    } else if (slotA.profile_id == null) {
      winner = slotB;
      loser = slotA;
    } else if (slotB.profile_id == null) {
      winner = slotA;
      loser = slotB;
    } else if (retA >= retB) {
      // Higher return wins; tie goes to higher seed (lower position number)
      winner = slotA;
      loser = slotB;
    } else {
      winner = slotB;
      loser = slotA;
    }

    // Mark winner as advanced
    await sb
      .from('bracket_slots')
      .update({ advanced: true })
      .eq('id', winner.id);

    // Mark loser as not advanced (and eliminate trader)
    await sb
      .from('bracket_slots')
      .update({ advanced: false })
      .eq('id', loser.id);

    if (loser.trader_id) {
      await sb
        .from('traders')
        .update({ is_eliminated: true, eliminated_at: new Date().toISOString() })
        .eq('id', loser.trader_id);
    }

    // Place winner into next round slot
    if (roundNumber < tournament.total_rounds) {
      const nextPosition = Math.ceil(winner.position / 2);
      await placeInNextRound(
        sb,
        tournamentId,
        roundNumber + 1,
        nextPosition,
        winner.profile_id!,
        winner.trader_id,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Return the full bracket state including all rounds and their slots,
 * suitable for rendering a bracket UI.
 */
export async function getBracketState(tournamentId: string): Promise<BracketState> {
  const sb = getServerSupabase();

  const { data: tournament, error: tErr } = await sb
    .from('bracket_tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single();

  if (tErr || !tournament) {
    throw new Error(`Tournament not found: ${tErr?.message ?? tournamentId}`);
  }

  const { data: allSlots } = await sb
    .from('bracket_slots')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true });

  // Group by round
  const roundMap = new Map<number, BracketSlot[]>();
  for (const slot of (allSlots ?? []) as BracketSlot[]) {
    const existing = roundMap.get(slot.round_number) ?? [];
    existing.push(slot);
    roundMap.set(slot.round_number, existing);
  }

  const rounds: BracketRoundNode[] = [];
  for (const [roundNum, slots] of roundMap) {
    rounds.push({ round_number: roundNum, slots });
  }

  // Winner is the advanced player in the final round
  let winner: BracketSlot | null = null;
  if (tournament.status === 'completed') {
    const finalSlots = roundMap.get(tournament.total_rounds);
    if (finalSlots) {
      winner = finalSlots.find((s) => s.advanced) ?? null;
    }
  }

  return {
    tournament: tournament as BracketTournament,
    rounds,
    winner,
  };
}

/**
 * Get bracket state by lobby ID (convenience — finds the tournament for the lobby).
 */
export async function getBracketStateByLobby(lobbyId: string): Promise<BracketState | null> {
  const sb = getServerSupabase();

  const { data: tournament } = await sb
    .from('bracket_tournaments')
    .select('id')
    .eq('lobby_id', lobbyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!tournament) return null;

  return getBracketState(tournament.id);
}

/**
 * Check whether the tournament is complete (final round decided).
 */
export async function isTournamentComplete(tournamentId: string): Promise<boolean> {
  const sb = getServerSupabase();

  const { data } = await sb
    .from('bracket_tournaments')
    .select('status')
    .eq('id', tournamentId)
    .single();

  return data?.status === 'completed';
}

/**
 * Return the winning player's slot from a completed tournament.
 */
export async function getWinner(tournamentId: string): Promise<BracketSlot | null> {
  const sb = getServerSupabase();

  const { data: tournament } = await sb
    .from('bracket_tournaments')
    .select('total_rounds, status')
    .eq('id', tournamentId)
    .single();

  if (!tournament || tournament.status !== 'completed') return null;

  const { data: finalSlots } = await sb
    .from('bracket_slots')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('round_number', tournament.total_rounds)
    .eq('advanced', true)
    .limit(1);

  if (!finalSlots || finalSlots.length === 0) return null;

  return finalSlots[0] as BracketSlot;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Place a winner into a specific slot in the next round.
 */
async function placeInNextRound(
  sb: ReturnType<typeof getServerSupabase>,
  tournamentId: string,
  nextRound: number,
  nextPosition: number,
  profileId: string,
  traderId: string | null,
): Promise<void> {
  // Try to update the pre-created empty slot
  const { data: existing } = await sb
    .from('bracket_slots')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('round_number', nextRound)
    .eq('position', nextPosition)
    .single();

  if (existing) {
    await sb
      .from('bracket_slots')
      .update({ profile_id: profileId, trader_id: traderId })
      .eq('id', existing.id);
  } else {
    // Slot wasn't pre-created; insert it
    await sb.from('bracket_slots').insert({
      tournament_id: tournamentId,
      round_number: nextRound,
      position: nextPosition,
      profile_id: profileId,
      trader_id: traderId,
    });
  }
}

/**
 * Compute return % for each participant in the current round
 * by examining their trading positions.
 */
async function computeReturnPcts(
  sb: ReturnType<typeof getServerSupabase>,
  lobbyId: string,
  roundId: string | null,
  slots: Array<{ profile_id: string | null; trader_id: string | null }>,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};

  if (!roundId) {
    // No trading round — everyone gets 0
    for (const s of slots) {
      const key = s.trader_id ?? s.profile_id;
      if (key) result[key] = 0;
    }
    return result;
  }

  // Get the round's starting balance
  const { data: round } = await sb
    .from('rounds')
    .select('starting_balance')
    .eq('id', roundId)
    .single();

  const startingBalance = round?.starting_balance ?? 10000;

  // Get current prices
  const { data: pricesData } = await sb.from('prices').select('symbol, price');
  const priceMap: Record<string, number> = {};
  for (const p of pricesData ?? []) priceMap[p.symbol] = p.price;

  // Get all trader IDs we care about
  const traderIds = slots
    .map((s) => s.trader_id)
    .filter((id): id is string => id != null);

  if (traderIds.length === 0) return result;

  // Get all positions for this round
  const { data: positions } = await sb
    .from('positions')
    .select('trader_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, closed_at')
    .eq('round_id', roundId)
    .in('trader_id', traderIds);

  // Calculate portfolio value for each trader
  for (const traderId of traderIds) {
    const traderPositions = (positions ?? []).filter((p) => p.trader_id === traderId);
    const open = traderPositions.filter((p) => !p.closed_at);
    const closed = traderPositions.filter((p) => p.closed_at);

    const realizedPnl = closed.reduce(
      (sum, p) => sum + (Number(p.realized_pnl) || 0),
      0,
    );

    let unrealizedPnl = 0;
    for (const pos of open) {
      const currentPrice = priceMap[pos.symbol];
      if (currentPrice == null) continue;
      const direction = pos.direction === 'long' ? 1 : -1;
      const priceDelta = currentPrice - pos.entry_price;
      unrealizedPnl += direction * priceDelta * pos.size * pos.leverage;
    }

    const portfolioValue = startingBalance + realizedPnl + unrealizedPnl;
    const returnPct =
      startingBalance === 0 ? 0 : ((portfolioValue - startingBalance) / startingBalance) * 100;

    result[traderId] = returnPct;
  }

  return result;
}
