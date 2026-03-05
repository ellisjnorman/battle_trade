import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkAuth, unauthorized } from '../../auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;
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
    await channel.send({
      type: 'broadcast',
      event: 'round_frozen',
      payload: { type: 'round_frozen', round: data },
    });
  } catch {
    // Broadcast is best-effort
  }

  return NextResponse.json({ action: 'freeze_round', round: data });
}
