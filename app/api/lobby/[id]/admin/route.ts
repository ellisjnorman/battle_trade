import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkAuthWithLobby, unauthorized } from './auth';

export const dynamic = 'force-dynamic';

// Legacy action-based POST — kept for backward compatibility.
// New callers should use the sub-routes:
//   POST /api/lobby/[id]/admin/round/start
//   POST /api/lobby/[id]/admin/round/freeze
//   POST /api/lobby/[id]/admin/round/eliminate
//   POST /api/lobby/[id]/admin/round/next
//   GET  /api/lobby/[id]/admin/status

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  if (!(await checkAuthWithLobby(request, lobbyId))) return unauthorized();
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'current_round') {
    const { data: round } = await supabase
      .from('rounds')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('round_number', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ round: round ?? null });
  }

  // Default: return lobby info
  const { data: lobby } = await supabase
    .from('lobbies')
    .select('*')
    .eq('id', lobbyId)
    .single();

  return NextResponse.json({ lobby: lobby ?? null });
}
