import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { distributePrizePool } from '@/lib/entry-fees';
import { checkAuthWithLobby, unauthorized } from '../auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  if (!(await checkAuthWithLobby(request, lobbyId))) return unauthorized();

  // Get final standings — non-eliminated traders sorted by portfolio value
  const { data: traders } = await supabase
    .from('traders')
    .select('id, name, is_eliminated')
    .eq('lobby_id', lobbyId);

  if (!traders || traders.length === 0) {
    return NextResponse.json({ error: 'No traders found' }, { status: 404 });
  }

  // Build rankings: non-eliminated first (they're the winners), then eliminated
  const alive = traders.filter(t => !t.is_eliminated);
  const eliminated = traders.filter(t => t.is_eliminated);

  // For a simple ranking: alive traders are ranked 1..N, eliminated are unranked
  const rankings = alive.map((t, i) => ({ trader_id: t.id, rank: i + 1 }));

  const result = await distributePrizePool({ lobby_id: lobbyId, rankings });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    action: 'distribute_prizes',
    winners: rankings.filter(r => r.rank <= 3).map(r => ({
      trader_id: r.trader_id,
      rank: r.rank,
      name: alive.find(t => t.id === r.trader_id)?.name,
    })),
    eliminated_count: eliminated.length,
  });
}
