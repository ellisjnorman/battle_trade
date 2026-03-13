'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { useAuthPersist } from '@/lib/use-auth-persist'
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
  id: string; name: string; format: string; status: 'waiting' | 'active' | 'completed' | 'cancelled'
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
interface LeaderboardEntry {
  id: string; display_name: string; tr_score: number; rank_tier: string; total_wins: number
}

// ─── Credit packages (mirrored from lib/payments.ts for client) ─────
const CREDIT_PACKAGES = [
  { id: 'starter', credits: 500, price_usd: 100, label: '500 CR', bonus_pct: 0 },
  { id: 'fighter', credits: 2000, price_usd: 300, label: '2,000 CR', bonus_pct: 0, popular: true },
  { id: 'warrior', credits: 5000, price_usd: 500, label: '5,000 CR', bonus_pct: 20 },
  { id: 'legend', credits: 15000, price_usd: 1000, label: '15,000 CR', bonus_pct: 50 },
]

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

// Score is 0-100. Wall Street rank tiers.
function btrTier(score: number) {
  // Convert legacy scores (0-2000) to 0-100 scale
  const s = score > 100 ? Math.round((score / 2000) * 100) : score
  if (s >= 90) return { name: 'MANAGING DIRECTOR', color: '#FFD700', next: 100, floor: 90, score100: s }
  if (s >= 75) return { name: 'VICE PRESIDENT', color: '#B9F2FF', next: 90, floor: 75, score100: s }
  if (s >= 60) return { name: 'SENIOR ANALYST', color: '#E5E4E2', next: 75, floor: 60, score100: s }
  if (s >= 45) return { name: 'ANALYST', color: '#00DC82', next: 60, floor: 45, score100: s }
  if (s >= 30) return { name: 'ASSOCIATE', color: '#C0C0C0', next: 45, floor: 30, score100: s }
  if (s >= 15) return { name: 'JUNIOR TRADER', color: '#CD7F32', next: 30, floor: 15, score100: s }
  return { name: 'INTERN', color: '#555', next: 15, floor: 0, score100: s }
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

const FALLBACK_EVENTS = ['Loading activity...']

// Placeholder leaderboard data shown when no real data exists yet
const PLACEHOLDER_TRADERS = [
  { id: 'p1', display_name: 'SatoshiSniper', tr_score: 87, rank_tier: 'whale', return_pct: 42.3, payout: 12400, wins: 18, battles: 24 },
  { id: 'p2', display_name: 'DeFi_Diana', tr_score: 79, rank_tier: 'whale', return_pct: 35.8, payout: 8750, wins: 14, battles: 20 },
  { id: 'p3', display_name: 'ChartMaster_K', tr_score: 72, rank_tier: 'market_maker', return_pct: 28.1, payout: 5200, wins: 11, battles: 18 },
  { id: 'p4', display_name: 'AlgoAlpha', tr_score: 64, rank_tier: 'market_maker', return_pct: 22.5, payout: 3100, wins: 9, battles: 15 },
  { id: 'p5', display_name: 'YieldYoda', tr_score: 55, rank_tier: 'swing_trader', return_pct: 17.2, payout: 1800, wins: 7, battles: 12 },
]

export default function DashboardPage() {
  const router = useRouter()
  const { authenticated, user, ready, logout } = usePrivy()
  useAuthPersist() // Keep localStorage profile_id in sync with Privy session
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [myLobbies, setMyLobbies] = useState<Lobby[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [pastBattles, setPastBattles] = useState<PastBattle[]>([])
  const [playLoading, setPlayLoading] = useState<string | null>(null)
  const [liveEvents, setLiveEvents] = useState<string[]>(FALLBACK_EVENTS)
  const [liveEventIdx, setLiveEventIdx] = useState(0)
  const [displayPnl, setDisplayPnl] = useState(0)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showCreditsModal, setShowCreditsModal] = useState(false)
  const [showPracticeModal, setShowPracticeModal] = useState(false)
  const [practiceDifficulty, setPracticeDifficulty] = useState<string>('medium')
  const [practiceBotCount, setPracticeBotCount] = useState(4)
  const [saving, setSaving] = useState(false)
  const [selectedLobby, setSelectedLobby] = useState<string | null>(null)
  const [editingLobby, setEditingLobby] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [showMyBattles, setShowMyBattles] = useState(false)
  const [lbPeriod, setLbPeriod] = useState<'daily' | 'weekly' | 'all'>('daily')
  const [topTraders, setTopTraders] = useState<{ id: string; display_name: string; tr_score: number; rank_tier: string; return_pct?: number; payout?: number; wins?: number; battles?: number }[]>([])
  const [topLoading, setTopLoading] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
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

      const [profileRes, lobbiesRes, lbRes, mineRes] = await Promise.allSettled([
        pid ? fetch(`/api/profile/${pid}`) : Promise.resolve(null),
        fetch('/api/lobbies/active'),
        fetch('/api/leaderboard'),
        pid ? fetch(`/api/lobbies/mine?profile_id=${pid}`) : Promise.resolve(null),
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
        if (lbRes.status === 'fulfilled' && (lbRes.value as Response).ok) {
          const d = await (lbRes.value as Response).json()
          setLeaderboard((d.leaderboard ?? d.profiles ?? []).slice(0, 5))
        }
        if (mineRes.status === 'fulfilled' && mineRes.value && (mineRes.value as Response).ok) {
          const d = await (mineRes.value as Response).json()
          setMyLobbies(d.lobbies ?? [])
        }
        setProfileLoading(false)
      }
    }
    load()

    const i = setInterval(() => {
      fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] }).then(d => setLobbies(d.lobbies ?? [])).catch(() => {})
    }, 30000)
    return () => { cancelled = true; clearInterval(i) }
  }, [authReady, user])

  // Fetch top traders by period
  useEffect(() => {
    if (!authReady) return
    setTopLoading(true)
    fetch(`/api/leaderboard?period=${lbPeriod}&limit=5`)
      .then(r => r.ok ? r.json() : { leaderboard: [] })
      .then(d => setTopTraders(d.leaderboard ?? []))
      .catch(() => {})
      .finally(() => setTopLoading(false))
  }, [authReady, lbPeriod])

  // ─── Play Actions ─────────────────────────────────────────
  const play = useCallback(async (mode: string, opts?: { difficulty?: string; botCount?: number }) => {
    setPlayLoading(mode)
    let pid = localStorage.getItem('bt_profile_id')
    if (!pid) {
      pid = crypto.randomUUID()
      localStorage.setItem('bt_profile_id', pid)
    }
    const name = profile?.display_name || 'Trader'
    try {
      if (mode === 'practice') {
        const r = await fetch('/api/lobbies/practice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_id: pid, display_name: name,
            bot_count: opts?.botCount ?? practiceBotCount,
            difficulty: opts?.difficulty ?? practiceDifficulty,
          }),
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
  }, [router, profile, practiceDifficulty, practiceBotCount])

  const deleteLobby = useCallback(async (lobbyId: string) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/lobby/${lobbyId}/manage`, {
        method: 'DELETE', headers: { Authorization: localStorage.getItem('bt_profile_id') || '' },
      })
      if (r.ok) {
        setLobbies(prev => prev.filter(l => l.id !== lobbyId))
        setMyLobbies(prev => prev.filter(l => l.id !== lobbyId))
        setSelectedLobby(null)
      }
    } catch {} finally { setSaving(false) }
  }, [])

  const cancelLobby = useCallback(async (lobbyId: string) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/lobby/${lobbyId}/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('bt_profile_id') || '' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (r.ok) {
        setMyLobbies(prev => prev.map(l => l.id === lobbyId ? { ...l, status: 'cancelled' as Lobby['status'] } : l))
        setLobbies(prev => prev.filter(l => l.id !== lobbyId))
      }
    } catch {} finally { setSaving(false) }
  }, [])

  const editLobby = useCallback(async (lobbyId: string, name: string) => {
    setSaving(true)
    try {
      const r = await fetch(`/api/lobby/${lobbyId}/manage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('bt_profile_id') || '' },
        body: JSON.stringify({ name }),
      })
      if (r.ok) {
        setMyLobbies(prev => prev.map(l => l.id === lobbyId ? { ...l, name } : l))
        setLobbies(prev => prev.map(l => l.id === lobbyId ? { ...l, name } : l))
        setEditingLobby(null)
      }
    } catch {} finally { setSaving(false) }
  }, [])

  // ─── Derived ──────────────────────────────────────────────
  const live = lobbies.filter(b => b.status === 'active')
  const open = lobbies.filter(b => b.status === 'waiting')
  const btrRaw = profile?.tr_score ?? 0
  const tier = btrTier(btrRaw)
  const btr = tier.score100 ?? 0  // normalized 0-100
  const btrProg = tier.next > tier.floor ? ((btr - tier.floor) / (tier.next - tier.floor)) * 100 : 100
  const pnlPos = displayPnl >= 0
  const winRate = profile?.win_rate ?? 0

  const lastBattle = pastBattles[0] ?? null
  const lastReturn = lastBattle && lastBattle.final_balance != null && lastBattle.starting_balance != null
    ? ((lastBattle.final_balance - lastBattle.starting_balance) / lastBattle.starting_balance * 100)
    : null

  // Total payouts (sum of positive battle returns)
  const totalPayouts = useMemo(() => pastBattles.reduce((sum, b) => {
    if (b.final_balance != null && b.starting_balance != null && b.final_balance > b.starting_balance) {
      return sum + (b.final_balance - b.starting_balance)
    }
    return sum
  }, 0), [pastBattles])

  return (
    <div style={{ minHeight: '100dvh', background: c.bg, color: '#FFF' }}>
      <style>{globalCSS}{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:none}}
        @keyframes pulse2{0%,100%{opacity:.6}50%{opacity:1}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(245,160,208,.06)}50%{box-shadow:0 0 40px rgba(245,160,208,.14)}}
        @keyframes tickerSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes countUp{from{opacity:0;transform:translateY(6px) scale(.95)}to{opacity:1;transform:none}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes rankPulse{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}
        @keyframes glowBar{0%,100%{opacity:.6}50%{opacity:1}}
        .fu{animation:fadeUp .3s ease both}
        .fu1{animation-delay:.05s}.fu2{animation-delay:.1s}.fu3{animation-delay:.15s}.fu4{animation-delay:.2s}.fu5{animation-delay:.25s}
        .si{animation:slideIn .3s ease both}
        .si1{animation-delay:.05s}.si2{animation-delay:.1s}.si3{animation-delay:.15s}.si4{animation-delay:.2s}.si5{animation-delay:.25s}
        .lb-row{transition:all .15s ease}
        .lb-row:hover{background:${c.elevated} !important;transform:translateX(4px)}
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
          border:1px solid ${c.border};border-radius:${radius.md}px;padding:4px;min-width:200px;
          z-index:200;animation:fadeUp .12s ease;box-shadow:0 12px 40px rgba(0,0,0,.6);
        }
        .pmenu button,.pmenu a{
          display:block;width:100%;padding:10px 14px;font-family:${font.sans};font-size:13px;
          border:none;background:transparent;color:${c.text2};cursor:pointer;
          border-radius:${radius.sm}px;text-decoration:none;text-align:left;transition:all .1s;
        }
        .pmenu button:hover,.pmenu a:hover{background:${c.hover};color:${c.text}}
        .sidebar-card{
          background:${c.surface};border:1px solid ${c.border};border-radius:${radius.lg}px;
          padding:16px;margin-bottom:12px;
        }
        .sidebar-label{
          font-family:${font.sans};font-size:10px;font-weight:700;color:${c.text3};
          letter-spacing:.06em;margin-bottom:10px;
        }
        .credits-btn{
          display:flex;align-items:center;gap:6px;
          font-family:${font.mono};font-size:12px;font-weight:600;color:${c.pink};
          padding:4px 10px;border-radius:8px;background:${c.pinkDim};border:1px solid ${c.pinkBorder};
          cursor:pointer;transition:all .15s;
        }
        .credits-btn:hover{background:rgba(245,160,208,.14);border-color:rgba(245,160,208,.25)}
        .modal-overlay{
          position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.7);
          display:flex;align-items:center;justify-content:center;
          animation:fadeUp .15s ease;backdrop-filter:blur(8px);
        }
        .modal-card{
          background:${c.elevated};border:1px solid ${c.border};border-radius:${radius.xl}px;
          padding:24px;width:90%;max-width:420px;max-height:90vh;overflow-y:auto;
        }
        .pkg-btn{
          display:flex;align-items:center;justify-content:space-between;
          padding:14px 16px;border:1px solid ${c.border};border-radius:${radius.md}px;
          background:${c.surface};cursor:pointer;transition:all .15s;width:100%;
        }
        .pkg-btn:hover{border-color:${c.borderHover};background:${c.hover}}
        .pkg-btn.popular{border-color:${c.pinkBorder};background:rgba(245,160,208,.04)}
        @media(max-width:900px){
          .dash-grid{grid-template-columns:1fr!important}
          .sidebar{order:-1}
          .pillar-row{grid-template-columns:repeat(3,1fr)!important}
        }
        @media(max-width:480px){
          .pillar-row{grid-template-columns:repeat(2,1fr)!important}
        }
      `}</style>

      {/* ══ TOP NAV ══ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, height: 48, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 16px',
        background: 'rgba(10,10,10,.94)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="Battle Trade" style={{ height: 32, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </Link>
          <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text3, maxWidth: 260, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <span key={liveEventIdx} style={{ animation: 'tickerSlide .3s ease', display: 'inline-block' }}>
              <span style={{ color: c.green, marginRight: 6, fontWeight: 600, fontSize: 10, letterSpacing: '.06em' }}>LIVE</span>
              {liveEvents[liveEventIdx % liveEvents.length]}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Rank badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: font.mono, fontSize: 11, fontWeight: 700,
            color: tier.color, padding: '4px 8px', borderRadius: 6,
            background: `${tier.color}10`, border: `1px solid ${tier.color}20`,
          }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>{btr}</span>
            <span style={{ fontSize: 9, letterSpacing: '.04em', color: `${tier.color}BB` }}>{tier.name}</span>
          </div>

          {/* Credits — always clickable */}
          <button className="credits-btn" onClick={() => setShowCreditsModal(true)}>
            {profile?.credits ?? 0} CR
          </button>

          {/* Profile dropdown — always visible */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowProfileMenu(!showProfileMenu)} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: c.surface,
              border: `1px solid ${c.border}`, borderRadius: radius.sm, padding: '3px 10px 3px 3px',
              cursor: 'pointer', transition: 'all .15s',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: profile ? `${tier.color}18` : c.hover,
                border: `1.5px solid ${profile ? `${tier.color}50` : c.border}`,
                fontFamily: font.mono, fontSize: 11, color: profile ? tier.color : c.text3, fontWeight: 700,
              }}>{profile?.display_name?.[0]?.toUpperCase() ?? '?'}</div>
              <span style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.text2 }}>
                {profile?.display_name ?? 'Account'}
              </span>
            </button>
            {showProfileMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowProfileMenu(false)} />
                <div className="pmenu">
                  <Link href="/profile" onClick={() => setShowProfileMenu(false)}>Profile & Settings</Link>
                  <Link href="/leaderboard" onClick={() => setShowProfileMenu(false)}>Global Rankings</Link>
                  <Link href="/markets" onClick={() => setShowProfileMenu(false)}>Prediction Markets</Link>
                  <button onClick={() => setShowCreditsModal(true)}>Buy Credits</button>
                  <div style={{ height: 1, background: c.border, margin: '4px 0' }} />
                  <button onClick={() => { localStorage.removeItem('bt_profile_id'); logout().then(() => router.push('/')) }} style={{ color: c.red }}>
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ══ BODY ══ */}
      {!authReady ? (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
          <div className="skeleton" style={{ height: 200, borderRadius: radius.xl, marginBottom: 16 }} />
          <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
            <div>
              <div className="skeleton" style={{ height: 80, borderRadius: radius.lg, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 200, borderRadius: radius.lg }} />
            </div>
            <div>
              <div className="skeleton" style={{ height: 300, borderRadius: radius.lg }} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 16px 100px' }}>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* RANK HERO — The ONE number. The dopamine.              */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="fu" style={{
            background: c.surface, border: `1px solid ${c.border}`, borderRadius: radius.xl,
            padding: '14px 16px', marginBottom: 16, position: 'relative', overflow: 'hidden',
          }}>
            {/* Top accent line */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${tier.color}, ${tier.color}40 40%, transparent 80%)` }} />

            {/* Row 1: Avatar + Name + Score + Rank */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: `${tier.color}15`, border: `2px solid ${tier.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: font.mono, fontSize: 17, color: tier.color, fontWeight: 700,
                boxShadow: `0 0 20px ${tier.color}20`,
              }}>{profile?.display_name?.[0]?.toUpperCase() ?? '?'}</div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 700, color: c.text, lineHeight: 1 }}>
                    {profileLoading ? '...' : profile?.display_name ?? 'Trader'}
                  </div>
                  <div style={{
                    fontFamily: font.mono, fontSize: 9, fontWeight: 700, color: tier.color,
                    letterSpacing: '.06em',
                    display: 'inline-block', padding: '1px 6px',
                    background: `${tier.color}12`, border: `1px solid ${tier.color}25`, borderRadius: 3,
                  }}>{tier.name}</div>
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: font.mono, fontSize: 36, fontWeight: 700, color: tier.color, lineHeight: 1, letterSpacing: '-.02em', animation: 'countUp .5s ease both', animationDelay: '.2s' }}>{btr}</div>
                <div style={{ fontFamily: font.sans, fontSize: 8, fontWeight: 600, color: c.text4, letterSpacing: '.1em', marginTop: 2 }}>TRADER RANK</div>
              </div>
            </div>

            {/* Row 2: Progress bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontFamily: font.mono, fontSize: 9, color: c.text3 }}>{tier.name} · {btr}</span>
                <span style={{ fontFamily: font.mono, fontSize: 9, color: tier.color }}>
                  {tier.next - btr} pts to {btrTier(tier.next).name}
                </span>
              </div>
              <div style={{ height: 5, background: c.hover, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${btrProg}%`, height: '100%', borderRadius: 3,
                  background: `linear-gradient(90deg, ${tier.color}, ${tier.color}CC)`,
                  transition: 'width .6s cubic-bezier(.25,.1,.25,1)',
                  boxShadow: `0 0 8px ${tier.color}40`,
                }} />
              </div>
            </div>

            {/* Row 3: 5 Pillars — compact inline */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 10 }} className="pillar-row">
              {[
                { name: 'PERF', weight: 35, col: c.green },
                { name: 'RISK', weight: 25, col: c.pink },
                { name: 'CONSIST', weight: 20, col: c.blue },
                { name: 'ADAPT', weight: 10, col: '#FFD700' },
                { name: 'SOCIAL', weight: 10, col: c.red },
              ].map(p => (
                <div key={p.name} style={{
                  background: `${p.col}08`, border: `1px solid ${p.col}18`, borderRadius: 4,
                  padding: '5px 4px', textAlign: 'center',
                }}>
                  <div style={{ fontFamily: font.mono, fontSize: 7, fontWeight: 700, color: `${p.col}AA`, letterSpacing: '.03em', marginBottom: 2 }}>{p.name}</div>
                  <div style={{ height: 2, background: `${p.col}15`, borderRadius: 1, overflow: 'hidden', marginBottom: 2 }}>
                    <div style={{ width: `${p.weight}%`, height: '100%', background: p.col, borderRadius: 1 }} />
                  </div>
                  <div style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: p.col }}>{p.weight}%</div>
                </div>
              ))}
            </div>

            {/* Row 4: Stats — compact */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, background: c.border, borderRadius: 4, overflow: 'hidden' }}>
              {[
                { value: pnlPos ? `+${displayPnl >= 1000 ? `${(displayPnl/1000).toFixed(1)}K` : Math.round(displayPnl)}` : `${displayPnl <= -1000 ? `${(displayPnl/1000).toFixed(1)}K` : Math.round(displayPnl)}`, label: 'TOTAL P&L', color: pnlPos ? c.green : c.red },
                { value: `${((winRate) * 100).toFixed(0)}%`, label: 'WIN RATE', color: winRate >= 0.5 ? c.green : c.text },
                { value: `${pastBattles.length}`, label: 'BATTLES', color: c.text },
                { value: `${profile?.total_wins ?? 0}`, label: 'WINS', color: c.green },
                { value: streak > 0 ? `${streak}` : '0', label: 'STREAK', color: streak >= 3 ? c.gold : streak > 0 ? '#FF8C00' : c.text4 },
                { value: (profile?.best_return ?? 0) > 0 ? `+${(profile!.best_return).toFixed(0)}%` : '-', label: 'BEST', color: (profile?.best_return ?? 0) > 0 ? c.green : c.text4 },
              ].map(s => (
                <div key={s.label} style={{ background: c.surface, padding: '6px 0', textAlign: 'center' }}>
                  <div style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontFamily: font.sans, fontSize: 7, fontWeight: 600, color: c.text4, letterSpacing: '.06em', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {streak >= 2 && (
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
                <StreakBadge streak={streak} />
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* TOP 5 LEADERBOARD — daily / weekly / all-time          */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="fu" style={{
            background: c.surface, border: `1px solid ${c.border}`, borderRadius: radius.xl,
            padding: '20px 24px', marginBottom: 16, position: 'relative', overflow: 'hidden',
          }}>
            {/* Shimmer accent */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(245,160,208,.4), rgba(0,191,255,.4), transparent)', backgroundSize: '200% 100%', animation: 'shimmer 3s linear infinite' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: font.display, fontSize: 16, color: c.gold, letterSpacing: '.06em' }}>TOP PAYOUTS</span>
              </div>
              {/* Period tabs */}
              <div style={{ display: 'flex', gap: 0, background: c.bg, borderRadius: 6, overflow: 'hidden', border: `1px solid ${c.border}` }}>
                {(['daily', 'weekly', 'all'] as const).map(p => (
                  <button key={p} onClick={() => setLbPeriod(p)} style={{
                    fontFamily: font.mono, fontSize: 10, fontWeight: 700, padding: '5px 12px',
                    color: lbPeriod === p ? c.bg : c.text3,
                    background: lbPeriod === p ? c.gold : 'transparent',
                    border: 'none', cursor: 'pointer', transition: 'all .15s',
                    letterSpacing: '.04em', textTransform: 'uppercase',
                  }}>{p === 'all' ? 'ALL TIME' : p}</button>
                ))}
              </div>
            </div>

            {topLoading ? (
              <div style={{ display: 'flex', gap: 8 }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="skeleton" style={{ flex: 1, height: 64, borderRadius: radius.sm }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                {(topTraders.length > 0 ? topTraders : PLACEHOLDER_TRADERS).slice(0, 5).map((t, i) => {
                  const isPlaceholder = topTraders.length === 0;
                  const tTier = btrTier(t.tr_score)
                  const isYou = profile?.id === t.id
                  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32', c.text3, c.text4]
                  const medals = ['👑', '🥈', '🥉', '', '']
                  return (
                    <Link key={t.id} href={isPlaceholder ? '/leaderboard' : `/profile/${t.id}`} className={`lb-row si si${i + 1}`} style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '12px 8px', borderRadius: radius.sm, textDecoration: 'none', color: 'inherit',
                      background: isYou ? `${c.pink}10` : i === 0 ? `${c.gold}08` : 'transparent',
                      border: `1px solid ${isYou ? `${c.pink}30` : i === 0 ? `${c.gold}20` : c.border}`,
                      position: 'relative', overflow: 'hidden',
                      opacity: isPlaceholder ? 0.6 : 1,
                    }}>
                      {i === 0 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: c.gold, animation: 'glowBar 2s ease infinite' }} />}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 800, color: rankColors[i], lineHeight: 1, animation: i < 3 ? 'countUp .4s ease both' : undefined, animationDelay: `${i * 0.08}s` }}>
                          {medals[i] || `#${i + 1}`}
                        </span>
                      </div>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${tTier.color}18`, border: `1.5px solid ${tTier.color}40`,
                        fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: tTier.color,
                      }}>{t.display_name?.[0]?.toUpperCase() ?? '?'}</div>
                      <span style={{
                        fontFamily: font.sans, fontSize: 11, fontWeight: isYou ? 700 : 500,
                        color: isYou ? c.pink : c.text, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center',
                      }}>{t.display_name}</span>
                      <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: c.green }}>
                        {t.payout != null
                          ? `$${t.payout >= 1000 ? `${(t.payout / 1000).toFixed(1)}K` : t.payout}`
                          : `${(t.return_pct ?? 0) >= 0 ? '+' : ''}${(t.return_pct ?? 0).toFixed(1)}%`
                        }
                      </span>
                      {isYou && <span style={{ fontFamily: font.sans, fontSize: 8, fontWeight: 700, color: c.pink, background: c.pinkDim, padding: '1px 5px', borderRadius: 3 }}>YOU</span>}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* CTA — Rank up. Opens difficulty picker.                  */}
          {/* ═══════════════════════════════════════════════════════ */}
          <button
            className={`mode-btn fu fu1 ${playLoading === 'practice' ? 'loading' : ''}`}
            onClick={() => setShowPracticeModal(true)}
            style={{
              padding: '28px 28px', marginBottom: 16, width: '100%',
              border: `1px solid rgba(245,160,208,.35)`,
              background: `linear-gradient(135deg, rgba(245,160,208,.1) 0%, ${c.surface} 40%, rgba(245,160,208,.05) 100%)`,
              boxShadow: '0 0 40px rgba(245,160,208,.12), 0 0 80px rgba(245,160,208,.06), inset 0 1px 0 rgba(245,160,208,.15)',
              animation: 'glow 4s ease infinite',
              borderRadius: radius.lg,
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${c.pink}, rgba(245,160,208,.4) 60%, transparent 100%)`, borderRadius: `${radius.lg}px ${radius.lg}px 0 0` }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, rgba(245,160,208,.2) 50%, transparent)` }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 700, color: c.pink, letterSpacing: '.12em', marginBottom: 6, textShadow: '0 0 20px rgba(245,160,208,.5)' }}>
                  {playLoading === 'practice' ? 'CREATING BATTLE...' : `${tier.next - btr} PTS TO ${btrTier(tier.next).name.toUpperCase()}`}
                </div>
                <div style={{ fontFamily: font.display, fontSize: 38, color: c.text, lineHeight: 1, letterSpacing: '.02em', textShadow: '0 2px 20px rgba(255,255,255,.08)' }}>
                  RANK UP NOW
                </div>
                <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, marginTop: 6 }}>
                  Choose your difficulty and climb the ranks
                </div>
              </div>
              <div style={{
                width: 60, height: 60, borderRadius: radius.md,
                background: `linear-gradient(135deg, rgba(245,160,208,.15), rgba(245,160,208,.05))`,
                border: `1px solid rgba(245,160,208,.4)`,
                boxShadow: '0 0 20px rgba(245,160,208,.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: font.display, fontSize: 26, color: c.pink,
                textShadow: '0 0 12px rgba(245,160,208,.5)',
              }}>GO</div>
            </div>
          </button>

          <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

            {/* ═══ MAIN COLUMN ═══ */}
            <div>

              {/* LEADERBOARD — front and center */}
              <div className="fu fu2" style={{
                background: c.surface, border: `1px solid ${c.border}`, borderRadius: radius.lg,
                padding: '16px', marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 700, color: c.text3, letterSpacing: '.06em' }}>GLOBAL RANKINGS</span>
                    {profile && <span style={{ fontFamily: font.mono, fontSize: 10, color: c.pink, background: c.pinkDim, padding: '2px 6px', borderRadius: 3 }}>YOU</span>}
                  </div>
                  <Link href="/leaderboard" style={{ fontFamily: font.sans, fontSize: 11, color: c.pink, textDecoration: 'none' }}>View All</Link>
                </div>

                {leaderboard.length > 0 ? (
                  <div style={{ border: `1px solid ${c.border}`, borderRadius: radius.sm, overflow: 'hidden' }}>
                    {leaderboard.map((t, i) => {
                      const tTier = btrTier(t.tr_score)
                      const isYou = profile?.id === t.id
                      return (
                        <Link key={t.id} href={`/profile/${t.id}`} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          textDecoration: 'none', color: 'inherit', transition: 'background .1s',
                          background: isYou ? `${c.pink}08` : 'transparent',
                          borderBottom: i < leaderboard.length - 1 ? `1px solid ${c.border}` : 'none',
                        }} className="lobby-row">
                          <span style={{
                            fontFamily: font.mono, fontSize: 14, fontWeight: 700, width: 22, textAlign: 'center',
                            color: i === 0 ? c.gold : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : c.text3,
                          }}>{i + 1}</span>
                          <div style={{
                            width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: `${tTier.color}18`, border: `1.5px solid ${tTier.color}40`,
                            fontFamily: font.mono, fontSize: 11, fontWeight: 700, color: tTier.color,
                          }}>{t.display_name?.[0]?.toUpperCase() ?? '?'}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontFamily: font.sans, fontSize: 13, fontWeight: isYou ? 700 : 500, color: isYou ? c.pink : c.text,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {t.display_name}{isYou ? ' (you)' : ''}
                            </div>
                            <div style={{ fontFamily: font.mono, fontSize: 9, color: c.text4 }}>{tTier.name} · {t.total_wins}W</div>
                          </div>
                          <div style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 700, color: tTier.color, flexShrink: 0 }}>{t.tr_score}</div>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, marginBottom: 8 }}>No rankings yet</div>
                    <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>Complete your first battle to get ranked</div>
                  </div>
                )}
              </div>

              {/* MODE SELECT — Practice / 1v1 / Host */}
              <div className="fu fu3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[
                  { id: 'practice', label: 'Practice', sub: 'vs AI bots', accent: c.green, onClick: () => setShowPracticeModal(true) },
                  { id: 'duel', label: '1v1 Duel', sub: 'head to head', accent: '#FF6B35', onClick: () => play('duel') },
                  { id: 'create', label: 'Host Battle', sub: 'invite friends', accent: c.blue, onClick: () => play('create') },
                ].map(m => (
                  <button
                    key={m.id}
                    className={`mode-btn ${playLoading === m.id ? 'loading' : ''}`}
                    onClick={m.onClick}
                    style={{ padding: '14px 12px', textAlign: 'center' }}
                  >
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${m.accent}80, transparent)` }} />
                    <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 700, color: c.text }}>{m.label}</div>
                    <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4 }}>
                      {playLoading === m.id ? 'Loading...' : m.sub}
                    </div>
                  </button>
                ))}
              </div>

              {/* ── TERMINAL-STYLE LOBBY FEED ── */}
              {(live.length > 0 || open.length > 0) && (
                <div className="fu fu4" style={{
                  marginBottom: 16, background: '#050505', border: `1px solid ${c.border}`,
                  borderRadius: radius.lg, overflow: 'hidden', fontFamily: font.mono,
                }}>
                  {/* Terminal header bar */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 14px', borderBottom: `1px solid ${c.border}`,
                    background: 'rgba(255,255,255,.02)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="live-dot" style={{ width: 5, height: 5 }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.green, letterSpacing: '.08em' }}>
                        BATTLES · {live.length + open.length} ACTIVE
                      </span>
                    </div>
                    <Link href="/create" style={{ fontSize: 10, color: c.pink, textDecoration: 'none', letterSpacing: '.04em' }}>+ NEW</Link>
                  </div>

                  {/* Column headers */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 70px 80px 70px',
                    padding: '4px 14px', borderBottom: `1px solid rgba(255,255,255,.03)`,
                    fontSize: 8, fontWeight: 600, color: c.text4, letterSpacing: '.1em',
                  }}>
                    <span>NAME</span>
                    <span style={{ textAlign: 'center' }}>PLAYERS</span>
                    <span style={{ textAlign: 'right' }}>LEADER</span>
                    <span style={{ textAlign: 'right' }}>STATUS</span>
                  </div>

                  {/* Live battles */}
                  {live.map(l => (
                    <div key={l.id} className="lobby-row" onClick={() => router.push(`/lobby/${l.id}`)}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 70px', alignItems: 'center', padding: '8px 14px', cursor: 'pointer' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                        <div style={{ fontSize: 9, color: c.text4 }}>
                          {l.current_round ? `R${l.current_round.number}` : '···'} · {l.format ?? 'elim'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: c.text2 }}>{l.player_count}</div>
                      <div style={{ textAlign: 'right' }}>
                        {l.top_trader ? (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: l.top_trader.return_pct >= 0 ? c.green : c.red }}>
                              {l.top_trader.return_pct >= 0 ? '+' : ''}{l.top_trader.return_pct.toFixed(1)}%
                            </div>
                            <div style={{ fontSize: 8, color: c.text4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.top_trader.name}</div>
                          </>
                        ) : <span style={{ fontSize: 10, color: c.text4 }}>---</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: c.bg, background: c.green,
                          padding: '2px 6px', borderRadius: 3, letterSpacing: '.04em',
                        }}>LIVE</span>
                      </div>
                    </div>
                  ))}

                  {/* Open battles */}
                  {open.slice(0, 8).map(l => {
                    const fee = (l.config?.entry_fee as number) ?? 0
                    const isOwner = !!(profile?.id && l.created_by === profile.id)
                    const isSel = selectedLobby === l.id
                    return (
                      <div key={l.id}>
                        <div className={`lobby-row ${isSel ? 'selected' : ''}`}
                          onClick={() => setSelectedLobby(isSel ? null : l.id)}
                          style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 70px', alignItems: 'center', padding: '8px 14px', cursor: 'pointer' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                              {isOwner && <span style={{ fontSize: 7, fontWeight: 700, color: c.pink, background: c.pinkDim, padding: '1px 4px', borderRadius: 2 }}>YOU</span>}
                            </div>
                            <div style={{ fontSize: 9, color: c.text4 }}>{l.format ?? 'elim'}</div>
                          </div>
                          <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: c.text3 }}>{l.player_count}</div>
                          <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: fee > 0 ? c.pink : c.text4 }}>
                            {fee > 0 ? `${fee}CR` : 'FREE'}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: c.text, background: 'rgba(255,255,255,.06)',
                              padding: '2px 6px', borderRadius: 3, letterSpacing: '.04em',
                            }}>OPEN</span>
                          </div>
                        </div>
                        {isSel && (
                          <div style={{ display: 'flex', gap: 8, padding: '4px 14px 10px' }}>
                            <button onClick={() => router.push(`/lobby/${l.id}`)} style={{
                              flex: 1, fontFamily: font.mono, fontSize: 11, fontWeight: 700, color: c.bg,
                              background: c.green, border: 'none', padding: '7px 0', borderRadius: 4, cursor: 'pointer',
                              letterSpacing: '.04em',
                            }}>JOIN</button>
                            {isOwner && (
                              <Link href={`/lobby/${l.id}/admin`} style={{
                                fontFamily: font.mono, fontSize: 11, fontWeight: 700, color: c.pink,
                                background: c.pinkDim, border: `1px solid ${c.pinkBorder}`,
                                padding: '7px 12px', borderRadius: 4, textDecoration: 'none',
                              }}>ADMIN</Link>
                            )}
                            {isOwner && l.status === 'waiting' && (
                              <button onClick={() => { if (confirm(`Delete "${l.name}"?`)) deleteLobby(l.id) }} disabled={saving} style={{
                                fontFamily: font.mono, fontSize: 11, fontWeight: 700, color: c.red,
                                background: c.redDim, border: `1px solid rgba(255,68,102,.15)`,
                                padding: '7px 12px', borderRadius: 4, cursor: 'pointer',
                              }}>DEL</button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* EMPTY STATE */}
              {lobbies.length === 0 && !profileLoading && (
                <div className="fu fu3" style={{
                  textAlign: 'center', padding: '40px 20px',
                  border: `1px solid ${c.border}`, borderRadius: radius.lg, background: c.surface,
                }}>
                  <div style={{ fontFamily: font.display, fontSize: 28, color: c.text, marginBottom: 4 }}>
                    Your rank starts at zero
                  </div>
                  <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, marginBottom: 20 }}>
                    Every battle counts. Start climbing.
                  </div>
                  <button onClick={() => setShowPracticeModal(true)} style={{
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

              {/* ═══ MY BATTLES — Admin management for created lobbies ═══ */}
              {myLobbies.length > 0 && (
                <div className="fu fu4" style={{
                  border: `1px solid ${c.border}`, borderRadius: radius.lg, background: c.surface,
                  overflow: 'hidden', marginTop: 16,
                }}>
                  <button onClick={() => setShowMyBattles(!showMyBattles)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                    padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: showMyBattles ? `1px solid ${c.border}` : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: font.display, fontSize: 18, color: c.pink, letterSpacing: '.06em' }}>MY BATTLES</span>
                      <span style={{
                        fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.bg,
                        background: c.pink, padding: '2px 7px', borderRadius: 4,
                      }}>{myLobbies.length}</span>
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 14, color: c.text3, transition: 'transform .2s', transform: showMyBattles ? 'rotate(180deg)' : 'none' }}>▾</span>
                  </button>

                  {showMyBattles && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {myLobbies.map(l => {
                        const isEditing = editingLobby === l.id
                        const statusColor = l.status === 'active' ? c.green : l.status === 'waiting' ? '#FFD700' : l.status === 'cancelled' ? c.red : c.text4
                        const statusLabel = l.status === 'active' ? 'LIVE' : l.status === 'waiting' ? 'OPEN' : l.status === 'cancelled' ? 'CANCELLED' : 'ENDED'
                        return (
                          <div key={l.id} style={{ borderBottom: `1px solid ${c.border}`, padding: '12px 18px' }}>
                            {/* Row 1: Name + Status */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                                  <input
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    maxLength={64}
                                    autoFocus
                                    style={{
                                      fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text,
                                      background: c.bg, border: `1px solid ${c.pink}`, borderRadius: 4,
                                      padding: '4px 8px', flex: 1, outline: 'none',
                                    }}
                                    onKeyDown={e => { if (e.key === 'Enter') editLobby(l.id, editName); if (e.key === 'Escape') setEditingLobby(null) }}
                                  />
                                  <button onClick={() => editLobby(l.id, editName)} disabled={saving || !editName.trim()} style={{
                                    fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.bg, background: c.green,
                                    border: 'none', padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                                  }}>SAVE</button>
                                  <button onClick={() => setEditingLobby(null)} style={{
                                    fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.text3, background: 'none',
                                    border: `1px solid ${c.border}`, padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                                  }}>ESC</button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                  <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                                  <span style={{
                                    fontFamily: font.mono, fontSize: 8, fontWeight: 700, color: statusColor,
                                    background: `${statusColor}15`, border: `1px solid ${statusColor}33`,
                                    padding: '1px 6px', borderRadius: 3, flexShrink: 0,
                                  }}>{statusLabel}</span>
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>{l.player_count ?? 0} players</span>
                              </div>
                            </div>

                            {/* Row 2: Actions */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {/* Admin panel link — always available for your lobbies */}
                              <Link href={`/lobby/${l.id}/admin`} style={{
                                fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.pink,
                                background: c.pinkDim, border: `1px solid ${c.pinkBorder}`,
                                padding: '5px 12px', borderRadius: 4, textDecoration: 'none',
                              }}>ADMIN PANEL</Link>
                              {/* View lobby — spectate for cancelled/completed, join for active/waiting */}
                              <Link href={l.status === 'active' || l.status === 'waiting' ? `/lobby/${l.id}` : `/lobby/${l.id}/spectate`} style={{
                                fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.text2,
                                background: c.hover, border: `1px solid ${c.border}`,
                                padding: '5px 12px', borderRadius: 4, textDecoration: 'none',
                              }}>VIEW</Link>
                              {/* Edit name */}
                              {(l.status === 'active' || l.status === 'waiting') && !isEditing && (
                                <button onClick={() => { setEditingLobby(l.id); setEditName(l.name) }} style={{
                                  fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.text3,
                                  background: 'none', border: `1px solid ${c.border}`,
                                  padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                                }}>EDIT</button>
                              )}
                              {/* Cancel (active/waiting) */}
                              {(l.status === 'active' || l.status === 'waiting') && (
                                <button onClick={() => { if (confirm(`Cancel "${l.name}"? This will end all rounds and close all positions.`)) cancelLobby(l.id) }} disabled={saving} style={{
                                  fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: '#FF9900',
                                  background: 'rgba(255,153,0,.06)', border: '1px solid rgba(255,153,0,.2)',
                                  padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                                }}>CANCEL</button>
                              )}
                              {/* Delete (waiting or cancelled only) */}
                              {(l.status === 'waiting' || l.status === 'cancelled') && (
                                <button onClick={() => { if (confirm(`Permanently delete "${l.name}"? This cannot be undone.`)) deleteLobby(l.id) }} disabled={saving} style={{
                                  fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.red,
                                  background: c.redDim, border: `1px solid rgba(255,68,102,.15)`,
                                  padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                                }}>DELETE</button>
                              )}
                            </div>

                            {/* Row 3: Meta */}
                            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                              <span style={{ fontFamily: font.sans, fontSize: 9, color: c.text4 }}>{l.format ?? 'elimination'}</span>
                              {l.created_at && <span style={{ fontFamily: font.sans, fontSize: 9, color: c.text4 }}>Created {timeAgo(l.created_at)}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ═══ SIDEBAR ═══ */}
            <div className="sidebar">

              {/* BATTLE LOG — recent battles as rank progression */}
              {pastBattles.length > 0 && (
                <div className="sidebar-card fu fu1">
                  <div className="sidebar-label">BATTLE LOG</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {pastBattles.slice(0, 6).map((b, i) => {
                      const startBal = b.starting_balance ?? 10000
                      const ret = b.final_balance != null ? ((b.final_balance - startBal) / startBal * 100) : null
                      const won = b.final_rank === 1
                      const pos = ret != null && ret >= 0
                      return (
                        <Link key={b.id} href={`/lobby/${b.lobby_id}`} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                          textDecoration: 'none', color: 'inherit',
                          borderBottom: i < Math.min(pastBattles.length, 6) - 1 ? `1px solid ${c.border}` : 'none',
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: won ? `${c.green}15` : c.hover,
                            border: `1.5px solid ${won ? `${c.green}40` : c.border}`, flexShrink: 0,
                          }}>
                            <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: won ? c.green : c.text3 }}>
                              {won ? 'W' : b.final_rank ?? '-'}
                            </span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 500, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {b.lobby_name ?? 'Battle'}
                            </div>
                            <div style={{ fontFamily: font.sans, fontSize: 9, color: c.text4 }}>{timeAgo(b.created_at)}</div>
                          </div>
                          {ret != null && (
                            <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 700, color: pos ? c.green : c.red, flexShrink: 0 }}>
                              {pos ? '+' : ''}{ret.toFixed(1)}%
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                  {pastBattles.length > 6 && (
                    <Link href="/profile" style={{ display: 'block', textAlign: 'center', padding: '8px 0 0', fontFamily: font.sans, fontSize: 11, color: c.pink, textDecoration: 'none' }}>
                      View all {pastBattles.length} battles
                    </Link>
                  )}
                </div>
              )}

              {/* PAYOUTS */}
              {totalPayouts > 0 && (
                <div className="sidebar-card fu fu2" style={{ background: `linear-gradient(135deg, ${c.surface}, rgba(0,220,130,.03))` }}>
                  <div className="sidebar-label">TOTAL EARNINGS</div>
                  <div style={{ fontFamily: font.mono, fontSize: 28, fontWeight: 700, color: c.green, lineHeight: 1 }}>
                    +${totalPayouts >= 1000 ? `${(totalPayouts / 1000).toFixed(1)}K` : totalPayouts.toLocaleString()}
                  </div>
                  <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4, marginTop: 4 }}>
                    from {pastBattles.filter(b => b.final_balance != null && b.starting_balance != null && b.final_balance > b.starting_balance).length} profitable battles
                  </div>
                </div>
              )}

              {/* BADGES */}
              {profile?.badges && profile.badges.length > 0 && (
                <div className="sidebar-card fu fu2">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="sidebar-label" style={{ marginBottom: 0 }}>BADGES</div>
                    <Link href="/profile" style={{ fontFamily: font.sans, fontSize: 10, color: c.pink, textDecoration: 'none' }}>View all</Link>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {profile.badges.slice(0, 8).map(b => (
                      <div key={b.id} title={b.name} style={{
                        width: 36, height: 36, borderRadius: 8, background: c.elevated,
                        border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontFamily: font.sans, fontSize: 16,
                        cursor: 'default',
                      }}>{b.icon === 'fire' ? '🔥' : b.icon === 'crown' ? '👑' : b.icon === 'star' ? '⭐' : b.icon === 'shield' ? '🛡' : b.icon === 'bolt' ? '⚡' : b.icon === 'trophy' ? '🏆' : b.icon === 'diamond' ? '💎' : b.icon === 'skull' ? '💀' : b.icon === 'medal' ? '🎖' : '🏅'}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* CREDITS */}
              <div className="sidebar-card fu fu2">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="sidebar-label" style={{ marginBottom: 0 }}>CREDITS</div>
                  <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 700, color: c.pink }}>{profile?.credits ?? 0}</span>
                </div>
                <button onClick={() => setShowCreditsModal(true)} style={{
                  width: '100%', fontFamily: font.sans, fontSize: 12, fontWeight: 600,
                  color: c.bg, background: c.pink, border: 'none', padding: '8px 0',
                  borderRadius: radius.sm, cursor: 'pointer', transition: 'all .15s',
                }}>Buy Credits</button>
              </div>

              {/* QUICK LINKS */}
              <div className="sidebar-card fu fu3">
                <div className="sidebar-label">EXPLORE</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {[
                    { href: '/leaderboard', label: 'Global Rankings', desc: 'See where you stand' },
                    { href: '/markets', label: 'Prediction Markets', desc: 'Bet on outcomes' },
                    { href: '/profile', label: 'Your Profile', desc: 'Stats, badges, history' },
                  ].map(link => (
                    <Link key={link.href} href={link.href} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: radius.sm, textDecoration: 'none',
                      color: 'inherit', transition: 'background .1s',
                    }} className="lobby-row">
                      <div>
                        <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text }}>{link.label}</div>
                        <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4 }}>{link.desc}</div>
                      </div>
                      <span style={{ fontFamily: font.sans, fontSize: 16, color: c.text4 }}>&rsaquo;</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ PRACTICE DIFFICULTY MODAL ══ */}
      {showPracticeModal && (
        <div className="modal-overlay" onClick={() => setShowPracticeModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: font.display, fontSize: 24, color: c.text }}>Start Practice</div>
                <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text3 }}>
                  Practice builds rank (capped outside top 100)
                </div>
              </div>
              <button onClick={() => setShowPracticeModal(false)} style={{
                width: 32, height: 32, borderRadius: 8, border: `1px solid ${c.border}`,
                background: c.surface, color: c.text3, cursor: 'pointer', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>&times;</button>
            </div>

            {/* Difficulty cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {([
                { id: 'easy', label: 'Chill', desc: '2 bots, 3min rounds, $50K', color: c.green, multiplier: '0.5x rank pts', icon: '~' },
                { id: 'medium', label: 'Standard', desc: '4 bots, 2min rounds, $10K', color: c.blue, multiplier: '0.75x rank pts', icon: '!' },
                { id: 'hard', label: 'Intense', desc: '6 bots, 1min rounds, $5K', color: '#FF6B35', multiplier: '1.0x rank pts', icon: '!!' },
                { id: 'insane', label: 'Degen', desc: '7 bots, 45s rounds, $2K', color: c.red, multiplier: '1.25x rank pts', icon: '!!!' },
              ] as const).map(d => (
                <button
                  key={d.id}
                  onClick={() => { setPracticeDifficulty(d.id); setPracticeBotCount(d.id === 'easy' ? 2 : d.id === 'medium' ? 4 : d.id === 'hard' ? 6 : 7) }}
                  style={{
                    padding: '16px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all .15s',
                    border: practiceDifficulty === d.id ? `2px solid ${d.color}` : `1px solid ${c.border}`,
                    borderRadius: radius.md, background: practiceDifficulty === d.id ? `${d.color}08` : c.surface,
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {practiceDifficulty === d.id && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: d.color }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: d.color,
                      background: `${d.color}15`, padding: '2px 6px', borderRadius: 3,
                    }}>{d.icon}</span>
                    <span style={{ fontFamily: font.sans, fontSize: 15, fontWeight: 700, color: practiceDifficulty === d.id ? c.text : c.text2 }}>
                      {d.label}
                    </span>
                  </div>
                  <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text4, marginBottom: 4 }}>{d.desc}</div>
                  <div style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: d.color }}>{d.multiplier}</div>
                </button>
              ))}
            </div>

            {/* Bot count slider */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.text2 }}>Opponents</span>
                <span style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: c.text }}>{practiceBotCount} bot{practiceBotCount !== 1 ? 's' : ''}</span>
              </div>
              <input
                type="range" min={1} max={7} value={practiceBotCount}
                onChange={e => setPracticeBotCount(Number(e.target.value))}
                style={{ width: '100%', accentColor: c.pink }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: font.mono, fontSize: 9, color: c.text4 }}>1</span>
                <span style={{ fontFamily: font.mono, fontSize: 9, color: c.text4 }}>7</span>
              </div>
            </div>

            {/* Launch button */}
            <button
              className={playLoading === 'practice' ? 'loading' : ''}
              onClick={() => { setShowPracticeModal(false); play('practice', { difficulty: practiceDifficulty, botCount: practiceBotCount }) }}
              disabled={!!playLoading}
              style={{
                width: '100%', padding: '14px 0', fontFamily: font.display, fontSize: 20,
                fontWeight: 700, color: c.bg, border: 'none', borderRadius: radius.md,
                cursor: 'pointer', transition: 'all .15s',
                background: `linear-gradient(135deg, ${c.green}, ${c.green}CC)`,
                boxShadow: `0 4px 20px ${c.green}30`,
              }}
            >
              {playLoading === 'practice' ? 'Creating Battle...' : 'Start Battle'}
            </button>

            <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4, textAlign: 'center', marginTop: 10 }}>
              Practice rank points are capped — top 100 requires verified live trades
            </div>
          </div>
        </div>
      )}

      {/* ══ CREDIT PURCHASE MODAL ══ */}
      {showCreditsModal && (
        <div className="modal-overlay" onClick={() => setShowCreditsModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: font.display, fontSize: 24, color: c.text }}>Buy Credits</div>
                <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text3 }}>
                  Current balance: <span style={{ color: c.pink, fontWeight: 600 }}>{profile?.credits ?? 0} CR</span>
                </div>
              </div>
              <button onClick={() => setShowCreditsModal(false)} style={{
                width: 32, height: 32, borderRadius: 8, border: `1px solid ${c.border}`,
                background: c.surface, color: c.text3, cursor: 'pointer', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>&times;</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {CREDIT_PACKAGES.map(pkg => {
                const total = pkg.credits + Math.round(pkg.credits * pkg.bonus_pct / 100)
                return (
                  <button key={pkg.id} className={`pkg-btn ${pkg.popular ? 'popular' : ''}`}
                    onClick={() => {
                      // For now just show alert — Stripe/Coinbase needs env keys
                      alert(`Credit purchases coming soon! Package: ${pkg.label} for $${(pkg.price_usd / 100).toFixed(2)}`)
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: font.sans, fontSize: 15, fontWeight: 700, color: c.text }}>{pkg.label}</span>
                        {pkg.popular && (
                          <span style={{ fontFamily: font.sans, fontSize: 9, fontWeight: 700, color: c.pink, background: c.pinkDim, padding: '2px 6px', borderRadius: 3 }}>POPULAR</span>
                        )}
                      </div>
                      {pkg.bonus_pct > 0 && (
                        <div style={{ fontFamily: font.sans, fontSize: 11, color: c.green }}>
                          +{pkg.bonus_pct}% bonus = {total.toLocaleString()} CR total
                        </div>
                      )}
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 700, color: c.text }}>
                      ${(pkg.price_usd / 100).toFixed(2)}
                    </span>
                  </button>
                )
              })}
            </div>

            <div style={{ fontFamily: font.sans, fontSize: 10, color: c.text4, textAlign: 'center' }}>
              Pay with Card, Apple Pay, or Crypto (BTC, ETH, SOL, USDC)
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
