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
    .select('id, name, is_eliminated, sessions(final_balance)')
    .eq('lobby_id', lobbyId);

  if (!traders || traders.length === 0) {
    return NextResponse.json({ error: 'No traders found' }, { status: 404 });
  }

  // Build rankings: non-eliminated first (they're the winners), ordered by performance
  const alive = traders.filter(t => !t.is_eliminated);
  const eliminated = traders.filter(t => t.is_eliminated);

  // Sort alive traders by final_balance descending (best performer first)
  alive.sort((a, b) => {
    const balA = Array.isArray(a.sessions) && a.sessions[0] ? (a.sessions[0] as { final_balance: number | null }).final_balance ?? 0 : 0;
    const balB = Array.isArray(b.sessions) && b.sessions[0] ? (b.sessions[0] as { final_balance: number | null }).final_balance ?? 0 : 0;
    return balB - balA;
  });

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
