/**
 * Supabase Auth helpers for Battle Trade.
 * Supports: email magic link, Apple Sign-In, wallet connect.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let _authClient: SupabaseClient | null = null;

export function getAuthClient(): SupabaseClient {
  if (_authClient) return _authClient;
  _authClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return _authClient;
}

// ---------------------------------------------------------------------------
// Auth methods
// ---------------------------------------------------------------------------

/** Sign in with email magic link (passwordless) */
export async function signInWithEmail(email: string): Promise<{ error?: string }> {
  const sb = getAuthClient();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  return {};
}

/** Sign in with email + password (for returning users who set a password) */
export async function signInWithPassword(email: string, password: string): Promise<{ error?: string }> {
  const sb = getAuthClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return {};
}

/** Sign up with email + password */
export async function signUpWithEmail(email: string, password: string): Promise<{ error?: string }> {
  const sb = getAuthClient();
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  return {};
}

/** Sign in with Apple */
export async function signInWithApple(): Promise<{ error?: string }> {
  const sb = getAuthClient();
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  return {};
}

/** Sign in with wallet — sign a message, verify, get session */
export async function signInWithWallet(walletType: 'evm' | 'solana'): Promise<{ error?: string }> {
  try {
    // Dynamic import to avoid SSR issues
    const { connectWallet } = await import('./wallet');
    const wallet = await connectWallet(walletType);

    // Get a nonce from the server
    const nonceRes = await fetch('/api/auth/wallet-nonce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: wallet.address, type: wallet.type }),
    });
    const { nonce } = await nonceRes.json();
    if (!nonce) return { error: 'Failed to get nonce' };

    // Sign the message
    const message = `Battle Trade login\nNonce: ${nonce}`;
    let signature: string;

    if (walletType === 'evm') {
      const ethereum = (window as unknown as Record<string, unknown>).ethereum as {
        request: (args: { method: string; params: unknown[] }) => Promise<string>;
      };
      signature = await ethereum.request({
        method: 'personal_sign',
        params: [message, wallet.address],
      });
    } else {
      const solana = (window as unknown as Record<string, unknown>).solana as {
        signMessage: (msg: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
      };
      const encoded = new TextEncoder().encode(message);
      const result = await solana.signMessage(encoded, 'utf8');
      signature = Buffer.from(result.signature).toString('hex');
    }

    // Verify on server and get session
    const verifyRes = await fetch('/api/auth/wallet-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: wallet.address,
        type: wallet.type,
        signature,
        nonce,
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) return { error: verifyData.error ?? 'Verification failed' };

    // Set the session from the server response
    if (verifyData.access_token) {
      const sb = getAuthClient();
      await sb.auth.setSession({
        access_token: verifyData.access_token,
        refresh_token: verifyData.refresh_token,
      });
    }

    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Wallet connection failed' };
  }
}

/** Sign out */
export async function signOut(): Promise<void> {
  const sb = getAuthClient();
  await sb.auth.signOut();
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/** Get current user (client-side) */
export async function getCurrentUser(): Promise<User | null> {
  const sb = getAuthClient();
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

/** Get or create profile for authenticated user */
export async function getOrCreateProfile(user: User): Promise<{
  id: string;
  display_name: string;
  email: string | null;
  wallet_address: string | null;
  badges: unknown[];
  elo_rating: number;
  total_wins: number;
  total_lobbies_played: number;
} | null> {
  const sb = getAuthClient();

  // Try to find existing profile
  const { data: existing } = await sb
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  if (existing) return existing;

  // Create new profile
  const displayName = user.user_metadata?.full_name
    ?? user.email?.split('@')[0]
    ?? `Trader_${Math.random().toString(36).slice(2, 6)}`;

  const { data: newProfile } = await sb
    .from('profiles')
    .insert({
      auth_user_id: user.id,
      display_name: displayName,
      email: user.email ?? null,
      wallet_address: user.user_metadata?.wallet_address ?? null,
      wallet_type: user.user_metadata?.wallet_type ?? null,
    })
    .select('*')
    .single();

  return newProfile;
}

// ---------------------------------------------------------------------------
// Badge system
// ---------------------------------------------------------------------------

export interface Badge {
  id: string;
  name: string;
  icon: string;
  earned_at: string;
}

export const BADGE_DEFS: Record<string, { name: string; icon: string; description: string }> = {
  first_blood: { name: 'First Blood', icon: '🗡️', description: 'Win your first battle' },
  streak_3: { name: 'On Fire', icon: '🔥', description: '3-win streak' },
  streak_5: { name: 'Unstoppable', icon: '⚡', description: '5-win streak' },
  top_10: { name: 'Top 10', icon: '🏆', description: 'Reach top 10 global' },
  whale: { name: 'Whale', icon: '🐋', description: 'Win $10K+ in prizes' },
  saboteur: { name: 'Saboteur', icon: '💣', description: 'Land 50 sabotages' },
  defender: { name: 'Fortress', icon: '🛡️', description: 'Block 20 attacks' },
  predictor: { name: 'Oracle', icon: '🔮', description: '10 correct predictions' },
  veteran: { name: 'Veteran', icon: '⭐', description: 'Play 100 games' },
  degen: { name: 'Degen', icon: '🎰', description: 'Use 10x leverage and win' },
};

export async function awardBadge(profileId: string, badgeId: string): Promise<void> {
  const def = BADGE_DEFS[badgeId];
  if (!def) return;

  const sb = getAuthClient();
  const { data: profile } = await sb
    .from('profiles')
    .select('badges')
    .eq('id', profileId)
    .single();

  if (!profile) return;

  const badges = (profile.badges as Badge[]) ?? [];
  if (badges.some(b => b.id === badgeId)) return; // Already has it

  badges.push({
    id: badgeId,
    name: def.name,
    icon: def.icon,
    earned_at: new Date().toISOString(),
  });

  await sb
    .from('profiles')
    .update({ badges })
    .eq('id', profileId);
}
