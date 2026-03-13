import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Get all waiting + active lobbies
    const { data: lobbies, error: lobbyErr } = await supabase
      .from('lobbies')
      .select('id, name, format, status, invite_code, config, created_at, created_by')
      .in('status', ['waiting', 'active']);

    if (lobbyErr) {
      return NextResponse.json({ error: lobbyErr.message }, { status: 500 });
    }

    if (!lobbies || lobbies.length === 0) {
      return NextResponse.json({ lobbies: [] });
    }

    const lobbyIds = lobbies.map((l) => l.id);
    const activeLobbyIds = lobbies.filter((l) => l.status === 'active').map((l) => l.id);

    // 2+3. Parallelize independent queries: traders + rounds
    const [tradersResult, roundsResult] = await Promise.all([
      supabase
        .from('traders')
        .select('lobby_id')
        .in('lobby_id', lobbyIds),
      activeLobbyIds.length > 0
        ? supabase
            .from('rounds')
            .select('lobby_id, round_number, status, started_at, duration_seconds')
            .in('lobby_id', activeLobbyIds)
            .in('status', ['active', 'frozen'])
            .order('round_number', { ascending: false })
        : Promise.resolve({ data: [] as { lobby_id: string; round_number: number; status: string; started_at: string | null; duration_seconds: number }[] }),
    ]);

    const playerCounts: Record<string, number> = {};
    const spectatorCounts: Record<string, number> = {};
    // is_competitor defaults to true; removed from SELECT due to PostgREST schema cache issue
    for (const t of tradersResult.data ?? []) {
      playerCounts[t.lobby_id] = (playerCounts[t.lobby_id] ?? 0) + 1;
    }

    const roundMap: Record<string, { round_number: number; status: string; started_at: string | null; duration_seconds: number }> = {};
    for (const r of roundsResult.data ?? []) {
      if (!roundMap[r.lobby_id]) {
        roundMap[r.lobby_id] = {
          round_number: r.round_number,
          status: r.status,
          started_at: r.started_at,
          duration_seconds: r.duration_seconds,
        };
      }
    }

    // 4. Get top trader per active lobby from leaderboard (traders with best return)
    const lobbiesWithRounds = Object.keys(roundMap);
    const topTraderMap: Record<string, { name: string; return_pct: number }> = {};

    if (lobbiesWithRounds.length > 0) {
      // Get latest round ids for active lobbies
      const { data: latestRounds } = await supabase
        .from('rounds')
        .select('id, lobby_id')
        .in('lobby_id', lobbiesWithRounds)
        .in('status', ['active', 'frozen'])
        .order('round_number', { ascending: false });

      const roundIdToLobby: Record<string, string> = {};
      const roundIds: string[] = [];
      for (const r of latestRounds ?? []) {
        if (!roundIdToLobby[r.lobby_id]) {
          roundIdToLobby[r.lobby_id] = r.lobby_id;
          roundIds.push(r.id);
        }
      }

      if (roundIds.length > 0) {
        // Get traders with positions in these rounds to find top performers
        const { data: positions } = await supabase
          .from('positions')
          .select('trader_id, round_id, realized_pnl')
          .in('round_id', roundIds)
          .eq('status', 'closed');

        if (positions && positions.length > 0) {
          // Aggregate PnL per trader per round
          const traderPnl: Record<string, Record<string, number>> = {};
          for (const p of positions) {
            if (!traderPnl[p.round_id]) traderPnl[p.round_id] = {};
            traderPnl[p.round_id][p.trader_id] = (traderPnl[p.round_id][p.trader_id] ?? 0) + (p.realized_pnl ?? 0);
          }

          // Find the round-to-lobby mapping
          const roundToLobby: Record<string, string> = {};
          for (const r of latestRounds ?? []) {
            if (roundIds.includes(r.id)) {
              roundToLobby[r.id] = r.lobby_id;
            }
          }

          // Find top trader per lobby
          const topTraderIds: string[] = [];
          for (const roundId of roundIds) {
            const traders = traderPnl[roundId];
            if (!traders) continue;
            let topId = '';
            let topPnl = -Infinity;
            for (const [tid, pnl] of Object.entries(traders)) {
              if (pnl > topPnl) {
                topPnl = pnl;
                topId = tid;
              }
            }
            if (topId) {
              topTraderIds.push(topId);
            }
          }

          if (topTraderIds.length > 0) {
            const { data: traderInfos } = await supabase
              .from('traders')
              .select('id, name')
              .in('id', topTraderIds);

            const traderNameMap: Record<string, string> = {};
            for (const t of traderInfos ?? []) {
              traderNameMap[t.id] = t.name;
            }

            for (const roundId of roundIds) {
              const traders = traderPnl[roundId];
              if (!traders) continue;
              let topId = '';
              let topPnl = -Infinity;
              for (const [tid, pnl] of Object.entries(traders)) {
                if (pnl > topPnl) {
                  topPnl = pnl;
                  topId = tid;
                }
              }
              const lobbyId = roundToLobby[roundId];
              if (topId && lobbyId && traderNameMap[topId]) {
                // Get starting balance from the round's lobby config for return_pct
                const lobby = lobbies.find((l) => l.id === lobbyId);
                const startBal = lobby?.config?.starting_balance ?? 10000;
                topTraderMap[lobbyId] = {
                  name: traderNameMap[topId],
                  return_pct: (topPnl / startBal) * 100,
                };
              }
            }
          }
        }
      }
    }

    // 5. Combine and sort: active first, then by trader count desc
    const result = lobbies
      .map((l) => ({
        id: l.id,
        name: l.name,
        format: l.format,
        status: l.status,
        invite_code: l.invite_code,
        config: l.config,
        created_by: l.created_by ?? null,
        player_count: playerCounts[l.id] ?? 0,
        spectator_count: spectatorCounts[l.id] ?? 0,
        current_round: roundMap[l.id] ?? undefined,
        top_trader: topTraderMap[l.id] ?? undefined,
      }))
      .sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return b.player_count - a.player_count;
      });

    return NextResponse.json({ lobbies: result }, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('GET /api/lobbies/active error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
