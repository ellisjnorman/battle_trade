'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { font, c, globalCSS, radius, btnPrimary, btnSecondary, card, inputStyle, navStyle, navHeight, logoStyle } from '@/app/design'

// ─── Types ──────────────────────────────────────────────────
interface UserProfile {
  id: string
  display_name: string
  handle: string | null
  avatar_url: string | null
  tr_score: number
  rank_tier: string
}

interface DuelRecord {
  id: string
  challenger_id: string
  opponent_id: string | null
  duration_minutes: number
  status: string
  lobby_id: string | null
  winner_id: string | null
  created_at: string
  challenger_return_pct?: number
  opponent_return_pct?: number
  challenger_name?: string
  opponent_name?: string
}

interface SearchResult {
  id: string
  display_name: string
  handle: string | null
  tr_score: number
  rank_tier: string
}

type DuelDuration = 15 | 30 | 60 | 240

// ─── Helpers ────────────────────────────────────────────────
function btrTier(score: number) {
  if (score >= 1800) return { name: 'LEGEND', color: '#FFD700', glow: '0 0 12px rgba(255,215,0,.4)' }
  if (score >= 1500) return { name: 'DIAMOND', color: '#B9F2FF', glow: '0 0 12px rgba(185,242,255,.4)' }
  if (score >= 1200) return { name: 'PLATINUM', color: '#E5E4E2', glow: '0 0 12px rgba(229,228,226,.3)' }
  if (score >= 900) return { name: 'GOLD', color: '#FFD700', glow: '0 0 12px rgba(255,215,0,.3)' }
  if (score >= 600) return { name: 'SILVER', color: '#C0C0C0', glow: '0 0 12px rgba(192,192,192,.3)' }
  if (score >= 300) return { name: 'BRONZE', color: '#CD7F32', glow: '0 0 12px rgba(205,127,50,.3)' }
  return { name: 'UNRANKED', color: '#555', glow: 'none' }
}

const DURATION_OPTIONS: { value: DuelDuration; label: string; sub: string }[] = [
  { value: 15, label: '15m', sub: 'Blitz' },
  { value: 30, label: '30m', sub: 'Quick' },
  { value: 60, label: '1h', sub: 'Standard' },
  { value: 240, label: '4h', sub: 'Marathon' },
]

function timeAgo(date: string): string {
  const ms = Date.now() - new Date(date).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Component ──────────────────────────────────────────────
export default function DuelPage() {
  const router = useRouter()
  const { authenticated, user, ready } = usePrivy()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [scrolled, setScrolled] = useState(false)

  // Matchmaking state
  const [searching, setSearching] = useState(false)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [matchFound, setMatchFound] = useState<{ lobby_id: string } | null>(null)
  const [selectedDuration, setSelectedDuration] = useState<DuelDuration>(15)
  const searchTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [searchElapsed, setSearchElapsed] = useState(0)

  // Challenge state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchingPlayers, setSearchingPlayers] = useState(false)
  const [challengeDuration, setChallengeDuration] = useState<DuelDuration>(15)
  const [challengeSending, setChallengeSending] = useState<string | null>(null)

  // Challenges & history
  const [pendingChallenges, setPendingChallenges] = useState<DuelRecord[]>([])
  const [recentDuels, setRecentDuels] = useState<DuelRecord[]>([])
  const [activeTab, setActiveTab] = useState<'find' | 'challenge' | 'pending' | 'history'>('find')

  // ─── Auth & Profile ─────────────────────────────────────
  useEffect(() => {
    if (ready && !authenticated) router.replace('/login')
  }, [ready, authenticated, router])

  useEffect(() => {
    if (!authenticated || !user) return
    let cancelled = false
    ;(async () => {
      try {
        const p = await getOrCreateProfile(user)
        if (!cancelled && p) {
          const raw = p as any
          setProfile({
            id: p.id,
            display_name: p.display_name,
            handle: raw.handle ?? null,
            avatar_url: raw.avatar_url ?? null,
            tr_score: raw.tr_score ?? 1000,
            rank_tier: raw.rank_tier ?? 'unranked',
          })
        }
      } catch {}
      if (!cancelled) setProfileLoading(false)
    })()
    return () => { cancelled = true }
  }, [authenticated, user])

  // Scroll handler
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // ─── Fetch Challenges & History ─────────────────────────
  const loadChallenges = useCallback(async () => {
    if (!profile) return
    try {
      const res = await fetch(`/api/duels/me?profile_id=${profile.id}`)
      if (!res.ok) return
      const data = await res.json()
      setPendingChallenges(data.pending ?? [])
      setRecentDuels(data.recent ?? [])
    } catch {}
  }, [profile])

  useEffect(() => {
    loadChallenges()
    const iv = setInterval(loadChallenges, 20000)
    return () => clearInterval(iv)
  }, [loadChallenges])

  // ─── Matchmaking ────────────────────────────────────────
  const startSearching = useCallback(async () => {
    if (!profile) return
    setSearching(true)
    setSearchElapsed(0)
    setMatchFound(null)

    // Start the elapsed timer
    elapsedTimer.current = setInterval(() => {
      setSearchElapsed(prev => prev + 1)
    }, 1000)

    // POST to queue
    try {
      const res = await fetch('/api/duels/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: profile.id,
          duration_minutes: selectedDuration,
        }),
      })
      const data = await res.json()

      if (data.matched) {
        // Immediate match
        if (elapsedTimer.current) clearInterval(elapsedTimer.current)
        setMatchFound({ lobby_id: data.lobby_id })
        setTimeout(() => router.push(`/lobby/${data.lobby_id}`), 2000)
        return
      }

      setQueuePosition(data.position ?? null)

      // Poll for match every 3 seconds
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch('/api/duels/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profile_id: profile.id,
              duration_minutes: selectedDuration,
            }),
          })
          const pollData = await pollRes.json()

          if (pollData.matched) {
            clearInterval(pollInterval)
            if (elapsedTimer.current) clearInterval(elapsedTimer.current)
            setMatchFound({ lobby_id: pollData.lobby_id })
            setTimeout(() => router.push(`/lobby/${pollData.lobby_id}`), 2000)
          } else {
            setQueuePosition(pollData.position ?? null)
          }
        } catch {}
      }, 3000)

      // Store interval ref for cleanup
      searchTimer.current = pollInterval as any
    } catch {
      setSearching(false)
      if (searchTimer.current) clearInterval(searchTimer.current)
      if (elapsedTimer.current) clearInterval(elapsedTimer.current)
    }
  }, [profile, selectedDuration, router])

  const cancelSearch = useCallback(async () => {
    if (searchTimer.current) clearInterval(searchTimer.current)
    if (elapsedTimer.current) clearInterval(elapsedTimer.current)
    setSearching(false)
    setSearchElapsed(0)
    setQueuePosition(null)
    if (!profile) return
    try {
      await fetch('/api/duels/queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: profile.id }),
      })
    } catch {}
  }, [profile])

  // ─── Player Search ──────────────────────────────────────
  const searchPlayers = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return }
    setSearchingPlayers(true)
    try {
      const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) return
      const data = await res.json()
      setSearchResults(
        (data.profiles ?? [])
          .filter((p: SearchResult) => p.id !== profile?.id)
          .slice(0, 8)
      )
    } catch {}
    setSearchingPlayers(false)
  }, [profile])

  useEffect(() => {
    const timeout = setTimeout(() => searchPlayers(searchQuery), 350)
    return () => clearTimeout(timeout)
  }, [searchQuery, searchPlayers])

  // ─── Send Challenge ─────────────────────────────────────
  const sendChallenge = useCallback(async (opponentId: string) => {
    if (!profile) return
    setChallengeSending(opponentId)
    try {
      const res = await fetch('/api/duels/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenger_id: profile.id,
          opponent_id: opponentId,
          duration_minutes: challengeDuration,
        }),
      })
      if (res.ok) {
        loadChallenges()
        setSearchQuery('')
        setSearchResults([])
      }
    } catch {}
    setChallengeSending(null)
  }, [profile, challengeDuration, loadChallenges])

  // ─── Accept / Decline ───────────────────────────────────
  const respondChallenge = useCallback(async (challengeId: string, action: 'accept' | 'decline') => {
    if (!profile) return
    try {
      const res = await fetch('/api/duels/challenge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challengeId,
          action,
          profile_id: profile.id,
        }),
      })
      const data = await res.json()
      if (action === 'accept' && data.lobby_id) {
        router.push(`/lobby/${data.lobby_id}`)
      }
      loadChallenges()
    } catch {}
  }, [profile, loadChallenges, router])

  // ─── Loading / Auth guard ───────────────────────────────
  if (!ready || !authenticated) return null
  if (profileLoading || !profile) {
    return (
      <div style={{ background: c.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{globalCSS}{duelCSS}</style>
        <div style={{ width: 200, height: 6, borderRadius: 3 }} className="skeleton" />
      </div>
    )
  }

  const tier = btrTier(profile.tr_score)
  const incomingCount = pendingChallenges.filter(d => d.opponent_id === profile.id && d.status === 'pending').length

  return (
    <div style={{ background: c.bg, minHeight: '100vh', fontFamily: font.sans }}>
      <style>{globalCSS}{duelCSS}</style>

      {/* ─── Nav ───────────────────────────────────────────── */}
      <nav style={navStyle(scrolled)}>
        <Link href="/dashboard">
          <img src="/brand/logo-h.svg" alt="Battle Trade" style={logoStyle} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: tier.color, textShadow: tier.glow }}>
            {profile.tr_score} BTR
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: tier.color, letterSpacing: '.06em', textTransform: 'uppercase' as const }}>
            {tier.name}
          </span>
        </div>
      </nav>

      {/* ─── Hero ──────────────────────────────────────────── */}
      <div style={{ padding: '32px 20px 0', maxWidth: 540, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontFamily: font.display, fontSize: 48, color: c.text, letterSpacing: '.02em', lineHeight: 1 }}>
            1v1 DUEL
          </h1>
          <p style={{ fontFamily: font.sans, fontSize: 14, color: c.text3, marginTop: 8 }}>
            Skill-based matchmaking. Same assets, same time, one winner.
          </p>
        </div>

        {/* ─── BTR Badge ─────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: '14px 20px', marginBottom: 28,
          background: c.surface, border: `1px solid ${c.border}`, borderRadius: radius.lg,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: `linear-gradient(135deg, ${tier.color}22, ${tier.color}08)`,
            border: `2px solid ${tier.color}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: tier.color }}>
              {tier.name.slice(0, 2)}
            </span>
          </div>
          <div>
            <div style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 700, color: c.text, lineHeight: 1 }}>
              {profile.tr_score}
            </div>
            <div style={{ fontSize: 11, fontWeight: 500, color: c.text3, letterSpacing: '.06em', textTransform: 'uppercase' as const }}>
              Battle Trade Rating
            </div>
          </div>
        </div>

        {/* ─── Tabs ──────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 20,
          background: c.surface, borderRadius: radius.md, padding: 3,
          border: `1px solid ${c.border}`,
        }}>
          {([
            { key: 'find' as const, label: 'Find Match' },
            { key: 'challenge' as const, label: 'Challenge' },
            { key: 'pending' as const, label: `Inbox${incomingCount > 0 ? ` (${incomingCount})` : ''}` },
            { key: 'history' as const, label: 'History' },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                fontFamily: font.sans, fontSize: 13, fontWeight: activeTab === t.key ? 600 : 400,
                color: activeTab === t.key ? c.text : c.text3,
                background: activeTab === t.key ? c.elevated : 'transparent',
                borderRadius: radius.sm,
                transition: 'all .15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── Find Match Tab ────────────────────────────── */}
        {activeTab === 'find' && (
          <div className="fade-up">
            {/* Duration selector */}
            {!searching && !matchFound && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: c.text3, letterSpacing: '.06em', textTransform: 'uppercase' as const, marginBottom: 8 }}>
                    MATCH DURATION
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {DURATION_OPTIONS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => setSelectedDuration(d.value)}
                        className="card-h"
                        style={{
                          padding: '14px 0', border: `1px solid ${selectedDuration === d.value ? c.pink + '44' : c.border}`,
                          background: selectedDuration === d.value ? c.pinkDim : c.surface,
                          borderRadius: radius.md, cursor: 'pointer', textAlign: 'center',
                        }}
                      >
                        <div style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: selectedDuration === d.value ? c.pink : c.text, lineHeight: 1 }}>
                          {d.label}
                        </div>
                        <div style={{ fontSize: 11, color: c.text3, marginTop: 4 }}>{d.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={startSearching}
                  className="btn-p find-match-btn"
                  style={{
                    ...btnPrimary,
                    width: '100%', padding: '16px 0', fontSize: 16,
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  FIND MATCH
                </button>
                <p style={{ textAlign: 'center', fontSize: 12, color: c.text4, marginTop: 10 }}>
                  Matches you with a player within 200 BTR of your rating
                </p>
              </>
            )}

            {/* Searching state */}
            {searching && !matchFound && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div className="search-ring-container">
                  <div className="search-ring" />
                  <div className="search-ring-inner" />
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                    fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: c.pink,
                  }}>
                    {formatTime(searchElapsed)}
                  </div>
                </div>
                <div style={{ fontFamily: font.sans, fontSize: 16, fontWeight: 600, color: c.text, marginTop: 24 }}>
                  Finding opponent...
                </div>
                <div style={{ fontSize: 13, color: c.text3, marginTop: 6 }}>
                  {queuePosition && queuePosition > 1
                    ? `Queue position: ${queuePosition}`
                    : `Searching ${selectedDuration}m ${DURATION_OPTIONS.find(d => d.value === selectedDuration)?.sub} matches`
                  }
                </div>
                <div style={{ fontSize: 12, color: c.text4, marginTop: 4 }}>
                  BTR range: {Math.max(0, profile.tr_score - 200)} - {profile.tr_score + 200}
                </div>

                <button
                  onClick={cancelSearch}
                  className="btn-s"
                  style={{
                    ...btnSecondary,
                    marginTop: 28, padding: '10px 32px', fontSize: 14,
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Match found */}
            {matchFound && (
              <div style={{ textAlign: 'center', padding: '40px 0' }} className="fade-up">
                <div className="match-found-burst" />
                <div style={{ fontFamily: font.display, fontSize: 42, color: c.green, marginTop: 16, letterSpacing: '.02em' }}>
                  MATCH FOUND
                </div>
                <div style={{ fontSize: 14, color: c.text2, marginTop: 8 }}>
                  Entering arena...
                </div>
                <div style={{
                  width: 120, height: 4, borderRadius: 2,
                  background: c.greenDim, margin: '16px auto 0', overflow: 'hidden',
                }}>
                  <div className="match-progress-bar" style={{ height: '100%', borderRadius: 2, background: c.green }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Challenge Tab ─────────────────────────────── */}
        {activeTab === 'challenge' && (
          <div className="fade-up">
            {/* Duration picker */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: c.text3, letterSpacing: '.06em', textTransform: 'uppercase' as const, marginBottom: 8 }}>
                DUEL LENGTH
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {DURATION_OPTIONS.map(d => (
                  <button
                    key={d.value}
                    onClick={() => setChallengeDuration(d.value)}
                    className="pill"
                    style={{
                      border: `1px solid ${challengeDuration === d.value ? c.pink + '44' : c.border}`,
                      color: challengeDuration === d.value ? c.pink : c.text3,
                      background: challengeDuration === d.value ? c.pinkDim : 'transparent',
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search input */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Search by name or handle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...inputStyle, padding: '12px 16px', fontSize: 14 }}
              />
              {searchingPlayers && (
                <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }}>
                  <div style={{ width: 16, height: 16, border: `2px solid ${c.border}`, borderTopColor: c.pink, borderRadius: '50%' }} className="spinner" />
                </div>
              )}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div style={{ ...card, marginBottom: 16 }}>
                {searchResults.map((p, i) => {
                  const pTier = btrTier(p.tr_score)
                  return (
                    <div
                      key={p.id}
                      className="row-h"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: i < searchResults.length - 1 ? `1px solid ${c.border}` : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: `linear-gradient(135deg, ${pTier.color}33, ${pTier.color}11)`,
                          border: `1px solid ${pTier.color}33`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: font.mono, fontSize: 11, fontWeight: 700, color: pTier.color,
                        }}>
                          {pTier.name.slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: c.text }}>{p.display_name}</div>
                          <div style={{ fontSize: 12, color: c.text3 }}>
                            <span style={{ fontFamily: font.mono, color: pTier.color }}>{p.tr_score}</span> BTR
                            {p.handle && <span style={{ marginLeft: 8, color: c.text4 }}>@{p.handle}</span>}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => sendChallenge(p.id)}
                        disabled={challengeSending === p.id}
                        className="btn-p"
                        style={{
                          ...btnPrimary,
                          padding: '8px 18px', fontSize: 12,
                          opacity: challengeSending === p.id ? 0.6 : 1,
                        }}
                      >
                        {challengeSending === p.id ? 'Sending...' : 'Challenge'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {searchQuery.length >= 2 && searchResults.length === 0 && !searchingPlayers && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: c.text4, fontSize: 14 }}>
                No players found
              </div>
            )}

            {searchQuery.length < 2 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: c.text4, fontSize: 13 }}>
                Type at least 2 characters to search for players
              </div>
            )}
          </div>
        )}

        {/* ─── Pending Challenges Tab ────────────────────── */}
        {activeTab === 'pending' && (
          <div className="fade-up">
            {pendingChallenges.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 32, color: c.text4, marginBottom: 12 }}>--</div>
                <div style={{ fontSize: 14, color: c.text4 }}>No pending challenges</div>
                <div style={{ fontSize: 12, color: c.text4, marginTop: 4 }}>Challenge someone or wait for an incoming duel</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingChallenges.map(d => {
                  const isIncoming = d.opponent_id === profile.id
                  const otherName = isIncoming ? (d.challenger_name ?? 'Unknown') : (d.opponent_name ?? 'Unknown')
                  return (
                    <div
                      key={d.id}
                      style={{
                        ...card,
                        padding: '14px 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' as const,
                            color: isIncoming ? c.pink : c.blue,
                            padding: '2px 8px', borderRadius: radius.pill,
                            background: isIncoming ? c.pinkDim : c.blueDim,
                          }}>
                            {isIncoming ? 'INCOMING' : 'SENT'}
                          </span>
                          <span style={{ fontSize: 12, color: c.text4 }}>{d.duration_minutes}m</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: c.text }}>
                          {isIncoming ? `${otherName} challenges you` : `You challenged ${otherName}`}
                        </div>
                        <div style={{ fontSize: 11, color: c.text4, marginTop: 2 }}>{timeAgo(d.created_at)}</div>
                      </div>

                      {isIncoming && d.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => respondChallenge(d.id, 'accept')}
                            className="btn-p"
                            style={{ ...btnPrimary, padding: '8px 16px', fontSize: 12 }}
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => respondChallenge(d.id, 'decline')}
                            className="btn-s"
                            style={{ ...btnSecondary, padding: '8px 14px', fontSize: 12 }}
                          >
                            Decline
                          </button>
                        </div>
                      )}

                      {!isIncoming && d.status === 'pending' && (
                        <div style={{ fontSize: 12, color: c.text4, fontStyle: 'italic' }}>Waiting...</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── History Tab ───────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="fade-up">
            {recentDuels.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 32, color: c.text4, marginBottom: 12 }}>--</div>
                <div style={{ fontSize: 14, color: c.text4 }}>No duels yet</div>
                <div style={{ fontSize: 12, color: c.text4, marginTop: 4 }}>Your duel history will appear here</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentDuels.slice(0, 5).map(d => {
                  const won = d.winner_id === profile.id
                  const isChallenger = d.challenger_id === profile.id
                  const otherName = isChallenger ? (d.opponent_name ?? 'Unknown') : (d.challenger_name ?? 'Unknown')
                  const myReturn = isChallenger ? (d.challenger_return_pct ?? 0) : (d.opponent_return_pct ?? 0)
                  const theirReturn = isChallenger ? (d.opponent_return_pct ?? 0) : (d.challenger_return_pct ?? 0)
                  const diff = myReturn - theirReturn

                  return (
                    <div
                      key={d.id}
                      style={{
                        ...card,
                        padding: '14px 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderLeft: `3px solid ${won ? c.green : c.red}`,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{
                            fontFamily: font.mono, fontSize: 13, fontWeight: 700,
                            color: won ? c.green : c.red,
                          }}>
                            {won ? 'W' : 'L'}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 500, color: c.text }}>
                            vs {otherName}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: c.text4 }}>
                          {d.duration_minutes}m duel &middot; {timeAgo(d.created_at)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 700, color: diff >= 0 ? c.green : c.red }}>
                          {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%
                        </div>
                        <div style={{ fontSize: 11, color: c.text4 }}>return diff</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Bottom spacer for mobile */}
        <div style={{ height: 80 }} />
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── CSS ──────────────────────────────────────────────────
const duelCSS = `
  .search-ring-container {
    position: relative;
    width: 140px;
    height: 140px;
    margin: 0 auto;
  }

  .search-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 3px solid ${c.border};
    border-top-color: ${c.pink};
    animation: spin 1.2s linear infinite;
  }

  .search-ring-inner {
    position: absolute;
    inset: 14px;
    border-radius: 50%;
    border: 2px solid ${c.border};
    border-bottom-color: ${c.pink}88;
    animation: spin 2s linear infinite reverse;
  }

  @keyframes spin {
    to { transform: rotate(360deg) }
  }

  .find-match-btn {
    background: linear-gradient(135deg, ${c.pink}, #E87CC0) !important;
    font-family: ${font.display} !important;
    letter-spacing: .06em;
  }
  .find-match-btn:hover {
    box-shadow: ${c.pinkGlow}, inset 0 1px 0 rgba(255,255,255,.15) !important;
  }

  .match-found-burst {
    width: 80px;
    height: 80px;
    margin: 0 auto;
    border-radius: 50%;
    background: ${c.greenDim};
    border: 2px solid ${c.green};
    animation: burstPulse .8s ease-out infinite alternate;
  }

  @keyframes burstPulse {
    0% { transform: scale(1); box-shadow: 0 0 0 0 ${c.green}44; }
    100% { transform: scale(1.1); box-shadow: 0 0 40px 10px ${c.green}22; }
  }

  .match-progress-bar {
    animation: progressFill 2s ease-in-out forwards;
  }

  @keyframes progressFill {
    from { width: 0% }
    to { width: 100% }
  }

  .spinner {
    animation: spin .6s linear infinite;
  }
`
