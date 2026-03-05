import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createMarket, MockProvider } from '@/lib/prediction-markets';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

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
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;
  const body = await request.json();
  const { action, round_id, trader_id, settings } = body;

  switch (action) {
    case 'start_round': {
      if (!round_id) {
        return NextResponse.json({ error: 'Missing round_id' }, { status: 400 });
      }
      const { data, error } = await supabase
        .from('rounds')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
        })
        .eq('id', round_id)
        .eq('lobby_id', lobbyId)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Auto-create prediction market for this round
      try {
        const { data: traders } = await supabase
          .from('traders')
          .select('team_id')
          .eq('lobby_id', lobbyId)
          .not('team_id', 'is', null);

        const teamIds = [...new Set((traders ?? []).map((t) => t.team_id).filter(Boolean))];
        if (teamIds.length > 0) {
          const { data: teamRows } = await supabase
            .from('teams')
            .select('id, name')
            .in('id', teamIds);
          const teams = (teamRows ?? []).map((t) => ({ id: t.id, name: t.name }));
          if (teams.length > 0) {
            await createMarket(lobbyId, round_id, teams);
          }
        }
      } catch {
        // Market creation is best-effort — don't fail the round start
      }

      return NextResponse.json({ action, round: data });
    }

    case 'freeze_round': {
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
      return NextResponse.json({ action, round: data });
    }

    case 'end_round': {
      if (!round_id) {
        return NextResponse.json({ error: 'Missing round_id' }, { status: 400 });
      }
      const { data, error } = await supabase
        .from('rounds')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', round_id)
        .eq('lobby_id', lobbyId)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Auto-resolve prediction market for this round
      try {
        const { data: market } = await supabase
          .from('prediction_markets')
          .select('id')
          .eq('lobby_id', lobbyId)
          .eq('round_id', round_id)
          .in('status', ['open', 'suspended'])
          .single();

        if (market) {
          // Find winning team from leaderboard
          const { data: topTrader } = await supabase
            .from('traders')
            .select('team_id')
            .eq('lobby_id', lobbyId)
            .not('team_id', 'is', null)
            .limit(1)
            .single();

          if (topTrader?.team_id) {
            const provider = new MockProvider();
            await provider.resolveMarket(market.id, topTrader.team_id);
          }
        }
      } catch {
        // Market resolution is best-effort
      }

      return NextResponse.json({ action, round: data });
    }

    case 'eliminate_trader': {
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
      return NextResponse.json({ action, trader: data });
    }

    case 'next_round': {
      const { data: lastRound } = await supabase
        .from('rounds')
        .select('*')
        .eq('lobby_id', lobbyId)
        .order('round_number', { ascending: false })
        .limit(1)
        .single();

      const nextNumber = lastRound ? lastRound.round_number + 1 : 1;

      const { data, error } = await supabase
        .from('rounds')
        .insert({
          event_id: lastRound?.event_id ?? lobbyId,
          lobby_id: lobbyId,
          round_number: nextNumber,
          status: 'pending',
          starting_balance: settings?.starting_balance ?? lastRound?.starting_balance ?? 10000,
          duration_seconds: settings?.duration_seconds ?? lastRound?.duration_seconds ?? 300,
          elimination_pct: settings?.elimination_pct ?? lastRound?.elimination_pct ?? 20,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ action, round: data });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;
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
