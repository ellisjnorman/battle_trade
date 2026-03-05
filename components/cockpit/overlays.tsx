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

function LockedOutOverlay({ timeRemaining, onClose }: { timeRemaining: number; onClose: () => void }) {
  const [time, setTime] = useState(timeRemaining)
  useEffect(() => {
    const t = setInterval(() => setTime(t => { if (t <= 1) { onClose(); return 0 } return t - 1 }), 1000)
    return () => clearInterval(t)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.95)', border: '2px solid #FF3333' }}>
      <div style={{ width: 8, height: 8, backgroundColor: '#FF3333', margin: '0 auto 16px' }} />
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 96, color: '#FF3333', lineHeight: 1 }}>LOCKED OUT</h1>
      <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[16px] text-[#555] mt-[16px]">SOMEONE SPENT 200CR TO STOP YOU</p>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', fontSize: 56, color: '#FF3333', marginTop: 32 }}>
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
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.97)', border: '2px solid #F5A0D0' }}>
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 22, color: '#F5A0D0', marginTop: 16 }}>BREAKING</p>
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 56, color: 'white', marginTop: 8, lineHeight: 1 }}>ETH ETF REJECTED</h1>
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 36, color: '#FF3333', marginTop: 8 }}>MARKET IN FREEFALL</p>
      <div style={{ width: 1, height: 32, backgroundColor: '#333', margin: '32px 0' }} />
      <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[14px] text-[#444]">BATTLE TRADE SABOTAGE · NOT REAL DATA</p>
      <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#1A1A1A]">
        <div className="h-full transition-all duration-100" style={{ width: `${progress}%`, backgroundColor: '#F5A0D0' }} />
      </div>
    </div>
  )
}

function MarketEventOverlay({ asset, timeRemaining, hasPosition = true, onClose }: { asset: string; timeRemaining: number; hasPosition?: boolean; onClose: () => void }) {
  const [time, setTime] = useState(timeRemaining)
  useEffect(() => { const t = setInterval(() => setTime(t => t <= 1 ? 0 : t - 1), 1000); return () => clearInterval(t) }, [])
  return (
    <>
      <div className="fixed top-[48px] left-0 right-0 h-[48px] z-40 flex items-center justify-center" style={{ backgroundColor: '#0D0D0D', borderBottom: '2px solid #FF3333' }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 22, color: 'white' }}>
          FLASH CRASH IN 0:{time.toString().padStart(2,'0')} · {asset} -15%
        </span>
      </div>
      {hasPosition && (
        <div className="fixed inset-0 z-30 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="p-[24px] max-w-md" style={{ backgroundColor: '#0D0D0D', border: '2px solid #FF3333' }}>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 22, color: '#FF3333', textAlign: 'center' }}>YOUR {asset} LONG IS EXPOSED</h2>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[16px] text-[#888] text-center mt-[8px]">$2,000 AT RISK</p>
            <div className="flex gap-[12px] mt-[24px]">
              <button onClick={onClose} className="flex-1 py-[12px]" style={{ backgroundColor: '#FF3333', color: '#0A0A0A', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 16 }}>CLOSE NOW</button>
              <button onClick={onClose} className="flex-1 py-[12px]" style={{ backgroundColor: 'transparent', border: '1px solid #333', color: '#555', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 16 }}>HOLD AND PRAY</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function FrozenOverlay() {
  return (
    <div className="fixed top-[48px] left-0 right-0 h-[48px] z-40 flex items-center justify-center" style={{ backgroundColor: '#111', borderBottom: '1px solid #F5A0D0' }}>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 16, color: 'white' }}>SCORES FROZEN · ELIMINATION INCOMING</span>
    </div>
  )
}

function ForcedTradeOverlay({ asset, size, leverage, onClose }: { asset: string; size: number; leverage: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.90)', border: '2px solid #FF3333' }}>
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 56, color: '#FF3333', lineHeight: 1, marginTop: 16 }}>YOU WAITED TOO LONG</h1>
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 28, color: 'white', marginTop: 16 }}>OPENING FORCED POSITION</p>
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 36, color: '#F5A0D0', marginTop: 16 }}>{asset} LONG ${size.toLocaleString()} @ {leverage}</p>
      <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[14px] text-[#555] italic mt-[32px]">The crowd can see this.</p>
    </div>
  )
}

function EliminatedOverlay({ trader }: { trader: { name: string; returnPct: number } }) {
  const isProfit = trader.returnPct >= 0
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: '#0A0A0A' }}>
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 120, color: '#FF3333', lineHeight: 1, marginTop: 16 }}>ELIMINATED</h1>
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 48, color: '#555', marginTop: 16 }}>{trader.name}</p>
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 72, color: isProfit ? '#00FF88' : '#FF3333', marginTop: 32 }}>
        FINAL: {isProfit ? '+' : ''}{trader.returnPct.toFixed(1)}%
      </p>
      <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[14px] text-[#1A1A1A] mt-[48px]">THANKS FOR PLAYING</p>
    </div>
  )
}

function RoundWinnerOverlay({ trader, round }: { trader: { name: string; returnPct: number }; round: number }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden" style={{ backgroundColor: '#0A0A0A' }}>
      <Confetti />
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 20, color: '#F5A0D0' }}>ROUND {round} CHAMPION</p>
      <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 120, color: 'white', lineHeight: 1, marginTop: 16 }}>{trader.name}</h1>
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 96, color: '#00FF88', lineHeight: 1, marginTop: 16 }}>
        +{trader.returnPct.toFixed(1)}%
      </p>
    </div>
  )
}

function Confetti() {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; color: string; delay: number; duration: number }>>([])
  useEffect(() => {
    setParticles(Array.from({ length: 20 }, (_, i) => ({ id: i, x: Math.random()*100, color: Math.random()>0.5 ? '#F5A0D0' : '#FFFFFF', delay: Math.random()*2, duration: 3+Math.random()*2 })))
    const t = setTimeout(() => setParticles([]), 5000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div key={p.id} className="absolute w-[8px] h-[8px]"
          style={{ left: `${p.x}%`, top: '-10px', backgroundColor: p.color, animation: `confetti-fall ${p.duration}s ease-out ${p.delay}s forwards` }} />
      ))}
      <style>{`@keyframes confetti-fall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }`}</style>
    </div>
  )
}
