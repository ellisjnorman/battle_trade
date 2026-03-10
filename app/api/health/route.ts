import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { startPriceFeed } from '@/lib/prices';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

let priceFeedStarted = false;

export async function GET() {
  // Boot price feed on first health check
  if (!priceFeedStarted) {
    startPriceFeed();
    priceFeedStarted = true;
  }

  let supabaseOk = false;
  let priceFeedOk = false;
  let activeLobbies = 0;

  try {
    const { error } = await supabase.from('lobbies').select('id', { count: 'exact', head: true });
    supabaseOk = !error;
    if (error) logger.warn('Health check: Supabase query failed', { route: '/api/health' }, error);
  } catch (err) {
    logger.error('Health check: Supabase unreachable', { route: '/api/health' }, err);
  }

  try {
    const { data, error } = await supabase
      .from('prices')
      .select('recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single();

    if (!error && data?.recorded_at) {
      const age = Date.now() - new Date(data.recorded_at).getTime();
      priceFeedOk = age < 30_000;
      if (!priceFeedOk) logger.warn('Health check: Price feed stale', { route: '/api/health', action: 'price_feed', age: `${age}ms` });
    }
  } catch (err) {
    logger.error('Health check: Price feed query failed', { route: '/api/health' }, err);
  }

  try {
    const { count } = await supabase
      .from('rounds')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    activeLobbies = count ?? 0;
  } catch (err) {
    logger.error('Health check: Active lobbies query failed', { route: '/api/health' }, err);
  }

  const recentErrors = logger.getRecentErrors();

  return NextResponse.json({
    status: supabaseOk ? 'ok' : 'degraded',
    supabase: supabaseOk,
    price_feed: priceFeedOk,
    active_lobbies: activeLobbies,
    recent_errors: recentErrors.length,
    last_error: recentErrors.length > 0 ? recentErrors[recentErrors.length - 1] : null,
    timestamp: new Date().toISOString(),
  });
}
