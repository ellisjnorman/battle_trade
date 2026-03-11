'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { font, c, tierColor, tierName } from '@/app/design'
import { ATTACKS, DEFENSES } from '@/lib/weapons'

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
  current_round?: { number: number; status: string }
  top_trader?: { name: string; return_pct: number }
}
interface TopTrader {
  id: string; display_name: string; tr_score: number; rank_tier: string
  total_wins: number; win_rate: number; best_return: number
}

interface MyLobby {
  id: string; name: string; status: string; player_count: number; spectator_count: number
  created_at: string
}
interface PeriodLeaderboard {
  period: string; traders: TopTrader[]; payouts: Record<string, number>; resets_at: string
}
type LobbyFilter = 'all' | 'live' | 'open' | 'free' | 'paid'
type RightTab = 'leaderboard' | 'cards'
type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all-time'

const ALL_CARDS = [...ATTACKS, ...DEFENSES]

export default function DashboardPage() {
  const router = useRouter()
  const { authenticated, user, ready, logout } = usePrivy()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [traders, setTraders] = useState<TopTrader[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [lobbyFilter, setLobbyFilter] = useState<LobbyFilter>('all')
  const [rightTab, setRightTab] = useState<RightTab>('leaderboard')
  const [myLobbies, setMyLobbies] = useState<MyLobby[]>([])
  const [lbPeriod, setLbPeriod] = useState<LeaderboardPeriod>('weekly')
  const [periodLb, setPeriodLb] = useState<PeriodLeaderboard | null>(null)
  const [quickPlaying, setQuickPlaying] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (!authenticated || !user) { router.push('/login?redirect=/dashboard'); return }
    setAuthReady(true)
  }, [ready, authenticated, user, router])

  useEffect(() => {
    if (!authReady || !user) return
    let cancelled = false
    const load = async () => {
      let pid = localStorage.getItem('bt_profile_id')
      if (!pid) { try { const p = await getOrCreateProfile(user); if (p) { pid = p.id; localStorage.setItem('bt_profile_id', p.id) } } catch {} }
      if (pid) {
        const r = await fetch(`/api/profile/${pid}`).catch(() => null)
        if (r?.ok) {
          const d = await r.json()
          if (!cancelled && d?.profile) setProfile(d.profile)
        } else if (!cancelled) {
          // Stale ID — clear and retry
          localStorage.removeItem('bt_profile_id')
          try { const p = await getOrCreateProfile(user); if (p) { localStorage.setItem('bt_profile_id', p.id); const r2 = await fetch(`/api/profile/${p.id}`); if (r2.ok) { const d2 = await r2.json(); if (d2?.profile) setProfile(d2.profile) } } } catch {}
        }
      }
      fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] }).then(d => { if (!cancelled) setLobbies(d.lobbies ?? []) }).catch(() => {})
      fetch('/api/leaderboard/global?limit=20').then(r => r.ok ? r.json() : { traders: [] }).then(d => { if (!cancelled) setTraders(d.traders ?? []) }).catch(() => {})
      if (pid) {
        fetch(`/api/lobbies/mine?profile_id=${pid}`).then(r => r.ok ? r.json() : { lobbies: [] }).then(d => { if (!cancelled) setMyLobbies(d.lobbies ?? []) }).catch(() => {})
      }
    }
    load()
    const i = setInterval(() => {
      fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] }).then(d => setLobbies(d.lobbies ?? [])).catch(() => {})
    }, 5000)
    return () => { cancelled = true; clearInterval(i) }
  }, [authReady, user])

  // Fetch period leaderboard when tab/period changes
  useEffect(() => {
    if (rightTab !== 'leaderboard') return
    fetch(`/api/leaderboard/periods?period=${lbPeriod}&limit=20`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPeriodLb(d) })
      .catch(() => {})
  }, [rightTab, lbPeriod])

  const handleQuickPlay = async () => {
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
  }

  const live = lobbies.filter(b => b.status === 'active')
  const totalOnline = lobbies.reduce((a, b) => a + b.player_count + b.spectator_count, 0)

  const filteredLobbies = lobbies.filter(l => {
    if (lobbyFilter === 'live') return l.status === 'active'
    if (lobbyFilter === 'open') return l.status === 'waiting'
    if (lobbyFilter === 'free') return !((l.config?.entry_fee as number) > 0)
    if (lobbyFilter === 'paid') return (l.config?.entry_fee as number) > 0
    return true
  })

  const playHref = live.length > 0 ? `/lobby/${live[0].id}` : lobbies.length > 0 ? `/lobby/${lobbies[0].id}` : '/create'

  const tCol = tierColor(profile?.rank_tier)
  const wr = profile ? profile.win_rate * 100 : 0
  const myRank = profile ? traders.findIndex(t => t.id === profile.id) : -1

  return (
    <div style={{ height: '100vh', background: '#080808', color: '#FFF', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::selection{background:rgba(245,160,208,.2)}
        html{-webkit-font-smoothing:antialiased}
        button,a{-webkit-tap-highlight-color:transparent}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.15}}
        @keyframes breathe{0%,100%{box-shadow:0 0 20px rgba(245,160,208,.06)}50%{box-shadow:0 0 40px rgba(245,160,208,.15),0 0 80px rgba(245,160,208,.04)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes shine{0%{left:-100%}45%{left:120%}100%{left:120%}}
        .skel{background:linear-gradient(90deg,#151515 25%,#1E1E1E 50%,#151515 75%);background-size:200% 100%;animation:shimmer 1.5s ease-in-out infinite;border-radius:12px}
        .row-h{transition:background .08s}
        .row-h:hover{background:rgba(255,255,255,.03)!important}
        .fpill{font-family:${font.sans};font-size:11px;font-weight:500;padding:5px 14px;border-radius:99px;cursor:pointer;transition:all .12s;border:1px solid transparent}
        .fpill:hover{border-color:#333!important}
        .tag{font-family:${font.mono};font-size:9px;font-weight:600;padding:2px 7px;border-radius:3px;letter-spacing:.03em}
        .dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
        .play-btn{position:relative;overflow:hidden;cursor:pointer;border:none;text-decoration:none;width:100%;padding:16px;font-family:${font.display};font-size:22px;letter-spacing:.05em;color:#0A0A0A;background:linear-gradient(135deg,#F5A0D0,#E88BC0);animation:breathe 3s ease-in-out infinite;display:flex;align-items:center;justify-content:center;gap:10px;transition:all .12s;border-radius:12px;flex-shrink:0}
        .play-btn:hover{filter:brightness(1.08)}
        .play-btn:active{transform:scale(.98);animation:none}
        .play-btn::after{content:'';position:absolute;top:0;left:-100%;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent);animation:shine 4s ease-in-out infinite}
        .card{background:#111;border:1px solid #1E1E1E;border-radius:12px;overflow:hidden}
        .card-hd{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #1A1A1A}
        .sec-t{font-family:${font.sans};font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.06em}
        .sec-a{font-family:${font.sans};font-size:10px;color:#999;text-decoration:none}
        .sec-a:hover{color:#CCC}
        .tab-btn{font-family:${font.sans};font-size:11px;font-weight:600;padding:6px 14px;border-radius:8px;cursor:pointer;border:none;transition:all .12s}

        @media(min-width:900px){html,body{overflow:hidden;height:100vh}}
        @media(max-width:899px){
          html,body{overflow:auto;height:auto}
          .dash-wrap{height:auto!important;overflow:auto!important}
          .dash-body{flex-direction:column!important;overflow:auto!important}
          .left-col,.center-col,.right-col{width:100%!important;min-width:0!important;max-height:none!important;overflow:visible!important;border:none!important}
          .left-col{order:2}.center-col{order:1}.right-col{order:3}
          .center-col{padding-bottom:80px!important}
        }
      `}</style>

      {/* ══ NAV ══ */}
      <nav style={{
        height: 48, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', borderBottom: '1px solid #1A1A1A', background: '#080808', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="BT" style={{ height: 24, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </Link>
          <div style={{ display: 'flex', gap: 16 }}>
            {[{ l: 'Home', href: '/dashboard', on: true }, { l: 'Lab', href: '/lab', on: false }, { l: 'Learn', href: '/learn', on: false }].map(n => (
              <Link key={n.l} href={n.href} style={{ fontFamily: font.sans, fontSize: 13, fontWeight: n.on ? 600 : 400, color: n.on ? '#FFF' : '#999', textDecoration: 'none' }}>{n.l}</Link>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {totalOnline > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div className="dot" style={{ width: 5, height: 5, background: c.green, animation: 'pulse 1.6s infinite' }} />
              <span style={{ fontFamily: font.mono, fontSize: 10, color: c.green }}>{totalOnline}</span>
            </div>
          )}
          {profile && (
            <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', background: '#111', border: '1px solid #1E1E1E', borderRadius: 20, padding: '2px 10px 2px 2px' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#1A1A1A', border: `2px solid ${tCol}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontFamily: font.display, color: tCol }}>{profile.display_name?.[0]?.toUpperCase() || '?'}</div>
              <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: c.pink }}>{profile.credits}</span>
            </Link>
          )}
          <Link href="/create" style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 600, color: c.bg, background: c.pink, padding: '7px 16px', borderRadius: 8, textDecoration: 'none' }}>Create Lobby</Link>
        </div>
      </nav>

      {!authReady ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="skel" style={{ width: 300, height: 200 }} /></div>
      ) : (
        <div className="dash-body" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* ──── LEFT: Profile + Stats + Nav ──── */}
          <div className="left-col" style={{ width: 300, minWidth: 300, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', borderRight: '1px solid #1A1A1A' }}>
            {profile ? (<>
              <div className="card">
                <div style={{ padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Link href="/profile" style={{ textDecoration: 'none' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#1A1A1A', border: `3px solid ${tCol}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontFamily: font.display, color: tCol }}>{profile.display_name[0]?.toUpperCase()}</div>
                    </Link>
                    <div>
                      <Link href="/profile" style={{ fontFamily: font.sans, fontSize: 15, fontWeight: 700, color: '#FFF', textDecoration: 'none', display: 'block' }}>{profile.display_name}</Link>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span className="tag" style={{ color: tCol, background: `${tCol}15` }}>{tierName(profile.rank_tier).toUpperCase()}</span>
                        {myRank >= 0 && <span style={{ fontFamily: font.mono, fontSize: 10, color: '#999' }}>#{myRank + 1}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 44, fontWeight: 700, color: '#FFF', lineHeight: 1 }}>{profile.tr_score}</span>
                    <span style={{ fontFamily: font.sans, fontSize: 10, color: '#999' }}>TR</span>
                  </div>
                  <div style={{ height: 3, background: '#1A1A1A', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: `linear-gradient(90deg, ${tCol}, ${tCol}66)`, width: `${Math.min(100, profile.tr_score % 100)}%` }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { l: 'WINS', v: profile.total_wins, col: c.green },
                  { l: 'WIN RATE', v: `${wr.toFixed(0)}%`, col: wr >= 50 ? c.green : '#999' },
                  { l: 'BEST TRADE', v: `${profile.best_return >= 0 ? '+' : ''}${profile.best_return.toFixed(0)}%`, col: profile.best_return >= 0 ? c.green : c.red },
                  { l: 'LOBBIES', v: profile.total_lobbies_played, col: '#BBB' },
                ].map(s => (
                  <div key={s.l} className="card" style={{ padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: s.col, lineHeight: 1 }}>{s.v}</div>
                    <div style={{ fontFamily: font.sans, fontSize: 8, color: '#999', textTransform: 'uppercase', marginTop: 4 }}>{s.l}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
                <div>
                  <div style={{ fontFamily: font.sans, fontSize: 9, color: '#999', textTransform: 'uppercase' }}>Credits</div>
                  <div style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: c.pink }}>{profile.credits}</div>
                </div>
                <Link href="/profile" style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.bg, background: c.pink, padding: '6px 12px', borderRadius: 6, textDecoration: 'none' }}>Get Credits</Link>
              </div>
            </>) : (
              <div className="card" style={{ padding: 20, textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#1A1A1A', border: '3px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontFamily: font.display, color: '#888', margin: '0 auto 12px' }}>?</div>
                <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: '#CCC', marginBottom: 4 }}>Welcome</div>
                <div style={{ fontFamily: font.sans, fontSize: 11, color: '#999', marginBottom: 14 }}>Loading your profile...</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {['WINS', 'WIN RATE', 'BEST TRADE', 'LOBBIES'].map(l => (
                    <div key={l} style={{ background: '#0C0C0C', borderRadius: 8, padding: '8px', textAlign: 'center', border: '1px solid #1A1A1A' }}>
                      <div style={{ fontFamily: font.mono, fontSize: 16, fontWeight: 700, color: '#555' }}>—</div>
                      <div style={{ fontFamily: font.sans, fontSize: 8, color: '#888', textTransform: 'uppercase', marginTop: 3 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Start / TODO */}
            <div className="card">
              <div className="card-hd"><span className="sec-t">Quick Start</span></div>
              {(() => {
                const hasPlayed = profile ? profile.total_lobbies_played > 0 : false
                const hasWin = profile ? profile.total_wins > 0 : false
                const tasks = [
                  { done: !!profile, label: 'Create your profile', href: '/profile' },
                  { done: hasPlayed, label: 'Join your first lobby', href: lobbies.length > 0 ? `/lobby/${lobbies[0].id}` : '/create' },
                  { done: hasPlayed, label: 'Make a trade', href: '/learn' },
                  { done: hasWin, label: 'Win a round', href: '/markets' },
                  { done: profile ? profile.credits > 0 : false, label: 'Earn credits', href: '/learn' },
                ]
                const done = tasks.filter(t => t.done).length
                return (<>
                  <div style={{ padding: '8px 14px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 3, background: '#1A1A1A', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: c.green, width: `${(done / tasks.length) * 100}%`, transition: 'width .3s' }} />
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: '#888', flexShrink: 0 }}>{done}/{tasks.length}</span>
                  </div>
                  {tasks.map((t, i) => (
                    <Link key={i} href={t.href} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: i < tasks.length - 1 ? '1px solid #151515' : 'none', textDecoration: 'none', color: t.done ? '#777' : '#CCC', fontFamily: font.sans, fontSize: 11, fontWeight: 500 }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: t.done ? 'none' : '1.5px solid #333', background: t.done ? c.green : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#FFF', flexShrink: 0 }}>
                        {t.done && '✓'}
                      </div>
                      <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</span>
                    </Link>
                  ))}
                </>)
              })()}
            </div>

            <div className="card">
              {[
                { l: 'Profile & Settings', href: '/profile', col: c.pink },
                { l: 'Leaderboard', href: '/leaderboard', col: c.gold },
                { l: 'Strategy Lab', href: '/lab', col: c.green },
                { l: 'Learn', href: '/learn', col: c.blue },
              ].map((n, i) => (
                <Link key={n.l} href={n.href} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: i < 3 ? '1px solid #1A1A1A' : 'none', textDecoration: 'none', color: '#DDD', fontFamily: font.sans, fontSize: 12, fontWeight: 500 }}>
                  <div className="dot" style={{ background: n.col, width: 8, height: 8 }} />
                  {n.l}
                </Link>
              ))}
            </div>

            <button onClick={() => { localStorage.removeItem('bt_profile_id'); logout() }} style={{ fontFamily: font.sans, fontSize: 10, color: '#777', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 'auto' }}>Sign out</button>
          </div>

          {/* ──── CENTER: Play + Lobbies ──── */}
          <div className="center-col" style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, overflow: 'hidden' }}>
            <button onClick={handleQuickPlay} disabled={quickPlaying} className="play-btn">
              {quickPlaying ? 'FINDING MATCH...' : live.length > 0 ? (
                <>PLAY NOW <span style={{ fontFamily: font.mono, fontSize: 12, background: 'rgba(0,0,0,.15)', padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}><span className="dot" style={{ width: 5, height: 5, background: '#0A0A0A', animation: 'pulse 1.4s infinite' }} />{live.length} LIVE</span></>
              ) : 'PLAY NOW'}
            </button>

            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="card-hd">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="sec-t">LOBBIES</span>
                  {live.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${c.green}15`, padding: '2px 8px', borderRadius: 99 }}>
                      <div className="dot" style={{ width: 4, height: 4, background: c.green, animation: 'pulse 1.6s infinite' }} />
                      <span style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 600, color: c.green }}>{live.length} live</span>
                    </div>
                  )}
                </div>
                <Link href="/create" className="sec-a">+ New lobby</Link>
              </div>
              <div style={{ display: 'flex', gap: 5, padding: '8px 14px', borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
                {(['all', 'live', 'open', 'free', 'paid'] as LobbyFilter[]).map(f => (
                  <button key={f} className="fpill" onClick={() => setLobbyFilter(f)} style={{
                    color: lobbyFilter === f ? c.bg : '#BBB',
                    background: lobbyFilter === f ? c.pink : 'transparent',
                    borderColor: lobbyFilter === f ? c.pink : '#222',
                    textTransform: 'capitalize',
                  }}>{f}</button>
                ))}
              </div>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {filteredLobbies.length > 0 ? filteredLobbies.map(l => {
                  const isLive = l.status === 'active'
                  const fee = (l.config?.entry_fee as number) ?? 0
                  return (
                    <Link key={l.id} href={`/lobby/${l.id}`} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid #1A1A1A', textDecoration: 'none', color: 'inherit' }}>
                      <div className="dot" style={{ width: 10, height: 10, background: isLive ? c.green : '#333', boxShadow: isLive ? `0 0 8px ${c.green}66` : 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: '#FFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                        <div style={{ fontFamily: font.mono, fontSize: 11, color: '#888', marginTop: 2 }}>
                          {l.player_count} players{l.spectator_count > 0 ? ` · ${l.spectator_count} watching` : ''}{l.current_round ? ` · R${l.current_round.number}` : ''}
                        </div>
                      </div>
                      {l.top_trader && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: font.mono, fontSize: 14, fontWeight: 700, color: l.top_trader.return_pct >= 0 ? c.green : c.red }}>
                            {l.top_trader.return_pct >= 0 ? '+' : ''}{l.top_trader.return_pct.toFixed(1)}%
                          </div>
                          <div style={{ fontFamily: font.mono, fontSize: 10, color: '#999' }}>{l.top_trader.name}</div>
                        </div>
                      )}
                      <span className="tag" style={{ color: fee > 0 ? c.pink : c.green, background: fee > 0 ? `${c.pink}15` : `${c.green}15` }}>{fee > 0 ? `$${fee}` : 'FREE'}</span>
                      {isLive && <span style={{ fontFamily: font.sans, fontSize: 9, fontWeight: 600, color: c.bg, background: c.green, padding: '2px 6px', borderRadius: 3 }}>LIVE</span>}
                    </Link>
                  )
                }) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32, textAlign: 'center' }}>
                    <div style={{ fontFamily: font.display, fontSize: 24, color: '#777', marginBottom: 8 }}>NO ACTIVE LOBBIES</div>
                    <div style={{ fontFamily: font.sans, fontSize: 13, color: '#999', marginBottom: 16 }}>Create a lobby and invite your friends</div>
                    <Link href="/create" style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.bg, background: c.pink, padding: '10px 28px', borderRadius: 8, textDecoration: 'none' }}>Create Lobby</Link>
                  </div>
                )}
              </div>
            </div>

            {/* My Lobbies — admin quick access */}
            {myLobbies.length > 0 && (
              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-hd">
                  <span className="sec-t">MY LOBBIES</span>
                  <Link href="/create" className="sec-a">+ New</Link>
                </div>
                {myLobbies.slice(0, 5).map(l => {
                  const isLive = l.status === 'active'
                  const isWaiting = l.status === 'waiting'
                  return (
                    <div key={l.id} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #1A1A1A' }}>
                      <div className="dot" style={{ width: 8, height: 8, background: isLive ? c.green : isWaiting ? c.gold : '#555' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: '#DDD', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                        <div style={{ fontFamily: font.mono, fontSize: 10, color: '#888' }}>{l.player_count}p · {l.status}</div>
                      </div>
                      <Link href={`/lobby/${l.id}/admin`} style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.pink, background: `${c.pink}15`, padding: '4px 10px', borderRadius: 4, textDecoration: 'none' }}>Admin</Link>
                      <Link href={`/lobby/${l.id}`} style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 500, color: '#999', background: '#1A1A1A', padding: '4px 10px', borderRadius: 4, textDecoration: 'none' }}>View</Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ──── RIGHT: Tabbed — Leaderboard / Playbook ──── */}
          <div className="right-col" style={{ width: 340, minWidth: 340, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', borderLeft: '1px solid #1A1A1A' }}>
            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="tab-btn" onClick={() => setRightTab('cards')} style={{ color: rightTab === 'cards' ? '#FFF' : '#999', background: rightTab === 'cards' ? '#1A1A1A' : 'transparent' }}>Playbook</button>
              <button className="tab-btn" onClick={() => setRightTab('leaderboard')} style={{ color: rightTab === 'leaderboard' ? '#FFF' : '#999', background: rightTab === 'leaderboard' ? '#1A1A1A' : 'transparent' }}>
                Leaderboard{traders.length > 0 && <span style={{ fontFamily: font.mono, fontSize: 9, color: '#999', marginLeft: 4 }}>({traders.length})</span>}
              </button>
            </div>

            {rightTab === 'cards' ? (
              /* ── Playbook: real event cards from lib/weapons.ts ── */
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div className="card-hd">
                  <span className="sec-t">EVENT CARDS — {ALL_CARDS.length}</span>
                  <Link href="/learn" className="sec-a">Learn →</Link>
                </div>
                <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  {/* Events */}
                  <div style={{ padding: '6px 14px 2px', borderBottom: '1px solid #1A1A1A' }}>
                    <span style={{ fontFamily: font.sans, fontSize: 9, fontWeight: 700, color: c.pink, textTransform: 'uppercase', letterSpacing: '.06em' }}>EVENTS ({ATTACKS.length})</span>
                  </div>
                  {ATTACKS.map(w => (
                    <div key={w.id} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #151515' }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'rgba(245,160,208,.06)', border: '1px solid rgba(245,160,208,.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, flexShrink: 0,
                      }}>{w.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: '#DDD' }}>{w.name}</div>
                        <div style={{ fontFamily: font.sans, fontSize: 10, color: '#888' }}>{w.desc}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: c.pink }}>{w.cost}</div>
                        {w.duration > 0 && <div style={{ fontFamily: font.mono, fontSize: 9, color: '#888' }}>{w.duration}s</div>}
                      </div>
                    </div>
                  ))}

                  {/* Counters */}
                  <div style={{ padding: '8px 14px 2px', borderBottom: '1px solid #1A1A1A' }}>
                    <span style={{ fontFamily: font.sans, fontSize: 9, fontWeight: 700, color: c.blue, textTransform: 'uppercase', letterSpacing: '.06em' }}>COUNTERS ({DEFENSES.length})</span>
                  </div>
                  {DEFENSES.map(w => (
                    <div key={w.id} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #151515' }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'rgba(123,147,219,.06)', border: '1px solid rgba(123,147,219,.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, flexShrink: 0,
                      }}>{w.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: '#DDD' }}>{w.name}</div>
                        <div style={{ fontFamily: font.sans, fontSize: 10, color: '#888' }}>{w.desc}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: c.blue }}>{w.cost}</div>
                        {w.duration > 0 && <div style={{ fontFamily: font.mono, fontSize: 9, color: '#888' }}>{w.duration}s</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Leaderboard with periods ── */
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div className="card-hd">
                  <span className="sec-t">LEADERBOARD</span>
                  <Link href="/leaderboard" className="sec-a">Full →</Link>
                </div>
                {/* Period tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
                  {(['daily', 'weekly', 'monthly', 'all-time'] as LeaderboardPeriod[]).map(p => (
                    <button key={p} onClick={() => setLbPeriod(p)} style={{
                      flex: 1, padding: '8px 0', fontFamily: font.sans, fontSize: 10, fontWeight: 600,
                      color: lbPeriod === p ? c.pink : '#888', background: lbPeriod === p ? `${c.pink}08` : 'transparent',
                      border: 'none', borderBottom: lbPeriod === p ? `2px solid ${c.pink}` : '2px solid transparent',
                      cursor: 'pointer', textTransform: 'capitalize',
                    }}>{p === 'all-time' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
                  ))}
                </div>
                {/* Payout banner */}
                {periodLb?.payouts && lbPeriod !== 'all-time' && (
                  <div style={{ display: 'flex', gap: 0, padding: '6px 14px', background: 'rgba(245,160,208,.03)', borderBottom: '1px solid #1A1A1A', flexShrink: 0 }}>
                    {Object.entries(periodLb.payouts).map(([place, amount]) => (
                      <div key={place} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: place === '1st' ? c.gold : place === '2nd' ? '#C0C0C0' : '#CD7F32' }}>{amount}</div>
                        <div style={{ fontFamily: font.sans, fontSize: 8, color: '#888' }}>{place} CR</div>
                      </div>
                    ))}
                    {periodLb.resets_at && (
                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontFamily: font.mono, fontSize: 10, color: '#888' }}>resets</div>
                        <div style={{ fontFamily: font.sans, fontSize: 8, color: '#666' }}>{new Date(periodLb.resets_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                      </div>
                    )}
                  </div>
                )}
                {/* Rankings list */}
                <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  {(() => {
                    const lbTraders = lbPeriod === 'all-time' ? traders : (periodLb?.traders ?? [])
                    return lbTraders.length > 0 ? lbTraders.map((t, i) => {
                      const isMe = profile?.id === t.id
                      const rc = i === 0 ? c.gold : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#888'
                      return (
                        <Link key={t.id} href={`/profile/${t.id}`} className="row-h" style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                          borderBottom: '1px solid #1A1A1A', textDecoration: 'none', color: 'inherit',
                          background: isMe ? 'rgba(245,160,208,.04)' : 'transparent',
                          borderLeft: isMe ? `3px solid ${c.pink}` : '3px solid transparent',
                        }}>
                          <span style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 700, color: rc, width: 18, textAlign: 'right' }}>{i + 1}</span>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1A1A1A', border: `1.5px solid ${tierColor(t.rank_tier)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.sans, fontSize: 9, color: '#BBB', flexShrink: 0 }}>{t.display_name[0]?.toUpperCase()}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: isMe || i < 3 ? 600 : 400, color: isMe ? c.pink : i < 3 ? '#FFF' : '#CCC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.display_name}{isMe ? ' (you)' : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: rc }}>{t.tr_score}</div>
                            <div style={{ fontFamily: font.sans, fontSize: 8, color: '#888' }}>{tierName(t.rank_tier).toUpperCase()}</div>
                          </div>
                        </Link>
                      )
                    }) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, textAlign: 'center' }}>
                        <div style={{ fontFamily: font.sans, fontSize: 14, color: '#999', marginBottom: 8 }}>No rankings yet</div>
                        <div style={{ fontFamily: font.sans, fontSize: 12, color: '#777' }}>Play a lobby to get on the board</div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
