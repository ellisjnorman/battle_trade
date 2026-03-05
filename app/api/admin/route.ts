import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

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

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) return unauthorized();

  const body = await request.json();
  const { action, round_id, trader_id, event_id, settings } = body;

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
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ action, trader: data });
    }

    case 'next_round': {
      if (!event_id) {
        return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
      }

      const { data: lastRound } = await supabase
        .from('rounds')
        .select('*')
        .eq('event_id', event_id)
        .order('round_number', { ascending: false })
        .limit(1)
        .single();

      const nextNumber = lastRound ? lastRound.round_number + 1 : 1;

      const { data, error } = await supabase
        .from('rounds')
        .insert({
          event_id,
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
