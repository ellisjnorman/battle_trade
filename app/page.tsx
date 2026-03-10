'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()
  const [lobbyCode, setLobbyCode] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleJoin = () => {
    const code = lobbyCode.trim().toUpperCase()
    if (!code) return
    router.push(`/register/${code}`)
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button, input { border-radius: 0 !important; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .fade-in { animation: fadeIn 0.6s ease-out forwards; }
        .fade-in-delay { animation: fadeIn 0.6s ease-out 0.2s forwards; opacity: 0; }
        .fade-in-delay-2 { animation: fadeIn 0.6s ease-out 0.4s forwards; opacity: 0; }
        .fade-in-delay-3 { animation: fadeIn 0.6s ease-out 0.6s forwards; opacity: 0; }
      `}</style>

      {/* Scanlines */}
      <div style={{ position: 'fixed', inset: 0, background: 'repeating-linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '2px 2px', pointerEvents: 'none', zIndex: 999 }} />

      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column' }}>
        {/* Nav */}
        <nav style={{ height: 56, borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-main.png" alt="Battle Trade" style={{ height: 40, width: 'auto' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span style={{ fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif", fontSize: 22, color: '#F5A0D0', letterSpacing: '0.1em' }}>BATTLE TRADE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => router.push('/profile')}
              style={{
                fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif",
                fontSize: 16,
                letterSpacing: '0.1em',
                color: '#888',
                backgroundColor: 'transparent',
                border: '1px solid #333',
                padding: '8px 20px',
                cursor: 'pointer',
              }}
            >
              PROFILE
            </button>
            <button
              onClick={() => router.push('/create')}
              style={{
                fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif",
                fontSize: 16,
                letterSpacing: '0.1em',
                color: '#FFF',
                backgroundColor: '#222',
                border: '1px solid #333',
                padding: '8px 20px',
                cursor: 'pointer',
              }}
            >
              CREATE LOBBY
            </button>
            <button
              onClick={() => inputRef.current?.focus()}
              style={{
                fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif",
                fontSize: 16,
                letterSpacing: '0.1em',
                color: '#0A0A0A',
                backgroundColor: '#F5A0D0',
                border: 'none',
                padding: '8px 24px',
                cursor: 'pointer',
              }}
            >
              JOIN LOBBY
            </button>
          </div>
        </nav>

        {/* Hero */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 32px', textAlign: 'center', position: 'relative' }}>
          {/* Background grid effect */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.03,
            backgroundImage: 'linear-gradient(#F5A0D0 1px, transparent 1px), linear-gradient(90deg, #F5A0D0 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            pointerEvents: 'none',
          }} />

          <div className="fade-in" style={{ position: 'relative', zIndex: 1 }}>
            <div style={{
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              fontSize: 11,
              color: '#F5A0D0',
              letterSpacing: '0.3em',
              marginBottom: 24,
              border: '1px solid #F5A0D0',
              display: 'inline-block',
              padding: '6px 16px',
            }}>
              THE FUTURE OF FINANCE IS MULTIPLAYER
            </div>
          </div>

          <h1 className="fade-in-delay" style={{
            fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif",
            fontSize: 'clamp(60px, 12vw, 140px)',
            color: 'white',
            lineHeight: 0.9,
            letterSpacing: '0.02em',
            position: 'relative',
            zIndex: 1,
          }}>
            TRADING AS<br />A SPECTATOR<br />SPORT
          </h1>

          <p className="fade-in-delay-2" style={{
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            fontSize: 16,
            color: '#999',
            maxWidth: 520,
            lineHeight: 1.6,
            marginTop: 32,
            position: 'relative',
            zIndex: 1,
          }}>
            Compete head-to-head in live trading battles. Sabotage your rivals. Get sabotaged back. The crowd bets on who wins. Welcome to the arena.
          </p>

          <div className="fade-in-delay-3" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 48, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', gap: 0, width: '100%', maxWidth: 440 }}>
              <input
                ref={inputRef}
                type="text"
                value={lobbyCode}
                onChange={e => setLobbyCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="ENTER LOBBY CODE"
                style={{
                  flex: 1,
                  height: 64,
                  backgroundColor: '#111',
                  border: '2px solid #1A1A1A',
                  borderRight: 'none',
                  color: '#F5A0D0',
                  fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
                  fontSize: 18,
                  textAlign: 'center',
                  letterSpacing: '0.15em',
                  outline: 'none',
                  padding: '0 16px',
                }}
              />
              <button
                onClick={handleJoin}
                disabled={!lobbyCode.trim()}
                style={{
                  fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif",
                  fontSize: 24,
                  letterSpacing: '0.1em',
                  color: lobbyCode.trim() ? '#0A0A0A' : '#666',
                  backgroundColor: lobbyCode.trim() ? '#F5A0D0' : '#1A1A1A',
                  border: lobbyCode.trim() ? '2px solid #F5A0D0' : '2px solid #1A1A1A',
                  padding: '0 40px',
                  height: 64,
                  cursor: lobbyCode.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 150ms',
                }}
              >
                ENTER
              </button>
            </div>
            <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 11, color: '#888' }}>
              Get your lobby code from the event host
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>or</span>
              <button
                onClick={() => router.push('/create')}
                style={{
                  fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif",
                  fontSize: 16,
                  letterSpacing: '0.1em',
                  color: '#F5A0D0',
                  backgroundColor: 'transparent',
                  border: '1px solid #F5A0D0',
                  padding: '6px 20px',
                  cursor: 'pointer',
                }}
              >
                CREATE YOUR OWN LOBBY
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="fade-in-delay-3 bt-stats-strip" style={{
            display: 'flex',
            gap: 48,
            marginTop: 80,
            position: 'relative',
            zIndex: 1,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            {[
              { value: '60+', label: 'TRADEABLE ASSETS' },
              { value: 'LIVE', label: 'PYTH PRICE FEEDS' },
              { value: '7', label: 'ATTACK WEAPONS' },
              { value: '4', label: 'DEFENSE SHIELDS' },
            ].map((stat, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif", fontSize: 32, color: '#F5A0D0', letterSpacing: '0.05em' }}>{stat.value}</div>
                <div style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 9, color: '#888', letterSpacing: '0.15em' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </main>

        {/* How it works */}
        <section style={{ borderTop: '1px solid #1A1A1A', padding: '80px 32px' }}>
          <h2 style={{
            fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif",
            fontSize: 48,
            color: 'white',
            textAlign: 'center',
            letterSpacing: '0.05em',
            marginBottom: 64,
          }}>
            HOW IT WORKS
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, maxWidth: 1000, margin: '0 auto' }}>
            {[
              { step: '01', title: 'JOIN A LOBBY', desc: 'Get your lobby code from the host. Register as a competitor or spectator.', icon: '🎮' },
              { step: '02', title: 'TRADE LIVE', desc: 'Trade 60+ assets with real Pyth price feeds. Crypto, stocks, commodities.', icon: '📈' },
              { step: '03', title: 'ATTACK RIVALS', desc: 'Spend credits to lockout, fake news, margin squeeze, or expose competitors.', icon: '⚡' },
              { step: '04', title: 'SURVIVE & WIN', desc: 'Bottom trader gets eliminated each round. Last one standing takes the crown.', icon: '🏆' },
            ].map((item) => (
              <div key={item.step} style={{ padding: 24, border: '1px solid #1A1A1A', backgroundColor: '#0D0D0D' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <span style={{ fontSize: 28 }}>{item.icon}</span>
                  <span style={{ fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace", fontSize: 12, color: '#888' }}>{item.step}</span>
                </div>
                <h3 style={{ fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif", fontSize: 24, color: 'white', letterSpacing: '0.05em', marginBottom: 8 }}>{item.title}</h3>
                <p style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 13, color: '#999', lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Roles section */}
        <section style={{ borderTop: '1px solid #1A1A1A', padding: '80px 32px' }}>
          <h2 style={{
            fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif",
            fontSize: 48,
            color: 'white',
            textAlign: 'center',
            letterSpacing: '0.05em',
            marginBottom: 64,
          }}>
            CHOOSE YOUR ROLE
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 900, margin: '0 auto' }}>
            {[
              { title: 'COMPETITOR', subtitle: 'Trade to survive', features: ['Open positions on 60+ assets', 'Deploy attack weapons on rivals', 'Activate defense shields', 'Climb the leaderboard'], color: '#00FF88', borderColor: '#00FF88' },
              { title: 'SPECTATOR', subtitle: 'Watch. Attack. Predict.', features: ['Watch live trading feed', 'Buy weapons to sabotage players', 'Bet credits on who wins', 'Influence the outcome'], color: '#F5A0D0', borderColor: '#F5A0D0' },
              { title: 'HOST', subtitle: 'Run the show', features: ['Create and manage lobbies', 'Fire volatility events live', 'Control round flow', 'Broadcast to venue screens'], color: '#888', borderColor: '#555' },
            ].map((role) => (
              <div key={role.title} style={{ padding: 32, border: `1px solid ${role.borderColor}`, backgroundColor: '#0D0D0D' }}>
                <h3 style={{ fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif", fontSize: 32, color: role.color, letterSpacing: '0.05em', marginBottom: 4 }}>{role.title}</h3>
                <p style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 12, color: '#999', marginBottom: 20 }}>{role.subtitle}</p>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {role.features.map((f, i) => (
                    <li key={i} style={{
                      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                      fontSize: 13,
                      color: '#888',
                      padding: '6px 0',
                      borderBottom: '1px solid #111',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <span style={{ width: 4, height: 4, backgroundColor: role.color, display: 'inline-block', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: '1px solid #1A1A1A', padding: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "var(--font-bebas), 'Bebas Neue', sans-serif", fontSize: 16, color: '#555', letterSpacing: '0.1em' }}>BATTLE TRADE</span>
          <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontSize: 11, color: '#555' }}>TRADING AS A SPECTATOR SPORT</span>
        </footer>

      </div>
    </>
  )
}
