/**
 * Guest session management for Battle Trade.
 * Allows users to play immediately without Privy authentication.
 * Guest identity is stored in localStorage via a UUID.
 */

export interface GuestSession {
  guest_id: string;
  display_name: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Fun name generator
// ---------------------------------------------------------------------------

const ADJECTIVES = [
  'Swift', 'Shadow', 'Iron', 'Neon', 'Cosmic', 'Rogue', 'Phantom', 'Turbo',
  'Hyper', 'Stealth', 'Blazing', 'Frozen', 'Lucky', 'Wild', 'Savage', 'Alpha',
  'Omega', 'Crypto', 'Diamond', 'Golden',
] as const;

const NOUNS = [
  'Trader', 'Whale', 'Bull', 'Bear', 'Shark', 'Wolf', 'Hawk', 'Viper',
  'Tiger', 'Fox', 'Ape', 'Degen', 'Legend', 'King', 'Boss', 'Ninja',
  'Samurai', 'Wizard', 'Raider', 'Hunter',
] as const;

export function generateGuestName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${adj}${noun}${num}`;
}

// ---------------------------------------------------------------------------
// Guest session CRUD (browser-only — guarded for SSR)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bt_guest';
const PROFILE_KEY = 'bt_profile_id';

function generateUUID(): string {
  // Use crypto.randomUUID when available, otherwise fallback
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get existing guest session or create a new one.
 * Returns null if running on the server (no localStorage).
 */
export function getOrCreateGuest(): GuestSession | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as GuestSession;
      if (parsed.guest_id && parsed.display_name && parsed.created_at) {
        return parsed;
      }
    } catch {
      // Corrupted — fall through to create new
    }
  }

  const session: GuestSession = {
    guest_id: generateUUID(),
    display_name: generateGuestName(),
    created_at: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

/**
 * Returns true if the current user is a guest (no linked profile from Privy auth).
 */
export function isGuest(): boolean {
  if (typeof window === 'undefined') return false;
  const hasProfile = localStorage.getItem(PROFILE_KEY);
  const hasGuest = localStorage.getItem(STORAGE_KEY);
  return !hasProfile && !!hasGuest;
}

/**
 * Clear guest session (e.g. after upgrade to real account).
 */
export function clearGuestSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Upgrade a guest to a real Privy-authenticated profile.
 * Migrates all traders and sessions from the guest profile to the real profile,
 * then clears the guest session from localStorage.
 *
 * @param guestProfileId - The profile_id that was created for the guest
 * @param privyProfileId - The profile_id created for the Privy-authenticated user
 */
export async function upgradeGuestToProfile(
  guestProfileId: string,
  privyProfileId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/guest/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guest_profile_id: guestProfileId,
        privy_profile_id: privyProfileId,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.error ?? 'Upgrade failed' };
    }

    // Clear guest state, set real profile
    clearGuestSession();
    localStorage.setItem(PROFILE_KEY, privyProfileId);

    return { success: true };
  } catch {
    return { success: false, error: 'Network error during upgrade' };
  }
}
