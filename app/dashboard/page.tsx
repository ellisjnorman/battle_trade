'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { getOrCreateProfile } from '@/lib/auth'
import { font, c, tierColor, tierName, globalCSS } from '@/app/design'

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
interface TopTrader {
  id: string; display_name: string; tr_score: number; rank_tier: string
  total_wins: number; win_rate: number; best_return: number
}
interface PeriodLeaderboard {
  period: string; traders: TopTrader[]; payouts: Record<string, number>; resets_at: string
}

type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all-time'

// Simulated live feed for energy when no real activity
const FAKE_FEED = [
  { user: 'wolfpack', text: '10x LONG BTC', col: '#00DC82' },
  { user: 'vega', text: 'BLOCKED BLACKOUT', col: '#7B93DB' },
  { user: 'degen_prime', text: '+47.3% this round', col: '#00DC82' },
  { user: 'iron_hands', text: 'LIQUIDATED', col: '#FF4466' },
  { user: 'moon_boy', text: 'dropped HEADLINE on vega', col: '#F5A0D0' },
  { user: 'anon', text: 'SHORT SOL 5x', col: '#FF4466' },
  { user: 'whale_hunter', text: 'used DARK POOL', col: '#7B93DB' },
  { user: 'paper_hands', text: 'panic closed all', col: '#FF4466' },
  { user: 'sigma', text: '+22.1% portfolio', col: '#00DC82' },
  { user: 'based', text: 'FORCE TRADE on moon_boy', col: '#F5A0D0' },
]

export default function DashboardPage() {
  const router = useRouter()
  const { authenticated, user, ready, logout } = usePrivy()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [traders, setTraders] = useState<TopTrader[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [lbPeriod, setLbPeriod] = useState<LeaderboardPeriod>('weekly')
  const [periodLb, setPeriodLb] = useState<PeriodLeaderboard | null>(null)
  const [quickPlaying, setQuickPlaying] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  const [feed, setFeed] = useState<typeof FAKE_FEED>([])
  const [deployHover, setDeployHover] = useState(false)
  const feedRef = useRef(0)

  // Live feed ticker
  useEffect(() => {
    const i = setInterval(() => {
      feedRef.current = (feedRef.current + 1) % FAKE_FEED.length
      setFeed(prev => [FAKE_FEED[feedRef.current], ...prev].slice(0, 8))
    }, 1800)
    return () => clearInterval(i)
  }, [])

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
        } else if (!cancelled) {
          localStorage.removeItem('bt_profile_id')
          try {
            const p = await getOrCreateProfile(user)
            if (p) {
              localStorage.setItem('bt_profile_id', p.id)
              const r2 = await fetch(`/api/profile/${p.id}`)
              if (r2.ok) { const d2 = await r2.json(); if (d2?.profile) setProfile(d2.profile) }
            }
          } catch {}
        }
      }
      if (!cancelled) setProfileLoading(false)
      fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] }).then(d => { if (!cancelled) setLobbies(d.lobbies ?? []) }).catch(() => {})
      fetch('/api/leaderboard/global?limit=20').then(r => r.ok ? r.json() : { traders: [] }).then(d => { if (!cancelled) setTraders(d.traders ?? []) }).catch(() => {})
    }
    load()
    const i = setInterval(() => {
      fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] }).then(d => setLobbies(d.lobbies ?? [])).catch(() => {})
    }, 5000)
    return () => { cancelled = true; clearInterval(i) }
  }, [authReady, user])

  useEffect(() => {
    fetch(`/api/leaderboard/periods?period=${lbPeriod}&limit=20`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPeriodLb(d) })
      .catch(() => {})
  }, [lbPeriod])

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

  const live = lobbies.filter(b => b.status === 'active')
  const totalOnline = lobbies.reduce((a, b) => a + b.player_count + b.spectator_count, 0)
  const myLobbies = lobbies.filter(l => profile?.id && l.created_by === profile.id)
  const tCol = tierColor(profile?.rank_tier)
  const wr = profile ? profile.win_rate * 100 : 0
  const myRank = profile ? traders.findIndex(t => t.id === profile.id) : -1
  const lbTraders = lbPeriod === 'all-time' ? traders : (periodLb?.traders ?? [])
  const xpPct = profile ? Math.min(100, profile.tr_score % 100) : 0

  return (
    <div style={{ height: '100vh', background: '#050505', color: '#FFF', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{globalCSS}{`
        @keyframes scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
        @keyframes glowPulse{0%,100%{box-shadow:0 0 20px rgba(245,160,208,.1),0 0 60px rgba(245,160,208,.05),inset 0 1px 0 rgba(255,255,255,.06)}50%{box-shadow:0 0 40px rgba(245,160,208,.2),0 0 80px rgba(245,160,208,.08),inset 0 1px 0 rgba(255,255,255,.06)}}
        @keyframes deployPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.01)}}
        @keyframes feedSlide{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
        @keyframes xpFill{from{width:0}to{width:${xpPct}%}}
        @keyframes rankGlow{0%,100%{text-shadow:0 0 12px currentColor}50%{text-shadow:0 0 24px currentColor,0 0 48px currentColor}}
        @keyframes borderSweep{0%{border-color:rgba(245,160,208,.15)}50%{border-color:rgba(245,160,208,.35)}100%{border-color:rgba(245,160,208,.15)}}
        @keyframes gradient{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

        .deploy-btn{
          position:relative;overflow:hidden;cursor:pointer;border:2px solid rgba(245,160,208,.3);
          width:100%;padding:20px;font-family:${font.display};font-size:28px;letter-spacing:.1em;
          color:#FFF;background:linear-gradient(135deg,rgba(245,160,208,.15),rgba(245,160,208,.05));
          animation:glowPulse 3s ease-in-out infinite;
          display:flex;align-items:center;justify-content:center;gap:12px;
          border-radius:14px;flex-shrink:0;transition:all .2s;
          text-shadow:0 0 20px rgba(245,160,208,.5);
        }
        .deploy-btn:hover{
          background:linear-gradient(135deg,rgba(245,160,208,.25),rgba(245,160,208,.1));
          border-color:rgba(245,160,208,.5);transform:translateY(-2px);
          box-shadow:0 0 60px rgba(245,160,208,.2),0 8px 32px rgba(0,0,0,.5);
        }
        .deploy-btn:active{transform:scale(.98);animation:none}
        .deploy-btn::before{
          content:'';position:absolute;top:0;left:-100%;width:40%;height:100%;
          background:linear-gradient(90deg,transparent,rgba(245,160,208,.08),transparent);
          animation:scanline 4s linear infinite;
        }

        .hud-card{
          background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);
          border-radius:12px;overflow:hidden;backdrop-filter:blur(8px);
        }
        .hud-header{
          display:flex;align-items:center;justify-content:space-between;
          padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04);
        }
        .hud-label{
          font-family:${font.mono};font-size:9px;font-weight:700;
          color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.12em;
        }

        .server-row{
          display:flex;align-items:center;gap:12px;padding:10px 14px;
          border-bottom:1px solid rgba(255,255,255,.03);
          transition:all .12s;cursor:pointer;position:relative;
        }
        .server-row:hover{background:rgba(245,160,208,.04)}
        .server-row:hover::before{
          content:'';position:absolute;left:0;top:0;bottom:0;width:2px;
          background:${c.pink};
        }

        .rank-badge{
          font-family:${font.mono};font-size:8px;font-weight:700;
          padding:2px 8px;border-radius:3px;letter-spacing:.08em;
        }

        .xp-bar{height:3px;background:rgba(255,255,255,.04);border-radius:99px;overflow:hidden}
        .xp-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,${c.pink},#FF6B9D);animation:xpFill 1s ease-out both .3s}

        .feed-item{animation:feedSlide .3s ease both;display:flex;align-items:center;gap:8px;padding:5px 14px}

        .period-tab{
          flex:1;padding:8px 0;font-family:${font.mono};font-size:9px;font-weight:700;
          letter-spacing:.06em;border:none;cursor:pointer;transition:all .12s;
          border-bottom:2px solid transparent;text-transform:uppercase;
        }

        .admin-link{
          font-family:${font.mono};font-size:8px;font-weight:700;
          color:${c.pink};background:rgba(245,160,208,.08);border:1px solid rgba(245,160,208,.15);
          padding:4px 10px;border-radius:3px;letter-spacing:.08em;
          text-decoration:none;transition:all .15s;animation:borderSweep 3s ease infinite;
        }
        .admin-link:hover{background:rgba(245,160,208,.15);border-color:rgba(245,160,208,.4)}

        .lb-row{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.03);transition:all .12s;text-decoration:none;color:inherit}
        .lb-row:hover{background:rgba(255,255,255,.02)}

        @media(min-width:900px){html,body{overflow:hidden;height:100vh}}
        @media(max-width:899px){
          html,body{overflow:auto;height:auto}
          .d-grid{grid-template-columns:1fr!important;grid-template-rows:auto!important;height:auto!important;overflow:auto!important}
          .d-grid>*{min-height:0!important;max-height:none!important;overflow:visible!important;border:none!important}
          .col-l{order:1}.col-c{order:2;padding-bottom:80px!important}.col-r{order:3}
        }
      `}</style>

      {/* ══ TOP BAR — minimal HUD ══ */}
      <nav style={{
        height: 48, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,.04)', background: '#050505', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="BT" style={{ height: 24, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </Link>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link href="/dashboard" className="nav-a" style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 600, color: c.pink, textDecoration: 'none', letterSpacing: '.04em' }}>HQ</Link>
            <Link href="/learn" className="nav-a" style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 400, color: c.text4, textDecoration: 'none', letterSpacing: '.04em' }}>LEARN</Link>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {totalOnline > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div className="live-dot" style={{ width: 4, height: 4 }} />
              <span style={{ fontFamily: font.mono, fontSize: 9, color: c.green, letterSpacing: '.06em' }}>{totalOnline} ONLINE</span>
            </div>
          )}
          {profile && (
            <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', background: 'rgba(245,160,208,.06)', border: '1px solid rgba(245,160,208,.1)', borderRadius: 6, padding: '4px 10px 4px 4px' }}>
              <div style={{ width: 20, height: 20, borderRadius: 4, background: `${tCol}15`, border: `1.5px solid ${tCol}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontFamily: font.mono, color: tCol, fontWeight: 700 }}>{profile.display_name?.[0]?.toUpperCase()}</div>
              <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.pink }}>{profile.credits}</span>
              <span style={{ fontFamily: font.mono, fontSize: 8, color: c.text4 }}>CR</span>
            </Link>
          )}
          <Link href="/create" style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: c.bg, background: c.pink, padding: '6px 14px', borderRadius: 6, textDecoration: 'none', letterSpacing: '.04em' }}>+ CREATE</Link>
        </div>
      </nav>

      {/* ══ LIVE TICKER ══ */}
      <div style={{ height: 28, minHeight: 28, borderBottom: '1px solid rgba(255,255,255,.03)', overflow: 'hidden', display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,.01)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, animation: 'tickerScroll 30s linear infinite', whiteSpace: 'nowrap' }}>
          {[...feed, ...feed, ...FAKE_FEED, ...FAKE_FEED].map((f, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
              <span style={{ fontFamily: font.mono, color: c.text4 }}>@{f.user}</span>
              <span style={{ fontFamily: font.mono, color: f.col, fontWeight: 600 }}>{f.text}</span>
            </span>
          ))}
        </div>
      </div>

      {!authReady ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="skeleton" style={{ width: 300, height: 200 }} />
        </div>
      ) : (
        <div className="d-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr 300px', overflow: 'hidden', minHeight: 0 }}>

          {/* ──── LEFT: Player Card ──── */}
          <div className="col-l" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', borderRight: '1px solid rgba(255,255,255,.04)' }}>

            {/* Rank Card */}
            {profileLoading ? (
              <div className="hud-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 8 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: '60%', height: 14, marginBottom: 6 }} />
                    <div className="skeleton" style={{ width: '40%', height: 10 }} />
                  </div>
                </div>
                <div className="skeleton" style={{ width: '45%', height: 40, marginBottom: 8 }} />
                <div className="skeleton" style={{ width: '100%', height: 3 }} />
              </div>
            ) : profile ? (
              <div className="hud-card">
                {/* Player identity */}
                <div style={{ padding: '16px 14px 12px' }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <Link href="/profile" style={{ textDecoration: 'none' }}>
                      <div style={{ width: 52, height: 52, borderRadius: 8, background: `linear-gradient(135deg, ${tCol}20, ${tCol}05)`, border: `2px solid ${tCol}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontFamily: font.display, color: tCol, transition: 'all .2s' }}>
                        {profile.display_name[0]?.toUpperCase()}
                      </div>
                    </Link>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link href="/profile" style={{ fontFamily: font.sans, fontSize: 16, fontWeight: 700, color: '#FFF', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</Link>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span className="rank-badge" style={{ color: tCol, background: `${tCol}15`, border: `1px solid ${tCol}30` }}>{tierName(profile.rank_tier).toUpperCase()}</span>
                        {myRank >= 0 && <span style={{ fontFamily: font.mono, fontSize: 9, color: c.text4 }}>#{myRank + 1}</span>}
                      </div>
                    </div>
                  </div>

                  {/* TR Score — the hero number */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 48, fontWeight: 700, color: '#FFF', lineHeight: 1, animation: 'rankGlow 4s ease infinite', textShadow: `0 0 20px ${tCol}40` }}>{profile.tr_score}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4, letterSpacing: '.08em' }}>XP</span>
                  </div>
                  <div className="xp-bar"><div className="xp-fill" style={{ width: `${xpPct}%` }} /></div>
                </div>

                {/* Combat stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid rgba(255,255,255,.04)' }}>
                  {[
                    { v: profile.total_wins, l: 'WINS', col: c.green },
                    { v: `${wr.toFixed(0)}%`, l: 'WIN RATE', col: wr >= 50 ? c.green : c.red },
                    { v: `${profile.best_return >= 0 ? '+' : ''}${profile.best_return.toFixed(0)}%`, l: 'BEST TRADE', col: profile.best_return >= 0 ? c.green : c.red },
                    { v: profile.total_lobbies_played, l: 'DEPLOYED', col: c.text2 },
                  ].map((s, i) => (
                    <div key={s.l} style={{ padding: '10px 14px', borderRight: i % 2 === 0 ? '1px solid rgba(255,255,255,.04)' : 'none', borderBottom: i < 2 ? '1px solid rgba(255,255,255,.04)' : 'none' }}>
                      <div style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: s.col, lineHeight: 1 }}>{s.v}</div>
                      <div style={{ fontFamily: font.mono, fontSize: 7, color: c.text4, letterSpacing: '.1em', marginTop: 4 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="hud-card" style={{ padding: 20, textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 8, background: 'rgba(255,255,255,.03)', border: '2px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontFamily: font.display, color: c.text4, margin: '0 auto 12px' }}>?</div>
                <div style={{ fontFamily: font.sans, fontSize: 15, fontWeight: 600, color: c.text3, marginBottom: 4 }}>RECRUIT</div>
                <div style={{ fontFamily: font.mono, fontSize: 10, color: c.text4, marginBottom: 12 }}>Deploy to earn your rank</div>
                <div style={{ fontFamily: font.mono, fontSize: 40, fontWeight: 700, color: c.text4, lineHeight: 1 }}>0</div>
                <div style={{ fontFamily: font.mono, fontSize: 8, color: c.text4, letterSpacing: '.1em', marginTop: 4 }}>XP</div>
              </div>
            )}

            {/* Credits / Ammo */}
            {profile && (
              <div className="hud-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
                <div>
                  <div style={{ fontFamily: font.mono, fontSize: 7, color: c.text4, letterSpacing: '.1em' }}>CREDITS</div>
                  <div style={{ fontFamily: font.mono, fontSize: 24, fontWeight: 700, color: c.pink, textShadow: '0 0 12px rgba(245,160,208,.3)' }}>{profile.credits}</div>
                </div>
                <Link href="/profile" style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 700, color: c.pink, background: 'rgba(245,160,208,.08)', border: '1px solid rgba(245,160,208,.15)', padding: '6px 14px', borderRadius: 4, textDecoration: 'none', letterSpacing: '.06em' }}>RESUPPLY</Link>
              </div>
            )}

            {/* Your Battles / Command Center */}
            <div className="hud-card">
              <div className="hud-header">
                <span className="hud-label">COMMAND CENTER</span>
                <Link href="/create" style={{ fontFamily: font.mono, fontSize: 9, color: c.pink, textDecoration: 'none', letterSpacing: '.04em' }}>+ NEW</Link>
              </div>
              {myLobbies.length > 0 ? myLobbies.slice(0, 4).map((l, i) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: i < Math.min(myLobbies.length, 4) - 1 ? '1px solid rgba(255,255,255,.03)' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: l.status === 'active' ? c.green : l.status === 'waiting' ? c.gold : c.text4, boxShadow: l.status === 'active' ? `0 0 6px ${c.green}` : 'none', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 600, color: c.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    <div style={{ fontFamily: font.mono, fontSize: 9, color: c.text4 }}>{l.player_count}p · {l.status}</div>
                  </div>
                  <Link href={`/lobby/${l.id}/admin`} className="admin-link">ADMIN</Link>
                </div>
              )) : (
                <div style={{ padding: '16px 14px', textAlign: 'center' }}>
                  <div style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>No active operations</div>
                </div>
              )}
            </div>

            {/* Nav links */}
            <div className="hud-card">
              {[
                { l: 'PROFILE', href: '/profile', col: c.pink },
                { l: 'TRAINING', href: '/learn', col: c.green },
                { l: 'RANKINGS', href: '/leaderboard', col: c.gold },
              ].map((n, i) => (
                <Link key={n.l} href={n.href} className="row-h" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', textDecoration: 'none', color: c.text3, fontFamily: font.mono, fontSize: 10, fontWeight: 600, letterSpacing: '.06em', borderBottom: i < 2 ? '1px solid rgba(255,255,255,.03)' : 'none' }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: n.col, flexShrink: 0 }} />
                  {n.l}
                </Link>
              ))}
            </div>

            <button onClick={() => { localStorage.removeItem('bt_profile_id'); logout().then(() => router.push('/')) }} style={{ fontFamily: font.mono, fontSize: 9, color: c.text4, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginTop: 'auto', letterSpacing: '.06em' }}>SIGN OUT</button>
          </div>

          {/* ──── CENTER: Deploy + Server Browser ──── */}
          <div className="col-c" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, overflow: 'hidden' }}>
            {/* DEPLOY button */}
            <button
              onClick={handleDeploy}
              disabled={quickPlaying}
              onMouseEnter={() => setDeployHover(true)}
              onMouseLeave={() => setDeployHover(false)}
              className="deploy-btn"
              style={quickPlaying ? { opacity: .7, animation: 'none' } : {}}
            >
              {quickPlaying ? (
                <span style={{ fontFamily: font.mono, fontSize: 14, letterSpacing: '.1em', color: c.pink }}>MATCHMAKING...</span>
              ) : (
                <>
                  <span>{deployHover ? 'FIND MATCH' : 'DEPLOY'}</span>
                  {live.length > 0 && (
                    <span style={{ fontFamily: font.mono, fontSize: 11, background: 'rgba(0,220,130,.15)', color: c.green, padding: '4px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 5, border: '1px solid rgba(0,220,130,.2)' }}>
                      <span className="live-dot" style={{ width: 4, height: 4 }} />{live.length} LIVE
                    </span>
                  )}
                </>
              )}
            </button>

            {/* Server Browser */}
            <div className="hud-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="hud-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="hud-label">SERVER BROWSER</span>
                  <span style={{ fontFamily: font.mono, fontSize: 9, color: c.text4 }}>{lobbies.length} servers</span>
                  {live.length > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: font.mono, fontSize: 9, color: c.green }}>
                      <span className="live-dot" style={{ width: 3, height: 3 }} />{live.length} active
                    </span>
                  )}
                </div>
                <Link href="/create" style={{ fontFamily: font.mono, fontSize: 9, color: c.pink, textDecoration: 'none', letterSpacing: '.04em' }}>+ HOST</Link>
              </div>

              {/* Column headers */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,.04)', flexShrink: 0 }}>
                <span style={{ flex: 1, fontFamily: font.mono, fontSize: 8, color: c.text4, letterSpacing: '.1em' }}>SERVER</span>
                <span style={{ width: 60, fontFamily: font.mono, fontSize: 8, color: c.text4, letterSpacing: '.1em', textAlign: 'center' }}>PLAYERS</span>
                <span style={{ width: 50, fontFamily: font.mono, fontSize: 8, color: c.text4, letterSpacing: '.1em', textAlign: 'center' }}>STATUS</span>
                <span style={{ width: 50, fontFamily: font.mono, fontSize: 8, color: c.text4, letterSpacing: '.1em', textAlign: 'center' }}>FEE</span>
              </div>

              {/* Server rows */}
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {lobbies.length > 0 ? lobbies.map(l => {
                  const isLive = l.status === 'active'
                  const fee = (l.config?.entry_fee as number) ?? 0
                  const isOwner = profile?.id && l.created_by === profile.id
                  return (
                    <div key={l.id} className="server-row" onClick={() => router.push(`/lobby/${l.id}`)}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isLive ? c.green : 'rgba(255,255,255,.1)', boxShadow: isLive ? `0 0 6px ${c.green}` : 'none', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: isLive ? '#FFF' : c.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                          {isOwner && <span style={{ fontFamily: font.mono, fontSize: 7, fontWeight: 700, color: c.pink, background: 'rgba(245,160,208,.08)', padding: '1px 5px', borderRadius: 2, letterSpacing: '.06em' }}>HOST</span>}
                        </div>
                        {l.top_trader && (
                          <div style={{ fontFamily: font.mono, fontSize: 9, color: c.text4, marginTop: 1 }}>
                            <span style={{ color: l.top_trader.return_pct >= 0 ? c.green : c.red }}>{l.top_trader.return_pct >= 0 ? '+' : ''}{l.top_trader.return_pct.toFixed(1)}%</span>
                            <span style={{ marginLeft: 4 }}>{l.top_trader.name}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ width: 60, textAlign: 'center' }}>
                        <span style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 600, color: l.player_count > 0 ? c.text2 : c.text4 }}>{l.player_count}</span>
                        <span style={{ fontFamily: font.mono, fontSize: 9, color: c.text4 }}>/8</span>
                      </div>
                      <div style={{ width: 50, textAlign: 'center' }}>
                        {isLive ? (
                          <span style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 700, color: c.green, background: 'rgba(0,220,130,.1)', padding: '2px 6px', borderRadius: 3 }}>LIVE</span>
                        ) : (
                          <span style={{ fontFamily: font.mono, fontSize: 9, color: c.gold }}>OPEN</span>
                        )}
                      </div>
                      <div style={{ width: 50, textAlign: 'center' }}>
                        <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 600, color: fee > 0 ? c.pink : c.green }}>{fee > 0 ? `$${fee}` : 'FREE'}</span>
                      </div>
                      {isOwner && (
                        <Link href={`/lobby/${l.id}/admin`} onClick={e => e.stopPropagation()} className="admin-link" style={{ flexShrink: 0 }}>ADMIN</Link>
                      )}
                    </div>
                  )
                }) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
                    <div style={{ fontFamily: font.display, fontSize: 28, color: c.text4, marginBottom: 8, letterSpacing: '.04em' }}>NO ACTIVE SERVERS</div>
                    <div style={{ fontFamily: font.mono, fontSize: 11, color: c.text4, marginBottom: 20, letterSpacing: '.02em' }}>Be the first to host a match</div>
                    <Link href="/create" style={{ fontFamily: font.mono, fontSize: 11, fontWeight: 700, color: c.bg, background: c.pink, padding: '10px 28px', borderRadius: 6, textDecoration: 'none', letterSpacing: '.06em' }}>HOST MATCH</Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ──── RIGHT: Live Feed + Leaderboard ──── */}
          <div className="col-r" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', borderLeft: '1px solid rgba(255,255,255,.04)' }}>

            {/* Kill Feed */}
            <div className="hud-card" style={{ flexShrink: 0 }}>
              <div className="hud-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="live-dot" style={{ width: 4, height: 4 }} />
                  <span className="hud-label">LIVE FEED</span>
                </div>
              </div>
              <div style={{ maxHeight: 140, overflow: 'hidden' }}>
                {feed.length > 0 ? feed.slice(0, 5).map((f, i) => (
                  <div key={i} className="feed-item" style={{ borderBottom: '1px solid rgba(255,255,255,.02)' }}>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>@{f.user}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: f.col, fontWeight: 600 }}>{f.text}</span>
                  </div>
                )) : (
                  <div style={{ padding: '16px 14px', textAlign: 'center' }}>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>Waiting for activity...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Leaderboard */}
            <div className="hud-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="hud-header">
                <span className="hud-label">RANKINGS</span>
                <Link href="/leaderboard" style={{ fontFamily: font.mono, fontSize: 9, color: c.pink, textDecoration: 'none' }}>ALL →</Link>
              </div>

              {/* Period tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,.04)', flexShrink: 0 }}>
                {(['daily', 'weekly', 'monthly', 'all-time'] as LeaderboardPeriod[]).map(p => (
                  <button key={p} onClick={() => setLbPeriod(p)} className="period-tab" style={{
                    color: lbPeriod === p ? c.pink : c.text4,
                    background: lbPeriod === p ? 'rgba(245,160,208,.04)' : 'transparent',
                    borderBottomColor: lbPeriod === p ? c.pink : 'transparent',
                  }}>{p === 'all-time' ? 'ALL' : p.slice(0, 3).toUpperCase()}</button>
                ))}
              </div>

              {/* Payout banner */}
              {periodLb?.payouts && lbPeriod !== 'all-time' && (
                <div style={{ display: 'flex', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,.04)', flexShrink: 0, background: 'rgba(245,160,208,.02)' }}>
                  {Object.entries(periodLb.payouts).map(([place, amount]) => (
                    <div key={place} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: place === '1st' ? c.gold : place === '2nd' ? '#C0C0C0' : '#CD7F32' }}>{amount}</div>
                      <div style={{ fontFamily: font.mono, fontSize: 7, color: c.text4, letterSpacing: '.08em' }}>{place} CR</div>
                    </div>
                  ))}
                  {periodLb.resets_at && (
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontFamily: font.mono, fontSize: 9, color: c.text4 }}>RESET</div>
                      <div style={{ fontFamily: font.mono, fontSize: 8, color: c.text4 }}>{new Date(periodLb.resets_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Rankings list */}
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                {lbTraders.length > 0 ? lbTraders.map((t, i) => {
                  const isMe = profile?.id === t.id
                  const medalCol = i === 0 ? c.gold : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : c.text4
                  return (
                    <Link key={t.id} href={`/profile/${t.id}`} className="lb-row" style={{
                      background: isMe ? 'rgba(245,160,208,.04)' : 'transparent',
                      borderLeft: isMe ? `2px solid ${c.pink}` : '2px solid transparent',
                    }}>
                      <span style={{ fontFamily: font.mono, fontSize: 10, fontWeight: 700, color: medalCol, width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ width: 24, height: 24, borderRadius: 4, background: `${tierColor(t.rank_tier)}10`, border: `1px solid ${tierColor(t.rank_tier)}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: font.mono, fontSize: 9, fontWeight: 700, color: tierColor(t.rank_tier), flexShrink: 0 }}>{t.display_name[0]?.toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: isMe || i < 3 ? 600 : 400, color: isMe ? c.pink : i < 3 ? '#FFF' : c.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.display_name}{isMe ? ' ←' : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: font.mono, fontSize: 12, fontWeight: 700, color: medalCol }}>{t.tr_score}</div>
                        <div style={{ fontFamily: font.mono, fontSize: 7, color: c.text4, letterSpacing: '.06em' }}>{tierName(t.rank_tier).toUpperCase()}</div>
                      </div>
                    </Link>
                  )
                }) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, textAlign: 'center' }}>
                    <div style={{ fontFamily: font.display, fontSize: 18, color: c.text4, marginBottom: 4 }}>NO RANKS YET</div>
                    <div style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>Deploy to earn your place</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
