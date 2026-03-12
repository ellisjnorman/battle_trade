import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/activity — recent platform activity for the live ticker.
 * Returns the latest 10 notable events across all lobbies.
 * Cached for 10s to reduce DB load.
 */
export async function GET() {
  const sb = getServerSupabase()
  const events: string[] = []

  // Run all independent queries in parallel
  const [sessionsResult, sabotagesResult, activeLobbiesResult, completedResult] = await Promise.all([
    sb
      .from('sessions')
      .select('final_balance, starting_balance, traders!inner(name, lobby_id, lobbies!inner(name))')
      .not('final_balance', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(5),
    sb
      .from('sabotages')
      .select('type, attacker:traders!sabotages_attacker_id_fkey(name), target:traders!sabotages_target_id_fkey(name)')
      .order('created_at', { ascending: false })
      .limit(3),
    sb
      .from('lobbies')
      .select('id', { count: 'exact' })
      .eq('status', 'active'),
    sb
      .from('lobbies')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed'),
  ])

  const { data: sessions } = sessionsResult
  if (sessions) {
    for (const s of sessions) {
      const trader = (s as Record<string, unknown>).traders as Record<string, unknown> | undefined
      const name = (trader?.name as string) ?? 'Unknown'
      const lobby = (trader?.lobbies as Record<string, unknown>)?.name as string ?? 'a battle'
      const startBal = (s.starting_balance ?? 10000) as number
      const finalBal = (s.final_balance ?? startBal) as number
      const ret = ((finalBal - startBal) / startBal * 100)
      if (Math.abs(ret) > 5) {
        events.push(ret > 0
          ? `${name} hit +${ret.toFixed(0)}% in ${lobby}`
          : `${name} went ${ret.toFixed(0)}% in ${lobby}`
        )
      }
    }
  }

  const { data: sabotages } = sabotagesResult
  if (sabotages) {
    for (const s of sabotages) {
      const src = ((s.attacker as unknown) as Record<string, unknown>)?.name ?? 'Someone'
      const tgt = ((s.target as unknown) as Record<string, unknown>)?.name ?? 'a trader'
      const atk = ((s.type as string) ?? 'sabotage').replace(/_/g, ' ')
      events.push(`${src} used ${atk} on ${tgt}`)
    }
  }

  const liveCount = activeLobbiesResult.count ?? 0
  const activeLobbyIds = (activeLobbiesResult.data ?? []).map((l: { id: string }) => l.id)

  if (liveCount > 0) {
    events.push(`${liveCount} battle${liveCount > 1 ? 's' : ''} happening right now`)
  }

  // Active players: depends on activeLobbies result
  const { count: activePlayers } = activeLobbyIds.length > 0
    ? await sb
        .from('traders')
        .select('id', { count: 'exact', head: true })
        .in('lobby_id', activeLobbyIds)
    : { count: 0 }

  const { count: battlesCompleted } = completedResult

  // If no real events, return empty (dashboard will hide ticker)
  return NextResponse.json(
    {
      events: events.slice(0, 10),
      activePlayers: activePlayers ?? 0,
      battlesCompleted: battlesCompleted ?? 0,
      liveBattles: liveCount ?? 0,
    },
    { headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=30' } },
  )
}
