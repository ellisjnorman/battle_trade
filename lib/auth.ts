/**
 * Auth helpers for Battle Trade.
 * Privy handles all authentication (social, email, wallets via WalletConnect).
 * This module provides profile management on top of Privy sessions.
 */

// ---------------------------------------------------------------------------
// Profile helpers
// ---------------------------------------------------------------------------

export interface BattleProfile {
  id: string;
  display_name: string;
  handle: string | null;
  email: string | null;
  wallet_address: string | null;
  badges: unknown[];
  elo_rating: number;
  total_wins: number;
  total_lobbies_played: number;
  credits: number;
}

/**
 * Get or create a profile for a Privy-authenticated user.
 * Calls server-side API route (uses service_role, bypasses RLS).
 * @param privyUser - Privy user object from usePrivy()
 * @param getAccessToken - Function from usePrivy() to get JWT for auth
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrCreateProfile(
  privyUser: any,
  getAccessToken?: () => Promise<string | null>,
): Promise<BattleProfile | null> {
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

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    // Get Privy JWT for authenticated request
    if (getAccessToken) {
      try {
        const token = await getAccessToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {
        console.warn('[auth] could not get access token');
      }
    }

    const res = await fetch('/api/auth/profile', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        display_name: displayName,
        email,
        wallet_address: privyUser.wallet?.address ?? null,
        wallet_type: privyUser.wallet ? 'evm' : null,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[auth] profile API error:', res.status, errText);
      return null;
    }

    const data = await res.json();
    return data.profile ?? null;
  } catch (err) {
    console.error('[auth] getOrCreateProfile failed:', err);
    return null;
  }
}

/**
 * Update wallet address on profile after Privy wallet link
 */
export async function updateProfileWallet(
  profileId: string,
  walletAddress: string,
  walletType: 'evm' | 'solana' = 'evm',
  getAccessToken?: () => Promise<string | null>,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (getAccessToken) {
    try {
      const token = await getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {}
  }
  await fetch(`/api/profile/${profileId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ wallet_address: walletAddress, wallet_type: walletType }),
  });
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
  console.warn('[auth] awardBadge called from client — should be server-side');
}
