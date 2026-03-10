import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('ADMIN_PASSWORD env var is not set — all admin requests will be rejected');
    return false;
  }

  // Also support per-lobby passwords from config header
  const lobbyPassword = request.headers.get('X-Lobby-Password');

  // Timing-safe comparison to prevent timing attacks
  try {
    const a = Buffer.from(authHeader, 'utf8');
    const b = Buffer.from(password, 'utf8');
    if (a.length !== b.length) {
      // Check lobby password as fallback
      if (lobbyPassword) {
        const c = Buffer.from(lobbyPassword, 'utf8');
        return c.length === b.length && crypto.timingSafeEqual(c, b);
      }
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
