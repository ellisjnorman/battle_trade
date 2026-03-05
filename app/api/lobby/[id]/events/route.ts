import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { suspendMarket, resumeMarket } from '@/lib/prediction-markets';

export const dynamic = 'force-dynamic';

function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return authHeader === password;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  const { data, error } = await supabase
    .from('volatility_events')
    .select('*')
    .eq('lobby_id', lobbyId)
    .order('fired_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
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
  const { type, asset, magnitude, duration_seconds, headline, trigger_mode, created_by } = body;

  if (!type) {
    return NextResponse.json({ error: 'Missing event type' }, { status: 400 });
  }

  // Validate lobby has an active round
  const { data: activeRound } = await supabase
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('status', 'active')
    .single();

  if (!activeRound) {
    return NextResponse.json({ error: 'No active round in this lobby' }, { status: 400 });
  }

  // Create volatility event record
  const { data: eventRecord, error } = await supabase
    .from('volatility_events')
    .insert({
      lobby_id: lobbyId,
      type,
      asset: asset ?? null,
      magnitude: magnitude ?? null,
      duration_seconds: duration_seconds ?? null,
      headline: headline ?? null,
      trigger_mode: trigger_mode ?? 'manual',
      fired_at: new Date().toISOString(),
      created_by: created_by ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Broadcast event_start to lobby channel
  const channel = supabase.channel(`lobby-${lobbyId}-events`);
  await channel.send({
    type: 'broadcast',
    event: 'volatility',
    payload: {
      type: 'event_start',
      event: eventRecord,
      secondsRemaining: duration_seconds ?? 60,
    },
  });

  // If there's an active prediction market, suspend it during the event
  const { data: market } = await supabase
    .from('prediction_markets')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('status', 'open')
    .single();

  if (market) {
    await suspendMarket(market.id);

    // Broadcast market suspended
    await channel.send({
      type: 'broadcast',
      event: 'market',
      payload: { type: 'market_suspended', reason: `Volatility event: ${type}` },
    });
  }

  // Schedule event completion
  if (duration_seconds && duration_seconds > 0) {
    setTimeout(async () => {
      // Broadcast event_complete
      const completeChannel = supabase.channel(`lobby-${lobbyId}-events`);
      await completeChannel.send({
        type: 'broadcast',
        event: 'volatility',
        payload: { type: 'event_complete', event: eventRecord },
      });

      // Resume market
      if (market) {
        await resumeMarket(market.id);
        await completeChannel.send({
          type: 'broadcast',
          event: 'market',
          payload: { type: 'market_resumed' },
        });
      }
    }, (duration_seconds ?? 60) * 1000);
  }

  return NextResponse.json(eventRecord, { status: 201 });
}
