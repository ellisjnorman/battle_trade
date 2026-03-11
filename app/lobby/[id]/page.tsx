'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { supabase } from '@/lib/supabase'
import { getOrCreateProfile } from '@/lib/auth'
import { getOrCreateGuest } from '@/lib/guest'
import { font, c } from '@/app/design'

/**
 * Lobby page — auto-joins and redirects to terminal.
 * No landing screen, no registration screen, no codes.
 * 1. If Privy-authenticated and already registered → redirect to trade/spectate
 * 2. If Privy-authenticated and not registered → auto-register as competitor → redirect to trade
 * 3. If not authenticated → guest mode: auto-create guest, join lobby, redirect to trade
 */
export default function LobbyAutoJoin() {
  const { id: lobbyId } = useParams<{ id: string }>()
  const router = useRouter()
  const { authenticated, user, ready } = usePrivy()
  const [status, setStatus] = useState('Loading...')
  const [error, setError] = useState<string | null>(null)
  const joinAttempted = useRef(false)

  // Authenticated flow — uses Privy profile + existing register endpoint
  const autoJoinAuthenticated = useCallback(async () => {
    if (!lobbyId || !user) return

    // 1. Ensure we have a profile
    let profileId = localStorage.getItem('bt_profile_id')
    if (!profileId) {
      try {
        const p = await getOrCreateProfile(user)
        if (p) { profileId = p.id; localStorage.setItem('bt_profile_id', p.id) }
      } catch {}
    }
    if (!profileId) {
      setError('Could not create profile. Try refreshing.')
      return
    }

    // 2. Check if already registered in this lobby
    setStatus('Checking registration...')
    try {
      const { data: existing } = await supabase
        .from('traders')
        .select('id, is_competitor')
        .eq('profile_id', profileId)
        .eq('lobby_id', lobbyId)
        .maybeSingle()

      if (existing) {
        const dest = existing.is_competitor ? 'trade' : 'spectate'
        router.replace(`/lobby/${lobbyId}/${dest}`)
        return
      }
    } catch {}

    // 3. Auto-register as competitor
    setStatus('Joining battle...')
    const displayName =
      user?.google?.name ??
      user?.twitter?.username ??
      user?.email?.address?.split('@')[0] ??
      'ANON'

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          is_competitor: true,
          profile_id: profileId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.insufficient_credits) {
          setError(`Not enough credits. Entry fee: ${data.entry_fee} CR`)
        } else {
          setError(data.error ?? 'Failed to join')
        }
        return
      }
      router.replace(`/lobby/${lobbyId}/trade`)
    } catch {
      setError('Network error — try again')
    }
  }, [lobbyId, user, router])

  // Guest flow — no authentication, UUID-based identity
  const autoJoinGuest = useCallback(async () => {
    if (!lobbyId) return

    const guest = getOrCreateGuest()
    if (!guest) {
      setError('Could not create guest session.')
      return
    }

    // Check if guest already has a trader in this lobby (via localStorage cache)
    const cacheKey = `bt_guest_trader_${lobbyId}`
    const cachedTraderId = localStorage.getItem(cacheKey)
    if (cachedTraderId) {
      // Verify it still exists in DB
      setStatus('Checking registration...')
      try {
        const { data: existing } = await supabase
          .from('traders')
          .select('id, is_competitor')
          .eq('id', cachedTraderId)
          .eq('lobby_id', lobbyId)
          .maybeSingle()

        if (existing) {
          const dest = existing.is_competitor ? 'trade' : 'spectate'
          router.replace(`/lobby/${lobbyId}/${dest}`)
          return
        }
        // Cached trader no longer exists — clear and re-join
        localStorage.removeItem(cacheKey)
      } catch {
        // DB check failed — try re-joining
        localStorage.removeItem(cacheKey)
      }
    }

    // Join lobby as guest
    setStatus('Joining as guest...')
    try {
      const res = await fetch('/api/guest/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobby_id: lobbyId,
          guest_id: guest.guest_id,
          display_name: guest.display_name,
          is_competitor: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.insufficient_credits) {
          setError(`Not enough credits. Entry fee: ${data.entry_fee} CR`)
        } else {
          setError(data.error ?? 'Failed to join')
        }
        return
      }

      // Cache trader_id + profile_id for this lobby
      localStorage.setItem(cacheKey, data.trader_id)
      if (data.profile_id) {
        localStorage.setItem('bt_guest_profile_id', data.profile_id)
      }

      if (data.already_registered) {
        router.replace(`/lobby/${lobbyId}/trade`)
        return
      }

      router.replace(`/lobby/${lobbyId}/trade`)
    } catch {
      setError('Network error — try again')
    }
  }, [lobbyId, router])

  useEffect(() => {
    if (!ready) return
    if (joinAttempted.current) return
    joinAttempted.current = true

    if (authenticated && user) {
      // Privy-authenticated user — use normal flow
      autoJoinAuthenticated()
    } else {
      // No auth — guest mode
      autoJoinGuest()
    }
  }, [ready, authenticated, user, autoJoinAuthenticated, autoJoinGuest])

  const handleRetry = () => {
    setError(null)
    joinAttempted.current = false
    if (authenticated && user) {
      autoJoinAuthenticated()
    } else {
      autoJoinGuest()
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: c.bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16,
    }}>
      {error ? (
        <>
          <div style={{ fontFamily: font.sans, fontSize: 16, fontWeight: 600, color: c.red }}>{error}</div>
          <button
            onClick={handleRetry}
            style={{
              fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.pink,
              background: 'transparent', border: `1px solid ${c.pink}`, padding: '10px 24px',
              borderRadius: 8, cursor: 'pointer',
            }}
          >Retry</button>
          {!authenticated && (
            <button
              onClick={() => router.push(`/login?redirect=/lobby/${lobbyId}`)}
              style={{
                fontFamily: font.sans, fontSize: 13, color: c.text3,
                background: 'transparent', border: 'none', cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >Sign in instead</button>
          )}
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              fontFamily: font.sans, fontSize: 13, color: c.text3,
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >Back to Dashboard</button>
        </>
      ) : (
        <>
          <div style={{
            width: 32, height: 32, border: `3px solid ${c.pink}`, borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontFamily: font.sans, fontSize: 14, color: c.text3 }}>{status}</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </>
      )}
    </div>
  )
}
