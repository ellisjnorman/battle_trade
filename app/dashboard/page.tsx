'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { font, c, tierColor, tierShort, tierName, globalCSS, radius } from '@/app/design'

// ─── Types ──────────────────────────────────────────────────
interface UserProfile {
  id: string; display_name: string; handle: string | null; avatar_url: string | null
  tr_score: number; rank_tier: string; credits: number
  total_wins: number; total_lobbies_played: number; win_rate: number; best_return: number
  badges?: { id: string; name: string; icon: string; earned_at: string }[]
}
interface Lobby {
  id: string; name: string; format: string; status: 'waiting' | 'active'
  player_count: number; spectator_count: number
  config: Record<string, unknown>
  created_by?: string | null
  current_round?: { number: number; status: string }
  top_trader?: { name: string; return_pct: number }
}
interface PastBattle {
  id: string; lobby_id: string; lobby_name: string | null
  final_rank: number | null; final_balance: number | null; starting_balance: number | null
  created_at: string
}

type LobbyFilter = 'all' | 'live' | 'open' | 'mine'

// ─── Helpers ────────────────────────────────────────────────
function calcStreak(battles: PastBattle[]): number {
  let streak = 0
  const sorted = [...battles].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  for (const b of sorted) {
    if (b.final_balance != null && b.starting_balance != null && b.final_balance > b.starting_balance) streak++
    else break
  }
  return streak
}

function lobbyGradient(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  const hue1 = Math.abs(h) % 360
  const hue2 = (hue1 + 40) % 360
  return `linear-gradient(135deg, hsl(${hue1},60%,12%) 0%, hsl(${hue2},40%,6%) 100%)`
}

// BTR tier from score
function btrTier(score: number): { name: string; color: string; next: number; floor: number } {
  if (score >= 1800) return { name: 'Legend', color: '#FFD700', next: 2000, floor: 1800 }
  if (score >= 1500) return { name: 'Diamond', color: '#B9F2FF', next: 1800, floor: 1500 }
  if (score >= 1200) return { name: 'Platinum', color: '#E5E4E2', next: 1500, floor: 1200 }
  if (score >= 900) return { name: 'Gold', color: '#FFD700', next: 1200, floor: 900 }
  if (score >= 600) return { name: 'Silver', color: '#C0C0C0', next: 900, floor: 600 }
  if (score >= 300) return { name: 'Bronze', color: '#CD7F32', next: 600, floor: 300 }
  return { name: 'Unranked', color: '#555', next: 300, floor: 0 }
}

// ─── Mode cards data ────────────────────────────────────────
const PLAY_MODES = [
  { id: 'practice', label: 'Practice', desc: 'vs AI bots', icon: '~', color: c.green, sub: 'No stakes. Learn the game.' },
  { id: 'quickplay', label: 'Quick Play', desc: 'instant match', icon: '>', color: c.pink, sub: 'Jump into a live battle.' },
  { id: 'duel', label: '1v1 Duel', desc: 'head to head', icon: 'x', color: '#FF6B35', sub: 'Challenge a rival. BTR matched.' },
  { id: 'tournament', label: 'Tournament', desc: 'bracket elimination', icon: '#', color: c.blue, sub: 'Climb the bracket. Win prizes.' },
]

export default function DashboardPage() {
  const router = useRouter()
  const { authenticated, user, ready, logout } = usePrivy()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [pastBattles, setPastBattles] = useState<PastBattle[]>([])
  const [filter, setFilter] = useState<LobbyFilter>('all')
  const [selectedLobby, setSelectedLobby] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [displayPnl, setDisplayPnl] = useState(0)
  const [activeMode, setActiveMode] = useState<string | null>(null)
  const targetPnl = useRef(0)
  const animFrame = useRef<number>(0)

  const streak = useMemo(() => calcStreak(pastBattles), [pastBattles])
  const totalPnl = useMemo(() => pastBattles.reduce((sum, b) => {
    if (b.final_balance != null && b.starting_balance != null) return sum + (b.final_balance - b.starting_balance)
    return sum
  }, 0), [pastBattles])

  // Spring animation for P&L
  useEffect(() => {
    targetPnl.current = totalPnl
    const spring = () => {
      setDisplayPnl(prev => {
        const diff = targetPnl.current - prev
        if (Math.abs(diff) < 0.5) return targetPnl.current
        return prev + diff * 0.08
      })
      animFrame.current = requestAnimationFrame(spring)
    }
    animFrame.current = requestAnimationFrame(spring)
    return () => { if (animFrame.current) cancelAnimationFrame(animFrame.current) }
  }, [totalPnl])

  useEffect(() => {
    if (!ready) return
    if (!authenticated || !user) { router.push('/'); return }
    setAuthReady(true)
  }, [ready, authenticated, user, router])

  useEffect(() => {
    if (!authReady || !user) return
    let cancelled = false
    const load = async () => {
      setProfileLoading(true)
      let pid = localStorage.getItem('bt_profile_id')
      if (!pid) {
        try {
          const p = await getOrCreateProfile(user)
          if (p) { pid = p.id; localStorage.setItem('bt_profile_id', p.id) }
        } catch {}
      }
      if (pid) {
        const r = await fetch(`/api/profile/${pid}`).catch(() => null)
        if (r?.ok) {
          const d = await r.json()
          if (!cancelled && d?.profile) setProfile(d.profile)
          if (!cancelled && d?.matches) setPastBattles(d.matches)
        } else if (!cancelled) {
          localStorage.removeItem('bt_profile_id')
          try {
            const p = await getOrCreateProfile(user)
            if (p) {
              localStorage.setItem('bt_profile_id', p.id)
              const r2 = await fetch(`/api/profile/${p.id}`)
              if (r2.ok) { const d2 = await r2.json(); if (d2?.profile) setProfile(d2.profile); if (d2?.matches) setPastBattles(d2.matches) }
            }
          } catch {}
        }
      }
      if (!cancelled) setProfileLoading(false)
      fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] }).then(d => { if (!cancelled) setLobbies(d.lobbies ?? []) }).catch(() => {})
    }
    load()
    const i = setInterval(() => {
      fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] }).then(d => setLobbies(d.lobbies ?? [])).catch(() => {})
    }, 15000)
    return () => { cancelled = true; clearInterval(i) }
  }, [authReady, user])

  // ─── Actions ──────────────────────────────────────────────
  const handlePlayMode = useCallback(async (mode: string) => {
    setActiveMode(mode)
    try {
      const pid = localStorage.getItem('bt_profile_id')
      const name = profile?.display_name || 'Trader'
      if (mode === 'practice') {
        const res = await fetch('/api/lobbies/practice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: pid, display_name: name, bot_count: 3 }),
        })
        if (res.ok) { const { lobby_id } = await res.json(); router.push(`/lobby/${lobby_id}/trade`) }
      } else if (mode === 'quickplay') {
        const res = await fetch('/api/lobbies/quickplay', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: pid }),
        })
        if (res.ok) { const { lobby_id } = await res.json(); router.push(`/lobby/${lobby_id}`) }
      } else if (mode === 'duel') {
        const res = await fetch('/api/duels/queue', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: pid }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.lobby_id) router.push(`/lobby/${data.lobby_id}`)
          else router.push(`/lobby/${data.duel_id || data.id}`)
        }
      } else if (mode === 'tournament') {
        router.push('/create?format=bracket')
      }
    } catch {} finally { setActiveMode(null) }
  }, [router, profile])

  const handleDeleteLobby = useCallback(async (lobbyId: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/manage`, {
        method: 'DELETE', headers: { Authorization: localStorage.getItem('bt_profile_id') || '' },
      })
      if (res.ok) { setLobbies(prev => prev.filter(l => l.id !== lobbyId)); setSelectedLobby(null) }
    } catch {} finally { setSaving(false) }
  }, [])

  // Filtered lobbies
  const filtered = useMemo(() => {
    let list = lobbies
    if (filter === 'live') list = list.filter(l => l.status === 'active')
    if (filter === 'open') list = list.filter(l => l.status === 'waiting')
    if (filter === 'mine') list = list.filter(l => profile?.id && l.created_by === profile.id)
    return list.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1
      if (b.status === 'active' && a.status !== 'active') return 1
      return (b.player_count + b.spectator_count) - (a.player_count + a.spectator_count)
    })
  }, [lobbies, filter, profile])

  const live = lobbies.filter(b => b.status === 'active')
  const totalOnline = lobbies.reduce((a, b) => a + b.player_count + b.spectator_count, 0)
  const btr = profile?.tr_score ?? 0
  const tier = btrTier(btr)
  const btrProgress = tier.next > tier.floor ? ((btr - tier.floor) / (tier.next - tier.floor)) * 100 : 100
  const wr = profile ? profile.win_rate * 100 : 0
  const pnlPositive = displayPnl >= 0
  const pnlColor = pnlPositive ? c.green : c.red
  const badges = profile?.badges ?? []

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: '#FFF' }}>
      <style>{globalCSS}{`
        @keyframes glowPulse{0%,100%{box-shadow:0 0 20px rgba(245,160,208,.08)}50%{box-shadow:0 0 40px rgba(245,160,208,.18)}}
        @keyframes streakFlame{0%,100%{transform:scale(1) rotate(-2deg)}33%{transform:scale(1.1) rotate(2deg)}66%{transform:scale(1.05) rotate(-1deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes rankGlow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.3)}}
        .fade-item{animation:fadeIn .3s ease both}
        .fade-item:nth-child(1){animation-delay:0s}
        .fade-item:nth-child(2){animation-delay:.04s}
        .fade-item:nth-child(3){animation-delay:.08s}
        .fade-item:nth-child(4){animation-delay:.12s}
        .mode-card{
          border:1px solid ${c.border};border-radius:${radius.lg}px;padding:20px;
          cursor:pointer;transition:all .2s cubic-bezier(.25,.1,.25,1);position:relative;overflow:hidden;
          background:${c.surface};
        }
        .mode-card:hover{border-color:${c.borderHover};transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,.4)}
        .mode-card:active{transform:scale(.97)}
        .mode-card.loading{opacity:.7;pointer-events:none}
        .lobby-card{
          border:1px solid ${c.border};border-radius:${radius.lg}px;overflow:hidden;
          cursor:pointer;transition:all .2s cubic-bezier(.25,.1,.25,1);position:relative;
        }
        .lobby-card:hover{border-color:${c.borderHover};transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.3)}
        .lobby-card.selected{border-color:${c.pink};box-shadow:0 0 20px rgba(245,160,208,.1)}
        .filter-pill{
          font-family:${font.sans};font-size:13px;font-weight:500;padding:6px 16px;
          border-radius:999px;border:1px solid ${c.border};background:transparent;
          color:${c.text3};cursor:pointer;transition:all .15s;white-space:nowrap;
        }
        .filter-pill:hover{color:${c.text2};border-color:${c.borderHover}}
        .filter-pill.active{color:${c.text};background:${c.surface};border-color:${c.pink}}
        .profile-menu{
          position:absolute;top:100%;right:0;margin-top:4px;background:${c.elevated};
          border:1px solid ${c.border};border-radius:${radius.md}px;padding:4px;min-width:180px;
          z-index:200;animation:fadeIn .15s ease;box-shadow:0 8px 32px rgba(0,0,0,.5);
        }
        .profile-menu button,.profile-menu a{
          display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;
          font-family:${font.sans};font-size:13px;border:none;background:transparent;
          color:${c.text2};cursor:pointer;border-radius:${radius.sm}px;text-decoration:none;
          transition:all .1s;text-align:left;
        }
        .profile-menu button:hover,.profile-menu a:hover{background:${c.hover};color:${c.text}}
        @media(max-width:768px){
          .dash-grid{grid-template-columns:1fr!important}
          .mode-grid{grid-template-columns:1fr 1fr!important}
          .hero-row{flex-direction:column!important}
          .stat-grid{grid-template-columns:1fr 1fr!important}
        }
      `}</style>

      {/* ══ NAV BAR ══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, height: 56, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 20px',
        background: 'rgba(10,10,10,.92)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="BT" style={{ height: 32, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </Link>
          {streak > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,200,0,.06)', border: '1px solid rgba(255,200,0,.12)' }}>
              <span style={{ fontSize: 14, animation: streak >= 5 ? 'streakFlame 1.5s ease infinite' : 'none', display: 'inline-block' }}>*</span>
              <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: c.gold }}>{streak} streak</span>
            </div>
          )}
          {totalOnline > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div className="live-dot" style={{ width: 5, height: 5 }} />
              <span style={{ fontFamily: font.sans, fontSize: 12, color: c.green, fontWeight: 500 }}>{totalOnline} online</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Credits */}
          <div style={{
            fontFamily: font.mono, fontSize: 13, fontWeight: 600, color: c.pink,
            padding: '5px 12px', borderRadius: radius.sm,
            background: c.pinkDim, border: `1px solid ${c.pinkBorder}`,
          }}>
            {profile?.credits ?? 0} CR
          </div>

          {/* Create */}
          <Link href="/create" className="btn-p" style={{
            fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.bg,
            background: c.pink, padding: '8px 16px', borderRadius: radius.md, textDecoration: 'none',
          }}>+ Create</Link>

          {/* Profile avatar / menu */}
          {profile && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowProfileMenu(!showProfileMenu)} style={{
                display: 'flex', alignItems: 'center', gap: 8, background: c.surface,
                border: `1px solid ${c.border}`, borderRadius: radius.md, padding: '4px 12px 4px 4px',
                cursor: 'pointer', transition: 'all .15s',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: radius.sm,
                  background: `linear-gradient(135deg, ${tier.color}22, ${tier.color}08)`,
                  border: `1.5px solid ${tier.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontFamily: font.sans, color: tier.color, fontWeight: 700,
                }}>{profile.display_name?.[0]?.toUpperCase()}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text2, lineHeight: 1.2 }}>{profile.display_name}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 10, color: tier.color, fontWeight: 600 }}>{tier.name}</div>
                </div>
              </button>
              {showProfileMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowProfileMenu(false)} />
                  <div className="profile-menu">
                    <Link href="/profile" onClick={() => setShowProfileMenu(false)}>Profile</Link>
                    <Link href="/leaderboard" onClick={() => setShowProfileMenu(false)}>Rankings</Link>
                    <Link href="/markets" onClick={() => setShowProfileMenu(false)}>Markets</Link>
                    <Link href="/learn" onClick={() => setShowProfileMenu(false)}>Learn</Link>
                    <div style={{ height: 1, background: c.border, margin: '4px 0' }} />
                    <button onClick={() => { localStorage.removeItem('bt_profile_id'); logout().then(() => router.push('/')) }} style={{ color: c.red }}>
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </nav>

      {!authReady ? (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
            <div className="skeleton" style={{ flex: 1, height: 160, borderRadius: radius.lg }} />
            <div className="skeleton" style={{ width: 320, height: 160, borderRadius: radius.lg }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: radius.lg }} />)}
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px 80px' }}>

          {/* ══ HERO ROW — Identity + Stats ══ */}
          <div className="hero-row" style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
            {/* Player card */}
            <div className="fade-item" style={{
              flex: 1, padding: '20px 24px', borderRadius: radius.lg,
              background: c.surface, border: `1px solid ${c.border}`,
              display: 'flex', gap: 20, alignItems: 'center',
            }}>
              {/* Avatar + rank */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: radius.md,
                  background: `linear-gradient(135deg, ${tier.color}30, ${tier.color}08)`,
                  border: `2px solid ${tier.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, fontFamily: font.sans, color: tier.color, fontWeight: 700,
                }}>{profile?.display_name?.[0]?.toUpperCase() ?? '?'}</div>
                <div style={{
                  position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
                  fontFamily: font.mono, fontSize: 9, fontWeight: 700, color: c.bg,
                  background: tier.color, padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap',
                }}>{tier.name.toUpperCase()}</div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: font.sans, fontSize: 20, fontWeight: 700, color: c.text, marginBottom: 2 }}>
                  {profile?.display_name ?? 'Loading...'}
                </div>

                {/* BTR Progress */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: tier.color }}>{btr}</span>
                  <span style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>BTR</span>
                  <div style={{ flex: 1, height: 4, background: c.hover, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      width: `${btrProgress}%`, height: '100%', borderRadius: 2,
                      background: `linear-gradient(90deg, ${tier.color}80, ${tier.color})`,
                      transition: 'width .5s ease',
                    }} />
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>{tier.next}</span>
                </div>

                {/* Badge row */}
                {badges.length > 0 && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {badges.slice(0, 6).map(b => (
                      <span key={b.id} title={b.name} style={{
                        fontSize: 16, width: 28, height: 28, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: c.hover, borderRadius: radius.sm,
                        border: `1px solid ${c.border}`,
                      }}>{b.icon}</span>
                    ))}
                    {badges.length > 6 && (
                      <span style={{
                        fontFamily: font.sans, fontSize: 11, color: c.text4,
                        display: 'flex', alignItems: 'center', paddingLeft: 4,
                      }}>+{badges.length - 6}</span>
                    )}
                  </div>
                )}
                {badges.length === 0 && (
                  <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text4 }}>
                    No badges yet — win your first battle
                  </div>
                )}
              </div>
            </div>

            {/* Stats grid */}
            <div className="stat-grid fade-item" style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2,
              borderRadius: radius.lg, overflow: 'hidden', border: `1px solid ${c.border}`,
              width: 320, flexShrink: 0,
            }}>
              {/* P&L */}
              <div style={{ padding: '14px 16px', background: c.surface }}>
                <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4, fontWeight: 500, letterSpacing: '.05em', marginBottom: 4 }}>TOTAL P&L</div>
                <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: pnlColor, lineHeight: 1 }}>
                  {pnlPositive ? '+' : ''}{displayPnl >= 1000 || displayPnl <= -1000 ? `$${(displayPnl / 1000).toFixed(1)}K` : `$${Math.round(displayPnl)}`}
                </div>
              </div>
              {/* Win Rate */}
              <div style={{ padding: '14px 16px', background: c.surface }}>
                <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4, fontWeight: 500, letterSpacing: '.05em', marginBottom: 4 }}>WIN RATE</div>
                <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: wr >= 50 ? c.green : c.text3, lineHeight: 1 }}>
                  {wr.toFixed(0)}%
                </div>
              </div>
              {/* Battles */}
              <div style={{ padding: '14px 16px', background: c.surface }}>
                <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4, fontWeight: 500, letterSpacing: '.05em', marginBottom: 4 }}>BATTLES</div>
                <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: c.text, lineHeight: 1 }}>
                  {pastBattles.length}
                </div>
              </div>
              {/* Best Return */}
              <div style={{ padding: '14px 16px', background: c.surface }}>
                <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4, fontWeight: 500, letterSpacing: '.05em', marginBottom: 4 }}>BEST</div>
                <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: (profile?.best_return ?? 0) >= 0 ? c.green : c.red, lineHeight: 1 }}>
                  {(profile?.best_return ?? 0) >= 0 ? '+' : ''}{(profile?.best_return ?? 0).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>

          {/* ══ PLAY MODES — Shows platform depth ══ */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text3, letterSpacing: '.04em', marginBottom: 12 }}>
              PLAY
            </div>
            <div className="mode-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {PLAY_MODES.map(mode => (
                <div
                  key={mode.id}
                  className={`mode-card ${activeMode === mode.id ? 'loading' : ''}`}
                  onClick={() => handlePlayMode(mode.id)}
                >
                  {/* Accent line */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: `linear-gradient(90deg, ${mode.color}, transparent)`,
                  }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: radius.sm, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      background: `${mode.color}12`, border: `1px solid ${mode.color}25`,
                      fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: mode.color,
                    }}>{mode.icon}</div>
                    <div>
                      <div style={{ fontFamily: font.sans, fontSize: 15, fontWeight: 700, color: c.text }}>{mode.label}</div>
                      <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>{mode.desc}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text3, lineHeight: 1.4 }}>
                    {activeMode === mode.id ? 'Loading...' : mode.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ══ LIVE & OPEN BATTLES ══ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text3, letterSpacing: '.04em' }}>
                BATTLES
              </div>
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                {([
                  { key: 'all', label: `All (${lobbies.length})` },
                  { key: 'live', label: `Live (${live.length})` },
                  { key: 'open', label: 'Open' },
                  { key: 'mine', label: 'Mine' },
                ] as { key: LobbyFilter; label: string }[]).map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)} className={`filter-pill ${filter === f.key ? 'active' : ''}`}>
                    {f.key === 'live' && live.length > 0 && <span className="live-dot" style={{ width: 4, height: 4, display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />}
                    {f.label}
                  </button>
                ))}
              </div>
              <Link href="/create" style={{ fontFamily: font.sans, fontSize: 12, color: c.pink, textDecoration: 'none', fontWeight: 500 }}>
                + New battle
              </Link>
            </div>

            {filtered.length > 0 ? (
              <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                {filtered.map((l, idx) => {
                  const isLive = l.status === 'active'
                  const fee = (l.config?.entry_fee as number) ?? 0
                  const prize = (l.config?.prize_pool as number) ?? (fee > 0 ? fee * 8 * 0.9 : 0)
                  const isOwner = !!(profile?.id && l.created_by === profile.id)
                  const isSelected = selectedLobby === l.id
                  const viewers = l.player_count + l.spectator_count

                  return (
                    <div key={l.id} className={`lobby-card fade-item ${isSelected ? 'selected' : ''}`} style={{ animationDelay: `${idx * 0.03}s` }} onClick={() => setSelectedLobby(isSelected ? null : l.id)}>
                      <div style={{
                        height: 72, background: lobbyGradient(l.name), padding: '12px 16px',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                        position: 'relative', overflow: 'hidden',
                      }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {isLive ? (
                            <span style={{
                              display: 'flex', alignItems: 'center', gap: 4, fontFamily: font.sans, fontSize: 11,
                              fontWeight: 700, color: '#FFF', background: 'rgba(0,220,130,.9)', padding: '2px 8px', borderRadius: 4,
                            }}>
                              <span className="live-dot" style={{ width: 4, height: 4, background: '#FFF' }} />LIVE
                            </span>
                          ) : (
                            <span style={{
                              fontFamily: font.sans, fontSize: 11, fontWeight: 600, color: c.gold,
                              background: 'rgba(255,215,0,.1)', padding: '2px 8px', borderRadius: 4,
                            }}>OPEN</span>
                          )}
                          {isOwner && (
                            <span style={{
                              fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.pink,
                              background: 'rgba(245,160,208,.15)', padding: '2px 6px', borderRadius: 4,
                            }}>HOST</span>
                          )}
                          {l.format === 'bracket' && (
                            <span style={{
                              fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.blue,
                              background: 'rgba(123,147,219,.15)', padding: '2px 6px', borderRadius: 4,
                            }}>BRACKET</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: font.sans, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                            {l.format.toUpperCase()}
                          </span>
                          <span style={{
                            fontFamily: font.mono, fontSize: 14, fontWeight: 700,
                            color: prize > 0 ? c.green : 'rgba(255,255,255,.6)',
                          }}>
                            {prize > 0 ? `$${prize}` : 'FREE'}
                          </span>
                        </div>
                      </div>

                      <div style={{ padding: '12px 16px' }}>
                        <div style={{ fontFamily: font.sans, fontSize: 16, fontWeight: 600, color: '#FFF', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontFamily: font.sans, fontSize: 12, color: c.text3 }}>
                            {l.player_count} player{l.player_count !== 1 ? 's' : ''}
                          </span>
                          {viewers > 0 && (
                            <span style={{ fontFamily: font.sans, fontSize: 12, color: c.text4 }}>
                              {viewers} watching
                            </span>
                          )}
                          {l.current_round && (
                            <span style={{ fontFamily: font.mono, fontSize: 11, color: c.gold }}>
                              R{l.current_round.number}
                            </span>
                          )}
                          {l.top_trader && (
                            <span style={{ fontFamily: font.mono, fontSize: 11, color: l.top_trader.return_pct >= 0 ? c.green : c.red, marginLeft: 'auto' }}>
                              {l.top_trader.return_pct >= 0 ? '+' : ''}{l.top_trader.return_pct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        {fee > 0 && (
                          <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4, marginTop: 4 }}>
                            {fee} CR entry
                          </div>
                        )}
                      </div>

                      {isSelected && (
                        <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', animation: 'fadeIn .15s ease' }}>
                          <button onClick={e => { e.stopPropagation(); router.push(`/lobby/${l.id}`) }} className="btn-p" style={{
                            flex: 1, fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.bg,
                            background: c.green, border: 'none', padding: '10px 0', borderRadius: radius.sm, cursor: 'pointer',
                          }}>{isLive ? 'Spectate' : 'Join'}</button>
                          {isOwner && (
                            <Link href={`/lobby/${l.id}/admin`} onClick={e => e.stopPropagation()} className="btn-s" style={{
                              fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.pink,
                              background: 'rgba(245,160,208,.06)', border: `1px solid rgba(245,160,208,.15)`,
                              padding: '10px 16px', borderRadius: radius.sm, textDecoration: 'none',
                              display: 'flex', alignItems: 'center',
                            }}>Admin</Link>
                          )}
                          {isOwner && l.status === 'waiting' && (
                            <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${l.name}"?`)) handleDeleteLobby(l.id) }} disabled={saving} style={{
                              fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.red,
                              background: c.redDim, border: `1px solid rgba(255,68,102,.15)`,
                              padding: '10px 14px', borderRadius: radius.sm, cursor: 'pointer',
                            }}>Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                border: `1px solid ${c.border}`, borderRadius: radius.lg, background: c.surface,
              }}>
                <div style={{ fontFamily: font.sans, fontSize: 18, fontWeight: 600, color: c.text3, marginBottom: 8 }}>
                  {filter === 'mine' ? 'No battles created yet' : 'No active battles'}
                </div>
                <div style={{ fontFamily: font.sans, fontSize: 14, color: c.text4, marginBottom: 24 }}>
                  {filter === 'mine' ? 'Create your first battle and invite friends' : 'Be the first to host or try a play mode above'}
                </div>
              </div>
            )}
          </div>

          {/* ══ RECENT MATCHES ══ */}
          {pastBattles.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text3, letterSpacing: '.04em', marginBottom: 12 }}>
                RECENT MATCHES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderRadius: radius.lg, overflow: 'hidden', border: `1px solid ${c.border}` }}>
                {pastBattles.slice(0, 5).map(b => {
                  const startBal = b.starting_balance ?? 10000
                  const returnPct = b.final_balance != null ? ((b.final_balance - startBal) / startBal * 100) : null
                  const pnlDollars = b.final_balance != null ? b.final_balance - startBal : null
                  const won = b.final_rank === 1
                  const positive = returnPct != null && returnPct >= 0
                  const daysAgo = Math.floor((Date.now() - new Date(b.created_at).getTime()) / 86400000)
                  const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`
                  return (
                    <Link key={b.id} href={`/lobby/${b.lobby_id}`} className="row-h" style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                      textDecoration: 'none', color: 'inherit', background: c.surface,
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: won ? 'rgba(0,220,130,.1)' : 'rgba(255,255,255,.02)',
                        border: `1.5px solid ${won ? 'rgba(0,220,130,.3)' : c.border}`, flexShrink: 0,
                      }}>
                        {won ? <span style={{ fontFamily: font.mono, fontSize: 14, color: c.green, fontWeight: 700 }}>W</span> : (
                          <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: c.text3 }}>{b.final_rank ?? '-'}</span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 500, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.lobby_name ?? 'Unknown'}
                        </div>
                        <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>{timeLabel}</div>
                      </div>
                      {pnlDollars != null && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 700, color: positive ? c.green : c.red }}>
                            {positive ? '+' : ''}{Math.abs(pnlDollars) >= 1000 ? `$${(pnlDollars / 1000).toFixed(1)}K` : `$${pnlDollars.toFixed(0)}`}
                          </div>
                          <div style={{ fontFamily: font.sans, fontSize: 11, color: positive ? 'rgba(0,220,130,.5)' : 'rgba(255,68,102,.4)' }}>
                            {positive ? '+' : ''}{returnPct?.toFixed(1)}%
                          </div>
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
              {pastBattles.length > 5 && (
                <div style={{ textAlign: 'center', padding: '12px' }}>
                  <Link href="/profile" style={{ fontFamily: font.sans, fontSize: 13, color: c.pink, textDecoration: 'none' }}>
                    View all {pastBattles.length} matches
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
