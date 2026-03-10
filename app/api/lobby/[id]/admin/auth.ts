import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServerSupabase } from '@/lib/supabase-server';

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function safeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  // Check global admin password
  const globalPassword = process.env.ADMIN_PASSWORD;
  if (globalPassword && safeEqual(authHeader, globalPassword)) return true;

  // Will also be checked against per-lobby password in checkAuthWithLobby
  // For backwards compat, return false here — callers should use checkAuthWithLobby
  return false;
}

/** Check auth against global password, per-lobby password, OR lobby creator profile ID */
export async function checkAuthWithLobby(request: NextRequest, lobbyId: string): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;

  // Check global admin password first
  const globalPassword = process.env.ADMIN_PASSWORD;
  if (globalPassword && safeEqual(authHeader, globalPassword)) return true;

  // Check per-lobby: creator profile ID or config admin_password
  try {
    const sb = getServerSupabase();
    const { data: lobby } = await sb
      .from('lobbies')
      .select('config, created_by')
      .eq('id', lobbyId)
      .single();

    // Creator owns their lobby — profile ID match
    if (lobby?.created_by && authHeader === lobby.created_by) return true;

    // Fallback: per-lobby admin password
    const lobbyPassword = lobby?.config?.admin_password;
    if (lobbyPassword && safeEqual(authHeader, lobbyPassword)) return true;
  } catch {
    // silent — fall through to false
  }

  return false;
}
