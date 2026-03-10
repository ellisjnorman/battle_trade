'use client'

import { useEffect, useState } from 'react'

interface OverlayManagerProps {
  activeOverlay: string | null
  onClose: () => void
  trader: { name: string; avatar: string; returnPct: number }
}

export function OverlayManager({ activeOverlay, onClose, trader }: OverlayManagerProps) {
  if (!activeOverlay) return null
  switch (activeOverlay) {
    case 'locked': return <LockedOutOverlay timeRemaining={90} onClose={onClose} />
    case 'fakenews': return <FakeNewsOverlay onClose={onClose} />
    case 'market-event': return <MarketEventOverlay asset="BTC" timeRemaining={23} onClose={onClose} />
    case 'frozen': return <FrozenOverlay />
    case 'forced': return <ForcedTradeOverlay asset="BTC" size={2000} leverage="5X" onClose={onClose} />
    case 'eliminated': return <EliminatedOverlay trader={trader} />
    case 'winner': return <RoundWinnerOverlay trader={trader} round={2} />
    default: return null
  }
}

// Shared font constants (match trading terminal)
const B = { fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", letterSpacing: '0.05em' } as const
const M = { fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", letterSpacing: '-0.02em' } as const
const S = { fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif" } as const

function LockedOutOverlay({ timeRemaining, onClose }: { timeRemaining: number; onClose: () => void }) {
  const [time, setTime] = useState(timeRemaining)
  useEffect(() => {
    const t = setInterval(() => setTime(t => { if (t <= 1) { onClose(); return 0 } return t - 1 }), 1000)
    return () => clearInterval(t)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.95)', border: '2px solid #FF3333' }}>
      <div style={{ width: 8, height: 8, backgroundColor: '#FF3333', margin: '0 auto 16px', boxShadow: '0 0 16px rgba(255,51,51,0.6)' }} />
      <h1 style={{ ...B, fontSize: 96, color: '#FF3333', lineHeight: 1, textShadow: '0 0 40px rgba(255,51,51,0.6), 0 0 80px rgba(255,51,51,0.3)' }}>LOCKED OUT</h1>
      <p style={{ ...S, fontSize: 16, color: '#888', marginTop: 16 }}>SOMEONE SPENT 200CR TO STOP YOU</p>
      <p style={{ ...M, fontSize: 56, color: '#FF3333', marginTop: 32, textShadow: '0 0 30px rgba(255,51,51,0.5)' }}>
        {Math.floor(time/60)}:{(time%60).toString().padStart(2,'0')}
      </p>
    </div>
  )
}

function FakeNewsOverlay({ onClose }: { onClose: () => void }) {
  const [progress, setProgress] = useState(100)
  useEffect(() => {
    const t = setInterval(() => setProgress(p => { if (p <= 0) { onClose(); return 0 } return p - (100/80) }), 100)
    return () => clearInterval(t)
  }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.97)', border: '2px solid #F5A0D0' }}>
      <p style={{ ...B, fontSize: 22, color: '#F5A0D0', marginTop: 16, textShadow: '0 0 20px rgba(245,160,208,0.5)' }}>BREAKING</p>
      <h1 style={{ ...B, fontSize: 56, color: 'white', marginTop: 8, lineHeight: 1, textShadow: '0 0 20px rgba(255,255,255,0.2)' }}>ETH ETF REJECTED</h1>
      <p style={{ ...B, fontSize: 36, color: '#FF3333', marginTop: 8, textShadow: '0 0 30px rgba(255,51,51,0.5)' }}>MARKET IN FREEFALL</p>
      <div style={{ width: 1, height: 32, backgroundColor: '#333', margin: '32px 0' }} />
      <p style={{ ...S, fontSize: 14, color: '#888' }}>BATTLE TRADE SABOTAGE · NOT REAL DATA</p>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#1A1A1A' }}>
        <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#F5A0D0', transition: 'width 100ms', boxShadow: '0 0 12px rgba(245,160,208,0.5)' }} />
      </div>
    </div>
  )
}

function MarketEventOverlay({ asset, timeRemaining, hasPosition = true, onClose }: { asset: string; timeRemaining: number; hasPosition?: boolean; onClose: () => void }) {
  const [time, setTime] = useState(timeRemaining)
  useEffect(() => { const t = setInterval(() => setTime(t => t <= 1 ? 0 : t - 1), 1000); return () => clearInterval(t) }, [])
  return (
    <>
      <div style={{ position: 'fixed', top: 48, left: 0, right: 0, height: 48, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A', borderBottom: '2px solid #FF3333', boxShadow: '0 4px 24px rgba(255,51,51,0.2)' }}>
        <span style={{ ...B, fontSize: 22, color: 'white', textShadow: '0 0 16px rgba(255,255,255,0.2)' }}>
          FLASH CRASH IN 0:{time.toString().padStart(2,'0')} · {asset} -15%
        </span>
      </div>
      {hasPosition && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div style={{ padding: 24, maxWidth: 400, backgroundColor: '#0A0A0A', border: '2px solid #FF3333' }}>
            <h2 style={{ ...B, fontSize: 22, color: '#FF3333', textAlign: 'center', textShadow: '0 0 20px rgba(255,51,51,0.4)' }}>YOUR {asset} LONG IS EXPOSED</h2>
            <p style={{ ...M, fontSize: 16, color: '#888', textAlign: 'center', marginTop: 8 }}>$2,000 AT RISK</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '12px 0', backgroundColor: '#FF3333', color: '#0A0A0A', ...B, fontSize: 16, border: 'none', cursor: 'pointer', boxShadow: '0 0 16px rgba(255,51,51,0.3)' }}>CLOSE NOW</button>
              <button onClick={onClose} style={{ flex: 1, padding: '12px 0', backgroundColor: 'transparent', border: '1px solid #333', color: '#888', ...B, fontSize: 16, cursor: 'pointer' }}>HOLD AND PRAY</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function FrozenOverlay() {
  return (
    <div style={{ position: 'fixed', top: 48, left: 0, right: 0, height: 48, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A', borderBottom: '1px solid #F5A0D0', boxShadow: '0 4px 24px rgba(245,160,208,0.1)' }}>
      <span style={{ ...B, fontSize: 16, color: 'white', textShadow: '0 0 16px rgba(245,160,208,0.3)' }}>SCORES FROZEN · ELIMINATION INCOMING</span>
    </div>
  )
}

function ForcedTradeOverlay({ asset, size, leverage, onClose }: { asset: string; size: number; leverage: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.90)', border: '2px solid #FF3333' }}>
      <h1 style={{ ...B, fontSize: 56, color: '#FF3333', lineHeight: 1, marginTop: 16, textShadow: '0 0 40px rgba(255,51,51,0.6), 0 0 80px rgba(255,51,51,0.3)' }}>YOU WAITED TOO LONG</h1>
      <p style={{ ...B, fontSize: 28, color: 'white', marginTop: 16, textShadow: '0 0 16px rgba(255,255,255,0.2)' }}>OPENING FORCED POSITION</p>
      <p style={{ ...B, fontSize: 36, color: '#F5A0D0', marginTop: 16, textShadow: '0 0 24px rgba(245,160,208,0.5)' }}>{asset} LONG ${size.toLocaleString()} @ {leverage}</p>
      <p style={{ ...S, fontSize: 14, color: '#888', marginTop: 32 }}>The crowd can see this.</p>
    </div>
  )
}

function EliminatedOverlay({ trader }: { trader: { name: string; returnPct: number } }) {
  const isProfit = trader.returnPct >= 0
  const pnlColor = isProfit ? '#00FF88' : '#FF3333'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0A' }}>
      <h1 style={{ ...B, fontSize: 120, color: '#FF3333', lineHeight: 1, textShadow: '0 0 60px rgba(255,51,51,0.6), 0 0 120px rgba(255,51,51,0.3), 0 0 200px rgba(255,51,51,0.15)', animation: 'eliminatedPulse 2s ease-in-out infinite' }}>ELIMINATED</h1>
      <p style={{ ...B, fontSize: 48, color: '#888', marginTop: 16, textShadow: '0 0 20px rgba(136,136,136,0.3)' }}>{trader.name}</p>
      <p style={{ ...B, fontSize: 72, color: pnlColor, marginTop: 32, textShadow: `0 0 40px ${pnlColor}80, 0 0 80px ${pnlColor}40` }}>
        FINAL: {isProfit ? '+' : ''}{trader.returnPct.toFixed(1)}%
      </p>
      <p style={{ ...S, fontSize: 14, color: '#333', marginTop: 48 }}>THANKS FOR PLAYING</p>
      <style>{`@keyframes eliminatedPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }`}</style>
    </div>
  )
}

function RoundWinnerOverlay({ trader, round }: { trader: { name: string; returnPct: number }; round: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#0A0A0A' }}>
      <Confetti />
      <p style={{ ...B, fontSize: 20, color: '#F5A0D0', textShadow: '0 0 20px rgba(245,160,208,0.5)' }}>ROUND {round} CHAMPION</p>
      <h1 style={{ ...B, fontSize: 120, color: 'white', lineHeight: 1, marginTop: 16, textShadow: '0 0 40px rgba(255,255,255,0.3), 0 0 80px rgba(245,160,208,0.2)' }}>{trader.name}</h1>
      <p style={{ ...B, fontSize: 96, color: '#00FF88', lineHeight: 1, marginTop: 16, textShadow: '0 0 40px rgba(0,255,136,0.6), 0 0 80px rgba(0,255,136,0.3)', animation: 'winnerGlow 2s ease-in-out infinite' }}>
        +{trader.returnPct.toFixed(1)}%
      </p>
      <style>{`@keyframes winnerGlow { 0%, 100% { text-shadow: 0 0 40px rgba(0,255,136,0.6), 0 0 80px rgba(0,255,136,0.3); } 50% { text-shadow: 0 0 60px rgba(0,255,136,0.8), 0 0 120px rgba(0,255,136,0.4); } }`}</style>
    </div>
  )
}

function Confetti() {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; color: string; delay: number; duration: number; size: number }>>([])
  useEffect(() => {
    setParticles(Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random()*100,
      color: ['#F5A0D0', '#00FF88', '#FFF', '#F5A0D0'][Math.floor(Math.random()*4)],
      delay: Math.random()*2,
      duration: 3+Math.random()*2,
      size: 6 + Math.floor(Math.random()*6),
    })))
    const t = setTimeout(() => setParticles([]), 5000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map(p => (
        <div key={p.id}
          style={{ position: 'absolute', width: p.size, height: p.size, left: `${p.x}%`, top: '-10px', backgroundColor: p.color, boxShadow: `0 0 8px ${p.color}80`, animation: `confetti-fall ${p.duration}s ease-out ${p.delay}s forwards` }} />
      ))}
      <style>{`@keyframes confetti-fall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }`}</style>
    </div>
  )
}
