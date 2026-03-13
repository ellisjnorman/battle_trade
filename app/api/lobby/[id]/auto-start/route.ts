import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { checkAutoStart, startAutoAdmin } from '@/lib/auto-admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lobby/[id]/auto-start
 * Called by trade page on load to ensure auto-admin is running for auto_admin lobbies.
 * No auth required — it only starts what's already flagged auto_admin=true.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  const sb = getServerSupabase();
  let isAutoAdmin = false;
  let lobbyStatus = '';
  const { data: lobby, error: lobbyErr } = await sb
    .from('lobbies')
    .select('id, auto_admin, status')
    .eq('id', lobbyId)
    .single();

  if (!lobbyErr && lobby) {
    isAutoAdmin = !!lobby.auto_admin;
    lobbyStatus = lobby.status;
  } else {
    // Fallback: auto_admin column may not be in schema cache
    const { data: l2 } = await sb.from('lobbies').select('id, config, status').eq('id', lobbyId).single();
    if (l2) {
      const cfg = l2.config as Record<string, unknown> | null;
      isAutoAdmin = !!(cfg?.auto_admin || cfg?.is_practice);
      lobbyStatus = l2.status;
    }
  }

  if (!isAutoAdmin) {
    return NextResponse.json({ auto_admin: false });
  }

  const result = await checkAutoStart(lobbyId);

  if (result.shouldStart) {
    try {
      await startAutoAdmin(lobbyId);
      return NextResponse.json({ auto_admin: true, started: true, countdown: result.countdown });
    } catch {
      return NextResponse.json({ auto_admin: true, started: false, error: 'Failed to start' });
    }
  }

  return NextResponse.json({ auto_admin: true, started: false, status: lobbyStatus });
}
