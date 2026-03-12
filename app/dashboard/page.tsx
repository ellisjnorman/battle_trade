'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { font, c, globalCSS, radius } from '@/app/design'
import StreakBadge from '@/components/streak-badge'

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

function btrTier(score: number) {
  if (score >= 1800) return { name: 'LEGEND', color: '#FFD700', next: 2000, floor: 1800 }
  if (score >= 1500) return { name: 'DIAMOND', color: '#B9F2FF', next: 1800, floor: 1500 }
  if (score >= 1200) return { name: 'PLATINUM', color: '#E5E4E2', next: 1500, floor: 1200 }
  if (score >= 900) return { name: 'GOLD', color: '#FFD700', next: 1200, floor: 900 }
  if (score >= 600) return { name: 'SILVER', color: '#C0C0C0', next: 900, floor: 600 }
  if (score >= 300) return { name: 'BRONZE', color: '#CD7F32', next: 600, floor: 300 }
  return { name: 'UNRANKED', color: '#555', next: 300, floor: 0 }
}

function timeAgo(date: string): string {
  const ms = Date.now() - new Date(date).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function lobbyGrad(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  const hue = Math.abs(h) % 360
  return `linear-gradient(135deg, hsl(${hue},55%,12%) 0%, hsl(${(hue + 35) % 360},40%,6%) 100%)`
}

// ─── The heist scoring — "mission complete" stats ───────────
function getMissionGrade(winRate: number, totalPlayed: number): { grade: string; color: string; label: string } {
  if (totalPlayed < 3) return { grade: '?', color: c.text4, label: 'ROOKIE' }
  if (winRate >= 0.6) return { grade: 'S', color: '#FFD700', label: 'MASTERMIND' }
  if (winRate >= 0.45) return { grade: 'A', color: c.green, label: 'SHARP' }
  if (winRate >= 0.3) return { grade: 'B', color: c.blue, label: 'SOLID' }
  if (winRate >= 0.15) return { grade: 'C', color: '#FF8C00', label: 'LEARNING' }
  return { grade: 'D', color: c.red, label: 'RECKLESS' }
}

const FALLBACK_EVENTS = ['Loading activity...']

export default function DashboardPage() {
  const router = useRouter()
  const { authenticated, user, ready, logout } = usePrivy()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [pastBattles, setPastBattles] = useState<PastBattle[]>([])
  const [playLoading, setPlayLoading] = useState<string | null>(null)
  const [liveEvents, setLiveEvents] = useState<string[]>(FALLBACK_EVENTS)
  const [liveEventIdx, setLiveEventIdx] = useState(0)
  const [socialProof, setSocialProof] = useState<{ activePlayers: number; liveBattles: number; battlesCompleted: number }>({ activePlayers: 0, liveBattles: 0, battlesCompleted: 0 })
  const [displayPnl, setDisplayPnl] = useState(0)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedLobby, setSelectedLobby] = useState<string | null>(null)
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
      let shouldContinue = true
      setDisplayPnl(prev => {
        const diff = targetPnl.current - prev
        if (Math.abs(diff) < 0.5) { shouldContinue = false; return targetPnl.current }
        return prev + diff * 0.1
      })
      if (shouldContinue) animFrame.current = requestAnimationFrame(spring)
    }
    animFrame.current = requestAnimationFrame(spring)
    return () => { if (animFrame.current) cancelAnimationFrame(animFrame.current) }
  }, [totalPnl])

  // Fetch real activity + rotate ticker
  useEffect(() => {
    fetch('/api/activity').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.events?.length > 0) setLiveEvents(d.events)
      if (d) setSocialProof({ activePlayers: d.activePlayers ?? 0, liveBattles: d.liveBattles ?? 0, battlesCompleted: d.battlesCompleted ?? 0 })
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

  // Data loading
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
        if (r.ok) { const d = await r.json(); router.push(`/lobby/${d.lobby_id}/trade?code=${d.code}`) }
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
  const btr = profile?.tr_score ?? 0
  const tier = btrTier(btr)
  const btrProg = tier.next > tier.floor ? ((btr - tier.floor) / (tier.next - tier.floor)) * 100 : 100
  const pnlPos = displayPnl >= 0
  const grade = getMissionGrade(profile?.win_rate ?? 0, pastBattles.length)
  const totalOnline = lobbies.reduce((a, b) => a + b.player_count + b.spectator_count, 0)

  // Last battle result for "last mission" display
  const lastBattle = pastBattles[0] ?? null
  const lastReturn = lastBattle && lastBattle.final_balance != null && lastBattle.starting_balance != null
    ? ((lastBattle.final_balance - lastBattle.starting_balance) / lastBattle.starting_balance * 100)
    : null

  return (
    <div style={{ minHeight: '100dvh', background: c.bg, color: '#FFF' }}>
      <style>{globalCSS}{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes slideRight{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
        @keyframes pulse2{0%,100%{opacity:.6}50%{opacity:1}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(245,160,208,.06)}50%{box-shadow:0 0 40px rgba(245,160,208,.14)}}
        @keyframes tickerSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes greenPulse{0%,100%{box-shadow:0 0 0 0 rgba(0,220,130,.4)}70%{box-shadow:0 0 0 4px rgba(0,220,130,0)}}
        @keyframes gradientShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
        .fu{animation:fadeUp .25s ease both}
        .fu1{animation-delay:.03s}.fu2{animation-delay:.06s}.fu3{animation-delay:.09s}.fu4{animation-delay:.12s}.fu5{animation-delay:.15s}
        .mode-btn{
          position:relative;border:1px solid ${c.border};border-radius:${radius.lg}px;
          padding:20px;cursor:pointer;transition:all .18s cubic-bezier(.25,.1,.25,1);
          background:${c.surface};overflow:hidden;text-align:left;width:100%;
        }
        .mode-btn:hover{border-color:${c.borderHover};transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.4)}
        .mode-btn:active{transform:scale(.98)}
        .mode-btn.loading{opacity:.6;pointer-events:none}
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
          .mode-grid{grid-template-columns:1fr 1fr!important}
          .hero-card{flex-direction:column!important}
        }
      `}</style>

      {/* ══ TOP NAV — Minimal, TikTok-style ══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, height: 48, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 16px',
        background: 'rgba(10,10,10,.94)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="BT" style={{ height: 24, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </Link>

          {/* Live ticker — sliding text */}
          <div style={{
            fontFamily: font.sans, fontSize: 11, color: c.text3,
            maxWidth: 260, overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
            <span key={liveEventIdx} style={{ animation: 'tickerSlide .3s ease', display: 'inline-block' }}>
              <span style={{ color: c.green, marginRight: 6, fontWeight: 600, fontSize: 10, letterSpacing: '.06em' }}>LIVE</span>
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
            fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.pink,
            padding: '3px 8px', borderRadius: 6, background: c.pinkDim,
          }}>{profile?.credits ?? 0} CR</div>

          {profile && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowProfileMenu(!showProfileMenu)} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: c.surface,
                border: `1px solid ${c.border}`, borderRadius: radius.sm, padding: '3px 10px 3px 3px',
                cursor: 'pointer',
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${tier.color}18`, border: `1.5px solid ${tier.color}50`,
                  fontFamily: font.mono, fontSize: 11, color: tier.color, fontWeight: 700,
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
          <div className="skeleton" style={{ height: 180, borderRadius: radius.lg, marginBottom: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="skeleton" style={{ height: 100, borderRadius: radius.md }} />
            <div className="skeleton" style={{ height: 100, borderRadius: radius.md }} />
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 16px 100px' }}>

          {/* ═══════════════════════════════════════════════════════
              SECTION 1: THE BIG PLAY — One button. One action.
              Like Duolingo's daily lesson CTA. One tap and you're in.
              ═══════════════════════════════════════════════════════ */}
          <button
            className={`mode-btn fu ${playLoading === 'quick' ? 'loading' : ''}`}
            onClick={() => play('quick')}
            style={{
              padding: '28px 24px', marginBottom: 12,
              border: `1px solid ${c.pinkBorder}`,
              background: `linear-gradient(135deg, rgba(245,160,208,.04) 0%, ${c.surface} 60%, rgba(0,220,130,.02) 100%)`,
              animation: 'glow 4s ease infinite',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.pink}, transparent 80%)` }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 700, color: c.pink, letterSpacing: '.1em', marginBottom: 6 }}>
                  {playLoading === 'quick' ? 'FINDING MATCH...' : socialProof.liveBattles > 0 ? `${socialProof.liveBattles} BATTLES LIVE` : 'READY?'}
                </div>
                <div style={{ fontFamily: font.display, fontSize: 36, color: c.text, lineHeight: 1, letterSpacing: '.02em' }}>
                  PLAY NOW
                </div>
                <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, marginTop: 4 }}>
                  Drop into a live battle
                </div>
              </div>
              <div style={{
                width: 56, height: 56, borderRadius: radius.md,
                background: c.pinkDim, border: `1px solid ${c.pinkBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: font.display, fontSize: 28, color: c.pink,
              }}>
                GO
              </div>
            </div>
          </button>

          {/* ═══════════════════════════════════════════════════════
              SECTION 2: SECONDARY MODES — Practice / 1v1 / Host
              Three compact cards, heist-style "mission select"
              ═══════════════════════════════════════════════════════ */}
          <div className="mode-grid fu fu1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
            {[
              { id: 'practice', label: 'PRACTICE', sub: 'vs bots', accent: c.green, icon: 'AI' },
              { id: 'duel', label: '1v1', sub: 'head to head', accent: '#FF6B35', icon: 'VS' },
              { id: 'create', label: 'HOST', sub: 'invite crew', accent: c.blue, icon: '+' },
            ].map(m => (
              <button
                key={m.id}
                className={`mode-btn ${playLoading === m.id ? 'loading' : ''}`}
                onClick={() => play(m.id)}
                style={{ padding: '14px 12px', textAlign: 'center' }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${m.accent}80, transparent)` }} />
                <div style={{
                  fontFamily: font.display, fontSize: 20, color: m.accent, lineHeight: 1,
                  marginBottom: 4, letterSpacing: '.04em',
                }}>{m.icon}</div>
                <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 700, color: c.text }}>{m.label}</div>
                <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4 }}>
                  {playLoading === m.id ? '...' : m.sub}
                </div>
              </button>
            ))}
          </div>

          {/* ═══════════════════════════════════════════════════════
              SECTION 3: YOUR STATS — Heist "Agent Profile"
              Mission grade + BTR + streak + last mission result
              ═══════════════════════════════════════════════════════ */}
          <div className="fu fu2" style={{
            background: c.surface, border: `1px solid ${c.border}`, borderRadius: radius.lg,
            padding: '16px', marginBottom: 16,
          }}>
            {/* Top row: identity + grade */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: radius.sm,
                  background: `${tier.color}18`, border: `2px solid ${tier.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: font.mono, fontSize: 18, color: tier.color, fontWeight: 700,
                }}>{profile?.display_name?.[0]?.toUpperCase() ?? '?'}</div>
                <div>
                  <div style={{ fontFamily: font.sans, fontSize: 15, fontWeight: 700, color: c.text }}>{profile?.display_name ?? '...'}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 10, color: tier.color, fontWeight: 600, letterSpacing: '.04em' }}>{tier.name}</div>
                </div>
              </div>

              {/* Mission Grade Badge */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: radius.md,
                background: `${grade.color}10`, border: `1px solid ${grade.color}25`,
              }}>
                <span style={{ fontFamily: font.display, fontSize: 28, color: grade.color, lineHeight: 1 }}>{grade.grade}</span>
                <div>
                  <div style={{ fontFamily: font.sans, fontSize: 9, fontWeight: 700, color: grade.color, letterSpacing: '.06em' }}>{grade.label}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>
                    {((profile?.win_rate ?? 0) * 100).toFixed(0)}% win
                  </div>
                </div>
              </div>
            </div>

            {/* BTR Score bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: tier.color }}>{btr}</span>
                  <span style={{ fontFamily: font.sans, fontSize: 10, color: c.text4, fontWeight: 600, letterSpacing: '.06em' }}>BTR</span>
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>{tier.next} next</span>
              </div>
              <div style={{ height: 4, background: c.hover, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${btrProg}%`, height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${tier.color}, ${tier.color}88)`, transition: 'width .4s ease' }} />
              </div>
            </div>

            {/* Stats row — 4 compact stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1, background: c.border, borderRadius: radius.sm, overflow: 'hidden' }}>
              {[
                { value: pnlPos ? `+${displayPnl >= 1000 ? `${(displayPnl/1000).toFixed(1)}K` : Math.round(displayPnl)}` : `${displayPnl <= -1000 ? `${(displayPnl/1000).toFixed(1)}K` : Math.round(displayPnl)}`, label: 'P&L', color: pnlPos ? c.green : c.red },
                { value: `${pastBattles.length}`, label: 'BATTLES', color: c.text },
                { value: `${profile?.total_wins ?? 0}`, label: 'WINS', color: c.text },
                { value: streak > 0 ? `${streak}W` : '-', label: 'STREAK', color: streak >= 3 ? c.gold : streak > 0 ? '#FF8C00' : c.text4 },
              ].map(s => (
                <div key={s.label} style={{ background: c.surface, padding: '10px 0', textAlign: 'center' }}>
                  <div style={{ fontFamily: font.mono, fontSize: 15, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontFamily: font.sans, fontSize: 8, fontWeight: 600, color: c.text4, letterSpacing: '.08em', marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Streak badge */}
            {streak >= 2 && (
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
                <StreakBadge streak={streak} />
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════
              SECTION 4: LAST MISSION — What happened last time
              Shows your most recent battle result prominently
              ═══════════════════════════════════════════════════════ */}
          {lastBattle && lastReturn !== null && (
            <Link href={`/lobby/${lastBattle.lobby_id}`} className="fu fu3" style={{
              display: 'block', textDecoration: 'none', color: 'inherit',
              background: c.surface, border: `1px solid ${c.border}`, borderRadius: radius.lg,
              padding: '14px 16px', marginBottom: 16, transition: 'all .15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: font.sans, fontSize: 9, fontWeight: 700, color: c.text4, letterSpacing: '.08em', marginBottom: 3 }}>LAST MISSION</div>
                  <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text }}>{lastBattle.lobby_name ?? 'Battle'}</div>
                  <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>{timeAgo(lastBattle.created_at)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily: font.mono, fontSize: 24, fontWeight: 700, lineHeight: 1,
                    color: lastReturn >= 0 ? c.green : c.red,
                  }}>{lastReturn >= 0 ? '+' : ''}{lastReturn.toFixed(1)}%</div>
                  {lastBattle.final_rank && (
                    <div style={{
                      fontFamily: font.mono, fontSize: 11, fontWeight: 700, marginTop: 2,
                      color: lastBattle.final_rank === 1 ? c.gold : c.text3,
                    }}>
                      {lastBattle.final_rank === 1 ? 'WINNER' : `#${lastBattle.final_rank}`}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          )}

          {/* ═══════════════════════════════════════════════════════
              SECTION 5: LIVE NOW — Battles happening RIGHT NOW
              FOMO trigger — see others playing, one tap to spectate
              ═══════════════════════════════════════════════════════ */}
          {live.length > 0 && (
            <div className="fu fu3" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div className="live-dot" style={{ width: 5, height: 5 }} />
                <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 700, color: c.green, letterSpacing: '.06em' }}>LIVE NOW</span>
              </div>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
                {live.map(l => {
                  const viewers = l.player_count + l.spectator_count
                  return (
                    <div key={l.id} className="lobby-row" onClick={() => router.push(`/lobby/${l.id}`)}>
                      <div style={{
                        width: 36, height: 36, borderRadius: radius.sm, background: lobbyGrad(l.name),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.6)',
                        flexShrink: 0,
                      }}>{l.current_round ? `R${l.current_round.number}` : '...'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                        <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4 }}>
                          {l.player_count} trading{viewers > l.player_count ? ` / ${viewers - l.player_count} watching` : ''}
                        </div>
                      </div>
                      {l.top_trader && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: l.top_trader.return_pct >= 0 ? c.green : c.red }}>
                            {l.top_trader.return_pct >= 0 ? '+' : ''}{l.top_trader.return_pct.toFixed(1)}%
                          </div>
                          <div style={{ fontFamily: font.sans, fontSize: 9, color: c.text4 }}>{l.top_trader.name}</div>
                        </div>
                      )}
                      <div style={{
                        fontFamily: font.sans, fontSize: 11, fontWeight: 600, color: c.green,
                        padding: '5px 12px', borderRadius: 6, background: `${c.green}12`,
                        border: `1px solid ${c.green}25`, flexShrink: 0,
                      }}>Watch</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              SECTION 6: OPEN LOBBIES — Join a crew
              ═══════════════════════════════════════════════════════ */}
          {open.length > 0 && (
            <div className="fu fu4" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 700, color: c.text3, letterSpacing: '.06em' }}>OPEN LOBBIES</span>
                <Link href="/create" style={{ fontFamily: font.sans, fontSize: 11, color: c.pink, textDecoration: 'none' }}>+ Create</Link>
              </div>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
                {open.slice(0, 6).map(l => {
                  const fee = (l.config?.entry_fee as number) ?? 0
                  const prize = (l.config?.prize_pool as number) ?? (fee > 0 ? fee * 8 * 0.9 : 0)
                  const isOwner = !!(profile?.id && l.created_by === profile.id)
                  const isSel = selectedLobby === l.id

                  return (
                    <div key={l.id}>
                      <div className={`lobby-row ${isSel ? 'selected' : ''}`} onClick={() => setSelectedLobby(isSel ? null : l.id)}>
                        <div style={{
                          width: 36, height: 36, borderRadius: radius.sm, background: lobbyGrad(l.name),
                          flexShrink: 0,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                            {isOwner && <span style={{ fontFamily: font.mono, fontSize: 8, fontWeight: 700, color: c.pink, background: c.pinkDim, padding: '1px 5px', borderRadius: 3 }}>HOST</span>}
                          </div>
                          <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4 }}>
                            {l.player_count} player{l.player_count !== 1 ? 's' : ''} / {l.format}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: prize > 0 ? c.green : c.text3 }}>
                            {prize > 0 ? `$${prize}` : 'FREE'}
                          </div>
                          {fee > 0 && <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4 }}>{fee} CR</div>}
                        </div>
                      </div>
                      {isSel && (
                        <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px', animation: 'fadeUp .12s ease' }}>
                          <button onClick={() => router.push(`/lobby/${l.id}`)} style={{
                            flex: 1, fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.bg,
                            background: c.green, border: 'none', padding: '9px 0', borderRadius: 6, cursor: 'pointer',
                          }}>Join</button>
                          {isOwner && (
                            <Link href={`/lobby/${l.id}/admin`} style={{
                              fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.pink,
                              background: c.pinkDim, border: `1px solid ${c.pinkBorder}`,
                              padding: '9px 14px', borderRadius: 6, textDecoration: 'none',
                              display: 'flex', alignItems: 'center',
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

          {/* ═══════════════════════════════════════════════════════
              EMPTY STATE — No lobbies, no battles. Be the first.
              ═══════════════════════════════════════════════════════ */}
          {lobbies.length === 0 && !profileLoading && (
            <div className="fu fu3" style={{
              textAlign: 'center', padding: '40px 20px',
              border: `1px solid ${c.border}`, borderRadius: radius.lg, background: c.surface,
            }}>
              <div style={{ fontFamily: font.display, fontSize: 28, color: c.text, marginBottom: 4, letterSpacing: '.02em' }}>
                NO BATTLES YET
              </div>
              <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, marginBottom: 20 }}>
                Start one. Be first. Set the pace.
              </div>
              <button onClick={() => play('practice')} style={{
                fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.bg,
                background: c.green, padding: '12px 28px', borderRadius: radius.md,
                border: 'none', cursor: 'pointer', marginRight: 10,
              }}>Practice vs Bots</button>
              <Link href="/create" style={{
                fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text2,
                background: c.surface, padding: '12px 20px', borderRadius: radius.md,
                border: `1px solid ${c.border}`, textDecoration: 'none',
              }}>Host a Battle</Link>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              SECTION 7: MATCH HISTORY — Past missions
              Compact, scannable, shows W/L at a glance
              ═══════════════════════════════════════════════════════ */}
          {pastBattles.length > 1 && (
            <div className="fu fu5">
              <div style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 700, color: c.text3, letterSpacing: '.06em', marginBottom: 8 }}>
                MISSION LOG
              </div>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
                {pastBattles.slice(1, 6).map(b => {
                  const startBal = b.starting_balance ?? 10000
                  const ret = b.final_balance != null ? ((b.final_balance - startBal) / startBal * 100) : null
                  const pnl = b.final_balance != null ? b.final_balance - startBal : null
                  const won = b.final_rank === 1
                  const pos = ret != null && ret >= 0
                  return (
                    <Link key={b.id} href={`/lobby/${b.lobby_id}`} className="lobby-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: won ? `${c.green}15` : c.hover,
                        border: `1.5px solid ${won ? `${c.green}40` : c.border}`, flexShrink: 0,
                      }}>
                        <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: won ? c.green : c.text3 }}>
                          {won ? 'W' : b.final_rank ?? '-'}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 500, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.lobby_name ?? 'Battle'}
                        </div>
                        <div style={{ fontFamily: font.sans, fontSize: 9, color: c.text4 }}>{timeAgo(b.created_at)}</div>
                      </div>
                      {pnl != null && (
                        <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: pos ? c.green : c.red, flexShrink: 0 }}>
                          {pos ? '+' : ''}{ret?.toFixed(1)}%
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
              {pastBattles.length > 6 && (
                <Link href="/profile" style={{ display: 'block', textAlign: 'center', padding: '10px', fontFamily: font.sans, fontSize: 11, color: c.pink, textDecoration: 'none' }}>
                  View all {pastBattles.length} missions
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
