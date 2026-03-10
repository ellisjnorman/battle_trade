import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logAdminAction } from '@/lib/audit';
import { checkAuthWithLobby, unauthorized } from '../auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lobby/[id]/admin/reset
 * Resets the entire game for a lobby — clears all rounds, positions, sabotages,
 * credit allocations, and un-eliminates all traders. Used between events or to restart.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  if (!(await checkAuthWithLobby(request, lobbyId))) return unauthorized();

  // Verify lobby exists
  const { data: lobby } = await supabase
    .from('lobbies')
    .select('id, config')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  const config = lobby.config as Record<string, unknown>;
  const startingCredits = 1000;

  // Get all round IDs for this lobby
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId);

  const roundIds = rounds?.map(r => r.id) ?? [];

  // Delete positions for all rounds in this lobby
  if (roundIds.length > 0) {
    await supabase
      .from('positions')
      .delete()
      .in('round_id', roundIds);
  }

  // Delete all rounds
  await supabase
    .from('rounds')
    .delete()
    .eq('lobby_id', lobbyId);

  // Delete sabotages
  await supabase
    .from('sabotages')
    .delete()
    .eq('lobby_id', lobbyId);

  // Delete volatility events
  await supabase
    .from('volatility_events')
    .delete()
    .eq('lobby_id', lobbyId);

  // Reset all traders: un-eliminate, clear status
  await supabase
    .from('traders')
    .update({ is_eliminated: false, eliminated_at: null })
    .eq('lobby_id', lobbyId);

  // Reset sessions: clear final balance/rank, un-eliminate
  await supabase
    .from('sessions')
    .update({
      final_balance: null,
      final_rank: null,
      is_eliminated: false,
      positions_locked: false,
      frozen_asset: null,
    })
    .eq('lobby_id', lobbyId);

  // Reset credit allocations to starting amount
  await supabase
    .from('credit_allocations')
    .update({
      balance: startingCredits,
      total_earned: startingCredits,
      total_spent: 0,
    })
    .eq('lobby_id', lobbyId);

  // Reset lobby status to waiting
  await supabase
    .from('lobbies')
    .update({ status: 'waiting' })
    .eq('id', lobbyId);

  // Broadcast reset event
  const ch = supabase.channel(`lobby-${lobbyId}`);
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await ch.send({ type: 'broadcast', event: 'game_reset', payload: { lobby_id: lobbyId } });
      setTimeout(() => supabase.removeChannel(ch), 1000);
    }
  });

  logAdminAction(lobbyId, 'reset_game');

  return NextResponse.json({
    success: true,
    message: 'Game reset. All rounds, positions, and sabotages cleared. Traders un-eliminated. Credits reset.',
  });
}
