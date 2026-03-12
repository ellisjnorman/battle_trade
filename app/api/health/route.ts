import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { startPriceFeed } from '@/lib/prices';
import { logger } from '@/lib/logger';
import { captureError } from '@/lib/error';

export const dynamic = 'force-dynamic';

let priceFeedStarted = false;
const startedAt = Date.now();

export async function GET() {
  // Boot price feed on first health check
  if (!priceFeedStarted) {
    startPriceFeed();
    priceFeedStarted = true;
  }

  let db = false;
  let prices = false;
  let activeLobbies = 0;

  // Run all health checks in parallel
  const [dbResult, priceResult, lobbiesResult] = await Promise.all([
    Promise.resolve(supabase.from('lobbies').select('id', { count: 'exact', head: true })).then(r => ({ error: r.error })).catch((err: unknown) => { captureError(err, { context: 'health-check', check: 'supabase' }); return { error: err }; }),
    Promise.resolve(supabase.from('prices').select('recorded_at').order('recorded_at', { ascending: false }).limit(1).single()).then(r => r).catch((err: unknown) => { captureError(err, { context: 'health-check', check: 'price-feed' }); return { data: null as { recorded_at: string } | null, error: err }; }),
    Promise.resolve(supabase.from('rounds').select('id', { count: 'exact', head: true }).eq('status', 'active')).then(r => r).catch((err: unknown) => { captureError(err, { context: 'health-check', check: 'active-lobbies' }); return { count: null as number | null }; }),
  ]);

  db = !dbResult.error;
  if (dbResult.error) logger.warn('Health check: Supabase query failed', { route: '/api/health' }, dbResult.error);

  if (!priceResult.error && priceResult.data?.recorded_at) {
    const age = Date.now() - new Date(priceResult.data.recorded_at).getTime();
    prices = age < 30_000;
    if (!prices) logger.warn('Health check: Price feed stale', { route: '/api/health', action: 'price_feed', age: `${age}ms` });
  }

  activeLobbies = ('count' in lobbiesResult ? lobbiesResult.count : null) ?? 0;

  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
  const recentErrors = logger.getRecentErrors();
  const status = db ? (prices ? 'ok' : 'degraded') : 'down';

  return NextResponse.json({
    status,
    db,
    prices,
    active_lobbies: activeLobbies,
    uptime: uptimeSeconds,
    recent_errors: recentErrors.length,
    last_error: recentErrors.length > 0 ? recentErrors[recentErrors.length - 1] : null,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
