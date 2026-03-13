import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Centralized middleware: rate limiting + Privy JWT identity extraction.
 *
 * Auth strategy:
 * - For ALL /api/* requests, if a Bearer JWT is present, verify it and attach
 *   `x-privy-user-id` header for downstream route handlers.
 * - Route handlers use `authenticateTrader()` or `authenticateProfile()` from
 *   lib/auth-guard.ts to enforce authorization.
 * - Webhooks skip everything (they have their own signature verification).
 *
 * This middleware does NOT block requests without JWTs — it enriches them.
 * Auth enforcement happens in individual route handlers via auth-guard.ts.
 */

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const windowMs = 60_000;
const hits: Map<string, { count: number; resetAt: number }> = new Map();

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

interface RateRule { pattern: RegExp; method?: string; limit: number }

const rules: RateRule[] = [
  // Admin mutations
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
  { pattern: /^\/api\/lobby\/[^/]+\/positions$/, method: 'POST', limit: 30 },
  { pattern: /^\/api\/lobby\/[^/]+\/positions$/, method: 'DELETE', limit: 30 },
  { pattern: /^\/api\/lobby\/[^/]+\/chat/, method: 'POST', limit: 60 },
  { pattern: /^\/api\/lobby\/[^/]+\/spectate-join/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/lobby\/[^/]+\/predictions/, method: 'POST', limit: 30 },

  // Auth + Profile mutations
  { pattern: /^\/api\/auth\/profile$/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/profile\/[^/]+$/, method: 'PATCH', limit: 10 },
  { pattern: /^\/api\/profile\/[^/]+\/follow/, method: 'POST', limit: 20 },
  { pattern: /^\/api\/strategies/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/strategies\/[^/]+\/vote/, method: 'POST', limit: 20 },
  { pattern: /^\/api\/duels/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/copy-trading/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/exchanges\/connect/, method: 'POST', limit: 5 },
  { pattern: /^\/api\/guest\/upgrade/, method: 'POST', limit: 5 },
  { pattern: /^\/api\/guest\/join/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/integrity/, method: 'POST', limit: 5 },
  { pattern: /^\/api\/reputation/, method: 'POST', limit: 10 },
  { pattern: /^\/api\/lobby\/create/, method: 'POST', limit: 5 },
  { pattern: /^\/api\/lobbies\/practice/, method: 'POST', limit: 5 },
  { pattern: /^\/api\/lobbies\/cleanup/, method: 'POST', limit: 5 },

  // Legacy admin
  { pattern: /^\/api\/admin/, method: 'POST', limit: 20 },
  { pattern: /^\/api\/positions/, method: 'POST', limit: 30 },
  { pattern: /^\/api\/positions/, method: 'DELETE', limit: 30 },

  // Read endpoints
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

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (_jwks) return _jwks;
  if (!PRIVY_APP_ID) return null; // Privy not configured — skip JWT verification
  _jwks = createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`),
  );
  return _jwks;
}

async function verifyPrivyToken(
  token: string,
): Promise<{ userId: string } | null> {
  try {
    const jwks = getJWKS();
    if (!jwks) return null;
    const { payload } = await jwtVerify(token, jwks, {
      issuer: 'privy.io',
      audience: PRIVY_APP_ID,
    });
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

  // --- Rate limiting ---
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
    break;
  }

  // --- Privy JWT identity extraction (non-blocking) ---
  // If a Bearer token is present, verify it and attach the user ID.
  // This does NOT reject requests without tokens — auth enforcement
  // is handled by individual route handlers via auth-guard.ts.
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const result = await verifyPrivyToken(token);
    if (result) {
      const headers = new Headers(req.headers);
      headers.set('x-privy-user-id', result.userId);
      return NextResponse.next({ request: { headers } });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
