import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { LobbyConfig } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  // Try by UUID first, then by invite code
  let { data: lobby } = await supabase
    .from('lobbies')
    .select('id, name, config')
    .eq('id', lobbyId)
    .single();

  if (!lobby) {
    const { data: byCode } = await supabase
      .from('lobbies')
      .select('id, name, config')
      .eq('invite_code', lobbyId.toUpperCase())
      .single();
    lobby = byCode;
  }

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  const config = lobby.config as LobbyConfig;
  const entryFee = config.entry_fee ?? 0;
  const rakePct = config.entry_rake_pct ?? 20;

  // Get pot info
  const { data: pot } = await supabase
    .from('entry_fee_pots')
    .select('prize_pool, total_entries, total_collected, rake_collected, status')
    .eq('lobby_id', lobby.id)
    .single();

  return NextResponse.json({
    entry_fee: entryFee,
    rake_pct: rakePct,
    prize_pool: pot?.prize_pool ?? 0,
    total_entries: pot?.total_entries ?? 0,
    total_collected: pot?.total_collected ?? 0,
    split: [60, 25, 15],
    pot_status: pot?.status ?? 'collecting',
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
  });
}
