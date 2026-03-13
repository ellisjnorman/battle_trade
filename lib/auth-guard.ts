/**
 * Server-side authentication guard for API routes.
 *
 * Supports three auth methods (checked in order):
 * 1. Privy JWT — middleware sets `x-privy-user-id`, we map to profile → trader
 * 2. Trader code — 6-char code returned at registration, sent as `X-Trader-Code`
 * 3. Guest token — guest_id sent as `X-Guest-Id`
 *
 * Usage in route handlers:
 *   const auth = await authenticateTrader(request, lobbyId);
 *   if (!auth.ok) return auth.response;
 *   const { trader } = auth;
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from './supabase';

interface TraderRow {
  id: string;
  name: string;
  lobby_id: string;
  profile_id: string | null;
  code: string | null;
  is_competitor?: boolean;
}

interface AuthSuccess {
  ok: true;
  trader: TraderRow;
  profileId: string | null;
}

interface AuthFailure {
  ok: false;
  response: NextResponse;
}

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * Authenticate a request and verify the caller owns the claimed trader.
 *
 * @param request - The incoming request
 * @param lobbyId - The lobby this request targets
 * @param traderId - Optional: the trader_id from the request body (if already parsed)
 */
export async function authenticateTrader(
  request: NextRequest,
  lobbyId: string,
  traderId?: string,
): Promise<AuthResult> {
  const fail = (msg: string, status = 401) =>
    ({ ok: false as const, response: NextResponse.json({ error: msg }, { status }) });

  // --- Method 1: Privy JWT (middleware already verified, set x-privy-user-id) ---
  const privyUserId = request.headers.get('x-privy-user-id');
  if (privyUserId) {
    // Map Privy user → profile → trader in this lobby
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', privyUserId)
      .single();

    if (!profile) {
      return fail('No profile found for authenticated user', 403);
    }

    // Find trader for this profile in this lobby
    const { data: trader } = await supabase
      .from('traders')
      .select('id, name, lobby_id, profile_id, code, is_competitor')
      .eq('profile_id', profile.id)
      .eq('lobby_id', lobbyId)
      .single();

    if (!trader) {
      return fail('You are not registered in this lobby', 403);
    }

    // If caller also provided trader_id, verify it matches
    if (traderId && traderId !== trader.id) {
      return fail('Trader ID does not match authenticated user', 403);
    }

    return { ok: true, trader, profileId: profile.id };
  }

  // --- Method 2: Trader code (X-Trader-Code header or trader_code in body) ---
  const traderCode = request.headers.get('x-trader-code');
  if (traderCode && traderCode.length >= 4) {
    const { data: trader } = await supabase
      .from('traders')
      .select('id, name, lobby_id, profile_id, code, is_competitor')
      .eq('code', traderCode)
      .eq('lobby_id', lobbyId)
      .single();

    if (!trader) {
      return fail('Invalid trader code', 403);
    }

    if (traderId && traderId !== trader.id) {
      return fail('Trader ID does not match trader code', 403);
    }

    return { ok: true, trader, profileId: trader.profile_id };
  }

  // --- Method 3: Guest ID (X-Guest-Id header) ---
  const guestId = request.headers.get('x-guest-id');
  if (guestId) {
    // Find guest profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', guestId)
      .eq('is_guest', true)
      .single();

    if (!profile) {
      return fail('Invalid guest session', 403);
    }

    const { data: trader } = await supabase
      .from('traders')
      .select('id, name, lobby_id, profile_id, code, is_competitor')
      .eq('profile_id', profile.id)
      .eq('lobby_id', lobbyId)
      .single();

    if (!trader) {
      return fail('Guest not registered in this lobby', 403);
    }

    if (traderId && traderId !== trader.id) {
      return fail('Trader ID does not match guest session', 403);
    }

    return { ok: true, trader, profileId: profile.id };
  }

  // --- Method 4: Fallback — trader_id from body (LEGACY, will be removed) ---
  // During migration, still allow trader_id-only auth but log a warning.
  // This keeps the app functional while clients are updated to send credentials.
  if (traderId) {
    const { data: trader } = await supabase
      .from('traders')
      .select('id, name, lobby_id, profile_id, code, is_competitor')
      .eq('id', traderId)
      .eq('lobby_id', lobbyId)
      .single();

    if (!trader) {
      return fail('Invalid trader for this lobby', 403);
    }

    // Log deprecation warning (server-side only)
    console.warn(
      `[AUTH-DEPRECATION] trader_id-only auth used for ${traderId} in lobby ${lobbyId}. ` +
      'Client should send X-Trader-Code, X-Guest-Id, or Privy JWT.',
    );

    return { ok: true, trader, profileId: trader.profile_id };
  }

  return fail('Authentication required. Send Privy JWT, X-Trader-Code, or X-Guest-Id header.');
}

/**
 * Authenticate a profile-level operation (not lobby-scoped).
 * Returns the profile ID of the authenticated user.
 */
export async function authenticateProfile(
  request: NextRequest,
): Promise<{ ok: true; profileId: string } | { ok: false; response: NextResponse }> {
  const fail = (msg: string, status = 401) =>
    ({ ok: false as const, response: NextResponse.json({ error: msg }, { status }) });

  // Privy JWT
  const privyUserId = request.headers.get('x-privy-user-id');
  if (privyUserId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', privyUserId)
      .single();

    if (!profile) return fail('No profile found', 403);
    return { ok: true, profileId: profile.id };
  }

  // Guest ID
  const guestId = request.headers.get('x-guest-id');
  if (guestId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', guestId)
      .eq('is_guest', true)
      .single();

    if (!profile) return fail('Invalid guest session', 403);
    return { ok: true, profileId: profile.id };
  }

  return fail('Authentication required');
}
