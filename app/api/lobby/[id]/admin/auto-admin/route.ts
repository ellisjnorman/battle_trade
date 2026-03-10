import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../auth';
import { getServerSupabase } from '@/lib/supabase-server';
import { startAutoAdmin, stopAutoAdmin } from '@/lib/auto-admin';

export const dynamic = 'force-dynamic';

/** Toggle auto-admin on/off for a lobby */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { enabled } = body;

  const sb = getServerSupabase();

  await sb
    .from('lobbies')
    .update({ auto_admin: !!enabled })
    .eq('id', lobbyId);

  if (enabled) {
    await startAutoAdmin(lobbyId);
    return NextResponse.json({ auto_admin: true, message: 'Auto-admin started' });
  } else {
    stopAutoAdmin(lobbyId);
    return NextResponse.json({ auto_admin: false, message: 'Auto-admin stopped' });
  }
}
