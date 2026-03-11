'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { font, c, tierColor, tierName, globalCSS, radius } from '@/app/design'

// ─── Types ──────────────────────────────────────────────────
interface UserProfile {
  id: string; display_name: string; handle: string | null; avatar_url: string | null
  tr_score: number; rank_tier: string; credits: number
  total_wins: number; total_lobbies_played: number; win_rate: number; best_return: number
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
type DashTab = 'battles' | 'learn' | 'history'

// ─── Streak logic ──────────────────────────────────────────
function calcStreak(battles: PastBattle[]): number {
  let streak = 0
  const sorted = [...battles].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  for (const b of sorted) {
    if (b.final_balance != null && b.starting_balance != null && b.final_balance > b.starting_balance) streak++
    else break
  }
  return streak
}

// ─── Color from lobby name (deterministic gradient) ────────
function lobbyGradient(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  const hue1 = Math.abs(h) % 360
  const hue2 = (hue1 + 40) % 360
  return `linear-gradient(135deg, hsl(${hue1},60%,15%) 0%, hsl(${hue2},50%,8%) 100%)`
}

// Strategy tips for the Learn section
const LEARN_CARDS = [
  { title: 'Leverage 101', desc: 'When to use 2x vs 20x — and why 100x kills.', tag: 'BEGINNER', col: c.green },
  { title: 'Reading the Board', desc: 'How to use the leaderboard as a trading signal.', tag: 'STRATEGY', col: c.blue },
  { title: 'Elimination Meta', desc: 'Preservation vs aggression in elimination rounds.', tag: 'ADVANCED', col: c.pink },
  { title: 'Sabotage Timing', desc: 'When to deploy weapons for maximum impact.', tag: 'TACTICS', col: c.gold },
  { title: 'Position Sizing', desc: 'Risk management when the clock is ticking.', tag: 'FUNDAMENTALS', col: c.green },
  { title: 'Hedging in Battle', desc: 'Using opposing positions to survive elimination.', tag: 'ADVANCED', col: c.pink },
]

export default function DashboardPage() {
  const router = useRouter()
  const { authenticated, user, ready, logout } = usePrivy()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [quickPlaying, setQuickPlaying] = useState(false)
  const [pastBattles, setPastBattles] = useState<PastBattle[]>([])
  const [filter, setFilter] = useState<LobbyFilter>('all')
  const [dashTab, setDashTab] = useState<DashTab>('battles')
  const [selectedLobby, setSelectedLobby] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [displayPnl, setDisplayPnl] = useState(0)
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

  const handleDeploy = useCallback(async () => {
    setQuickPlaying(true)
    try {
      const pid = localStorage.getItem('bt_profile_id')
      const res = await fetch('/api/lobbies/quickplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: pid }),
      })
      if (res.ok) {
        const { lobby_id } = await res.json()
        router.push(`/lobby/${lobby_id}`)
      }
    } catch {} finally { setQuickPlaying(false) }
  }, [router])

  const [practicing, setPracticing] = useState(false)
  const handlePractice = useCallback(async () => {
    setPracticing(true)
    try {
      const pid = localStorage.getItem('bt_profile_id')
      const name = profile?.display_name || 'Trader'
      const res = await fetch('/api/lobbies/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: pid, display_name: name, bot_count: 3 }),
      })
      if (res.ok) {
        const { lobby_id } = await res.json()
        router.push(`/lobby/${lobby_id}/trade`)
      }
    } catch {} finally { setPracticing(false) }
  }, [router, profile])

  const handleDeleteLobby = useCallback(async (lobbyId: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/manage`, {
        method: 'DELETE',
        headers: { Authorization: localStorage.getItem('bt_profile_id') || '' },
      })
      if (res.ok) {
        setLobbies(prev => prev.filter(l => l.id !== lobbyId))
        setSelectedLobby(null)
      }
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
  const tCol = tierColor(profile?.rank_tier)
  const wr = profile ? profile.win_rate * 100 : 0
  const pnlPositive = displayPnl >= 0
  const pnlColor = pnlPositive ? c.green : c.red

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: '#FFF' }}>
      <style>{globalCSS}{`
        @keyframes glowPulse{0%,100%{box-shadow:0 0 20px rgba(245,160,208,.1)}50%{box-shadow:0 0 40px rgba(245,160,208,.2)}}
        @keyframes streakFlame{0%,100%{transform:scale(1) rotate(-2deg)}33%{transform:scale(1.1) rotate(2deg)}66%{transform:scale(1.05) rotate(-1deg)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
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
        .tab-btn{
          font-family:${font.sans};font-size:14px;font-weight:500;padding:8px 0;
          border:none;background:transparent;cursor:pointer;transition:all .15s;
          border-bottom:2px solid transparent;color:${c.text3};
        }
        .tab-btn:hover{color:${c.text2}}
        .tab-btn.active{color:${c.text};border-bottom-color:${c.pink}}
        .learn-card{
          border:1px solid ${c.border};border-radius:${radius.md}px;padding:20px;
          cursor:pointer;transition:all .2s;min-width:240px;flex-shrink:0;
        }
        .learn-card:hover{border-color:${c.borderHover};background:${c.surface};transform:translateY(-1px)}
        .profile-menu{
          position:absolute;top:100%;right:0;margin-top:4px;background:${c.elevated};
          border:1px solid ${c.border};border-radius:${radius.md}px;padding:4px;min-width:160px;
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
          .stat-strip{flex-wrap:wrap}
        }
      `}</style>

      {/* ══ NAV BAR ══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, height: 56, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 20px',
        background: 'rgba(10,10,10,.92)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="BT" style={{ height: 32, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </Link>
          <div style={{ display: 'flex', gap: 20 }}>
            {(['battles', 'learn', 'history'] as DashTab[]).map(t => (
              <button key={t} onClick={() => setDashTab(t)} className={`tab-btn ${dashTab === t ? 'active' : ''}`}>
                {t === 'battles' ? 'Battles' : t === 'learn' ? 'Learn' : 'History'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {streak > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,200,0,.06)', border: '1px solid rgba(255,200,0,.12)' }}>
              <span style={{ fontSize: 14, animation: streak >= 5 ? 'streakFlame 1.5s ease infinite' : 'none', display: 'inline-block' }}>🔥</span>
              <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: c.gold }}>{streak}</span>
            </div>
          )}
          {totalOnline > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div className="live-dot" style={{ width: 5, height: 5 }} />
              <span style={{ fontFamily: font.sans, fontSize: 12, color: c.green, fontWeight: 500 }}>{totalOnline} online</span>
            </div>
          )}
          <Link href="/create" className="btn-p" style={{
            fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.bg,
            background: c.pink, padding: '8px 16px', borderRadius: radius.md, textDecoration: 'none',
          }}>+ Create</Link>

          {/* Profile avatar / menu */}
          {profile && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowProfileMenu(!showProfileMenu)} style={{
                display: 'flex', alignItems: 'center', gap: 8, background: c.surface,
                border: `1px solid ${c.border}`, borderRadius: radius.md, padding: '5px 12px 5px 5px',
                cursor: 'pointer', transition: 'all .15s',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: radius.sm, background: `${tCol}15`,
                  border: `1.5px solid ${tCol}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontFamily: font.sans, color: tCol, fontWeight: 700,
                }}>{profile.display_name?.[0]?.toUpperCase()}</div>
                <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text2 }}>{profile.display_name}</span>
              </button>
              {showProfileMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowProfileMenu(false)} />
                  <div className="profile-menu">
                    <Link href="/profile" onClick={() => setShowProfileMenu(false)}>Profile</Link>
                    <Link href="/leaderboard" onClick={() => setShowProfileMenu(false)}>Rankings</Link>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)' }}>
          <div className="skeleton" style={{ width: 300, height: 200 }} />
        </div>
      ) : (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 20px 80px' }}>

          {/* ══ STAT STRIP ══ */}
          <div className="stat-strip" style={{
            display: 'flex', gap: 16, marginBottom: 24, alignItems: 'stretch',
          }}>
            {/* P&L Card */}
            <div style={{
              flex: 1, padding: '16px 20px', borderRadius: radius.lg,
              background: pnlPositive ? 'rgba(0,220,130,.03)' : 'rgba(255,68,102,.03)',
              border: `1px solid ${pnlPositive ? 'rgba(0,220,130,.1)' : 'rgba(255,68,102,.1)'}`,
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div>
                <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text3, fontWeight: 500, marginBottom: 4 }}>Total P&L</div>
                <div style={{ fontFamily: font.mono, fontSize: 32, fontWeight: 700, color: pnlColor, lineHeight: 1 }}>
                  {pnlPositive ? '+' : ''}{displayPnl >= 1000 || displayPnl <= -1000 ? `$${(displayPnl / 1000).toFixed(1)}K` : `$${Math.round(displayPnl)}`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'end', gap: 2, height: 32, marginLeft: 'auto' }}>
                {pastBattles.slice(0, 10).reverse().map((b, i) => {
                  const ret = b.final_balance && b.starting_balance ? (b.final_balance - b.starting_balance) / b.starting_balance : 0
                  const h = Math.max(3, Math.min(32, Math.abs(ret) * 200 + 4))
                  return <div key={i} style={{ width: 5, height: h, borderRadius: 2, background: ret >= 0 ? c.green : c.red, opacity: 0.3 + (i / 10) * 0.7 }} />
                })}
              </div>
            </div>

            {/* Quick stats */}
            <div style={{
              display: 'flex', gap: 0, border: `1px solid ${c.border}`, borderRadius: radius.lg, overflow: 'hidden',
            }}>
              {[
                { label: 'Battles', value: String(pastBattles.length), col: c.text },
                { label: 'Win Rate', value: `${wr.toFixed(0)}%`, col: wr >= 50 ? c.green : c.text3 },
                { label: 'Best', value: `${(profile?.best_return ?? 0) >= 0 ? '+' : ''}${(profile?.best_return ?? 0).toFixed(0)}%`, col: (profile?.best_return ?? 0) >= 0 ? c.green : c.red },
                { label: 'Credits', value: String(profile?.credits ?? 0), col: c.pink },
              ].map((s, i) => (
                <div key={s.label} style={{
                  padding: '12px 20px', textAlign: 'center',
                  borderRight: i < 3 ? `1px solid ${c.border}` : 'none',
                  background: c.surface,
                }}>
                  <div style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 700, color: s.col, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4, marginTop: 4, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ══ BATTLES TAB ══ */}
          {dashTab === 'battles' && (
            <>
              {/* Quick play + filter row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button onClick={handlePractice} disabled={practicing} className="btn-p" style={{
                  fontFamily: font.sans, fontSize: 15, fontWeight: 700, color: c.bg, background: c.green,
                  border: 'none', padding: '12px 28px', borderRadius: radius.md, cursor: 'pointer',
                  ...(practicing ? { opacity: 0.7 } : {}),
                }}>
                  {practicing ? 'Creating...' : 'Practice'}
                </button>
                <button onClick={handleDeploy} disabled={quickPlaying} className="btn-p" style={{
                  fontFamily: font.sans, fontSize: 15, fontWeight: 700, color: c.bg, background: c.pink,
                  border: 'none', padding: '12px 28px', borderRadius: radius.md, cursor: 'pointer',
                  animation: 'glowPulse 3s ease-in-out infinite',
                  ...(quickPlaying ? { opacity: 0.7, animation: 'none' } : {}),
                }}>
                  {quickPlaying ? 'Finding match...' : 'Quick Play'}
                </button>
                <div style={{ display: 'flex', gap: 6, flex: 1, overflow: 'auto' }}>
                  {([
                    { key: 'all', label: `All (${lobbies.length})` },
                    { key: 'live', label: `Live (${live.length})` },
                    { key: 'open', label: 'Open' },
                    { key: 'mine', label: 'My Battles' },
                  ] as { key: LobbyFilter; label: string }[]).map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)} className={`filter-pill ${filter === f.key ? 'active' : ''}`}>
                      {f.key === 'live' && live.length > 0 && <span className="live-dot" style={{ width: 5, height: 5, display: 'inline-block', marginRight: 4, verticalAlign: 'middle' }} />}
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lobby cards grid */}
              {filtered.length > 0 ? (
                <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                  {filtered.map(l => {
                    const isLive = l.status === 'active'
                    const fee = (l.config?.entry_fee as number) ?? 0
                    const prize = (l.config?.prize_pool as number) ?? (fee > 0 ? fee * 8 * 0.9 : 0)
                    const isOwner = !!(profile?.id && l.created_by === profile.id)
                    const isSelected = selectedLobby === l.id
                    const viewers = l.player_count + l.spectator_count

                    return (
                      <div key={l.id} className={`lobby-card ${isSelected ? 'selected' : ''}`} onClick={() => setSelectedLobby(isSelected ? null : l.id)}>
                        {/* Thumbnail header */}
                        <div style={{
                          height: 80, background: lobbyGradient(l.name), padding: '12px 16px',
                          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                          position: 'relative', overflow: 'hidden',
                        }}>
                          {/* Status badges */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {isLive ? (
                              <span style={{
                                display: 'flex', alignItems: 'center', gap: 4, fontFamily: font.sans, fontSize: 11,
                                fontWeight: 700, color: '#FFF', background: 'rgba(0,220,130,.9)', padding: '2px 8px',
                                borderRadius: 4,
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
                          </div>
                          {/* Prize badge */}
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

                        {/* Card body */}
                        <div style={{ padding: '12px 16px' }}>
                          <div style={{ fontFamily: font.sans, fontSize: 16, fontWeight: 600, color: '#FFF', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

                        {/* Action row (expanded) */}
                        {isSelected && (
                          <div style={{
                            display: 'flex', gap: 8, padding: '0 16px 14px',
                            animation: 'fadeIn .15s ease',
                          }}>
                            <button onClick={e => { e.stopPropagation(); router.push(`/lobby/${l.id}`) }} className="btn-p" style={{
                              flex: 1, fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.bg,
                              background: c.green, border: 'none', padding: '10px 0', borderRadius: radius.sm, cursor: 'pointer',
                            }}>Join</button>
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
                  textAlign: 'center', padding: '80px 20px',
                  border: `1px solid ${c.border}`, borderRadius: radius.lg, background: c.surface,
                }}>
                  <div style={{ fontFamily: font.sans, fontSize: 20, fontWeight: 600, color: c.text3, marginBottom: 8 }}>
                    {filter === 'mine' ? 'No battles created yet' : 'No active battles'}
                  </div>
                  <div style={{ fontFamily: font.sans, fontSize: 14, color: c.text4, marginBottom: 24 }}>
                    {filter === 'mine' ? 'Create your first battle and invite friends' : 'Be the first to host or try Quick Play'}
                  </div>
                  <Link href="/create" className="btn-p" style={{
                    fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.bg,
                    background: c.pink, padding: '12px 28px', borderRadius: radius.md, textDecoration: 'none',
                  }}>Create Battle</Link>
                </div>
              )}
            </>
          )}

          {/* ══ LEARN TAB ══ */}
          {dashTab === 'learn' && (
            <div>
              <div style={{ fontFamily: font.sans, fontSize: 20, fontWeight: 600, color: c.text, marginBottom: 4 }}>
                Learn to Trade
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 14, color: c.text3, marginBottom: 24 }}>
                Master the strategies that win battles. From basics to advanced elimination meta.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {LEARN_CARDS.map(card => (
                  <Link href="/learn" key={card.title} className="learn-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: card.col,
                        background: `${card.col}12`, padding: '2px 8px', borderRadius: 4,
                      }}>{card.tag}</span>
                    </div>
                    <div style={{ fontFamily: font.sans, fontSize: 16, fontWeight: 600, color: c.text, marginBottom: 6 }}>
                      {card.title}
                    </div>
                    <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, lineHeight: 1.4 }}>
                      {card.desc}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ══ HISTORY TAB ══ */}
          {dashTab === 'history' && (
            <div>
              <div style={{ fontFamily: font.sans, fontSize: 20, fontWeight: 600, color: c.text, marginBottom: 20 }}>
                Match History
              </div>
              {pastBattles.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {pastBattles.map(b => {
                    const startBal = b.starting_balance ?? 10000
                    const returnPct = b.final_balance != null ? ((b.final_balance - startBal) / startBal * 100) : null
                    const pnlDollars = b.final_balance != null ? b.final_balance - startBal : null
                    const won = b.final_rank === 1
                    const positive = returnPct != null && returnPct >= 0
                    const daysAgo = Math.floor((Date.now() - new Date(b.created_at).getTime()) / 86400000)
                    const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`
                    return (
                      <Link key={b.id} href={`/lobby/${b.lobby_id}`} className="row-h" style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                        borderRadius: radius.sm, textDecoration: 'none', color: 'inherit',
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: won ? 'rgba(0,220,130,.1)' : 'rgba(255,255,255,.02)',
                          border: `1.5px solid ${won ? 'rgba(0,220,130,.3)' : c.border}`,
                          flexShrink: 0,
                        }}>
                          {won ? <span style={{ fontSize: 18 }}>👑</span> : (
                            <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 700, color: c.text3 }}>{b.final_rank ?? '—'}</span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 500, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {b.lobby_name ?? 'Unknown'}
                          </div>
                          <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text4 }}>{timeLabel}</div>
                        </div>
                        {pnlDollars != null && (
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 700, color: positive ? c.green : c.red }}>
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
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', border: `1px solid ${c.border}`, borderRadius: radius.lg }}>
                  <div style={{ fontFamily: font.sans, fontSize: 16, color: c.text3, marginBottom: 8 }}>No matches yet</div>
                  <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text4 }}>Join a battle to start building your record</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
