import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

// Simple in-memory nonce store (replace with Redis in prod)
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

export async function POST(request: NextRequest) {
  const { address, type } = await request.json();
  if (!address || !type) {
    return NextResponse.json({ error: 'Missing address or type' }, { status: 400 });
  }

  const nonce = randomBytes(32).toString('hex');
  const key = `${type}:${address.toLowerCase()}`;

  // Store nonce with 5 min expiry
  nonceStore.set(key, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 });

  // Clean expired nonces
  for (const [k, v] of nonceStore) {
    if (v.expiresAt < Date.now()) nonceStore.delete(k);
  }

  return NextResponse.json({ nonce });
}

// Export for use in verify route
export { nonceStore };
