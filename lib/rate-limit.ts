/**
 * Simple in-memory rate limiter for API routes.
 * Not distributed — works per-instance only (fine for single-server / Vercel).
 */

const windowMs = 60_000; // 1 minute window
const hits: Map<string, { count: number; resetAt: number }> = new Map();

// Cleanup stale entries every 5 minutes (unref to not block process exit)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of hits) {
    if (val.resetAt < now) hits.delete(key);
  }
}, 300_000);
if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
  cleanupTimer.unref();
}

export function rateLimit(key: string, maxPerMinute: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxPerMinute - 1 };
  }

  if (entry.count >= maxPerMinute) {
    return { ok: false, remaining: 0 };
  }

  entry.count++;
  return { ok: true, remaining: maxPerMinute - entry.count };
}

/**
 * Extract IP from request headers (works on Vercel + Cloudflare)
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}
