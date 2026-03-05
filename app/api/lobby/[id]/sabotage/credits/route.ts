import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const trader_id = request.nextUrl.searchParams.get('trader_id');

  if (!trader_id) {
    return NextResponse.json({ error: 'Missing trader_id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('credit_allocations')
    .select('balance, total_earned, total_spent')
    .eq('trader_id', trader_id)
    .eq('lobby_id', lobbyId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { balance: 0, total_earned: 0, total_spent: 0 },
    );
  }

  return NextResponse.json(data);
}
