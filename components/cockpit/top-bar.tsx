'use client'

interface TopBarProps {
  trader: { name: string; handle: string; avatar: string; rank: number; totalTraders: number; balance: number; returnPct: number }
  round: { current: number; total: number; leverage: string; timeRemaining: string; isUrgent: boolean }
  credits: number
  activityStatus: 'active' | 'warning' | 'critical'
}

export function TopBar({ trader, round, credits, activityStatus }: TopBarProps) {
  const isProfit = trader.returnPct >= 0
  const initial = trader.name.charAt(0).toUpperCase()
  return (
    <header className="h-[48px] bg-[#0D0D0D] border-b border-[#1A1A1A] flex items-center justify-between px-[16px]">
      <div className="flex items-center gap-[12px]">
        <div className="w-[32px] h-[32px] overflow-hidden flex items-center justify-center" style={{ border: '2px solid #F5A0D0', backgroundColor: '#1A1A1A' }}>
          {trader.avatar && !trader.avatar.includes('logo-icon') ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={trader.avatar} alt={trader.name} width={32} height={32} className="w-full h-full object-cover" />
          ) : (
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#F5A0D0' }}>{initial}</span>
          )}
        </div>
        <div className="flex flex-col">
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[20px] text-white leading-none">{trader.name}</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[9px] text-[#555]">{trader.handle}</span>
        </div>
        <div className="w-px h-[24px] bg-[#1A1A1A]" />
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[16px] text-[#F5A0D0]">#{trader.rank} OF {trader.totalTraders}</span>
        <div className="w-px h-[24px] bg-[#1A1A1A]" />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[15px] text-white">${trader.balance.toLocaleString()}</span>
        <span
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}
          className="text-[15px]"
        >
          <span style={{ color: isProfit ? '#00FF88' : '#FF3333' }}>
            {isProfit ? '+' : ''}{trader.returnPct.toFixed(1)}%
          </span>
        </span>
      </div>
      <div className="flex items-center gap-[8px]">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[15px] text-[#444]">ROUND {round.current} OF {round.total}</span>
        <span className="text-[15px] text-[#444]">·</span>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[15px] text-[#F5A0D0]">LEVERAGE {round.leverage}</span>
        <span className="text-[15px] text-[#444]">·</span>
        <span
          style={{ fontFamily: "'DM Sans', sans-serif" }}
          className="text-[9px] text-[#333] border border-[#1A1A1A] px-[8px] py-[4px]"
        >
          PAPER TRADING
        </span>
      </div>
      <div className="flex items-center gap-[12px]">
        <div className="flex flex-col items-end">
          <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[8px] text-[#444]">ENDS IN</span>
          <span
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}
            className="text-[32px] leading-none"
          >
            <span style={{ color: round.isUrgent ? '#FF3333' : 'white' }}>
              {round.timeRemaining}
            </span>
          </span>
        </div>
        <div className="w-px h-[32px] bg-[#1A1A1A]" />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[12px] text-[#F5A0D0]">{credits}CR</span>
        <div className="w-px h-[32px] bg-[#1A1A1A]" />
        <div className="flex items-center gap-[4px]">
          {activityStatus === 'active' && (
            <span className="inline-flex items-center gap-[4px]" style={{ padding: '4px 8px' }}>
              <span className="block w-[8px] h-[8px] bg-[#00FF88]" />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[10px] text-[#00FF88]">ACTIVE</span>
            </span>
          )}
          {activityStatus === 'warning' && (
            <span className="inline-flex items-center gap-[4px]" style={{ padding: '4px 8px' }}>
              <span className="block w-[8px] h-[8px] bg-[#FF3333] animate-pulse" />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[10px] text-[#FF3333]">IDLE</span>
            </span>
          )}
          {activityStatus === 'critical' && (
            <span className="inline-flex items-center gap-[4px]" style={{ padding: '4px 8px' }}>
              <span className="block w-[8px] h-[8px] bg-[#FF3333]" />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[10px] text-[#FF3333]">CRITICAL</span>
            </span>
          )}
        </div>
      </div>
    </header>
  )
}

export function AutoCloseWarning({ secondsRemaining }: { secondsRemaining: number }) {
  return (
    <div className="h-[32px] w-full flex items-center justify-center border-b bg-[#0D0D0D] border-[#FF3333]">
      <span
        style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }}
        className="text-[14px] text-white animate-pulse"
      >
        ALL POSITIONS AUTO-CLOSE IN {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
      </span>
    </div>
  )
}
