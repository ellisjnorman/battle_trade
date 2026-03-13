import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { calcUnrealizedPnl } from '@/lib/pnl';
import type { Position } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lobby/[id]/tick
 *
 * Serverless-friendly game loop tick. Called by the trading terminal every ~10s.
 * Each call:
 *  1. Checks if current round should end (elapsed time >= duration)
 *  2. If so: scores, eliminates, creates next round (or finishes game)
 *  3. Ticks bots once (make trades)
 *  4. Returns current game state
 *
 * Idempotent — safe to call concurrently (uses DB state, not memory).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const sb = getServerSupabase();

  // Load lobby
  const { data: lobby } = await sb
    .from('lobbies')
    .select('id, config, status')
    .eq('id', lobbyId)
    .single();

  if (!lobby) return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });

  const config = (lobby.config as Record<string, unknown>) ?? {};
  const isAuto = config.auto_admin || config.is_practice;
  if (!isAuto) return NextResponse.json({ auto: false });

  if (lobby.status === 'completed') {
    return NextResponse.json({ status: 'completed', auto: true });
  }

  // Get current active round
  const { data: round } = await sb
    .from('rounds')
    .select('*')
    .eq('lobby_id', lobbyId)
    .in('status', ['active', 'pending'])
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  if (!round) {
    return NextResponse.json({ status: lobby.status, auto: true, round: null });
  }

  const roundDuration = Number(round.duration_seconds ?? config.round_duration_seconds ?? 120);
  const eliminationPct = Number(round.elimination_pct ?? config.elimination_pct ?? 25);
  const startingBalance = Number(round.starting_balance ?? config.starting_balance ?? 10000);

  // Activate pending round
  if (round.status === 'pending') {
    await sb.from('rounds').update({
      status: 'active',
      started_at: new Date().toISOString(),
    }).eq('id', round.id);
    round.status = 'active';
    round.started_at = new Date().toISOString();
  }

  // Check if round should end
  const elapsed = round.started_at
    ? (Date.now() - new Date(round.started_at).getTime()) / 1000
    : 0;
  const roundEnded = elapsed >= roundDuration;
  const timeRemaining = Math.max(0, roundDuration - elapsed);

  let gameOver = false;
  let eliminated: string[] = [];
  let winner: { name: string; return_pct: number } | null = null;
  let nextRoundNumber = round.round_number;

  if (roundEnded && round.status === 'active') {
    // ── End round ──
    await sb.from('rounds').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
    }).eq('id', round.id);

    // Calculate standings
    const standings = await getStandings(lobbyId, round.id, startingBalance);
    const alive = standings.filter(s => !s.is_eliminated);

    if (alive.length <= 1) {
      // Game over
      gameOver = true;
      await sb.from('lobbies').update({ status: 'completed' }).eq('id', lobbyId);

      if (alive.length === 1) {
        winner = { name: alive[0].name, return_pct: alive[0].returnPct };
        // Update winner profile stats
        const { data: winTrader } = await sb.from('traders').select('profile_id').eq('id', alive[0].id).single();
        if (winTrader?.profile_id) {
          const { data: prof } = await sb.from('profiles').select('total_wins').eq('id', winTrader.profile_id).single();
          if (prof) await sb.from('profiles').update({ total_wins: (prof.total_wins ?? 0) + 1 }).eq('id', winTrader.profile_id);
        }
      }
    } else {
      // Eliminate bottom X%
      const elimCount = Math.max(1, Math.floor(alive.length * eliminationPct / 100));
      const toElim = alive.slice(-elimCount);

      for (const t of toElim) {
        await sb.from('traders').update({
          is_eliminated: true,
          eliminated_at: new Date().toISOString(),
        }).eq('id', t.id);
      }
      eliminated = toElim.map(t => t.name);

      // Check again after elimination
      const remaining = alive.length - elimCount;
      if (remaining <= 1) {
        gameOver = true;
        await sb.from('lobbies').update({ status: 'completed' }).eq('id', lobbyId);
        const w = alive.find(a => !toElim.some(e => e.id === a.id));
        if (w) winner = { name: w.name, return_pct: w.returnPct };
      } else {
        // Create next round
        nextRoundNumber = round.round_number + 1;
        await sb.from('rounds').insert({
          lobby_id: lobbyId,
          round_number: nextRoundNumber,
          status: 'active',
          started_at: new Date().toISOString(),
          starting_balance: startingBalance,
          duration_seconds: roundDuration,
          elimination_pct: eliminationPct,
        });
      }
    }
  }

  // ── Drift prices (simulate market movement) ──
  if (!gameOver) {
    try {
      const { data: prices } = await sb.from('prices').select('symbol, price');
      for (const p of prices ?? []) {
        // Random walk: +-0.3% per tick
        const drift = 1 + (Math.random() - 0.5) * 0.006;
        const newPrice = Math.round(p.price * drift * 100) / 100;
        await sb.from('prices').update({ price: newPrice, updated_at: new Date().toISOString() }).eq('symbol', p.symbol);
      }
    } catch {}
  }

  // ── Tick bots (if round is active and game isn't over) ──
  if (!gameOver && !roundEnded) {
    try {
      const { tickBots } = await import('@/lib/bots');
      const activeRoundId = roundEnded ? undefined : round.id;
      if (activeRoundId) {
        await tickBots(lobbyId, activeRoundId);
      }
    } catch (err) {
      console.error('[tick] bot tick error:', err);
    }
  }

  // Get current standings for response
  const currentRound = roundEnded && !gameOver
    ? { round_number: nextRoundNumber, status: 'active' as const, time_remaining: roundDuration }
    : { round_number: round.round_number, status: round.status as string, time_remaining: timeRemaining };

  return NextResponse.json({
    auto: true,
    status: gameOver ? 'completed' : 'active',
    round: currentRound,
    eliminated,
    game_over: gameOver,
    winner,
  });
}

// ── Helper: get standings sorted by return ──
async function getStandings(lobbyId: string, roundId: string, startingBalance: number) {
  const sb = getServerSupabase();

  const [{ data: traders }, { data: positions }, { data: prices }] = await Promise.all([
    sb.from('traders').select('id, name, is_eliminated').eq('lobby_id', lobbyId),
    sb.from('positions').select('trader_id, size, leverage, entry_price, direction, symbol')
      .eq('round_id', roundId).is('closed_at', null),
    sb.from('prices').select('symbol, price'),
  ]);

  const priceMap: Record<string, number> = {};
  for (const p of prices ?? []) priceMap[p.symbol] = p.price;

  return (traders ?? [])
    .map(t => {
      const tPositions = (positions ?? []).filter(p => p.trader_id === t.id);
      let pnl = 0;
      for (const pos of tPositions) {
        const currentPrice = priceMap[pos.symbol] ?? pos.entry_price;
        pnl += calcUnrealizedPnl(pos as unknown as Position, currentPrice);
      }
      const pv = startingBalance + pnl;
      const returnPct = startingBalance > 0 ? ((pv - startingBalance) / startingBalance) * 100 : 0;
      return { ...t, portfolioValue: pv, returnPct };
    })
    .sort((a, b) => {
      if (a.is_eliminated !== b.is_eliminated) return a.is_eliminated ? 1 : -1;
      return b.returnPct - a.returnPct;
    });
}
