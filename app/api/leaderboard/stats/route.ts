import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { RankTier } from '@/types';

export const dynamic = 'force-dynamic';

const ALL_TIERS: RankTier[] = [
  'paper_hands',
  'retail',
  'swing_trader',
  'market_maker',
  'whale',
  'degen_king',
  'legendary',
];

export async function GET() {
  // Run all queries in parallel
  const [
    playersResult,
    lobbiesResult,
    volumeResult,
    tierResults,
  ] = await Promise.all([
    // Total players
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true }),

    // Total completed lobbies
    supabase
      .from('lobbies')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed'),

    // Total volume: sum of (size * entry_price * leverage) across all closed positions
    supabase
      .from('positions')
      .select('size, entry_price, leverage')
      .eq('status', 'closed'),

    // Tier distribution — one count per tier
    Promise.all(
      ALL_TIERS.map(async (tier) => {
        const { count, error } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('rank_tier', tier);
        return { tier, count: error ? 0 : (count ?? 0) };
      }),
    ),
  ]);

  // Compute total volume from position rows
  let totalVolume = 0;
  if (!volumeResult.error && volumeResult.data) {
    for (const pos of volumeResult.data) {
      totalVolume += (pos.size ?? 0) * (pos.entry_price ?? 0) * (pos.leverage ?? 1);
    }
  }

  // Build tier distribution map
  const tierDistribution: Record<string, number> = {};
  for (const { tier, count } of tierResults) {
    tierDistribution[tier] = count;
  }

  const hasError = playersResult.error || lobbiesResult.error;

  if (hasError) {
    const msg = playersResult.error?.message ?? lobbiesResult.error?.message ?? 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    total_players: playersResult.count ?? 0,
    total_lobbies_completed: lobbiesResult.count ?? 0,
    total_volume_traded: Math.round(totalVolume * 100) / 100,
    tier_distribution: tierDistribution,
  });
}
