import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  let supabaseOk = false;
  let priceFeedOk = false;
  let activeLobbies = 0;

  try {
    const { error } = await supabase.from('lobbies').select('id', { count: 'exact', head: true });
    supabaseOk = !error;
  } catch {
    // supabase down
  }

  try {
    const { data, error } = await supabase
      .from('prices')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!error && data?.updated_at) {
      const age = Date.now() - new Date(data.updated_at).getTime();
      priceFeedOk = age < 30_000; // stale if older than 30s
    }
  } catch {
    // price feed down
  }

  try {
    const { count } = await supabase
      .from('rounds')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    activeLobbies = count ?? 0;
  } catch {
    // silent
  }

  return NextResponse.json({
    status: 'ok',
    supabase: supabaseOk,
    price_feed: priceFeedOk,
    active_lobbies: activeLobbies,
    timestamp: new Date().toISOString(),
  });
}
