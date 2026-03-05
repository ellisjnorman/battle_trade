import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { MockProvider } from '@/lib/prediction-markets';

function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return authHeader === password;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: lobbyId } = await params;
  const body = await request.json();
  const { winner_team_id } = body;

  if (!winner_team_id) {
    return NextResponse.json({ error: 'Missing winner_team_id' }, { status: 400 });
  }

  // Find the market to resolve
  const { data: market } = await supabase
    .from('prediction_markets')
    .select('id')
    .eq('lobby_id', lobbyId)
    .in('status', ['open', 'suspended'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!market) {
    return NextResponse.json({ error: 'No open market found' }, { status: 404 });
  }

  const provider = new MockProvider();
  await provider.resolveMarket(market.id, winner_team_id);

  // Broadcast resolution
  const channel = supabase.channel(`lobby-${lobbyId}-markets`);
  await channel.send({
    type: 'broadcast',
    event: 'market',
    payload: {
      type: 'market_resolved',
      winner: winner_team_id,
      market_id: market.id,
    },
  });

  return NextResponse.json({ success: true, market_id: market.id });
}
