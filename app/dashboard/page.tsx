'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { font, c, globalCSS, radius } from '@/app/design'

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
  created_at?: string
}
interface PastBattle {
  id: string; lobby_id: string; lobby_name: string | null
  final_rank: number | null; final_balance: number | null; starting_balance: number | null
  created_at: string
}

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

function lobbyGrad(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  const hue = Math.abs(h) % 360
  return `linear-gradient(135deg, hsl(${hue},55%,12%) 0%, hsl(${(hue + 35) % 360},40%,6%) 100%)`
}

function btrTier(score: number) {
  if (score >= 1800) return { name: 'LEGEND', color: '#FFD700', emoji: '*', next: 2000, floor: 1800 }
  if (score >= 1500) return { name: 'DIAMOND', color: '#B9F2FF', emoji: '<>', next: 1800, floor: 1500 }
  if (score >= 1200) return { name: 'PLATINUM', color: '#E5E4E2', emoji: '||', next: 1500, floor: 1200 }
  if (score >= 900) return { name: 'GOLD', color: '#FFD700', emoji: '+', next: 1200, floor: 900 }
  if (score >= 600) return { name: 'SILVER', color: '#C0C0C0', emoji: '-', next: 900, floor: 600 }
  if (score >= 300) return { name: 'BRONZE', color: '#CD7F32', emoji: '.', next: 600, floor: 300 }
  return { name: 'UNRANKED', color: '#555', emoji: '?', next: 300, floor: 0 }
}

function timeAgo(date: string): string {
  const ms = Date.now() - new Date(date).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

// Fallback events shown only while real data loads
const FALLBACK_EVENTS = ['Loading activity...']

export default function DashboardPage() {
  const router = useRouter()
  const { authenticated, user, ready, logout } = usePrivy()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [pastBattles, setPastBattles] = useState<PastBattle[]>([])
  const [selectedLobby, setSelectedLobby] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [playLoading, setPlayLoading] = useState<string | null>(null)
  const [liveEvents, setLiveEvents] = useState<string[]>(FALLBACK_EVENTS)
  const [liveEventIdx, setLiveEventIdx] = useState(0)
  const [displayPnl, setDisplayPnl] = useState(0)
  const targetPnl = useRef(0)
  const animFrame = useRef<number>(0)

  const streak = useMemo(() => calcStreak(pastBattles), [pastBattles])
  const totalPnl = useMemo(() => pastBattles.reduce((sum, b) => {
    if (b.final_balance != null && b.starting_balance != null) return sum + (b.final_balance - b.starting_balance)
    return sum
  }, 0), [pastBattles])

  // Animated P&L counter
  useEffect(() => {
    targetPnl.current = totalPnl
    const spring = () => {
      setDisplayPnl(prev => {
        const diff = targetPnl.current - prev
        if (Math.abs(diff) < 0.5) return targetPnl.current
        return prev + diff * 0.1
      })
      animFrame.current = requestAnimationFrame(spring)
    }
    animFrame.current = requestAnimationFrame(spring)
    return () => { if (animFrame.current) cancelAnimationFrame(animFrame.current) }
  }, [totalPnl])

  // Fetch real activity + rotate ticker
  useEffect(() => {
    fetch('/api/activity').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.events?.length > 0) setLiveEvents(d.events)
    }).catch(() => {})
    const t = setInterval(() => setLiveEventIdx(i => (i + 1) % Math.max(liveEvents.length, 1)), 3500)
    return () => clearInterval(t)
  }, [liveEvents.length])

  // Auth check
  useEffect(() => {
    if (!ready) return
    if (!authenticated || !user) { router.push('/'); return }
    setAuthReady(true)
  }, [ready, authenticated, user, router])

  // Data loading — parallel fetches
  useEffect(() => {
    if (!authReady || !user) return
    let cancelled = false

    const load = async () => {
      setProfileLoading(true)

      // Fetch profile + lobbies in parallel
      let pid = localStorage.getItem('bt_profile_id')
      if (!pid) {
        try {
          const p = await getOrCreateProfile(user)
          if (p) { pid = p.id; localStorage.setItem('bt_profile_id', p.id) }
        } catch {}
      }

      const [profileRes, lobbiesRes] = await Promise.allSettled([
        pid ? fetch(`/api/profile/${pid}`) : Promise.resolve(null),
        fetch('/api/lobbies/active'),
      ])

      if (!cancelled) {
        if (profileRes.status === 'fulfilled' && profileRes.value && (profileRes.value as Response).ok) {
          const d = await (profileRes.value as Response).json()
          if (d?.profile) setProfile(d.profile)
          if (d?.matches) setPastBattles(d.matches)
        }
        if (lobbiesRes.status === 'fulfilled' && (lobbiesRes.value as Response).ok) {
          const d = await (lobbiesRes.value as Response).json()
          setLobbies(d.lobbies ?? [])
        }
        setProfileLoading(false)
      }
    }
    load()

    // Lighter polling — just lobbies
    const i = setInterval(() => {
      fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] }).then(d => setLobbies(d.lobbies ?? [])).catch(() => {})
    }, 10000)
    return () => { cancelled = true; clearInterval(i) }
  }, [authReady, user])

  // ─── Play Actions ─────────────────────────────────────────
  const play = useCallback(async (mode: string) => {
    setPlayLoading(mode)
    const pid = localStorage.getItem('bt_profile_id')
    const name = profile?.display_name || 'Trader'
    try {
      if (mode === 'practice') {
        const r = await fetch('/api/lobbies/practice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: pid, display_name: name, bot_count: 3 }),
        })
        if (r.ok) { const d = await r.json(); router.push(`/lobby/${d.lobby_id}/trade`) }
      } else if (mode === 'quick') {
        const r = await fetch('/api/lobbies/quickplay', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: pid }),
        })
        if (r.ok) { const d = await r.json(); router.push(`/lobby/${d.lobby_id}`) }
      } else if (mode === 'duel') {
        const r = await fetch('/api/duels/queue', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: pid }),
        })
        if (r.ok) { const d = await r.json(); router.push(`/lobby/${d.lobby_id || d.duel_id || d.id}`) }
      } else if (mode === 'create') {
        router.push('/create')
      }
    } catch {} finally { setPlayLoading(null) }
  }, [router, profile])

  const deleteLobby = useCallback(async (lobbyId: string) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/lobby/${lobbyId}/manage`, {
        method: 'DELETE', headers: { Authorization: localStorage.getItem('bt_profile_id') || '' },
      })
      if (r.ok) { setLobbies(prev => prev.filter(l => l.id !== lobbyId)); setSelectedLobby(null) }
    } catch {} finally { setSaving(false) }
  }, [])

  // ─── Derived ──────────────────────────────────────────────
  const live = lobbies.filter(b => b.status === 'active')
  const open = lobbies.filter(b => b.status === 'waiting')
  const mine = lobbies.filter(b => profile?.id && b.created_by === profile.id)
  const totalOnline = lobbies.reduce((a, b) => a + b.player_count + b.spectator_count, 0)
  const btr = profile?.tr_score ?? 0
  const tier = btrTier(btr)
  const btrProg = tier.next > tier.floor ? ((btr - tier.floor) / (tier.next - tier.floor)) * 100 : 100
  const pnlPos = displayPnl >= 0

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: '#FFF', overflow: 'hidden' }}>
      <style>{globalCSS}{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes slideRight{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
        @keyframes pulse2{0%,100%{opacity:.6}50%{opacity:1}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(245,160,208,.06)}50%{box-shadow:0 0 40px rgba(245,160,208,.14)}}
        @keyframes tickerSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .fu{animation:fadeUp .25s ease both}
        .fu1{animation-delay:.03s}.fu2{animation-delay:.06s}.fu3{animation-delay:.09s}.fu4{animation-delay:.12s}
        .play-btn{
          position:relative;border:1px solid ${c.border};border-radius:${radius.lg}px;
          padding:16px 20px;cursor:pointer;transition:all .18s cubic-bezier(.25,.1,.25,1);
          background:${c.surface};overflow:hidden;text-align:left;width:100%;
        }
        .play-btn:hover{border-color:${c.borderHover};transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.4)}
        .play-btn:active{transform:scale(.98)}
        .play-btn.loading{opacity:.6;pointer-events:none}
        .lobby-row{
          display:flex;align-items:center;gap:12px;padding:12px 16px;
          cursor:pointer;transition:background .1s;border-radius:${radius.sm}px;
        }
        .lobby-row:hover{background:${c.hover}}
        .lobby-row.selected{background:${c.elevated};border:1px solid ${c.pink}30}
        .pmenu{
          position:absolute;top:100%;right:0;margin-top:4px;background:${c.elevated};
          border:1px solid ${c.border};border-radius:${radius.md}px;padding:4px;min-width:180px;
          z-index:200;animation:fadeUp .12s ease;box-shadow:0 12px 40px rgba(0,0,0,.6);
        }
        .pmenu button,.pmenu a{
          display:block;width:100%;padding:10px 14px;font-family:${font.sans};font-size:13px;
          border:none;background:transparent;color:${c.text2};cursor:pointer;
          border-radius:${radius.sm}px;text-decoration:none;text-align:left;transition:all .1s;
        }
        .pmenu button:hover,.pmenu a:hover{background:${c.hover};color:${c.text}}
        @media(max-width:768px){
          .desk-grid{grid-template-columns:1fr!important}
          .play-grid{grid-template-columns:1fr 1fr!important}
          .hero-split{flex-direction:column!important}
        }
      `}</style>

      {/* ══ NAV ══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, height: 52, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 16px',
        background: 'rgba(10,10,10,.94)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="BT" style={{ height: 28, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </Link>

          {/* Live ticker */}
          <div style={{
            fontFamily: font.sans, fontSize: 12, color: c.text3,
            maxWidth: 300, overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
            <span key={liveEventIdx} style={{ animation: 'tickerSlide .3s ease', display: 'inline-block' }}>
              <span style={{ color: c.green, marginRight: 6 }}>LIVE</span>
              {liveEvents[liveEventIdx % liveEvents.length]}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {totalOnline > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div className="live-dot" style={{ width: 5, height: 5 }} />
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.green }}>{totalOnline}</span>
            </div>
          )}
          <div style={{
            fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: c.pink,
            padding: '4px 10px', borderRadius: 6, background: c.pinkDim,
          }}>{profile?.credits ?? 0} CR</div>

          {profile && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowProfileMenu(!showProfileMenu)} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: c.surface,
                border: `1px solid ${c.border}`, borderRadius: radius.sm, padding: '3px 10px 3px 3px',
                cursor: 'pointer',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${tier.color}18`, border: `1.5px solid ${tier.color}50`,
                  fontFamily: font.mono, fontSize: 12, color: tier.color, fontWeight: 700,
                }}>{profile.display_name?.[0]?.toUpperCase()}</div>
                <span style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.text2 }}>{profile.display_name}</span>
              </button>
              {showProfileMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowProfileMenu(false)} />
                  <div className="pmenu">
                    <Link href="/profile" onClick={() => setShowProfileMenu(false)}>Profile</Link>
                    <Link href="/leaderboard" onClick={() => setShowProfileMenu(false)}>Rankings</Link>
                    <Link href="/markets" onClick={() => setShowProfileMenu(false)}>Predictions</Link>
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

      {/* ══ BODY ══ */}
      {!authReady ? (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
          <div className="skeleton" style={{ height: 200, borderRadius: radius.lg, marginBottom: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="skeleton" style={{ height: 80, borderRadius: radius.md }} />
            <div className="skeleton" style={{ height: 80, borderRadius: radius.md }} />
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 80px' }}>

          {/* ══ HERO — BIG PLAY BUTTON + Identity ══ */}
          <div className="hero-split fu" style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {/* Play Now — THE CTA */}
            <button
              className={`play-btn ${playLoading === 'quick' ? 'loading' : ''}`}
              onClick={() => play('quick')}
              style={{
                flex: 1, padding: '24px', border: `1px solid ${c.pinkBorder}`,
                background: `linear-gradient(135deg, rgba(245,160,208,.04) 0%, ${c.surface} 100%)`,
                animation: 'glow 4s ease infinite',
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.pink}, transparent 80%)` }} />
              <div style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 600, color: c.pink, letterSpacing: '.08em', marginBottom: 6 }}>
                {playLoading === 'quick' ? 'FINDING MATCH...' : 'READY?'}
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 28, fontWeight: 800, color: c.text, lineHeight: 1, marginBottom: 4 }}>
                Play Now
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3 }}>
                Jump into a live battle instantly
              </div>
            </button>

            {/* Your card */}
            <div className="fu1" style={{
              width: 260, padding: '16px', borderRadius: radius.lg,
              background: c.surface, border: `1px solid ${c.border}`, flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: radius.sm,
                  background: `${tier.color}18`, border: `2px solid ${tier.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: font.mono, fontSize: 20, color: tier.color, fontWeight: 700,
                }}>{profile?.display_name?.[0]?.toUpperCase() ?? '?'}</div>
                <div>
                  <div style={{ fontFamily: font.sans, fontSize: 15, fontWeight: 700, color: c.text }}>{profile?.display_name ?? '...'}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: tier.color, fontWeight: 600 }}>{tier.name}</div>
                </div>
                {streak > 0 && (
                  <div style={{
                    marginLeft: 'auto', fontFamily: font.mono, fontSize: 12, fontWeight: 700,
                    color: c.gold, padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(255,215,0,.08)', border: '1px solid rgba(255,215,0,.15)',
                  }}>{streak}W</div>
                )}
              </div>

              {/* BTR bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: tier.color }}>{btr}</span>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>{tier.next} next</span>
                </div>
                <div style={{ height: 3, background: c.hover, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${btrProg}%`, height: '100%', borderRadius: 2, background: tier.color, transition: 'width .4s ease' }} />
                </div>
              </div>

              {/* Mini stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: pnlPos ? c.green : c.red }}>
                    {pnlPos ? '+' : ''}{displayPnl >= 1000 || displayPnl <= -1000 ? `${(displayPnl/1000).toFixed(1)}K` : Math.round(displayPnl)}
                  </div>
                  <div style={{ fontFamily: font.sans, fontSize: 9, color: c.text4, letterSpacing: '.04em' }}>P&L</div>
                </div>
                <div>
                  <div style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: (profile?.win_rate ?? 0) >= 0.5 ? c.green : c.text3 }}>
                    {((profile?.win_rate ?? 0) * 100).toFixed(0)}%
                  </div>
                  <div style={{ fontFamily: font.sans, fontSize: 9, color: c.text4, letterSpacing: '.04em' }}>WIN</div>
                </div>
                <div>
                  <div style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: c.text }}>{pastBattles.length}</div>
                  <div style={{ fontFamily: font.sans, fontSize: 9, color: c.text4, letterSpacing: '.04em' }}>PLAYED</div>
                </div>
              </div>
            </div>
          </div>

          {/* ══ PLAY MODES — 3 secondary modes ══ */}
          <div className="play-grid fu fu2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
            {[
              { id: 'practice', label: 'Practice', sub: 'vs AI bots', accent: c.green },
              { id: 'duel', label: '1v1 Duel', sub: 'head to head', accent: '#FF6B35' },
              { id: 'create', label: 'Host Battle', sub: 'invite friends', accent: c.blue },
            ].map(m => (
              <button
                key={m.id}
                className={`play-btn ${playLoading === m.id ? 'loading' : ''}`}
                onClick={() => play(m.id)}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${m.accent}80, transparent)` }} />
                <div style={{ fontFamily: font.sans, fontSize: 15, fontWeight: 700, color: c.text }}>{m.label}</div>
                <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text4 }}>
                  {playLoading === m.id ? 'Loading...' : m.sub}
                </div>
              </button>
            ))}
          </div>

          {/* ══ LIVE BATTLES ══ */}
          {live.length > 0 && (
            <div className="fu fu3" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div className="live-dot" style={{ width: 5, height: 5 }} />
                <span style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.green, letterSpacing: '.04em' }}>LIVE NOW</span>
              </div>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
                {live.map(l => {
                  const viewers = l.player_count + l.spectator_count
                  return (
                    <div key={l.id} className="lobby-row" onClick={() => router.push(`/lobby/${l.id}`)}>
                      <div style={{
                        width: 40, height: 40, borderRadius: radius.sm, background: lobbyGrad(l.name),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: font.mono, fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,.6)',
                        flexShrink: 0,
                      }}>{l.current_round ? `R${l.current_round.number}` : '...'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                        <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>
                          {l.player_count} trading{viewers > l.player_count ? ` / ${viewers - l.player_count} watching` : ''}
                        </div>
                      </div>
                      {l.top_trader && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: l.top_trader.return_pct >= 0 ? c.green : c.red }}>
                            {l.top_trader.return_pct >= 0 ? '+' : ''}{l.top_trader.return_pct.toFixed(1)}%
                          </div>
                          <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4 }}>{l.top_trader.name}</div>
                        </div>
                      )}
                      <div style={{
                        fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.green,
                        padding: '6px 14px', borderRadius: 6, background: `${c.green}12`,
                        border: `1px solid ${c.green}25`, flexShrink: 0,
                      }}>Watch</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══ OPEN BATTLES ══ */}
          {open.length > 0 && (
            <div className="fu fu3" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.text3, letterSpacing: '.04em' }}>OPEN LOBBIES</span>
                <Link href="/create" style={{ fontFamily: font.sans, fontSize: 11, color: c.pink, textDecoration: 'none' }}>+ New</Link>
              </div>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
                {open.slice(0, 8).map(l => {
                  const fee = (l.config?.entry_fee as number) ?? 0
                  const prize = (l.config?.prize_pool as number) ?? (fee > 0 ? fee * 8 * 0.9 : 0)
                  const isOwner = !!(profile?.id && l.created_by === profile.id)
                  const isSel = selectedLobby === l.id

                  return (
                    <div key={l.id}>
                      <div className={`lobby-row ${isSel ? 'selected' : ''}`} onClick={() => setSelectedLobby(isSel ? null : l.id)}>
                        <div style={{
                          width: 40, height: 40, borderRadius: radius.sm, background: lobbyGrad(l.name),
                          flexShrink: 0,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                            {isOwner && <span style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 700, color: c.pink, background: c.pinkDim, padding: '1px 5px', borderRadius: 3 }}>HOST</span>}
                          </div>
                          <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>
                            {l.player_count} player{l.player_count !== 1 ? 's' : ''} / {l.format}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: prize > 0 ? c.green : c.text3 }}>
                            {prize > 0 ? `$${prize}` : 'FREE'}
                          </div>
                          {fee > 0 && <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4 }}>{fee} CR entry</div>}
                        </div>
                      </div>
                      {isSel && (
                        <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px', animation: 'fadeUp .12s ease' }}>
                          <button onClick={() => router.push(`/lobby/${l.id}`)} className="btn-p" style={{
                            flex: 1, fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.bg,
                            background: c.green, border: 'none', padding: '9px 0', borderRadius: 6, cursor: 'pointer',
                          }}>Join</button>
                          {isOwner && (
                            <Link href={`/lobby/${l.id}/admin`} style={{
                              fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.pink,
                              background: c.pinkDim, border: `1px solid ${c.pinkBorder}`,
                              padding: '9px 14px', borderRadius: 6, textDecoration: 'none',
                            }}>Admin</Link>
                          )}
                          {isOwner && l.status === 'waiting' && (
                            <button onClick={() => { if (confirm(`Delete "${l.name}"?`)) deleteLobby(l.id) }} disabled={saving} style={{
                              fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.red,
                              background: c.redDim, border: `1px solid rgba(255,68,102,.15)`,
                              padding: '9px 14px', borderRadius: 6, cursor: 'pointer',
                            }}>Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══ EMPTY STATE ══ */}
          {lobbies.length === 0 && !profileLoading && (
            <div className="fu fu3" style={{
              textAlign: 'center', padding: '48px 20px',
              border: `1px solid ${c.border}`, borderRadius: radius.lg, background: c.surface,
            }}>
              <div style={{ fontFamily: font.sans, fontSize: 18, fontWeight: 700, color: c.text, marginBottom: 6 }}>
                No battles happening right now
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 14, color: c.text3, marginBottom: 20 }}>
                Start one. Be the first.
              </div>
              <button onClick={() => play('practice')} className="btn-p" style={{
                fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.bg,
                background: c.green, padding: '12px 32px', borderRadius: radius.md,
                border: 'none', cursor: 'pointer', marginRight: 10,
              }}>Practice vs Bots</button>
              <Link href="/create" className="btn-s" style={{
                fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text2,
                background: c.surface, padding: '12px 24px', borderRadius: radius.md,
                border: `1px solid ${c.border}`, textDecoration: 'none',
              }}>Host a Battle</Link>
            </div>
          )}

          {/* ══ MATCH HISTORY ══ */}
          {pastBattles.length > 0 && (
            <div className="fu fu4">
              <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.text3, letterSpacing: '.04em', marginBottom: 10 }}>
                RECENT
              </div>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
                {pastBattles.slice(0, 5).map(b => {
                  const startBal = b.starting_balance ?? 10000
                  const ret = b.final_balance != null ? ((b.final_balance - startBal) / startBal * 100) : null
                  const pnl = b.final_balance != null ? b.final_balance - startBal : null
                  const won = b.final_rank === 1
                  const pos = ret != null && ret >= 0
                  return (
                    <Link key={b.id} href={`/lobby/${b.lobby_id}`} className="lobby-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: won ? `${c.green}15` : c.hover,
                        border: `1.5px solid ${won ? `${c.green}40` : c.border}`, flexShrink: 0,
                      }}>
                        <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: won ? c.green : c.text3 }}>
                          {won ? 'W' : b.final_rank ?? '-'}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 500, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.lobby_name ?? 'Battle'}
                        </div>
                        <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4 }}>{timeAgo(b.created_at)}</div>
                      </div>
                      {pnl != null && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: pos ? c.green : c.red }}>
                            {pos ? '+' : ''}{Math.abs(pnl) >= 1000 ? `$${(pnl/1000).toFixed(1)}K` : `$${pnl.toFixed(0)}`}
                          </span>
                          <span style={{ fontFamily: font.sans, fontSize: 11, color: c.text4, marginLeft: 6 }}>
                            {pos ? '+' : ''}{ret?.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
              {pastBattles.length > 5 && (
                <Link href="/profile" style={{ display: 'block', textAlign: 'center', padding: '10px', fontFamily: font.sans, fontSize: 12, color: c.pink, textDecoration: 'none' }}>
                  All {pastBattles.length} matches
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
