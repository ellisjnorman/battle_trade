import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return authHeader === password;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const eventId = request.nextUrl.searchParams.get('event_id');
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('event_id', eventId)
    .order('round_number', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({ round: round ?? null });
}
