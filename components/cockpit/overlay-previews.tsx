'use client'

import { useState, useEffect } from 'react'

export function OverlayPreviews() {
  return (
    <div style={{ width: 1280, marginTop: 32 }} className="space-y-8">
      <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 24, color: 'white', marginBottom: 16 }}>OVERLAY PREVIEWS</h2>
      {[
        { label: 'LOCKED OUT', component: <LockedOutPreview /> },
        { label: 'FAKE NEWS', component: <FakeNewsPreview /> },
        { label: 'MARKET EVENT', component: <MarketEventPreview /> },
        { label: 'FROZEN', component: <FrozenPreview /> },
        { label: 'FORCED TRADE', component: <ForcedTradePreview /> },
        { label: 'ELIMINATED', component: <EliminatedPreview /> },
        { label: 'ROUND WINNER', component: <RoundWinnerPreview /> },
      ].map(({ label, component }) => (
        <div key={label}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 14, color: '#555', display: 'block', marginBottom: 8 }}>{label}</span>
          {component}
        </div>
      ))}
    </div>
  )
}

function LockedOutPreview() {
  return (
    <div className="w-full h-[400px] flex flex-col items-center justify-center relative" style={{ backgroundColor: 'rgba(0,0,0,0.95)', border: '2px solid #FF3333' }}>
      <div style={{ width: 8, height: 8, backgroundColor: '#FF3333', marginBottom: 16 }} />
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 96, color: '#FF3333', lineHeight: 1 }}>LOCKED OUT</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[16px] text-[#555] mt-[16px]">SOMEONE SPENT 200CR TO STOP YOU</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', fontSize: 56, color: '#FF3333', marginTop: 24 }}>1:30</span>
    </div>
  )
}

function FakeNewsPreview() {
  const [progress, setProgress] = useState(100)
  useEffect(() => { const i = setInterval(() => setProgress(p => p > 0 ? p - 1 : 100), 80); return () => clearInterval(i) }, [])
  return (
    <div className="w-full h-[400px] flex flex-col items-center justify-center relative" style={{ backgroundColor: 'rgba(0,0,0,0.97)', border: '2px solid #F5A0D0' }}>
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 22, color: '#F5A0D0' }}>BREAKING</p>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 56, color: 'white', lineHeight: 1, textAlign: 'center' }}>ETH ETF REJECTED</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 36, color: '#FF3333', marginTop: 8 }}>MARKET IN FREEFALL</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[14px] text-[#444] mt-[24px]">BATTLE TRADE SABOTAGE · NOT REAL DATA</span>
      <div className="absolute bottom-0 left-0 right-0 h-[8px] bg-[#1A1A1A]">
        <div className="h-full transition-all duration-100" style={{ width: `${progress}%`, backgroundColor: '#F5A0D0' }} />
      </div>
    </div>
  )
}

function MarketEventPreview() {
  return (
    <div className="w-full flex flex-col">
      <div className="h-[48px] flex items-center justify-center" style={{ backgroundColor: '#0D0D0D', borderBottom: '2px solid #FF3333' }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 22, color: 'white' }}>FLASH CRASH IN 0:23 · BTC -15%</span>
      </div>
      <div className="h-[352px] flex items-center justify-center" style={{ backgroundColor: 'rgba(10,10,10,0.8)' }}>
        <div className="p-[24px] text-center" style={{ backgroundColor: '#0D0D0D', border: '1px solid #1A1A1A' }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 24, color: 'white', display: 'block', marginBottom: 16 }}>YOUR BTC LONG IS EXPOSED</span>
          <div className="flex gap-[16px] justify-center">
            <button className="px-[24px] py-[12px]" style={{ backgroundColor: '#FF3333', color: 'white', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 18 }}>CLOSE NOW</button>
            <button className="px-[24px] py-[12px]" style={{ border: '1px solid #333', color: '#888', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 18 }}>HOLD AND PRAY</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FrozenPreview() {
  return (
    <div className="w-full">
      <div className="h-[48px] flex items-center justify-center" style={{ backgroundColor: '#111', borderBottom: '1px solid #F5A0D0' }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 16, color: 'white' }}>SCORES FROZEN · ELIMINATION INCOMING</span>
      </div>
      <div className="h-[352px] flex items-center justify-center" style={{ backgroundColor: '#0A0A0A' }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[14px] text-[#333] italic">(Main UI visible below banner)</span>
      </div>
    </div>
  )
}

function ForcedTradePreview() {
  return (
    <div className="w-full h-[400px] flex flex-col items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.90)', border: '2px solid #FF3333' }}>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 56, color: '#FF3333', lineHeight: 1 }}>YOU WAITED TOO LONG</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 28, color: 'white', marginTop: 16 }}>OPENING FORCED POSITION</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 36, color: '#F5A0D0', marginTop: 16 }}>BTC LONG $2,000 @ 5X</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[14px] text-[#555] italic mt-[16px]">The crowd can see this.</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[10px] text-[#333] mt-[24px]">Cannot dismiss. Auto-closes 4s.</span>
    </div>
  )
}

function EliminatedPreview() {
  return (
    <div className="w-full h-[400px] flex flex-col items-center justify-center" style={{ backgroundColor: '#0A0A0A' }}>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 120, color: '#FF3333', lineHeight: 1 }}>ELIMINATED</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 48, color: '#555', marginTop: 16 }}>WOLFPACK</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 72, color: '#00FF88', marginTop: 8 }}>FINAL: +42.2%</span>
    </div>
  )
}

function RoundWinnerPreview() {
  return (
    <div className="w-full h-[400px] flex flex-col items-center justify-center relative overflow-hidden" style={{ backgroundColor: '#0A0A0A' }}>
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="absolute w-[8px] h-[8px]"
            style={{ left: `${Math.random()*100}%`, top: `${Math.random()*100}%`, backgroundColor: i%2===0 ? '#F5A0D0' : '#FFFFFF', opacity: 0.6 }} />
        ))}
      </div>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 20, color: '#F5A0D0', marginBottom: 8 }}>ROUND 2 CHAMPION</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 120, color: 'white', lineHeight: 1 }}>WOLFPACK</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 96, color: '#00FF88', marginTop: 8, lineHeight: 1 }}>+42.2%</span>
    </div>
  )
}
