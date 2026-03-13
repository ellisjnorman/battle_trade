'use client';

import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { getOrCreateProfile } from '@/lib/auth';

/**
 * Hook that keeps the local profile cache (bt_profile_id) in sync with
 * Privy's auth state. Call this at the top of any page that needs auth.
 *
 * - On mount: waits for Privy to rehydrate, then syncs localStorage
 * - If Privy session expired: clears stale profile_id
 * - If Privy session is valid but profile_id missing: re-creates it
 *
 * Returns { ready, authenticated, profileId, user, logout }
 */
export function useAuthPersist() {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const synced = useRef(false);

  useEffect(() => {
    if (!ready || synced.current) return;
    synced.current = true;

    if (authenticated && user) {
      // Privy session is valid — ensure profile_id is cached
      const cached = localStorage.getItem('bt_profile_id');
      if (!cached) {
        getOrCreateProfile(user, getAccessToken)
          .then(p => { if (p) localStorage.setItem('bt_profile_id', p.id); })
          .catch(() => {});
      }
    } else {
      // Privy session gone — clear stale profile cache
      localStorage.removeItem('bt_profile_id');
    }
  }, [ready, authenticated, user]);

  return {
    ready,
    authenticated,
    profileId: typeof window !== 'undefined' ? localStorage.getItem('bt_profile_id') : null,
    user,
    logout,
  };
}
