import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { MockProvider } from '@/lib/prediction-markets';
import { logger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit';
import { checkAuth, unauthorized } from '../../auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;
  const body = await request.json();
  const { trader_id } = body;

  if (!trader_id) {
    return NextResponse.json({ error: 'Missing trader_id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('traders')
    .update({
      is_eliminated: true,
      eliminated_at: new Date().toISOString(),
    })
    .eq('id', trader_id)
    .eq('lobby_id', lobbyId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve prediction market with winner
  try {
    const { data: activeRound } = await supabase
      .from('rounds')
      .select('id')
      .eq('lobby_id', lobbyId)
      .in('status', ['active', 'frozen'])
      .order('round_number', { ascending: false })
      .limit(1)
      .single();

    if (activeRound) {
      const { data: market } = await supabase
        .from('prediction_markets')
        .select('id')
        .eq('lobby_id', lobbyId)
        .eq('round_id', activeRound.id)
        .in('status', ['open', 'suspended'])
        .single();

      if (market) {
        // Find top non-eliminated team
        const { data: topTrader } = await supabase
          .from('traders')
          .select('team_id')
          .eq('lobby_id', lobbyId)
          .eq('is_eliminated', false)
          .not('team_id', 'is', null)
          .limit(1)
          .single();

        if (topTrader?.team_id) {
          const provider = new MockProvider();
          await provider.resolveMarket(market.id, topTrader.team_id);
        }
      }
    }
  } catch (err) {
    logger.warn('Market resolution failed (best-effort)', { lobbyId, action: 'eliminate' }, err);
  }

  // Broadcast elimination
  try {
    const channel = supabase.channel(`lobby-${lobbyId}`);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({ type: 'broadcast', event: 'elimination', payload: { type: 'elimination', trader_id, trader: data } });
        setTimeout(() => supabase.removeChannel(channel), 1000);
      }
    });
  } catch (err) {
    logger.warn('Broadcast failed (best-effort)', { lobbyId, action: 'eliminate' }, err);
  }

  logAdminAction(lobbyId, 'eliminate', { trader_id, trader_name: data.name });

  return NextResponse.json({ action: 'eliminate_trader', trader: data });
}
