import { NextRequest, NextResponse } from 'next/server';

/**
 * Centralized rate limiting middleware for all API routes.
 * Uses in-memory counters (single-instance — fine for Vercel / single server).
 */

const windowMs = 60_000;
const hits: Map<string, { count: number; resetAt: number }> = new Map();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of hits) {
      if (val.resetAt < now) hits.delete(key);
    }
  }, 300_000);
}

function checkRate(key: string, max: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

// Route pattern → max requests per minute
// More restrictive for mutations, lenient for reads
interface RateRule { pattern: RegExp; method?: string; limit: number }

const rules: RateRule[] = [
  // Already rate-limited in route handlers — skip (handled there for backwards compat)
  // POST /api/lobby/create → 5/min (in route)
  // POST /api/lobby/[id]/positions → 30/min (in route)

  // Admin mutations — 20/min (generous but prevents runaway scripts)
  { pattern: /^\/api\/lobby\/[^/]+\/admin\/round\/(start|freeze|eliminate|next)/, method: 'POST', limit: 20 },
  { pattern: /^\/api\/lobby\/[^/]+\/admin\/(liquidate|reset|distribute)/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/lobby\/[^/]+\/admin$/, method: 'POST', limit: 20 },
  { pattern: /^\/api\/lobby\/[^/]+\/events/, method: 'POST', limit: 15 },

  // Player mutations
  { pattern: /^\/api\/lobby\/[^/]+\/register/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/lobby\/[^/]+\/sabotage\/defense/, method: 'POST', limit: 20 },
  { pattern: /^\/api\/lobby\/[^/]+\/sabotage$/, method: 'POST', limit: 20 },
  { pattern: /^\/api\/lobby\/[^/]+\/markets\/bet/, method: 'POST', limit: 30 },
  { pattern: /^\/api\/lobby\/[^/]+\/markets\/resolve/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/lobby\/[^/]+\/markets$/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/lobby\/[^/]+\/credits\/purchase/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/lobby\/[^/]+\/positions\/fill/, method: 'POST', limit: 60 },

  // Legacy admin
  { pattern: /^\/api\/admin/, method: 'POST', limit: 20 },
  { pattern: /^\/api\/positions/, method: 'POST', limit: 30 },
  { pattern: /^\/api\/positions/, method: 'DELETE', limit: 30 },

  // Read endpoints — 120/min (2 per second)
  { pattern: /^\/api\/lobby\/[^/]+\/leaderboard/, limit: 120 },
  { pattern: /^\/api\/lobby\/[^/]+\/info/, limit: 120 },
  { pattern: /^\/api\/lobby\/[^/]+\/admin\/status/, limit: 120 },
  { pattern: /^\/api\/lobby\/[^/]+\/sabotage\/credits/, limit: 120 },
  { pattern: /^\/api\/market-data/, limit: 60 },
  { pattern: /^\/api\/admin\/standings/, limit: 60 },
  { pattern: /^\/api\/admin\/round/, limit: 60 },
  { pattern: /^\/api\/health/, limit: 60 },
  { pattern: /^\/api\/og/, limit: 30 },
];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Only apply to API routes (skip webhooks — they have their own auth)
  if (!path.startsWith('/api/') || path.startsWith('/api/webhooks/')) {
    return NextResponse.next();
  }

  const ip = getIp(req);
  const method = req.method;

  for (const rule of rules) {
    if (rule.method && rule.method !== method) continue;
    if (!rule.pattern.test(path)) continue;

    const key = `mw:${ip}:${method}:${path}`;
    if (!checkRate(key, rule.limit)) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    break; // first match wins
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
