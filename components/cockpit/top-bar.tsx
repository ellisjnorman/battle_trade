'use client'

interface TopBarProps {
  lobbyName: string
  trader: { name: string; avatar: string; rank: number; totalTraders: number }
  round: { current: number; total: number; timeRemaining: string; isUrgent: boolean }
  credits: number
  portfolioValue: number
  returnPct: number
}

export function TopBar({ lobbyName, trader, round, credits, portfolioValue, returnPct }: TopBarProps) {
  const isProfit = returnPct >= 0
  const initial = trader.name.charAt(0).toUpperCase()

  return (
    <header className="h-[40px] bg-[#0D0D0D] border-b border-[#1A1A1A] flex items-center justify-between px-[12px] shrink-0">
      {/* Left: Logo + Lobby */}
      <div className="flex items-center gap-[12px]">
        <a href="/" className="flex items-center gap-[8px]" style={{ textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.png" alt="" style={{ height: 24, width: 'auto' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.1em' }} className="text-[18px] text-[#F5A0D0]">
            BATTLE TRADE
          </span>
        </a>
        <div className="w-px h-[20px] bg-[#1A1A1A]" />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[14px] text-[#333]">
          {lobbyName}
        </span>
      </div>

      {/* Center: Round + Timer */}
      <div className="flex items-center gap-[12px]">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[13px] text-[#444]">
          ROUND {round.current}/{round.total}
        </span>
        <div
          className="px-[12px] py-[2px]"
          style={{ border: `1px solid ${round.isUrgent ? '#FF3333' : '#1A1A1A'}` }}
        >
          <span
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}
            className={`text-[16px] ${round.isUrgent ? 'text-[#FF3333] animate-pulse' : 'text-white'}`}
          >
            {round.timeRemaining}
          </span>
        </div>
        <span
          style={{ fontFamily: "'DM Sans', sans-serif" }}
          className="text-[9px] text-[#333] border border-[#1A1A1A] px-[6px] py-[2px]"
        >
          PAPER
        </span>
      </div>

      {/* Right: Trader info */}
      <div className="flex items-center gap-[10px]">
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}
          className="text-[13px] text-white"
        >
          ${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: isProfit ? '#00FF88' : '#FF3333' }}
          className="text-[13px]"
        >
          {isProfit ? '+' : ''}{returnPct.toFixed(1)}%
        </span>
        <div className="w-px h-[20px] bg-[#1A1A1A]" />
        <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[11px] text-[#F5A0D0]">{credits}CR</span>
        <div className="w-px h-[20px] bg-[#1A1A1A]" />
        <div className="flex items-center gap-[6px]">
          <div className="w-[24px] h-[24px] flex items-center justify-center" style={{ border: '1px solid #F5A0D0', backgroundColor: '#1A1A1A' }}>
            {trader.avatar && !trader.avatar.includes('logo-icon') ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={trader.avatar} alt={trader.name} width={24} height={24} className="w-full h-full object-cover" />
            ) : (
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: '#F5A0D0' }}>{initial}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[13px] text-white leading-none">{trader.name}</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[8px] text-[#555]">#{trader.rank} of {trader.totalTraders}</span>
          </div>
        </div>
      </div>
    </header>
  )
}

export function AutoCloseWarning({ secondsRemaining }: { secondsRemaining: number }) {
  return (
    <div className="h-[28px] w-full flex items-center justify-center border-b bg-[#0D0D0D] border-[#FF3333] shrink-0">
      <span
        style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}
        className="text-[13px] text-white animate-pulse"
      >
        ALL POSITIONS AUTO-CLOSE IN {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
      </span>
    </div>
  )
}
