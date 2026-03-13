import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Centralized middleware: rate limiting + Privy auth for mutations.
 *
 * Auth strategy:
 * - POST/PUT/DELETE on /api/lobby/** require a valid Privy JWT
 * - GET requests pass through (lobby data is public during games)
 * - Public routes (/api/health, /api/market-data, /api/lobbies/active, /api/guest/) skip auth
 * - Webhooks have their own auth and skip everything
 * - Verified Privy user ID is attached as `x-privy-user-id` header
 */

// ---------------------------------------------------------------------------
// Rate limiting (unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Privy JWT verification
// ---------------------------------------------------------------------------

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

// Cache the JWKS fetcher — jose handles key rotation/caching internally
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (_jwks) return _jwks;
  if (!PRIVY_APP_ID) {
    throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not set');
  }
  _jwks = createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`),
  );
  return _jwks;
}

/**
 * Routes that never require authentication, even for mutations.
 */
const PUBLIC_ROUTE_PREFIXES = [
  '/api/health',
  '/api/market-data',
  '/api/lobbies/active',
  '/api/lobby/create',
  '/api/guest/',
  '/api/webhooks/',
  '/api/og/',
];

const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTE_PREFIXES.some(prefix => path.startsWith(prefix));
}

function requiresAuth(req: NextRequest): boolean {
  // Only mutations under /api/lobby/ require auth
  if (!MUTATION_METHODS.has(req.method)) return false;
  if (isPublicRoute(req.nextUrl.pathname)) return false;
  if (!req.nextUrl.pathname.startsWith('/api/lobby/')) return false;

  // Skip Privy JWT auth for routes that use their own auth (admin password, trader codes, etc.)
  // These routes validate credentials internally — middleware JWT would block them
  const path = req.nextUrl.pathname;
  const selfAuthPatterns = [
    /\/admin\//,          // admin routes use password-based auth
    /\/register$/,        // player registration
    /\/positions/,        // trading (uses trader code)
    /\/sabotage/,         // market events (uses trader/spectator id)
    /\/events/,           // volatility events
    /\/markets/,          // prediction markets
    /\/credits\//,        // credit purchases
    /\/backfill-bots$/,   // bot backfill (uses admin_id)
    /\/spectate-join$/,   // spectator join
    /\/stream/,           // broadcast streaming
    /\/chat/,             // chat messages
    /\/manage$/,          // lobby management
    /\/predictions/,      // predictions
  ];
  if (selfAuthPatterns.some(p => p.test(path))) return false;

  return true;
}

async function verifyPrivyToken(
  token: string,
): Promise<{ userId: string } | null> {
  try {
    const jwks = getJWKS();
    const { payload } = await jwtVerify(token, jwks, {
      issuer: 'privy.io',
      audience: PRIVY_APP_ID,
    });

    // Privy puts the user ID in the `sub` claim
    const userId = payload.sub;
    if (!userId) return null;

    return { userId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware entry point
// ---------------------------------------------------------------------------

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Only apply to API routes (skip webhooks — they have their own auth)
  if (!path.startsWith('/api/') || path.startsWith('/api/webhooks/')) {
    return NextResponse.next();
  }

  // --- Rate limiting (runs first, before auth) ---
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

  // --- Privy auth (only for mutations on /api/lobby/*) ---
  if (requiresAuth(req)) {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 },
      );
    }

    const result = await verifyPrivyToken(token);
    if (!result) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 },
      );
    }

    // Forward verified user ID to downstream route handlers
    const headers = new Headers(req.headers);
    headers.set('x-privy-user-id', result.userId);

    return NextResponse.next({
      request: { headers },
    });
  }

  // --- Optional: attach user ID for GET requests if token is present ---
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const result = await verifyPrivyToken(token);
    if (result) {
      const headers = new Headers(req.headers);
      headers.set('x-privy-user-id', result.userId);
      return NextResponse.next({
        request: { headers },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
