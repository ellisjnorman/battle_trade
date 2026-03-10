'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { type LobbyState, type VolatilityEvent } from '@/lib/battle-trade-types'
import { useBroadcastData } from '@/hooks/use-broadcast-data'
import { Scanlines } from '@/components/broadcast/scanlines'
import { ConnectionBanner } from '@/components/broadcast/connection-banner'

// Top Bar Component - Broadcast Grade
function TopBar({ lobbyState, sponsorLogo }: { lobbyState: LobbyState; sponsorLogo: string | null }) {
  const minutes = Math.floor(lobbyState.timeRemaining / 60)
  const seconds = lobbyState.timeRemaining % 60
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  const isDanger = lobbyState.timeRemaining < 120
  const isPulsing = lobbyState.timeRemaining < 30

  return (
    <div className="absolute top-0 left-0 right-0 h-[72px] flex items-center justify-between px-[32px] broadcast-panel edge-light-top z-10">
      {/* Left: Logo + Event Name */}
      <div className="flex items-center gap-[20px]">
        <div className="relative">
          <img
            src="/brand/logo-main.png"
            alt="Battle Trade"
            className="h-[32px] w-auto"
          />
        </div>
        <div className="h-[24px] w-[1px] bg-[#222222]" />
        <span className="font-heading text-[18px] tracking-[0.08em] text-[#666666]">
          {lobbyState.name}
        </span>
      </div>

      {/* Center: Round + Timer */}
      <div className="flex items-center gap-[24px]">
        <div className="flex items-center gap-[12px]">
          <span className="font-heading text-[14px] tracking-[0.15em] text-[#555555]">ROUND</span>
          <span className="font-heading text-[32px] tracking-[0.05em] text-white">
            {lobbyState.round}
          </span>
          <span className="font-heading text-[14px] tracking-[0.05em] text-[#333333]">
            / {lobbyState.totalRounds}
          </span>
        </div>

        <div className="h-[32px] w-[1px] bg-[#222222]" />

        <div
          className={`font-mono text-[48px] number-display ${isPulsing ? 'animate-pulse-danger animate-loss-glow' : ''}`}
          style={{
            color: isDanger ? '#FF3333' : '#FFFFFF',
            textShadow: isDanger
              ? '0 0 30px rgba(255, 51, 51, 0.6), 0 0 60px rgba(255, 51, 51, 0.3)'
              : '0 0 20px rgba(255, 255, 255, 0.1)',
          }}
        >
          {timeStr}
        </div>
      </div>

      {/* Right: Live Badge + Sponsor Zone */}
      <div className="flex items-center gap-[20px]">
        <div className="flex items-center gap-[8px]">
          <div className="w-[8px] h-[8px] bg-[#FF3333] animate-pulse-glow" style={{ boxShadow: '0 0 12px #FF3333' }} />
          <span className="font-heading text-[12px] tracking-[0.15em] text-[#888888]">LIVE</span>
        </div>
        <div className="w-[180px] h-[44px] flex items-center justify-center border border-dashed border-[#333333]">
          {sponsorLogo ? (
            <img src={sponsorLogo} className="h-full w-auto object-contain" alt="Sponsor" />
          ) : (
            <span className="font-heading text-[11px] tracking-[0.1em] text-[#333333]">
              SPONSOR
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Leaderboard Row Component
function LeaderboardRow({
  trader,
  index,
}: {
  trader: LobbyState['traders'][0]
  index: number
}) {
  const isFirst = trader.rank === 1
  const isTop3 = trader.rank <= 3

  return (
    <div
      className={`h-[56px] flex items-center px-[16px] gap-[12px] transition-all duration-500 animate-fade-in stagger-${index + 1} ${isFirst ? 'broadcast-panel-glow' : ''}`}
      style={{
        opacity: trader.isEliminated ? 0.25 : 1,
        borderBottom: '1px solid rgba(34, 34, 34, 0.6)',
        background: isFirst
          ? 'linear-gradient(90deg, rgba(245, 160, 208, 0.08) 0%, transparent 100%)'
          : 'transparent',
      }}
    >
      {/* Rank Badge */}
      <div
        className={`w-[36px] h-[36px] flex items-center justify-center font-heading text-[22px] ${isFirst ? 'rank-badge-1' : isTop3 ? 'rank-badge-top3' : ''}`}
      >
        <span style={{ color: isFirst ? '#0A0A0A' : isTop3 ? '#FFFFFF' : '#444444' }}>
          {trader.rank}
        </span>
      </div>

      {/* Name */}
      <span
        className={`font-heading text-[18px] flex-1 tracking-[0.05em] ${trader.isEliminated ? 'line-through' : ''}`}
        style={{ color: isFirst ? '#F5A0D0' : '#FFFFFF' }}
      >
        {trader.name.length > 11 ? trader.name.slice(0, 11) + '...' : trader.name}
      </span>

      {/* Return */}
      <div className="flex items-center gap-[8px]">
        <span
          className={`font-mono text-[20px] number-display ${trader.return >= 0 ? (isFirst ? 'animate-profit-glow' : '') : ''}`}
          style={{
            color: trader.return >= 0 ? '#00FF88' : '#FF3333',
            textShadow: trader.return >= 0
              ? '0 0 15px rgba(0, 255, 136, 0.5)'
              : '0 0 15px rgba(255, 51, 51, 0.5)',
          }}
        >
          {trader.return >= 0 ? '+' : ''}{trader.return.toFixed(1)}%
        </span>
      </div>

      {/* Activity Indicator */}
      <div
        className="w-[6px] h-[6px]"
        style={{
          backgroundColor: trader.activity === 'active' ? '#00FF88' : trader.activity === 'idle' ? '#F5A0D0' : '#FF3333',
          boxShadow: trader.activity === 'active' ? '0 0 8px #00FF88' : 'none',
        }}
      />
    </div>
  )
}

// Left Panel Component
function LeftPanel({ lobbyState }: { lobbyState: LobbyState }) {
  return (
    <div className="absolute left-0 top-[72px] bottom-[56px] w-[300px] flex flex-col broadcast-panel edge-light-left">
      {/* Header */}
      <div className="px-[20px] py-[16px] border-b border-[#1A1A1A]">
        <div className="flex items-center justify-between">
          <span className="font-heading text-[13px] tracking-[0.15em] text-[#555555]">
            STANDINGS
          </span>
          <span className="font-mono text-[11px] text-[#333333]">
            {lobbyState.traders.filter(t => !t.isEliminated).length} ACTIVE
          </span>
        </div>
      </div>

      {/* Leaderboard Rows */}
      <div className="flex-1 overflow-hidden">
        {lobbyState.traders.slice(0, 8).map((trader, idx) => (
          <LeaderboardRow key={trader.id} trader={trader} index={idx} />
        ))}
      </div>

      {/* Sabotage Feed */}
      <div className="border-t border-[#1A1A1A]">
        <div className="px-[20px] py-[10px]">
          <span className="font-heading text-[11px] tracking-[0.15em] text-[#444444]">
            SABOTAGE FEED
          </span>
        </div>
        <div className="px-[20px] pb-[16px] flex flex-col gap-[10px]">
          {lobbyState.sabotageEvents.slice(0, 3).map((event, idx) => (
            <div
              key={event.id}
              className={`pl-[10px] font-body text-[11px] leading-[1.4] animate-slide-in-left stagger-${idx + 1}`}
              style={{
                borderLeft: '2px solid #F5A0D0',
                color: '#666666',
              }}
            >
              <span className="text-[#F5A0D0]">{event.from}</span>
              <span className="text-[#333333]"> → </span>
              <span className="text-white">{event.to}</span>
              <span className="text-[#444444]"> · {event.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Prediction Market Component
function RightPanel({ lobbyState }: { lobbyState: LobbyState }) {
  const totalBets = lobbyState.predictionMarket.reduce((sum, e) => sum + e.totalBets, 0)

  return (
    <div className="absolute right-0 bottom-[56px] w-[300px] h-[420px] flex flex-col broadcast-panel">
      {/* Header */}
      <div className="px-[20px] py-[16px] border-b border-[#1A1A1A]">
        <span className="font-heading text-[13px] tracking-[0.15em] text-[#555555]">
          WHO WINS THIS ROUND?
        </span>
      </div>

      {/* Prediction Entries */}
      <div className="flex-1 px-[20px] py-[16px] flex flex-col gap-[20px]">
        {lobbyState.predictionMarket.map((entry, idx) => {
          const maxOdds = Math.max(...lobbyState.predictionMarket.map(e => e.odds))
          const barWidth = (entry.odds / maxOdds) * 100
          const isLeading = idx === 0

          return (
            <div key={entry.traderId} className={`flex flex-col gap-[8px] animate-fade-in stagger-${idx + 1}`}>
              <div className="flex items-center justify-between">
                <span className={`font-heading text-[16px] tracking-[0.05em] ${isLeading ? 'text-[#F5A0D0]' : 'text-white'}`}>
                  {entry.traderName}
                </span>
                <span className="font-heading text-[20px] tracking-[0.02em] text-white">
                  {entry.odds.toFixed(1)}<span className="text-[14px] text-[#555555]">X</span>
                </span>
              </div>
              {/* Progress Bar */}
              <div className="h-[4px] w-full bg-[#1A1A1A] overflow-hidden">
                <div
                  className="h-full transition-all duration-700 ease-out"
                  style={{
                    width: `${barWidth}%`,
                    background: isLeading
                      ? 'linear-gradient(90deg, #F5A0D0 0%, #E080B8 100%)'
                      : 'linear-gradient(90deg, #444444 0%, #333333 100%)',
                    boxShadow: isLeading ? '0 0 12px rgba(245, 160, 208, 0.4)' : 'none',
                  }}
                />
              </div>
              <span className="font-mono text-[10px] text-[#444444]">
                {entry.totalBets.toLocaleString()} CR
              </span>
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div className="px-[20px] py-[14px] border-t border-[#1A1A1A] flex items-center justify-between">
        <span className="font-heading text-[11px] tracking-[0.1em] text-[#444444]">
          TOTAL POOL
        </span>
        <span className="font-mono text-[14px] text-[#F5A0D0] number-display">
          {totalBets.toLocaleString()} CR
        </span>
      </div>
    </div>
  )
}

// Bottom Ticker Component
function BottomTicker({ lobbyState }: { lobbyState: LobbyState }) {
  const tickerItems = [
    { type: 'trade', text: 'WOLFPACK opens BTC LONG $5,000 @ 5X' },
    { type: 'sabotage', text: 'ANONYMOUS locks out IRON HANDS for 30s' },
    { type: 'trade', text: 'VEGA closes ETH SHORT +$840' },
    { type: 'event', text: 'FLASH CRASH WARNING — 2:14' },
    { type: 'trade', text: 'IRON HANDS opens SOL LONG $2,000 @ 3X' },
    { type: 'trade', text: 'DEGEN PRIME closes BTC SHORT -$320' },
    { type: 'sabotage', text: 'VEGA ghosts DEGEN PRIME positions' },
    { type: 'trade', text: 'ANONYMOUS opens ETH LONG $4,000 @ 4X' },
  ]

  const getIcon = (type: string) => {
    if (type === 'sabotage') return '◆'
    if (type === 'event') return '▲'
    return '•'
  }

  const getColor = (type: string) => {
    if (type === 'sabotage') return '#F5A0D0'
    if (type === 'event') return '#FF3333'
    return '#888888'
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[56px] overflow-hidden broadcast-panel border-t border-[#222222]">
      {/* Gradient fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-[80px] bg-gradient-to-r from-[#0A0A0A] to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-[80px] bg-gradient-to-l from-[#0A0A0A] to-transparent z-10" />

      <div className="flex items-center h-full animate-scroll-left whitespace-nowrap">
        {[...tickerItems, ...tickerItems].map((item, idx) => (
          <span
            key={idx}
            className="font-body text-[13px] mx-[40px] flex items-center gap-[8px]"
            style={{ color: getColor(item.type) }}
          >
            <span className="text-[8px]">{getIcon(item.type)}</span>
            {item.text}
          </span>
        ))}
      </div>
    </div>
  )
}

// Event Overlay Component
function EventOverlay({ event }: { event: VolatilityEvent | null }) {
  if (!event) return null

  const getEventContent = () => {
    switch (event.type) {
      case 'FLASH_CRASH':
        return {
          icon: '▼',
          title: 'FLASH CRASH',
          color: '#FF3333',
          glowColor: 'rgba(255, 51, 51, 0.6)',
          subtitle: `${event.asset} ${event.impact}%`,
        }
      case 'MOON_SHOT':
        return {
          icon: '▲',
          title: 'MOON SHOT',
          color: '#00FF88',
          glowColor: 'rgba(0, 255, 136, 0.6)',
          subtitle: `${event.asset} +${event.impact}%`,
        }
      case 'LOCKOUT':
        return {
          icon: '■',
          title: 'TRADING HALTED',
          color: '#FF3333',
          glowColor: 'rgba(255, 51, 51, 0.6)',
          subtitle: '',
        }
      default:
        return null
    }
  }

  const content = getEventContent()
  if (!content) return null

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 vignette">
      {/* Background pulse */}
      <div
        className="absolute inset-0 animate-pulse-glow"
        style={{
          background: `radial-gradient(ellipse at center, ${content.glowColor} 0%, transparent 70%)`,
          opacity: 0.15,
        }}
      />

      <div className="flex flex-col items-center animate-scale-in-bounce">
        <span
          className="font-heading text-[24px] tracking-[0.3em] mb-[16px]"
          style={{ color: content.color, opacity: 0.6 }}
        >
          {content.icon}
        </span>
        <div
          className="font-heading text-[140px] tracking-[0.08em] leading-none"
          style={{
            color: content.color,
            textShadow: `0 0 60px ${content.glowColor}, 0 0 120px ${content.glowColor}`,
          }}
        >
          {content.title}
        </div>
        {content.subtitle && (
          <div
            className="font-heading text-[72px] tracking-[0.05em] text-white mt-[24px] animate-fade-in"
            style={{ animationDelay: '300ms' }}
          >
            {content.subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

// Elimination Overlay Component
function EliminationOverlay({
  phase,
  traderName,
  finalReturn,
}: {
  phase: 'incoming' | 'reveal' | null
  traderName?: string
  finalReturn?: number
}) {
  if (!phase) return null

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-[#0A0A0A]">
      {phase === 'incoming' && (
        <div className="flex flex-col items-center">
          <div className="w-[400px] h-[2px] bg-[#1A1A1A] mb-[32px] overflow-hidden">
            <div className="h-full w-full bg-[#F5A0D0] animate-shimmer" />
          </div>
          <div
            className="font-heading text-[72px] tracking-[0.1em] animate-pulse-danger"
            style={{ color: '#F5A0D0' }}
          >
            SCORES FROZEN
          </div>
          <div className="w-[400px] h-[2px] bg-[#1A1A1A] mt-[32px] overflow-hidden">
            <div className="h-full w-full bg-[#F5A0D0] animate-shimmer" />
          </div>
        </div>
      )}

      {phase === 'reveal' && (
        <div className="flex flex-col items-center">
          <div
            className="font-heading text-[200px] tracking-[0.1em] leading-none animate-scale-in-bounce"
            style={{
              color: '#FF3333',
              textShadow: '0 0 80px rgba(255, 51, 51, 0.6), 0 0 160px rgba(255, 51, 51, 0.3)',
            }}
          >
            ELIMINATED
          </div>
          {traderName && (
            <div
              className="font-heading text-[96px] tracking-[0.05em] text-white mt-[40px] animate-slide-in-up"
              style={{ animationDelay: '400ms', opacity: 0 }}
            >
              {traderName}
            </div>
          )}
          {finalReturn !== undefined && (
            <div
              className="font-heading text-[64px] tracking-[0.05em] mt-[24px] animate-fade-in"
              style={{
                color: finalReturn >= 0 ? '#00FF88' : '#FF3333',
                animationDelay: '800ms',
                opacity: 0,
              }}
            >
              FINAL: {finalReturn >= 0 ? '+' : ''}{finalReturn.toFixed(1)}%
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Winner Overlay Component
function WinnerOverlay({
  round,
  winnerName,
  winnerReturn,
  showConfetti,
}: {
  round: number
  winnerName: string
  winnerReturn: number
  showConfetti: boolean
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-[#0A0A0A] overflow-hidden">
      {/* Radial glow background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(245, 160, 208, 0.15) 0%, transparent 60%)',
        }}
      />

      {/* Confetti */}
      {showConfetti && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 60 }).map((_, i) => {
            const left = (i * 17) % 100
            const size = 6 + (i % 8)
            const colorIndex = i % 3
            const duration = 4 + (i % 3)
            const delay = (i * 0.033) % 2
            return (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${left}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: ['#F5A0D0', '#FFFFFF', '#00FF88'][colorIndex],
                  animation: `confetti-fall ${duration}s linear forwards`,
                  animationDelay: `${delay}s`,
                }}
              />
            )
          })}
        </div>
      )}

      <div className="flex flex-col items-center relative z-10">
        <div
          className="font-heading text-[28px] tracking-[0.3em] mb-[40px] animate-fade-in"
          style={{ color: '#F5A0D0' }}
        >
          ROUND {round} CHAMPION
        </div>

        <div
          className="font-heading text-[180px] tracking-[0.06em] text-white leading-none animate-scale-in-bounce"
        >
          {winnerName}
        </div>

        <div
          className="font-heading text-[120px] tracking-[0.02em] mt-[32px] animate-profit-glow animate-fade-in"
          style={{
            color: '#00FF88',
            textShadow: '0 0 60px rgba(0, 255, 136, 0.6), 0 0 120px rgba(0, 255, 136, 0.3)',
            animationDelay: '500ms',
          }}
        >
          +{winnerReturn.toFixed(1)}%
        </div>
      </div>
    </div>
  )
}

// Main Broadcast Page
export default function BroadcastPage() {
  const { id: lobbyId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const sponsorLogo = searchParams.get('sponsor_logo')
  const { lobbyState, connected } = useBroadcastData(lobbyId)

  const currentEvent = lobbyState.currentEvent ?? null
  const isElimination = lobbyState.status === 'ELIMINATION'
  const isChampion = lobbyState.status === 'CHAMPION'
  const winner = lobbyState.traders[0]

  // Derive elimination phase from round status
  const eliminationPhase: 'incoming' | 'reveal' | null = isElimination ? 'incoming' : null
  const lastEliminated = lobbyState.traders.filter(t => t.isEliminated).pop()

  return (
    <div
      className="relative w-[1920px] h-[1080px] overflow-hidden"
      style={{ backgroundColor: 'transparent' }}
    >
      <ConnectionBanner isConnected={connected} />

      {/* Normal broadcast UI */}
      {!isElimination && !isChampion && !currentEvent && (
        <>
          <TopBar lobbyState={lobbyState} sponsorLogo={sponsorLogo} />
          <LeftPanel lobbyState={lobbyState} />
          <RightPanel lobbyState={lobbyState} />
          <BottomTicker lobbyState={lobbyState} />
        </>
      )}

      {/* Event Overlay */}
      <EventOverlay event={currentEvent} />

      {/* Elimination Overlay */}
      <EliminationOverlay
        phase={eliminationPhase}
        traderName={lastEliminated?.name}
        finalReturn={lastEliminated?.return}
      />

      {/* Winner Overlay */}
      {isChampion && winner && (
        <WinnerOverlay
          round={lobbyState.round}
          winnerName={winner.name}
          winnerReturn={winner.return}
          showConfetti={true}
        />
      )}

      <Scanlines />
    </div>
  )
}
