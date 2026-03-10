/**
 * Auth helpers for Battle Trade.
 * Privy handles all authentication (social, email, wallets via WalletConnect).
 * This module provides profile management on top of Privy sessions.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase client (for profile management only — auth is via Privy)
// ---------------------------------------------------------------------------

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return _client;
}

// ---------------------------------------------------------------------------
// Profile helpers
// ---------------------------------------------------------------------------

export interface BattleProfile {
  id: string;
  display_name: string;
  email: string | null;
  wallet_address: string | null;
  badges: unknown[];
  elo_rating: number;
  total_wins: number;
  total_lobbies_played: number;
}

/**
 * Get or create a profile for a Privy-authenticated user.
 * Called after Privy login with the Privy user object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrCreateProfile(privyUser: any): Promise<BattleProfile | null> {
  const sb = getClient();

  // Try to find existing profile by Privy ID
  const { data: existing } = await sb
    .from('profiles')
    .select('*')
    .eq('auth_user_id', privyUser.id)
    .single();

  if (existing) return existing;

  // Build display name from available data
  const displayName =
    privyUser.google?.name ??
    privyUser.email?.address?.split('@')[0] ??
    privyUser.apple?.email?.split('@')[0] ??
    (privyUser.wallet?.address
      ? `${privyUser.wallet.address.slice(0, 6)}...${privyUser.wallet.address.slice(-4)}`
      : `Trader_${Math.random().toString(36).slice(2, 6)}`);

  const email =
    privyUser.email?.address ??
    privyUser.google?.email ??
    privyUser.apple?.email ??
    null;

  const { data: newProfile } = await sb
    .from('profiles')
    .insert({
      auth_user_id: privyUser.id,
      display_name: displayName,
      email,
      wallet_address: privyUser.wallet?.address ?? null,
      wallet_type: privyUser.wallet ? 'evm' : null,
    })
    .select('*')
    .single();

  return newProfile;
}

/**
 * Get profile by Privy user ID
 */
export async function getProfileByPrivyId(privyUserId: string): Promise<BattleProfile | null> {
  const sb = getClient();
  const { data } = await sb
    .from('profiles')
    .select('*')
    .eq('auth_user_id', privyUserId)
    .single();
  return data;
}

/**
 * Update wallet address on profile after Privy wallet link
 */
export async function updateProfileWallet(
  profileId: string,
  walletAddress: string,
  walletType: 'evm' | 'solana' = 'evm',
): Promise<void> {
  const sb = getClient();
  await sb
    .from('profiles')
    .update({ wallet_address: walletAddress, wallet_type: walletType })
    .eq('id', profileId);
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

  const sb = getClient();
  const { data: profile } = await sb
    .from('profiles')
    .select('badges')
    .eq('id', profileId)
    .single();

  if (!profile) return;

  const badges = (profile.badges as Badge[]) ?? [];
  if (badges.some(b => b.id === badgeId)) return;

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
