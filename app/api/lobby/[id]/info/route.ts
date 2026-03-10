import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  // Try by UUID first, then by invite code
  let { data: lobby } = await supabase
    .from('lobbies')
    .select('id, name, format, status, is_public, invite_code, created_at')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    const { data: byCode } = await supabase
      .from('lobbies')
      .select('id, name, format, status, is_public, invite_code, created_at')
      .eq('invite_code', lobbyId.toUpperCase())
      .single();
    lobby = byCode;
  }

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  return NextResponse.json(lobby, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  });
}
