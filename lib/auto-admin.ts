/**
 * Auto-admin engine — runs games without manual intervention.
 *
 * When a lobby has auto_admin=true:
 * 1. Countdown starts when min_players reached
 * 2. Round auto-creates and starts
 * 3. Timer runs → round auto-ends
 * 4. Bottom X% auto-eliminated
 * 5. Next round auto-starts after brief intermission
 * 6. When ≤1 player remains → game over, prizes distributed
 */

import { getServerSupabase } from './supabase-server';
import { calcUnrealizedPnl } from './pnl';
import { captureError } from './error';
import type { Position } from '@/types';

// Track active auto-admin loops per lobby
const activeLoops = new Map<string, NodeJS.Timeout>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start auto-admin for a lobby. Called when min_players reached. */
export async function startAutoAdmin(lobbyId: string): Promise<void> {
  if (activeLoops.has(lobbyId)) return; // Already running

  const sb = getServerSupabase();
  const { data: lobby } = await sb
    .from('lobbies')
    .select('id, config, auto_admin, min_players, auto_start_countdown, status')
    .eq('id', lobbyId)
    .single();

  if (!lobby?.auto_admin) return;

  // Start the game loop
  await runGameLoop(lobbyId);
}

/** Stop auto-admin for a lobby */
export function stopAutoAdmin(lobbyId: string): void {
  const timer = activeLoops.get(lobbyId);
  if (timer) {
    clearTimeout(timer);
    activeLoops.delete(lobbyId);
  }
}

/** Check if a lobby should start auto-admin (called on player join) */
export async function checkAutoStart(lobbyId: string): Promise<{ shouldStart: boolean; countdown?: number }> {
  const sb = getServerSupabase();

  const { data: lobby } = await sb
    .from('lobbies')
    .select('id, auto_admin, min_players, auto_start_countdown, status')
    .eq('id', lobbyId)
    .single();

  if (!lobby?.auto_admin || lobby.status !== 'waiting') {
    return { shouldStart: false };
  }

  // Count active competitors
  const { count } = await sb
    .from('traders')
    .select('id', { count: 'exact', head: true })
    .eq('lobby_id', lobbyId)
    .eq('is_competitor', true)
    .eq('is_eliminated', false);

  const playerCount = count ?? 0;
  if (playerCount >= (lobby.min_players ?? 2)) {
    return { shouldStart: true, countdown: lobby.auto_start_countdown ?? 30 };
  }

  return { shouldStart: false };
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

async function runGameLoop(lobbyId: string): Promise<void> {
  const sb = getServerSupabase();

  // Mark lobby as active
  await sb.from('lobbies').update({ status: 'active' }).eq('id', lobbyId);

  // Get lobby config
  const { data: lobby } = await sb
    .from('lobbies')
    .select('config, format')
    .eq('id', lobbyId)
    .single();

  if (!lobby) return;

  const config = lobby.config as Record<string, unknown>;
  const roundDuration = Number(config.round_duration_seconds ?? 300);
  const startingBalance = Number(config.starting_balance ?? 10000);
  const eliminationPct = Number(config.elimination_pct ?? 25);
  const intermissionSeconds = 15; // Brief pause between rounds

  // Broadcast helper
  const broadcast = async (event: string, payload: Record<string, unknown>) => {
    const { supabase } = await import('./supabase');
    const ch = supabase.channel(`lobby-${lobbyId}-auto`);
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.send({ type: 'broadcast', event, payload });
        setTimeout(() => supabase.removeChannel(ch), 500);
      }
    });
    // Fallback: remove channel regardless after 3s (covers subscription failure)
    setTimeout(() => supabase.removeChannel(ch), 3000);
  };

  // Create first round
  const { data: round } = await sb
    .from('rounds')
    .insert({
      lobby_id: lobbyId,
      event_id: lobbyId, // Use lobby_id as event_id for new format
      round_number: 1,
      status: 'pending',
      starting_balance: startingBalance,
      duration_seconds: roundDuration,
      elimination_pct: eliminationPct,
    })
    .select()
    .single();

  if (!round) return;

  // Start the round
  await startRound(lobbyId, round.id, roundDuration, broadcast);

  // Schedule round end
  const timer = setTimeout(async () => {
    await endRoundAndAdvance(lobbyId, round.id, {
      eliminationPct,
      roundDuration,
      startingBalance,
      intermissionSeconds,
      broadcast,
    });
  }, roundDuration * 1000);

  activeLoops.set(lobbyId, timer);
}

async function startRound(
  lobbyId: string,
  roundId: string,
  _duration: number,
  broadcast: (event: string, payload: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const sb = getServerSupabase();

  await sb
    .from('rounds')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', roundId);

  // Start price feed
  try {
    const { startPriceFeed } = await import('./prices');
    startPriceFeed();
  } catch {
    // Price feed may already be running
  }

  await broadcast('auto_admin', { type: 'round_started', round_id: roundId });
}

async function endRoundAndAdvance(
  lobbyId: string,
  roundId: string,
  opts: {
    eliminationPct: number;
    roundDuration: number;
    startingBalance: number;
    intermissionSeconds: number;
    broadcast: (event: string, payload: Record<string, unknown>) => Promise<void>;
  },
): Promise<void> {
  const sb = getServerSupabase();

  // End current round
  await sb
    .from('rounds')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', roundId);

  activeLoops.delete(lobbyId);

  // Get standings from leaderboard
  const { data: tradersData } = await sb
    .from('traders')
    .select('id, name, is_eliminated')
    .eq('lobby_id', lobbyId);

  const { data: sessions } = await sb
    .from('sessions')
    .select('trader_id, starting_balance')
    .eq('lobby_id', lobbyId);

  const { data: positions } = await sb
    .from('positions')
    .select('trader_id, size, leverage, entry_price, direction, symbol')
    .eq('round_id', roundId)
    .is('closed_at', null);

  const { data: pricesData } = await sb.from('prices').select('symbol, price');
  const priceMap: Record<string, number> = {};
  for (const p of pricesData ?? []) priceMap[p.symbol] = p.price;

  const sessionMap: Record<string, number> = {};
  for (const s of sessions ?? []) sessionMap[s.trader_id] = s.starting_balance;

  // Calculate simple portfolio values
  const portfolioValues: Record<string, number> = {};
  for (const t of tradersData ?? []) {
    const startBal = sessionMap[t.id] ?? 10000;
    const traderPositions = (positions ?? []).filter(p => p.trader_id === t.id);
    let pnl = 0;
    for (const pos of traderPositions) {
      const currentPrice = priceMap[pos.symbol] ?? pos.entry_price;
      pnl += calcUnrealizedPnl(pos as unknown as Position, currentPrice);
    }
    portfolioValues[t.id] = startBal + pnl;
  }

  // Build standings sorted by return % — separate alive from eliminated
  const allStandings = (tradersData ?? [])
    .map(t => {
      const startBal = sessionMap[t.id] ?? 10000;
      const pv = portfolioValues[t.id] ?? startBal;
      const returnPct = startBal > 0 ? ((pv - startBal) / startBal) * 100 : 0;
      return { trader: t, portfolioValue: pv, returnPct, rank: 0 };
    });

  // Rank alive traders first, then eliminated at the bottom
  const standings = allStandings
    .sort((a, b) => {
      if (a.trader.is_eliminated !== b.trader.is_eliminated) {
        return a.trader.is_eliminated ? 1 : -1; // alive first
      }
      return b.returnPct - a.returnPct;
    })
    .map((s, i) => ({ ...s, rank: i + 1 }));

  // Count alive players
  const alive = standings.filter(s => !s.trader.is_eliminated);
  if (alive.length <= 1) {
    // Game over — distribute prizes
    await finishGame(lobbyId, standings, opts.broadcast);
    return;
  }

  // Eliminate bottom X%
  const elimCount = Math.max(1, Math.floor(alive.length * opts.eliminationPct / 100));
  const toEliminate = alive.slice(-elimCount);

  for (const s of toEliminate) {
    await sb
      .from('traders')
      .update({ is_eliminated: true, eliminated_at: new Date().toISOString() })
      .eq('id', s.trader.id);
  }

  const eliminatedNames = toEliminate.map(s => s.trader.name);
  await opts.broadcast('auto_admin', {
    type: 'elimination',
    eliminated: eliminatedNames,
    remaining: alive.length - elimCount,
  });

  // Check if game should end
  const remainingCount = alive.length - elimCount;
  if (remainingCount <= 1) {
    await finishGame(lobbyId, standings, opts.broadcast);
    return;
  }

  // Intermission broadcast
  await opts.broadcast('auto_admin', {
    type: 'intermission',
    seconds: opts.intermissionSeconds,
    next_round_number: (await getLatestRoundNumber(lobbyId)) + 1,
  });

  // Schedule next round after intermission
  const timer = setTimeout(async () => {
    const nextRoundNum = (await getLatestRoundNumber(lobbyId)) + 1;

    const { data: nextRound } = await sb
      .from('rounds')
      .insert({
        lobby_id: lobbyId,
        event_id: lobbyId,
        round_number: nextRoundNum,
        status: 'pending',
        starting_balance: opts.startingBalance,
        duration_seconds: opts.roundDuration,
        elimination_pct: opts.eliminationPct,
      })
      .select()
      .single();

    if (!nextRound) return;

    await startRound(lobbyId, nextRound.id, opts.roundDuration, opts.broadcast);

    // Schedule this round's end
    const endTimer = setTimeout(async () => {
      await endRoundAndAdvance(lobbyId, nextRound.id, opts);
    }, opts.roundDuration * 1000);

    activeLoops.set(lobbyId, endTimer);
  }, opts.intermissionSeconds * 1000);

  activeLoops.set(lobbyId, timer);
}

async function finishGame(
  lobbyId: string,
  standings: Array<{ trader: { id: string; name: string; is_eliminated: boolean }; returnPct: number; rank: number }>,
  broadcast: (event: string, payload: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  const sb = getServerSupabase();

  // Mark lobby complete
  await sb.from('lobbies').update({ status: 'completed' }).eq('id', lobbyId);

  // Clean up lobby engine to prevent memory leak
  try {
    const { unregisterLobbyEngine } = await import('./prices');
    unregisterLobbyEngine(lobbyId);
  } catch {
    // Best-effort cleanup
  }

  // Distribute prizes
  const { distributePrizePool } = await import('./entry-fees');
  const rankings = standings
    .filter(s => !s.trader.is_eliminated)
    .map((s, i) => ({ trader_id: s.trader.id, rank: i + 1 }));

  await distributePrizePool({ lobby_id: lobbyId, rankings });

  // Record payouts to profile history
  for (const r of rankings.slice(0, 1)) {
    const { data: trader } = await sb
      .from('traders')
      .select('profile_id')
      .eq('id', r.trader_id)
      .single();

    if (trader?.profile_id) {
      // Update profile stats
      const { data: prof } = await sb.from('profiles').select('total_wins').eq('id', trader.profile_id).single();
      if (prof) {
        await sb.from('profiles').update({ total_wins: (prof.total_wins ?? 0) + 1 }).eq('id', trader.profile_id);
      }
    }
  }

  // Recalc TR for ALL participants (fire-and-forget)
  const { data: allTraders } = await sb
    .from('traders')
    .select('profile_id')
    .eq('lobby_id', lobbyId)
    .not('profile_id', 'is', null);

  if (allTraders && allTraders.length > 0) {
    import('@/lib/reputation').then(({ recalcAndSave }) => {
      for (const t of allTraders) {
        if (t.profile_id) {
          recalcAndSave(t.profile_id).catch(err =>
            captureError(err, { context: 'auto-admin', lobbyId, action: 'recalcAndSave', profileId: t.profile_id }),
          );
        }
      }
    }).catch(err => captureError(err, { context: 'auto-admin', lobbyId, action: 'import-reputation' }));
  }

  // Broadcast game over
  const winner = standings.find(s => !s.trader.is_eliminated);
  await broadcast('auto_admin', {
    type: 'game_over',
    winner: winner ? { name: winner.trader.name, return_pct: winner.returnPct } : null,
    final_standings: standings.slice(0, 5).map(s => ({
      name: s.trader.name,
      return_pct: s.returnPct,
      rank: s.rank,
    })),
  });

  activeLoops.delete(lobbyId);
}

async function getLatestRoundNumber(lobbyId: string): Promise<number> {
  const sb = getServerSupabase();
  const { data } = await sb
    .from('rounds')
    .select('round_number')
    .eq('lobby_id', lobbyId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();
  return data?.round_number ?? 0;
}
