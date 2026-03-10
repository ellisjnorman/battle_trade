'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif"
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace"
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif"

const TIER_COLORS: Record<string, string> = {
  paper_hands: '#555', retail: '#CD7F32', swing_trader: '#C0C0C0',
  market_maker: '#FFD700', whale: '#00BFFF', degen_king: '#F5A0D0', legendary: '#FFF',
}
const TIER_NAMES: Record<string, string> = {
  paper_hands: 'PAPER HANDS', retail: 'RETAIL', swing_trader: 'SWING TRADER',
  market_maker: 'MARKET MAKER', whale: 'WHALE', degen_king: 'DEGEN KING', legendary: 'LEGENDARY',
}

type Tab = 'matches' | 'strategies' | 'following'

interface ProfileData {
  id: string; display_name: string; handle: string | null; avatar_url: string | null
  bio: string | null; location: string | null; created_at: string
  tr_score: number; tr_performance: number; tr_combat: number; tr_strategy: number; tr_community: number; tr_streak: number
  rank_tier: string; badges: Array<{ id: string; name: string; icon: string; earned_at: string }>
  total_lobbies_played: number; total_wins: number; win_rate: number; best_return: number
  elo_rating: number; total_earnings: number; streak_current: number; streak_best: number
  followers_count: number; following_count: number
}
interface MatchData { lobby_name: string; lobby_id: string; final_rank: number | null; starting_balance: number; final_balance: number | null; created_at: string }
interface HeatmapDay { date: string; value: number }

export default function ProfilePage() {
  const { id: profileId } = useParams<{ id: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [matches, setMatches] = useState<MatchData[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([])
  const [tab, setTab] = useState<Tab>('matches')
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)

  const isSelf = useMemo(() => {
    try { return localStorage.getItem('bt_profile_id') === profileId } catch { return false }
  }, [profileId])

  useEffect(() => {
    if (!profileId) return
    fetch(`/api/profile/${profileId}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setProfile(d.profile)
        setMatches(d.matches ?? [])
        setHeatmap(d.heatmap ?? [])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [profileId])

  const handleFollow = async () => {
    const myId = localStorage.getItem('bt_profile_id')
    if (!myId) { router.push('/login'); return }
    try {
      const method = isFollowing ? 'DELETE' : 'POST'
      const r = await fetch(`/api/profile/${profileId}/follow`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ follower_id: myId }) })
      if (r.ok) setIsFollowing(!isFollowing)
    } catch {}
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: B, fontSize: 24, color: '#555', letterSpacing: '0.1em' }}>LOADING...</span>
    </div>
  )

  if (!profile) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontFamily: B, fontSize: 36, color: '#FF3333' }}>PROFILE NOT FOUND</span>
      <button onClick={() => router.push('/')} style={{ fontFamily: B, fontSize: 16, color: '#F5A0D0', background: 'transparent', border: '1px solid #F5A0D0', padding: '10px 24px', cursor: 'pointer' }}>BACK HOME</button>
    </div>
  )

  const tc = TIER_COLORS[profile.rank_tier] ?? '#888'
  const tn = TIER_NAMES[profile.rank_tier] ?? profile.rank_tier.replace(/_/g, ' ').toUpperCase()
  const initial = profile.display_name.charAt(0).toUpperCase()
  const pillars = [
    { label: 'PERFORMANCE', value: profile.tr_performance, weight: '30%' },
    { label: 'COMBAT', value: profile.tr_combat, weight: '20%' },
    { label: 'STRATEGY', value: profile.tr_strategy, weight: '20%' },
    { label: 'COMMUNITY', value: profile.tr_community, weight: '15%' },
    { label: 'STREAK', value: profile.tr_streak, weight: '15%' },
  ]

  // Heatmap grid (13 weeks × 7 days)
  const heatmapGrid = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of heatmap) map[d.date] = d.value
    const cells: Array<{ date: string; value: number }> = []
    const now = new Date()
    for (let i = 90; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      cells.push({ date: key, value: map[key] ?? 0 })
    }
    return cells
  }, [heatmap])

  const heatColor = (v: number) => {
    if (v === 0) return '#111'
    if (v > 0) return v > 0.1 ? '#F5A0D0' : v > 0.05 ? '#8B4D70' : '#3D2233'
    return v < -0.1 ? '#FF3333' : v < -0.05 ? '#8B2020' : '#3D1515'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      <style>{`
        .tab-btn:hover { color: #FFF !important; }
      `}</style>

      {/* Nav */}
      <nav style={{ height: 48, borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#0D0D0D' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.png" alt="" style={{ height: 20 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span style={{ fontFamily: B, fontSize: 16, color: '#F5A0D0', letterSpacing: '0.1em' }}>BATTLE TRADE</span>
        </a>
        <button onClick={() => router.push('/markets')} style={{ fontFamily: B, fontSize: 13, color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '6px 16px', cursor: 'pointer' }}>PLAY NOW</button>
      </nav>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
        {/* ─── HEADER ─── */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 32 }}>
          {/* Avatar */}
          <div style={{ width: 80, height: 80, border: `2px solid ${tc}`, background: '#1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {profile.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontFamily: B, fontSize: 36, color: tc }}>{initial}</span>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: B, fontSize: 32, color: '#FFF', letterSpacing: '0.03em' }}>{profile.display_name}</h1>
              {profile.handle && <span style={{ fontFamily: M, fontSize: 12, color: '#888' }}>@{profile.handle}</span>}
              {!isSelf && (
                <button onClick={handleFollow} style={{ fontFamily: B, fontSize: 12, letterSpacing: '0.08em', padding: '6px 16px', cursor: 'pointer', background: isFollowing ? 'transparent' : '#F5A0D0', color: isFollowing ? '#888' : '#0A0A0A', border: isFollowing ? '1px solid #333' : 'none' }}>
                  {isFollowing ? 'FOLLOWING' : 'FOLLOW'}
                </button>
              )}
              {isSelf && (
                <button onClick={() => router.push('/profile')} style={{ fontFamily: B, fontSize: 12, color: '#888', background: 'transparent', border: '1px solid #333', padding: '6px 16px', cursor: 'pointer' }}>EDIT</button>
              )}
            </div>

            {/* TR + Tier */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: B, fontSize: 40, color: tc }}>{profile.tr_score}</span>
                <span style={{ fontFamily: B, fontSize: 14, color: '#888' }}>TR</span>
              </div>
              <span style={{ fontFamily: B, fontSize: 14, color: tc, letterSpacing: '0.08em' }}>{tn}</span>
            </div>

            {profile.bio && <p style={{ fontFamily: S, fontSize: 13, color: '#888', marginTop: 8 }}>{profile.bio}</p>}

            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              {profile.location && <span style={{ fontFamily: S, fontSize: 11, color: '#555' }}>{profile.location}</span>}
              <span style={{ fontFamily: S, fontSize: 11, color: '#555' }}>Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
              <span style={{ fontFamily: S, fontSize: 11, color: '#888' }}><strong>{profile.followers_count}</strong> followers</span>
              <span style={{ fontFamily: S, fontSize: 11, color: '#888' }}><strong>{profile.following_count}</strong> following</span>
            </div>
          </div>
        </div>

        {/* ─── ACTIVITY HEATMAP ─── */}
        <div style={{ marginBottom: 32, padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: B, fontSize: 14, color: '#888', letterSpacing: '0.08em' }}>TRADING ACTIVITY</span>
            <span style={{ fontFamily: S, fontSize: 11, color: '#555' }}>LAST 90 DAYS</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {heatmapGrid.map((c, i) => (
              <div key={i} title={`${c.date}: ${c.value === 0 ? 'No activity' : c.value > 0 ? `+${(c.value * 100).toFixed(1)}%` : `${(c.value * 100).toFixed(1)}%`}`}
                style={{ width: 10, height: 10, background: heatColor(c.value) }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
            <span style={{ fontFamily: M, fontSize: 11, color: '#888' }}>{profile.total_lobbies_played} lobbies</span>
            <span style={{ fontFamily: M, fontSize: 11, color: '#888' }}>{profile.total_wins} wins</span>
            <span style={{ fontFamily: M, fontSize: 11, color: '#888' }}>{(profile.win_rate * 100).toFixed(0)}% win rate</span>
            <span style={{ fontFamily: M, fontSize: 11, color: '#888' }}>Best: {profile.best_return > 0 ? '+' : ''}{(profile.best_return * 100).toFixed(1)}%</span>
          </div>
        </div>

        {/* ─── PILLAR SCORES ─── */}
        <div style={{ marginBottom: 32, padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
          <span style={{ fontFamily: B, fontSize: 14, color: '#888', letterSpacing: '0.08em', display: 'block', marginBottom: 16 }}>REPUTATION BREAKDOWN</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pillars.map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: B, fontSize: 12, color: '#888', width: 100, letterSpacing: '0.05em' }}>{p.label}</span>
                <div style={{ flex: 1, height: 8, background: '#111', position: 'relative' }}>
                  <div style={{ height: '100%', width: `${p.value}%`, background: tc, transition: 'width 500ms ease' }} />
                </div>
                <span style={{ fontFamily: M, fontSize: 12, color: '#FFF', width: 28, textAlign: 'right' }}>{p.value}</span>
                <span style={{ fontFamily: M, fontSize: 9, color: '#555', width: 28 }}>{p.weight}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── BADGES ─── */}
        {profile.badges.length > 0 && (
          <div style={{ marginBottom: 32, padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
            <span style={{ fontFamily: B, fontSize: 14, color: '#888', letterSpacing: '0.08em', display: 'block', marginBottom: 16 }}>BADGES ({profile.badges.length})</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {profile.badges.map(b => (
                <div key={b.id} title={`${b.name} — Earned ${new Date(b.earned_at).toLocaleDateString()}`}
                  style={{ width: 64, height: 64, border: '1px solid #333', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <span style={{ fontSize: 24 }}>{b.icon}</span>
                  <span style={{ fontFamily: B, fontSize: 8, color: '#888', letterSpacing: '0.05em' }}>{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TABS ─── */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #1A1A1A', marginBottom: 16 }}>
          {[
            { id: 'matches' as Tab, label: 'MATCHES' },
            { id: 'strategies' as Tab, label: 'STRATEGIES' },
            { id: 'following' as Tab, label: 'FOLLOWING' },
          ].map(t => (
            <button key={t.id} className="tab-btn" onClick={() => setTab(t.id)}
              style={{ fontFamily: B, fontSize: 14, letterSpacing: '0.08em', padding: '10px 20px', cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: tab === t.id ? '2px solid #F5A0D0' : '2px solid transparent', color: tab === t.id ? '#FFF' : '#666' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* MATCHES TAB */}
        {tab === 'matches' && (
          <div>
            {matches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48 }}><span style={{ fontFamily: S, fontSize: 13, color: '#555' }}>No matches yet</span></div>
            ) : matches.map((m, i) => {
              const ret = m.final_balance && m.starting_balance ? (m.final_balance - m.starting_balance) / m.starting_balance : 0
              return (
                <div key={i} onClick={() => router.push(`/lobby/${m.lobby_id}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #111', cursor: 'pointer' }}>
                  <div>
                    <span style={{ fontFamily: B, fontSize: 16, color: '#FFF', letterSpacing: '0.03em' }}>{m.lobby_name}</span>
                    <span style={{ fontFamily: S, fontSize: 11, color: '#555', marginLeft: 12 }}>{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {m.final_rank && (
                      <span style={{ fontFamily: M, fontSize: 13, color: m.final_rank === 1 ? '#FFD700' : m.final_rank <= 3 ? '#C0C0C0' : '#888' }}>
                        #{m.final_rank}
                      </span>
                    )}
                    <span style={{ fontFamily: M, fontSize: 13, color: ret >= 0 ? '#00FF88' : '#FF3333' }}>
                      {ret >= 0 ? '+' : ''}{(ret * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* STRATEGIES / FOLLOWING tabs — simplified */}
        {tab === 'strategies' && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <span style={{ fontFamily: S, fontSize: 13, color: '#555' }}>Strategies published by this trader will appear here</span>
          </div>
        )}
        {tab === 'following' && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <span style={{ fontFamily: S, fontSize: 13, color: '#555' }}>Following list will appear here</span>
          </div>
        )}
      </main>
    </div>
  )
}
