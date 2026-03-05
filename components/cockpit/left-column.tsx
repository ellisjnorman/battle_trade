'use client'

interface Position { id: string; type: 'long' | 'short'; asset: string; size: number; pnl: number; pnlPct: number; liqPrice: number; isNearLiquidation?: boolean }
interface Standing { rank: number; name: string; returnPct: number; isYou?: boolean; isEliminated?: boolean; activityStatus: 'active' | 'warning' | 'critical' }
interface Event { time: string; name: string; asset: string }
interface LeftColumnProps { positions: Position[]; activityState: 'active' | 'warning' | 'critical'; warningCountdown?: number; returnPct: number; standings: Standing[]; events: Event[]; onClosePosition?: (id: string) => void }

export function LeftColumn({ positions, activityState, warningCountdown, returnPct, standings, events, onClosePosition }: LeftColumnProps) {
  const isProfit = returnPct >= 0
  return (
    <aside className="w-[200px] bg-[#0A0A0A] border-r border-[#1A1A1A] flex flex-col">
      {/* Positions */}
      <div className="p-[8px] border-b border-[#1A1A1A]">
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[13px] text-[#333] mb-[8px]">POSITIONS</h3>
        {positions.length === 0 ? (
          <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[10px] text-[#333] italic text-center py-[16px]">NO POSITIONS</p>
        ) : (
          <div className="flex flex-col gap-[4px]">{positions.slice(0, 3).map(pos => <PositionCard key={pos.id} position={pos} onClose={onClosePosition} />)}</div>
        )}
      </div>

      {/* Activity */}
      <div className="p-[8px] border-b border-[#1A1A1A]">
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[12px] text-[#333] mb-[8px]">ACTIVITY</h3>
        <ActivityBlock state={activityState} countdown={warningCountdown} />
      </div>

      {/* Return hero */}
      <div className="p-[12px] border-b border-[#1A1A1A]">
        <div className="flex flex-col items-center">
          <span
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', color: isProfit ? '#00FF88' : '#FF3333' }}
            className="text-[72px] leading-none"
          >
            {isProfit ? '+' : ''}{returnPct.toFixed(1)}%
          </span>
          <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[8px] text-[#444] mt-[4px]">RETURN</span>
          <div className="w-full h-[4px] bg-[#1A1A1A] mt-[8px]">
            <div style={{ width: `${Math.min(Math.abs(returnPct) * 2, 100)}%`, backgroundColor: isProfit ? '#00FF88' : '#FF3333' }} className="h-full" />
          </div>
        </div>
      </div>

      {/* Standings */}
      <div className="p-[8px] border-b border-[#1A1A1A] flex-1">
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[12px] text-[#333] mb-[8px]">STANDINGS</h3>
        <div className="flex flex-col">{standings.map(s => <StandingRow key={s.rank} standing={s} />)}</div>
      </div>

      {/* Next events */}
      <div className="p-[8px]">
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-[#1A1A1A] mb-[8px]">NEXT EVENTS</h3>
        <div className="flex flex-col gap-[4px]">
          {events.map((event, i) => (
            <div key={i} className="flex items-center gap-[8px]">
              <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[10px] text-[#F5A0D0]">{event.time}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[10px] text-[#444]">· {event.name} · {event.asset}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}

function PositionCard({ position, onClose }: { position: Position; onClose?: (id: string) => void }) {
  const isLong = position.type === 'long'
  const isProfit = position.pnl >= 0
  const dirColor = isLong ? '#00FF88' : '#FF3333'
  return (
    <div
      className="bg-[#0D0D0D] border border-[#1A1A1A] p-[8px]"
      style={{
        borderLeft: `3px solid ${dirColor}`,
        ...(position.isNearLiquidation ? { border: '1px solid #FF3333', borderLeft: '3px solid #FF3333' } : {}),
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[8px]">
          <span
            className="w-[16px] h-[16px] flex items-center justify-center text-[10px]"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', backgroundColor: dirColor, color: isLong ? '#0A0A0A' : 'white' }}
          >
            {isLong ? 'L' : 'S'}
          </span>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[14px] text-white">{position.asset}</span>
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[12px] text-[#555]">${position.size.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between mt-[4px]">
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: isProfit ? '#00FF88' : '#FF3333' }}
          className="text-[13px]"
        >
          {isProfit ? '+' : ''}${position.pnl.toLocaleString()} ({isProfit ? '+' : ''}{position.pnlPct.toFixed(1)}%)
        </span>
        <div className="flex items-center gap-[8px]">
          <span
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}
            className={`text-[10px] text-[#FF3333] ${position.isNearLiquidation ? 'animate-pulse' : ''}`}
          >
            LIQ ${position.liqPrice.toLocaleString()}
          </span>
          {onClose && (
            <button onClick={() => onClose(position.id)} className="text-[#444] hover:text-white text-[12px]">×</button>
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityBlock({ state, countdown }: { state: 'active' | 'warning' | 'critical'; countdown?: number }) {
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  if (state === 'active') return (
    <div className="text-center py-[8px]">
      <div className="flex items-center justify-center gap-[4px]">
        <span className="block w-[8px] h-[8px] bg-[#00FF88]" />
        <span className="block w-[8px] h-[8px] bg-[#00FF88]" />
        <span className="block w-[8px] h-[8px] bg-[#00FF88]" />
      </div>
      <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[13px] text-[#00FF88] mt-[4px]">ACTIVE TRADER</p>
    </div>
  )
  if (state === 'warning') return (
    <div className="border border-[#FF3333] p-[8px]" style={{ backgroundColor: 'rgba(255,51,51,0.05)' }}>
      <div className="text-center">
        <div className="flex items-center justify-center gap-[4px]">
          <span className="block w-[8px] h-[8px] bg-[#FF3333] animate-pulse" />
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[15px] text-[#FF3333] animate-pulse">TRADE NOW</span>
        </div>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[12px] text-[#FF3333] mt-[4px]">IDLE · AUTO-TRADE IN {fmtTime(countdown || 0)}</p>
        <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[9px] text-[#555] mt-[4px]">open a position or one opens for you</p>
      </div>
    </div>
  )
  return (
    <div className="border-2 border-[#FF3333] p-[8px]" style={{ backgroundColor: 'rgba(255,51,51,0.1)' }}>
      <div className="text-center">
        <div className="flex items-center justify-center gap-[4px]">
          <span className="block w-[8px] h-[8px] bg-[#FF3333]" />
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[10px] text-[#FF3333]">CRITICAL</span>
        </div>
        <p style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[36px] text-[#FF3333] animate-pulse">{fmtTime(countdown || 0)}</p>
        <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[11px] text-[#888]">FORCED TRADE INCOMING</p>
      </div>
    </div>
  )
}

function StandingRow({ standing }: { standing: Standing }) {
  const isProfit = standing.returnPct >= 0
  return (
    <div
      className="flex items-center justify-between py-[4px]"
      style={{
        ...(standing.isYou ? { backgroundColor: '#111', borderLeft: '2px solid #F5A0D0', marginLeft: '-8px', marginRight: '-8px', paddingLeft: '8px', paddingRight: '8px' } : {}),
      }}
    >
      <div className="flex items-center gap-[4px]">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[13px] text-white w-[16px]">
          {standing.isEliminated ? (
            <span className="inline-flex items-center"><span className="block w-[8px] h-[8px] bg-[#FF3333]" /></span>
          ) : `#${standing.rank}`}
        </span>
        {standing.rank === 1 && !standing.isEliminated && <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[10px] text-[#F5A0D0]">★</span>}
        <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[9px] text-white truncate max-w-[56px]">{standing.name}</span>
        <span className="inline-flex items-center">
          {standing.activityStatus === 'active' && <span className="block w-[4px] h-[4px] bg-[#00FF88]" />}
          {standing.activityStatus === 'warning' && <span className="block w-[4px] h-[4px] bg-[#FF3333] animate-pulse" />}
          {standing.activityStatus === 'critical' && <span className="block w-[4px] h-[4px] bg-[#FF3333]" />}
        </span>
      </div>
      <span
        style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: isProfit ? '#00FF88' : '#FF3333' }}
        className="text-[11px]"
      >
        {isProfit ? '+' : ''}{standing.returnPct.toFixed(1)}%
      </span>
    </div>
  )
}
