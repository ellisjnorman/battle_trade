'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { font, c, radius, card, btnPrimary, btnSecondary, globalCSS, tierColor, tierName } from '@/app/design'

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
interface StrategyData { id: string; title: string; body: string | null; upvotes: number; tags: string[] | null; created_at: string }
interface MiniProfile { id: string; display_name: string; avatar_url: string | null; rank_tier: string; tr_score: number }

export default function ProfilePage() {
  const { id: profileId } = useParams<{ id: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [matches, setMatches] = useState<MatchData[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([])
  const [strategies, setStrategies] = useState<StrategyData[]>([])
  const [followers, setFollowers] = useState<MiniProfile[]>([])
  const [followingList, setFollowingList] = useState<MiniProfile[]>([])
  const [tab, setTab] = useState<Tab>('matches')
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)

  const isSelf = useMemo(() => {
    try { return localStorage.getItem('bt_profile_id') === profileId } catch { return false }
  }, [profileId])

  useEffect(() => {
    if (!profileId) return
    const viewerId = (() => { try { return localStorage.getItem('bt_profile_id') } catch { return null } })()
    const qs = viewerId ? `?viewer_id=${viewerId}` : ''
    fetch(`/api/profile/${profileId}${qs}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setProfile(d.profile)
        setMatches(d.matches ?? [])
        setHeatmap(d.heatmap ?? [])
        setStrategies(d.strategies ?? [])
        setFollowers(d.followers ?? [])
        setFollowingList(d.following ?? [])
        if (typeof d.is_following === 'boolean') setIsFollowing(d.is_following)
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
    } catch { /* no-op */ }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{globalCSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div className="skeleton" style={{ width: 80, height: 80, borderRadius: radius.lg }} />
        <div className="skeleton" style={{ width: 160, height: 20, borderRadius: radius.sm }} />
        <div className="skeleton" style={{ width: 100, height: 14, borderRadius: radius.sm }} />
      </div>
    </div>
  )

  if (!profile) return (
    <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <style>{globalCSS}</style>
      <span style={{ fontFamily: font.display, fontSize: 36, color: c.red }}>PROFILE NOT FOUND</span>
      <Link href="/" className="btn-s" style={{ ...btnSecondary, padding: '10px 24px', textDecoration: 'none', fontSize: 14 }}>
        Back Home
      </Link>
    </div>
  )

  const tc = tierColor(profile.rank_tier)
  const tn = tierName(profile.rank_tier)
  const initial = profile.display_name.charAt(0).toUpperCase()
  const pillars = [
    { label: 'Performance', value: profile.tr_performance, weight: '30%' },
    { label: 'Combat', value: profile.tr_combat, weight: '20%' },
    { label: 'Strategy', value: profile.tr_strategy, weight: '20%' },
    { label: 'Community', value: profile.tr_community, weight: '15%' },
    { label: 'Streak', value: profile.tr_streak, weight: '15%' },
  ]

  // Heatmap grid (last 90 days)
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
    if (v === 0) return c.surface
    if (v > 0) return v > 0.1 ? c.pink : v > 0.05 ? '#8B4D70' : '#3D2233'
    return v < -0.1 ? c.red : v < -0.05 ? '#8B2020' : '#3D1515'
  }

  const stats = [
    { label: 'Lobbies', value: profile.total_lobbies_played },
    { label: 'Wins', value: profile.total_wins },
    { label: 'Win Rate', value: `${(profile.win_rate * 100).toFixed(0)}%` },
    { label: 'Best Return', value: `${profile.best_return > 0 ? '+' : ''}${(profile.best_return * 100).toFixed(1)}%` },
    { label: 'Earnings', value: `$${profile.total_earnings.toLocaleString()}` },
    { label: 'ELO', value: profile.elo_rating },
  ]

  const renderFollowUser = (u: MiniProfile) => {
    const utc = tierColor(u.rank_tier)
    return (
      <Link key={u.id} href={`/profile/${u.id}`} className="row-h"
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', textDecoration: 'none', borderRadius: radius.sm, transition: 'background .12s' }}>
        <div style={{ width: 36, height: 36, borderRadius: radius.md, border: `2px solid ${utc}`, background: c.elevated, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {u.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={u.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontFamily: font.display, fontSize: 16, color: utc }}>{u.display_name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{u.display_name}</span>
        </div>
        <span style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 500, color: utc, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tierName(u.rank_tier)}</span>
        <span style={{ fontFamily: font.mono, fontSize: 13, color: c.text2, minWidth: 36, textAlign: 'right' }}>{u.tr_score}</span>
      </Link>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.bg }}>
      <style>{globalCSS}</style>

      {/* Nav */}
      <nav style={{ height: 56, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: c.bg, position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(20px) saturate(1.2)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.png" alt="" style={{ height: 24 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span style={{ fontFamily: font.display, fontSize: 18, color: c.pink, letterSpacing: '0.08em' }}>BATTLE TRADE</span>
        </Link>
        <Link href="/markets" className="btn-p" style={{ ...btnPrimary, padding: '8px 20px', fontSize: 14, textDecoration: 'none' }}>
          Play Now
        </Link>
      </nav>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
        {/* ─── HEADER ─── */}
        <div className="fade-up" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 28 }}>
          {/* Avatar */}
          <div style={{ width: 80, height: 80, borderRadius: radius.lg, border: `2px solid ${tc}`, background: c.elevated, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            {profile.avatar_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontFamily: font.display, fontSize: 36, color: tc }}>{initial}</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: font.sans, fontSize: 24, fontWeight: 700, color: c.text }}>{profile.display_name}</h1>
              {profile.handle && <span style={{ fontFamily: font.mono, fontSize: 12, color: c.text3 }}>@{profile.handle}</span>}
              {!isSelf && (
                <button onClick={handleFollow} className={isFollowing ? 'btn-s' : 'btn-p'}
                  style={{ ...(isFollowing ? btnSecondary : btnPrimary), fontSize: 12, fontWeight: 600, padding: '6px 16px' }}>
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
              {isSelf && (
                <Link href="/profile" className="btn-s" style={{ ...btnSecondary, fontSize: 12, fontWeight: 600, padding: '6px 16px', textDecoration: 'none' }}>
                  Edit Profile
                </Link>
              )}
            </div>

            {/* TR + Tier */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: font.mono, fontSize: 36, fontWeight: 700, color: tc }}>{profile.tr_score}</span>
                <span style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>TR</span>
              </div>
              <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: tc, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{tn}</span>
            </div>

            {profile.bio && <p style={{ fontFamily: font.sans, fontSize: 13, color: c.text2, marginTop: 8, lineHeight: 1.5 }}>{profile.bio}</p>}

            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              {profile.location && <span style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>{profile.location}</span>}
              <span style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
              <span style={{ fontFamily: font.sans, fontSize: 11, color: c.text2 }}><strong>{profile.followers_count}</strong> followers</span>
              <span style={{ fontFamily: font.sans, fontSize: 11, color: c.text2 }}><strong>{profile.following_count}</strong> following</span>
            </div>
          </div>
        </div>

        {/* ─── STATS GRID ─── */}
        <div className="fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 24 }}>
          {stats.map(s => (
            <div key={s.label} style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 500, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
              <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: c.text }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* ─── ACTIVITY HEATMAP ─── */}
        <div className="fade-up" style={{ ...card, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trading Activity</span>
            <span style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>Last 90 days</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {heatmapGrid.map((cell, i) => (
              <div key={i} title={`${cell.date}: ${cell.value === 0 ? 'No activity' : cell.value > 0 ? `+${(cell.value * 100).toFixed(1)}%` : `${(cell.value * 100).toFixed(1)}%`}`}
                style={{ width: 10, height: 10, borderRadius: 2, background: heatColor(cell.value) }} />
            ))}
          </div>
        </div>

        {/* ─── PILLAR SCORES ─── */}
        <div className="fade-up" style={{ ...card, padding: 20, marginBottom: 24 }}>
          <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text2, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 16 }}>Reputation Breakdown</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pillars.map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 500, color: c.text3, width: 100 }}>{p.label}</span>
                <div style={{ flex: 1, height: 6, background: c.elevated, borderRadius: radius.pill, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p.value}%`, background: tc, borderRadius: radius.pill, transition: 'width 500ms ease' }} />
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 12, color: c.text, width: 28, textAlign: 'right' }}>{p.value}</span>
                <span style={{ fontFamily: font.mono, fontSize: 9, color: c.text4, width: 28 }}>{p.weight}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── BADGES ─── */}
        {profile.badges.length > 0 && (
          <div className="fade-up" style={{ ...card, padding: 20, marginBottom: 24 }}>
            <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text2, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 16 }}>Badges ({profile.badges.length})</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {profile.badges.map(b => (
                <div key={b.id} title={`${b.name} — Earned ${new Date(b.earned_at).toLocaleDateString()}`}
                  style={{ width: 64, height: 64, borderRadius: radius.md, border: `1px solid ${c.border}`, background: c.elevated, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 24 }}>{b.icon}</span>
                  <span style={{ fontFamily: font.sans, fontSize: 8, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TABS ─── */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${c.border}`, marginBottom: 16 }}>
          {([
            { id: 'matches' as Tab, label: 'Matches' },
            { id: 'strategies' as Tab, label: 'Strategies' },
            { id: 'following' as Tab, label: 'Social' },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ fontFamily: font.sans, fontSize: 14, fontWeight: tab === t.id ? 600 : 400, letterSpacing: '0.02em', padding: '10px 20px', cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: tab === t.id ? `2px solid ${c.pink}` : '2px solid transparent', color: tab === t.id ? c.text : c.text4, transition: 'color .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* MATCHES TAB */}
        {tab === 'matches' && (
          <div>
            {matches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <span style={{ fontFamily: font.sans, fontSize: 13, color: c.text4 }}>No matches yet</span>
              </div>
            ) : matches.map((m, i) => {
              const ret = m.final_balance && m.starting_balance ? (m.final_balance - m.starting_balance) / m.starting_balance : 0
              return (
                <Link key={i} href={`/lobby/${m.lobby_id}`} className="row-h"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${c.surface}`, textDecoration: 'none', borderRadius: radius.sm }}>
                  <div>
                    <span style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text }}>{m.lobby_name}</span>
                    <span style={{ fontFamily: font.sans, fontSize: 11, color: c.text4, marginLeft: 12 }}>{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {m.final_rank && (
                      <span style={{ fontFamily: font.mono, fontSize: 13, color: m.final_rank === 1 ? c.gold : m.final_rank <= 3 ? '#C0C0C0' : c.text3 }}>
                        #{m.final_rank}
                      </span>
                    )}
                    <span style={{ fontFamily: font.mono, fontSize: 13, color: ret >= 0 ? c.green : c.red }}>
                      {ret >= 0 ? '+' : ''}{(ret * 100).toFixed(1)}%
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* STRATEGIES TAB */}
        {tab === 'strategies' && (
          <div>
            {strategies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48 }}>
                <span style={{ fontFamily: font.sans, fontSize: 13, color: c.text4 }}>No strategies published yet</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {strategies.map(s => (
                  <Link key={s.id} href="/lab" className="card-h" style={{ ...card, padding: 16, textDecoration: 'none', display: 'block' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <h3 style={{ fontFamily: font.sans, fontSize: 15, fontWeight: 600, color: c.text, lineHeight: 1.3 }}>{s.title}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <span style={{ fontFamily: font.sans, fontSize: 12, color: c.text3 }}>^</span>
                        <span style={{ fontFamily: font.mono, fontSize: 13, color: c.text2 }}>{s.upvotes}</span>
                      </div>
                    </div>
                    {s.body && (
                      <p style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, marginTop: 6, lineHeight: 1.5 }}>
                        {s.body.length > 120 ? s.body.slice(0, 120) + '...' : s.body}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {(s.tags ?? []).map(tag => (
                        <span key={tag} style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 500, color: c.text3, background: c.elevated, border: `1px solid ${c.border}`, borderRadius: radius.pill, padding: '3px 10px' }}>{tag}</span>
                      ))}
                      <span style={{ fontFamily: font.sans, fontSize: 11, color: c.text4, marginLeft: 'auto' }}>
                        {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SOCIAL TAB (Followers + Following) */}
        {tab === 'following' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Followers */}
            <div>
              <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text2, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
                Followers ({followers.length})
              </span>
              {followers.length === 0 ? (
                <div style={{ padding: '24px 0' }}>
                  <span style={{ fontFamily: font.sans, fontSize: 13, color: c.text4 }}>No followers yet</span>
                </div>
              ) : (
                <div style={{ ...card, overflow: 'hidden' }}>
                  {followers.map(u => renderFollowUser(u))}
                </div>
              )}
            </div>

            {/* Following */}
            <div>
              <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text2, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
                Following ({followingList.length})
              </span>
              {followingList.length === 0 ? (
                <div style={{ padding: '24px 0' }}>
                  <span style={{ fontFamily: font.sans, fontSize: 13, color: c.text4 }}>Not following anyone yet</span>
                </div>
              ) : (
                <div style={{ ...card, overflow: 'hidden' }}>
                  {followingList.map(u => renderFollowUser(u))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
