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

  // Recent completed sessions with good returns
  const { data: sessions } = await sb
    .from('sessions')
    .select('final_balance, starting_balance, traders!inner(name, lobby_id, lobbies!inner(name))')
    .not('final_balance', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(5)

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

  // Recent sabotages
  const { data: sabotages } = await sb
    .from('sabotages')
    .select('attack_type, source_trader:traders!sabotages_source_trader_id_fkey(name), target_trader:traders!sabotages_target_trader_id_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(3)

  if (sabotages) {
    for (const s of sabotages) {
      const src = ((s.source_trader as unknown) as Record<string, unknown>)?.name ?? 'Someone'
      const tgt = ((s.target_trader as unknown) as Record<string, unknown>)?.name ?? 'a trader'
      const atk = ((s.attack_type as string) ?? 'sabotage').replace(/_/g, ' ')
      events.push(`${src} used ${atk} on ${tgt}`)
    }
  }

  // Active lobby count
  const { count: liveCount } = await sb
    .from('lobbies')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  if (liveCount && liveCount > 0) {
    events.push(`${liveCount} battle${liveCount > 1 ? 's' : ''} happening right now`)
  }

  // If no real events, return empty (dashboard will hide ticker)
  return NextResponse.json(
    { events: events.slice(0, 10) },
    { headers: { 'Cache-Control': 's-maxage=10, stale-while-revalidate=30' } },
  )
}
