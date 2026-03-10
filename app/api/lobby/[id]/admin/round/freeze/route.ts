import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit';
import { checkAuthWithLobby, unauthorized } from '../../auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  if (!(await checkAuthWithLobby(request, lobbyId))) return unauthorized();
  const body = await request.json();
  const { round_id } = body;

  if (!round_id) {
    return NextResponse.json({ error: 'Missing round_id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('rounds')
    .update({ status: 'frozen' })
    .eq('id', round_id)
    .eq('lobby_id', lobbyId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Broadcast round frozen
  try {
    const channel = supabase.channel(`lobby-${lobbyId}`);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({ type: 'broadcast', event: 'round_frozen', payload: { type: 'round_frozen', round: data } });
        setTimeout(() => supabase.removeChannel(channel), 1000);
      }
    });
  } catch (err) {
    logger.warn('Broadcast failed (best-effort)', { action: 'freeze' }, err);
  }

  logAdminAction(lobbyId, 'round_freeze', { round_id });

  return NextResponse.json({ action: 'freeze_round', round: data });
}
