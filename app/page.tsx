'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif"
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace"
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif"

interface LiveLobby {
  id: string
  name: string
  format: string
  status: 'waiting' | 'active'
  invite_code: string | null
  player_count: number
  spectator_count: number
  config: Record<string, unknown>
  current_round?: { number: number; status: string; time_remaining?: number }
  top_trader?: { name: string; return_pct: number }
}

interface LeaderEntry {
  display_name: string
  tr_score: number
  rank_tier: string
  total_wins: number
}

const TIER_COLORS: Record<string, string> = {
  paper_hands: '#555', retail: '#CD7F32', swing_trader: '#C0C0C0',
  market_maker: '#FFD700', whale: '#00BFFF', degen_king: '#F5A0D0', legendary: '#FFF',
}

const LESSONS = [
  { title: 'LEVERAGE 101', desc: 'Why 10x will wreck you (and when it won\'t)', icon: '📊', tag: 'BEGINNER' },
  { title: 'READING CANDLES', desc: 'Decode price action in 60 seconds flat', icon: '🕯', tag: 'BEGINNER' },
  { title: 'RISK MANAGEMENT', desc: 'The only edge that actually matters', icon: '🛡', tag: 'ESSENTIAL' },
  { title: 'SABOTAGE META', desc: 'When to attack, when to defend, when to save', icon: '⚡', tag: 'STRATEGY' },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'JOIN', desc: 'Pick a lobby or hit PLAY NOW. No signup required.', icon: '🎮' },
  { step: '02', title: 'TRADE', desc: 'Trade 60+ assets with live prices. Paper or real.', icon: '📈' },
  { step: '03', title: 'BATTLE', desc: 'Attack rivals. Defend yourself. The crowd bets on you.', icon: '⚔️' },
  { step: '04', title: 'WIN', desc: 'Last trader standing takes the crown and the prize pool.', icon: '🏆' },
]

export default function LandingPage() {
  const router = useRouter()
  const [lobbyCode, setLobbyCode] = useState('')
  const [lobbies, setLobbies] = useState<LiveLobby[]>([])
  const [topTraders, setTopTraders] = useState<LeaderEntry[]>([])
  const [showCode, setShowCode] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/lobbies/active').then(r => r.ok ? r.json() : { lobbies: [] }).then(d => setLobbies(d.lobbies ?? [])).catch(() => {})
    // Top traders by TR score
    // For now use a simple query; API will be built
    fetch('/api/leaderboard/global').then(r => r.ok ? r.json() : { traders: [] }).then(d => setTopTraders(d.traders?.slice(0, 5) ?? [])).catch(() => {})
  }, [])

  const handleJoin = () => {
    const code = lobbyCode.trim().toUpperCase()
    if (!code) return
    router.push(`/register/${code}`)
  }

  const liveLobbies = lobbies.filter(l => l.status === 'active')
  const upcomingLobbies = lobbies.filter(l => l.status === 'waiting')

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button, input { border-radius: 0 !important; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px rgba(245,160,208,0.15)} 50%{box-shadow:0 0 40px rgba(245,160,208,0.35)} }
        .fade-in { animation: fadeIn 0.5s ease both; }
        .fi1 { animation: fadeIn 0.5s ease 0.1s both; opacity:0; }
        .fi2 { animation: fadeIn 0.5s ease 0.2s both; opacity:0; }
        .fi3 { animation: fadeIn 0.5s ease 0.3s both; opacity:0; }
        .fi4 { animation: fadeIn 0.5s ease 0.4s both; opacity:0; }
        .lobby-card:hover { border-color: #F5A0D0 !important; }
        .nav-link:hover { color: #FFF !important; }
        .cta-glow { animation: glow 3s ease-in-out infinite; }
      `}</style>

      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '2px 2px', pointerEvents: 'none', zIndex: 999 }} />

      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column' }}>
        {/* ─── NAV ─── */}
        <nav style={{ height: 56, borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0, background: '#0D0D0D' }}>
          <div onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-icon.png" alt="" style={{ height: 24, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span style={{ fontFamily: B, fontSize: 20, color: '#F5A0D0', letterSpacing: '0.1em' }}>BATTLE TRADE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <a href="/markets" className="nav-link" style={{ fontFamily: B, fontSize: 14, color: '#888', letterSpacing: '0.08em', textDecoration: 'none', transition: 'color 150ms' }}>MARKETS</a>
            <a href="/learn" className="nav-link" style={{ fontFamily: B, fontSize: 14, color: '#888', letterSpacing: '0.08em', textDecoration: 'none', transition: 'color 150ms' }}>LEARN</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showCode ? (
              <div style={{ display: 'flex', gap: 0 }}>
                <input ref={inputRef} type="text" value={lobbyCode} onChange={e => setLobbyCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleJoin()} placeholder="CODE" autoFocus
                  style={{ width: 120, height: 36, background: '#111', border: '1px solid #333', borderRight: 'none', color: '#F5A0D0', fontFamily: M, fontSize: 13, textAlign: 'center', letterSpacing: '0.1em', outline: 'none', padding: '0 8px' }} />
                <button onClick={handleJoin} style={{ height: 36, padding: '0 16px', background: lobbyCode.trim() ? '#F5A0D0' : '#222', color: lobbyCode.trim() ? '#0A0A0A' : '#666', border: 'none', fontFamily: B, fontSize: 14, letterSpacing: '0.08em', cursor: 'pointer' }}>GO</button>
              </div>
            ) : (
              <button onClick={() => setShowCode(true)} style={{ fontFamily: B, fontSize: 13, letterSpacing: '0.08em', color: '#888', background: 'transparent', border: '1px solid #333', padding: '8px 16px', cursor: 'pointer' }}>HAVE A CODE?</button>
            )}
            <button onClick={() => router.push('/profile')} style={{ fontFamily: B, fontSize: 13, letterSpacing: '0.08em', color: '#888', background: 'transparent', border: '1px solid #333', padding: '8px 16px', cursor: 'pointer' }}>PROFILE</button>
            <button onClick={() => router.push('/markets')} className="cta-glow" style={{ fontFamily: B, fontSize: 14, letterSpacing: '0.1em', color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '8px 20px', cursor: 'pointer' }}>PLAY NOW</button>
          </div>
        </nav>

        {/* ─── HERO ─── */}
        <section style={{ position: 'relative', padding: '80px 32px 60px', textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'linear-gradient(#F5A0D0 1px, transparent 1px), linear-gradient(90deg, #F5A0D0 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

          <div className="fade-in" style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: S, fontSize: 11, color: '#F5A0D0', letterSpacing: '0.3em', border: '1px solid rgba(245,160,208,0.3)', display: 'inline-block', padding: '6px 16px', marginBottom: 24 }}>
              THE FUTURE OF FINANCE IS MULTIPLAYER
            </div>
          </div>

          <h1 className="fi1" style={{ fontFamily: B, fontSize: 'clamp(56px, 11vw, 130px)', color: 'white', lineHeight: 0.9, letterSpacing: '0.02em', position: 'relative', zIndex: 1 }}>
            TRADE. ATTACK.<br />SURVIVE.
          </h1>

          <p className="fi2" style={{ fontFamily: S, fontSize: 16, color: '#999', maxWidth: 500, lineHeight: 1.6, margin: '28px auto 0', position: 'relative', zIndex: 1 }}>
            Compete head-to-head in live trading battles. Sabotage rivals. The crowd decides who wins. Welcome to the arena.
          </p>

          <div className="fi3" style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 40, position: 'relative', zIndex: 1 }}>
            <button onClick={() => router.push('/markets')} className="cta-glow" style={{ fontFamily: B, fontSize: 28, letterSpacing: '0.1em', color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '16px 48px', cursor: 'pointer' }}>
              PLAY NOW
            </button>
            {liveLobbies.length > 0 && (
              <button onClick={() => router.push(`/lobby/${liveLobbies[0].id}/spectate`)} style={{ fontFamily: B, fontSize: 28, letterSpacing: '0.1em', color: '#F5A0D0', background: 'transparent', border: '2px solid #F5A0D0', padding: '16px 40px', cursor: 'pointer' }}>
                WATCH LIVE
              </button>
            )}
          </div>

          {/* Stats strip */}
          <div className="fi4" style={{ display: 'flex', gap: 48, justifyContent: 'center', marginTop: 60, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
            {[
              { value: '60+', label: 'TRADEABLE ASSETS' },
              { value: 'LIVE', label: 'PRICE FEEDS' },
              { value: '7', label: 'ATTACK WEAPONS' },
              { value: '5', label: 'DEFENSE SHIELDS' },
              { value: String(liveLobbies.length || '—'), label: 'LIVE NOW' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: B, fontSize: 28, color: '#F5A0D0', letterSpacing: '0.05em' }}>{s.value}</div>
                <div style={{ fontFamily: S, fontSize: 9, color: '#888', letterSpacing: '0.15em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── LIVE NOW ─── */}
        {liveLobbies.length > 0 && (
          <section style={{ borderTop: '1px solid #1A1A1A', padding: '48px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1100, margin: '0 auto 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, background: '#00FF88', animation: 'pulse 2s infinite' }} />
                <h2 style={{ fontFamily: B, fontSize: 32, color: 'white', letterSpacing: '0.05em' }}>LIVE NOW</h2>
              </div>
              <a href="/markets" style={{ fontFamily: S, fontSize: 12, color: '#F5A0D0', textDecoration: 'none' }}>VIEW ALL →</a>
            </div>
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', maxWidth: 1100, margin: '0 auto', paddingBottom: 8 }}>
              {liveLobbies.map(l => (
                <div key={l.id} className="lobby-card" onClick={() => router.push(`/lobby/${l.id}`)} style={{ minWidth: 300, padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A', cursor: 'pointer', transition: 'border-color 150ms', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontFamily: B, fontSize: 20, color: '#FFF', letterSpacing: '0.05em' }}>{l.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, background: '#00FF88', animation: 'pulse 2s infinite' }} />
                      <span style={{ fontFamily: M, fontSize: 10, color: '#00FF88' }}>LIVE</span>
                    </div>
                  </div>
                  <div style={{ fontFamily: S, fontSize: 12, color: '#888', marginBottom: 8 }}>
                    {l.player_count} players · {l.spectator_count} watching
                  </div>
                  {l.top_trader && (
                    <div style={{ fontFamily: M, fontSize: 13, color: l.top_trader.return_pct >= 0 ? '#00FF88' : '#FF3333', marginBottom: 12 }}>
                      #1 {l.top_trader.name} {l.top_trader.return_pct >= 0 ? '+' : ''}{l.top_trader.return_pct.toFixed(1)}%
                    </div>
                  )}
                  {l.current_round && (
                    <div style={{ fontFamily: M, fontSize: 11, color: '#666' }}>
                      R{l.current_round.number} · {l.current_round.status.toUpperCase()}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button onClick={e => { e.stopPropagation(); router.push(`/lobby/${l.id}/spectate`) }} style={{ flex: 1, height: 36, background: 'transparent', border: '1px solid #333', color: '#888', fontFamily: B, fontSize: 13, letterSpacing: '0.08em', cursor: 'pointer' }}>WATCH</button>
                    <button onClick={e => { e.stopPropagation(); router.push(`/lobby/${l.id}`) }} style={{ flex: 1, height: 36, background: '#F5A0D0', border: 'none', color: '#0A0A0A', fontFamily: B, fontSize: 13, letterSpacing: '0.08em', cursor: 'pointer' }}>JOIN</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── UPCOMING ─── */}
        {upcomingLobbies.length > 0 && (
          <section style={{ borderTop: '1px solid #1A1A1A', padding: '48px 24px' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
              <h2 style={{ fontFamily: B, fontSize: 32, color: 'white', letterSpacing: '0.05em', marginBottom: 24 }}>STARTING SOON</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {upcomingLobbies.slice(0, 6).map(l => {
                  const fee = (l.config?.entry_fee as number) ?? 0
                  return (
                    <div key={l.id} className="lobby-card" onClick={() => router.push(`/lobby/${l.id}`)} style={{ padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A', cursor: 'pointer', transition: 'border-color 150ms' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontFamily: B, fontSize: 18, color: '#FFF', letterSpacing: '0.05em' }}>{l.name}</span>
                        <span style={{ fontFamily: M, fontSize: 10, color: '#FFD700' }}>UPCOMING</span>
                      </div>
                      <div style={{ fontFamily: S, fontSize: 12, color: '#888', marginBottom: 4 }}>
                        {l.player_count} registered · {l.format.toUpperCase()}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <span style={{ fontFamily: M, fontSize: 12, color: fee > 0 ? '#F5A0D0' : '#00FF88' }}>{fee > 0 ? `$${fee} BUY-IN` : 'FREE'}</span>
                        <button onClick={e => { e.stopPropagation(); router.push(`/lobby/${l.id}`) }} style={{ height: 32, padding: '0 20px', background: '#F5A0D0', border: 'none', color: '#0A0A0A', fontFamily: B, fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer' }}>REGISTER</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* ─── HOW IT WORKS ─── */}
        <section style={{ borderTop: '1px solid #1A1A1A', padding: '64px 24px' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <h2 style={{ fontFamily: B, fontSize: 40, color: 'white', textAlign: 'center', letterSpacing: '0.05em', marginBottom: 48 }}>HOW IT WORKS</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {HOW_IT_WORKS.map(item => (
                <div key={item.step} style={{ padding: 24, border: '1px solid #1A1A1A', background: '#0D0D0D' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 24 }}>{item.icon}</span>
                    <span style={{ fontFamily: M, fontSize: 11, color: '#F5A0D0' }}>{item.step}</span>
                  </div>
                  <h3 style={{ fontFamily: B, fontSize: 22, color: 'white', letterSpacing: '0.05em', marginBottom: 6 }}>{item.title}</h3>
                  <p style={{ fontFamily: S, fontSize: 13, color: '#888', lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── LEARN ─── */}
        <section style={{ borderTop: '1px solid #1A1A1A', padding: '64px 24px' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
              <h2 style={{ fontFamily: B, fontSize: 40, color: 'white', letterSpacing: '0.05em' }}>TRADING ACADEMY</h2>
              <a href="/learn" style={{ fontFamily: S, fontSize: 12, color: '#F5A0D0', textDecoration: 'none' }}>VIEW ALL →</a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {LESSONS.map(l => (
                <div key={l.title} onClick={() => router.push('/learn')} className="lobby-card" style={{ padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A', cursor: 'pointer', transition: 'border-color 150ms' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 24 }}>{l.icon}</span>
                    <span style={{ fontFamily: M, fontSize: 9, color: '#F5A0D0', border: '1px solid rgba(245,160,208,0.3)', padding: '2px 8px' }}>{l.tag}</span>
                  </div>
                  <h3 style={{ fontFamily: B, fontSize: 18, color: 'white', letterSpacing: '0.05em', marginBottom: 6 }}>{l.title}</h3>
                  <p style={{ fontFamily: S, fontSize: 12, color: '#888', lineHeight: 1.4 }}>{l.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── LEADERBOARD + COMMUNITY ─── */}
        <section style={{ borderTop: '1px solid #1A1A1A', padding: '64px 24px' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            {/* Global Leaderboard */}
            <div>
              <h2 style={{ fontFamily: B, fontSize: 32, color: 'white', letterSpacing: '0.05em', marginBottom: 24 }}>TOP TRADERS</h2>
              <div style={{ border: '1px solid #1A1A1A', background: '#0D0D0D' }}>
                {topTraders.length > 0 ? topTraders.map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < topTraders.length - 1 ? '1px solid #111' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontFamily: M, fontSize: 14, color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#666', width: 24 }}>#{i + 1}</span>
                      <span style={{ fontFamily: B, fontSize: 16, color: '#FFF', letterSpacing: '0.05em' }}>{t.display_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontFamily: M, fontSize: 12, color: TIER_COLORS[t.rank_tier] ?? '#888' }}>TR {t.tr_score}</span>
                      <span style={{ fontFamily: M, fontSize: 11, color: '#888' }}>{t.total_wins}W</span>
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <span style={{ fontFamily: S, fontSize: 13, color: '#555' }}>Play your first game to appear here</span>
                  </div>
                )}
              </div>
              <a href="/leaderboard" style={{ fontFamily: S, fontSize: 12, color: '#F5A0D0', textDecoration: 'none', display: 'block', marginTop: 12 }}>FULL LEADERBOARD →</a>
            </div>

            {/* Choose Your Role */}
            <div>
              <h2 style={{ fontFamily: B, fontSize: 32, color: 'white', letterSpacing: '0.05em', marginBottom: 24 }}>CHOOSE YOUR ROLE</h2>
              {[
                { title: 'COMPETITOR', desc: 'Trade to survive. Deploy attacks. Climb the leaderboard.', color: '#00FF88', cta: 'COMPETE', href: '/markets' },
                { title: 'SPECTATOR', desc: 'Watch. Bet. Buy weapons. Influence the outcome.', color: '#F5A0D0', cta: 'SPECTATE', href: '/markets' },
                { title: 'HOST', desc: 'Create lobbies. Run events. Control the show.', color: '#FFD700', cta: 'CREATE', href: '/create' },
              ].map(r => (
                <div key={r.title} onClick={() => router.push(r.href)} className="lobby-card" style={{ padding: 16, border: `1px solid ${r.color}33`, background: '#0D0D0D', marginBottom: 8, cursor: 'pointer', transition: 'border-color 150ms', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontFamily: B, fontSize: 20, color: r.color, letterSpacing: '0.05em' }}>{r.title}</h3>
                    <p style={{ fontFamily: S, fontSize: 12, color: '#888', marginTop: 2 }}>{r.desc}</p>
                  </div>
                  <span style={{ fontFamily: B, fontSize: 13, color: r.color, letterSpacing: '0.08em', flexShrink: 0 }}>{r.cta} →</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FOOTER ─── */}
        <footer style={{ borderTop: '1px solid #1A1A1A', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: B, fontSize: 14, color: '#555', letterSpacing: '0.1em' }}>BATTLE TRADE</span>
          <div style={{ display: 'flex', gap: 20 }}>
            {['ABOUT', 'DOCS', 'DISCORD', 'X'].map(l => (
              <a key={l} href="#" style={{ fontFamily: S, fontSize: 11, color: '#555', textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
          <span style={{ fontFamily: S, fontSize: 10, color: '#333', letterSpacing: '0.08em' }}>POWERED BY CRACKED LABS</span>
        </footer>
      </div>
    </>
  )
}
