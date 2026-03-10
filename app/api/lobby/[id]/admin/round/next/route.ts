import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { startParticipationLoop } from '@/lib/participation-rules';
import { logAdminAction } from '@/lib/audit';
import { checkAuth, unauthorized } from '../../auth';
import { getCleanup, setCleanup, removeCleanup } from '../../participation';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;
  const body = await request.json();
  const { settings } = body;

  // End current round if active
  const { data: lastRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  if (lastRound && (lastRound.status === 'active' || lastRound.status === 'frozen')) {
    await supabase
      .from('rounds')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      })
      .eq('id', lastRound.id);

    removeCleanup(lobbyId);
  }

  const nextNumber = lastRound ? lastRound.round_number + 1 : 1;

  const { data, error } = await supabase
    .from('rounds')
    .insert({
      event_id: lastRound?.event_id ?? lobbyId,
      lobby_id: lobbyId,
      round_number: nextNumber,
      status: 'pending',
      starting_balance: settings?.starting_balance ?? lastRound?.starting_balance ?? 10000,
      duration_seconds: settings?.duration_seconds ?? lastRound?.duration_seconds ?? 300,
      elimination_pct: settings?.elimination_pct ?? lastRound?.elimination_pct ?? 20,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAdminAction(lobbyId, 'next_round', { new_round_id: data.id });

  return NextResponse.json({ action: 'next_round', round: data });
}
