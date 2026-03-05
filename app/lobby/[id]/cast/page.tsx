'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { type LobbyState, type BroadcastTrader, type BroadcastPrice } from '@/lib/battle-trade-types'
import { useBroadcastData } from '@/hooks/use-broadcast-data'
import { Scanlines } from '@/components/broadcast/scanlines'
import { ConnectionBanner } from '@/components/broadcast/connection-banner'

// Mini Sparkline Component
function Sparkline({ data, color, isPositive }: { data: number[]; color: string; isPositive: boolean }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * 48
      const y = 16 - ((val - min) / range) * 16
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width="48" height="16" viewBox="0 0 48 16" className="opacity-80">
      <defs>
        <linearGradient id={`sparkline-${isPositive ? 'profit' : 'loss'}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={isPositive ? '#00FF88' : '#FF3333'} stopOpacity="0.2" />
          <stop offset="100%" stopColor={isPositive ? '#00FF88' : '#FF3333'} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={`url(#sparkline-${isPositive ? 'profit' : 'loss'})`}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  )
}

// Header Bar
function HeaderBar({ lobbyState }: { lobbyState: LobbyState }) {
  const minutes = Math.floor(lobbyState.timeRemaining / 60)
  const seconds = lobbyState.timeRemaining % 60
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  const isDanger = lobbyState.timeRemaining < 120

  return (
    <div className="h-[56px] flex items-center justify-between px-[32px] broadcast-panel edge-light-top">
      {/* Left */}
      <div className="flex items-center gap-[16px]">
        <div className="flex items-center gap-[8px]">
          <div className="w-[6px] h-[6px] bg-[#F5A0D0]" style={{ boxShadow: '0 0 8px #F5A0D0' }} />
          <span className="font-heading text-[14px] tracking-[0.15em] text-[#F5A0D0]">
            CAST MODE
          </span>
        </div>
        <div className="h-[20px] w-[1px] bg-[#222222]" />
        <span className="font-heading text-[14px] tracking-[0.08em] text-[#555555]">
          {lobbyState.name}
        </span>
      </div>

      {/* Center */}
      <div className="flex items-center gap-[24px]">
        <div className="flex items-center gap-[12px]">
          <span className="font-heading text-[12px] tracking-[0.15em] text-[#444444]">ROUND</span>
          <span className="font-heading text-[28px] tracking-[0.05em] text-white">
            {lobbyState.round}
          </span>
        </div>
        <div className="h-[24px] w-[1px] bg-[#222222]" />
        <span
          className={`font-mono text-[28px] number-display ${isDanger ? 'text-[#FF3333]' : 'text-white'}`}
          style={{ textShadow: isDanger ? '0 0 20px rgba(255, 51, 51, 0.5)' : 'none' }}
        >
          {timeStr}
        </span>
        <div
          className="px-[12px] py-[4px] font-heading text-[11px] tracking-[0.1em]"
          style={{
            backgroundColor: '#00FF88',
            color: '#0A0A0A',
            boxShadow: '0 0 12px rgba(0, 255, 136, 0.4)',
          }}
        >
          LIVE
        </div>
      </div>

      {/* Right */}
      {lobbyState.nextEvent ? (
        <div className="flex items-center gap-[12px]">
          <div className="w-[6px] h-[6px] bg-[#FF3333] animate-pulse-glow" style={{ boxShadow: '0 0 8px #FF3333' }} />
          <span className="font-heading text-[13px] tracking-[0.08em] text-[#FF3333]">
            {lobbyState.nextEvent.type} IN {Math.floor(lobbyState.nextEvent.timeUntil / 60)}:{(lobbyState.nextEvent.timeUntil % 60).toString().padStart(2, '0')}
          </span>
        </div>
      ) : (
        <span className="font-heading text-[13px] tracking-[0.08em] text-[#333333]">
          NO EVENT SCHEDULED
        </span>
      )}
    </div>
  )
}

// Seeded random number generator for deterministic sparklines
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function getSparklineData(traderId: string) {
  let seed = 0
  for (let i = 0; i < traderId.length; i++) {
    seed += traderId.charCodeAt(i) * (i + 1)
  }
  return Array.from({ length: 12 }, (_, i) => seededRandom(seed + i) * 100)
}

// Full Standings Panel (Left Column)
function StandingsPanel({ traders }: { traders: BroadcastTrader[] }) {
  return (
    <div className="w-[420px] h-full flex flex-col broadcast-panel edge-light-left">
      {/* Header */}
      <div className="px-[24px] py-[16px] border-b border-[#1A1A1A]">
        <div className="flex items-center justify-between">
          <span className="font-heading text-[12px] tracking-[0.2em] text-[#555555]">
            FULL STANDINGS
          </span>
          <span className="font-mono text-[11px] text-[#333333]">
            {traders.length} TRADERS
          </span>
        </div>
      </div>

      {/* Column Headers */}
      <div className="px-[24px] py-[10px] flex items-center gap-[12px] border-b border-[#1A1A1A] bg-[#0D0D0D]">
        <span className="font-heading text-[9px] tracking-[0.15em] w-[32px] text-[#444444]">#</span>
        <span className="font-heading text-[9px] tracking-[0.15em] flex-1 text-[#444444]">TRADER</span>
        <span className="font-heading text-[9px] tracking-[0.15em] w-[70px] text-right text-[#444444]">RETURN</span>
        <span className="font-heading text-[9px] tracking-[0.15em] w-[64px] text-right text-[#444444]">BALANCE</span>
        <span className="font-heading text-[9px] tracking-[0.15em] w-[48px] text-[#444444]">TREND</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {traders.map((trader, idx) => {
          const isFirst = trader.rank === 1
          const isTop3 = trader.rank <= 3
          const sparkData = getSparklineData(trader.id)

          return (
            <div
              key={trader.id}
              className={`h-[68px] flex items-center px-[24px] gap-[12px] border-b border-[#1A1A1A] animate-fade-in stagger-${Math.min(idx + 1, 8)}`}
              style={{
                opacity: trader.isEliminated ? 0.25 : 1,
                background: isFirst
                  ? 'linear-gradient(90deg, rgba(245, 160, 208, 0.08) 0%, transparent 100%)'
                  : 'transparent',
              }}
            >
              {/* Rank */}
              <div
                className={`w-[32px] h-[32px] flex items-center justify-center font-heading text-[18px] ${isFirst ? 'rank-badge-1' : isTop3 ? 'rank-badge-top3' : ''}`}
              >
                <span style={{ color: isFirst ? '#0A0A0A' : isTop3 ? '#FFFFFF' : '#444444' }}>
                  {trader.rank}
                </span>
              </div>

              {/* Info Column */}
              <div className="flex-1 flex flex-col gap-[4px] min-w-0">
                <div className="flex items-center gap-[8px]">
                  <span
                    className={`font-heading text-[16px] tracking-[0.05em] truncate ${trader.isEliminated ? 'line-through' : ''}`}
                    style={{ color: isFirst ? '#F5A0D0' : '#FFFFFF' }}
                  >
                    {trader.name}
                  </span>
                  {trader.sabotagesActive.slice(0, 1).map((sab) => (
                    <span
                      key={sab.id}
                      className="font-heading text-[9px] px-[6px] py-[2px] flex-shrink-0"
                      style={{
                        backgroundColor: sab.type === 'LOCKOUT' ? 'rgba(255, 51, 51, 0.15)' : '#1A1A1A',
                        color: sab.type === 'LOCKOUT' ? '#FF3333' : '#666666',
                        border: sab.type === 'LOCKOUT' ? '1px solid rgba(255, 51, 51, 0.3)' : 'none',
                      }}
                    >
                      {sab.type === 'LOCKOUT' ? 'LOCKED' : 'GHOST'} {sab.remainingTime}s
                    </span>
                  ))}
                </div>
                <span className="font-body text-[10px] text-[#444444] truncate">
                  {trader.positions.length > 0
                    ? trader.positions.slice(0, 2).map((p) => `${p.asset} ${p.direction}`).join(' · ')
                    : 'No open positions'}
                </span>
              </div>

              {/* Return */}
              <span
                className="font-mono text-[16px] w-[70px] text-right number-display"
                style={{
                  color: trader.return >= 0 ? '#00FF88' : '#FF3333',
                  textShadow: trader.return >= 0
                    ? '0 0 12px rgba(0, 255, 136, 0.4)'
                    : '0 0 12px rgba(255, 51, 51, 0.4)',
                }}
              >
                {trader.return >= 0 ? '+' : ''}{trader.return.toFixed(1)}%
              </span>

              {/* Balance */}
              <span className="font-mono text-[12px] w-[64px] text-right text-[#666666] number-display">
                ${(trader.balance / 1000).toFixed(1)}K
              </span>

              {/* Sparkline */}
              <Sparkline data={sparkData} color="#F5A0D0" isPositive={trader.return >= 0} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Narrative Feed Entry
interface FeedEntry {
  id: string
  type: 'trade' | 'big_trade' | 'sabotage' | 'event' | 'elimination'
  timestamp: string
  text: string
}

function NarrativeFeed({ lobbyState }: { lobbyState: LobbyState }) {
  const feedEntries: FeedEntry[] = [
    { id: '1', type: 'big_trade', timestamp: '14:22', text: 'WOLFPACK opens BTC LONG $5,000 @ 5X leverage' },
    { id: '2', type: 'trade', timestamp: '14:20', text: 'VEGA closes ETH SHORT with +$840 profit' },
    { id: '3', type: 'sabotage', timestamp: '14:18', text: 'ANONYMOUS → WOLFPACK · LOCKOUT activated (200cr)' },
    { id: '4', type: 'event', timestamp: '14:15', text: 'FLASH CRASH TRIGGERED · BTC drops 18% instantly' },
    { id: '5', type: 'trade', timestamp: '14:12', text: 'IRON HANDS opens SOL LONG $2,000 @ 3X' },
    { id: '6', type: 'trade', timestamp: '14:10', text: 'DEGEN PRIME closes BTC SHORT -$320 loss' },
    { id: '7', type: 'sabotage', timestamp: '14:08', text: 'VEGA → IRON HANDS · GHOST mode (150cr)' },
    { id: '8', type: 'elimination', timestamp: '14:05', text: 'MOON BOY ELIMINATED · Final return: -15.3%' },
    { id: '9', type: 'trade', timestamp: '14:02', text: 'ANONYMOUS opens ETH LONG $4,000 @ 4X' },
    { id: '10', type: 'big_trade', timestamp: '14:00', text: 'WOLFPACK closes SOL LONG +$1,240 profit' },
  ]

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'big_trade': return '#00FF88'
      case 'sabotage': return '#F5A0D0'
      case 'event':
      case 'elimination': return '#FF3333'
      default: return '#333333'
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'big_trade': return '▲'
      case 'sabotage': return '◆'
      case 'event': return '⚠'
      case 'elimination': return '✕'
      default: return '•'
    }
  }

  const narrativePrompt = "Wolfpack has opened 3 leveraged longs in 2 minutes. They're either front-running the moon shot or about to get absolutely wrecked."

  return (
    <div className="flex-1 h-full flex flex-col border-r border-[#1A1A1A]">
      {/* Header */}
      <div className="px-[24px] py-[16px] border-b border-[#1A1A1A]">
        <span className="font-heading text-[12px] tracking-[0.2em] text-[#555555]">
          NARRATIVE FEED
        </span>
      </div>

      {/* AI Prompt */}
      <div className="px-[24px] py-[16px] border-b border-[#1A1A1A] broadcast-panel-glow">
        <div className="flex items-start gap-[12px]">
          <div className="w-[4px] h-[4px] mt-[8px] bg-[#F5A0D0]" style={{ boxShadow: '0 0 8px #F5A0D0' }} />
          <p className="font-body text-[13px] leading-[1.6] text-[#888888] italic">
            {narrativePrompt}
          </p>
        </div>
      </div>

      {/* Feed Entries */}
      <div className="flex-1 overflow-y-auto">
        {feedEntries.map((entry, idx) => (
          <div
            key={entry.id}
            className={`px-[24px] py-[14px] border-b border-[#1A1A1A] flex items-start gap-[16px] animate-fade-in stagger-${Math.min(idx + 1, 8)}`}
            style={{
              borderLeftWidth: '3px',
              borderLeftColor: getBorderColor(entry.type),
              background: entry.type === 'elimination'
                ? 'linear-gradient(90deg, rgba(255, 51, 51, 0.05) 0%, transparent 100%)'
                : entry.type === 'big_trade'
                ? 'linear-gradient(90deg, rgba(0, 255, 136, 0.03) 0%, transparent 100%)'
                : 'transparent',
            }}
          >
            <span className="font-mono text-[10px] w-[36px] text-[#444444] pt-[2px]">
              {entry.timestamp}
            </span>
            <span
              className="text-[10px] w-[12px] pt-[3px]"
              style={{ color: getBorderColor(entry.type) }}
            >
              {getIcon(entry.type)}
            </span>
            <span
              className={`font-body text-[13px] leading-[1.5] flex-1 ${entry.type === 'big_trade' ? 'font-medium' : ''}`}
              style={{
                color: entry.type === 'elimination' ? '#FF3333' : entry.type === 'big_trade' ? '#FFFFFF' : '#AAAAAA',
              }}
            >
              {entry.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Intel Panel (Right Column)
function IntelPanel({ lobbyState }: { lobbyState: LobbyState }) {
  return (
    <div className="w-[320px] h-full flex flex-col broadcast-panel">
      {/* Live Prices */}
      <div className="border-b border-[#1A1A1A]">
        <div className="px-[24px] py-[12px] border-b border-[#1A1A1A] bg-[#0D0D0D]">
          <span className="font-heading text-[10px] tracking-[0.2em] text-[#555555]">
            LIVE PRICES
          </span>
        </div>
        <div className="px-[24px] py-[16px] flex flex-col gap-[12px]">
          {lobbyState.prices.map((price) => (
            <div key={price.asset} className="flex items-center justify-between">
              <span className="font-heading text-[15px] tracking-[0.05em] text-white">
                {price.asset}
              </span>
              <div className="flex items-center gap-[12px]">
                <span className="font-mono text-[15px] text-white number-display">
                  ${price.price.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </span>
                <span
                  className="font-mono text-[12px] number-display flex items-center gap-[4px]"
                  style={{ color: price.change24h >= 0 ? '#00FF88' : '#FF3333' }}
                >
                  <span className="text-[8px]">{price.change24h >= 0 ? '▲' : '▼'}</span>
                  {Math.abs(price.change24h).toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prediction Odds */}
      <div className="border-b border-[#1A1A1A]">
        <div className="px-[24px] py-[12px] border-b border-[#1A1A1A] bg-[#0D0D0D]">
          <span className="font-heading text-[10px] tracking-[0.2em] text-[#555555]">
            PREDICTION ODDS
          </span>
        </div>
        <div className="px-[24px] py-[16px] flex flex-col gap-[10px]">
          {lobbyState.predictionMarket.map((entry, idx) => (
            <div key={entry.traderId} className="flex items-center justify-between">
              <span className={`font-heading text-[13px] tracking-[0.05em] ${idx === 0 ? 'text-[#F5A0D0]' : 'text-white'}`}>
                {entry.traderName}
              </span>
              <span className="font-mono text-[14px] text-[#F5A0D0] number-display">
                {entry.odds.toFixed(1)}X
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Active Sabotages */}
      <div className="border-b border-[#1A1A1A]">
        <div className="px-[24px] py-[12px] border-b border-[#1A1A1A] bg-[#0D0D0D]">
          <span className="font-heading text-[10px] tracking-[0.2em] text-[#555555]">
            ACTIVE SABOTAGES
          </span>
        </div>
        <div className="px-[24px] py-[16px] flex flex-col gap-[8px]">
          {lobbyState.traders
            .filter((t) => t.sabotagesActive.length > 0)
            .flatMap((t) =>
              t.sabotagesActive.map((s) => (
                <div key={s.id} className="flex items-center justify-between">
                  <span className="font-body text-[12px] text-[#888888]">
                    {t.name}
                  </span>
                  <span
                    className="font-heading text-[11px]"
                    style={{ color: s.type === 'LOCKOUT' ? '#FF3333' : '#888888' }}
                  >
                    {s.type} · {s.remainingTime}s
                  </span>
                </div>
              ))
            )}
          {lobbyState.traders.every((t) => t.sabotagesActive.length === 0) && (
            <span className="font-body text-[12px] text-[#333333] italic">
              No active sabotages
            </span>
          )}
        </div>
      </div>

      {/* Credits */}
      <div className="border-b border-[#1A1A1A]">
        <div className="px-[24px] py-[12px] border-b border-[#1A1A1A] bg-[#0D0D0D]">
          <span className="font-heading text-[10px] tracking-[0.2em] text-[#555555]">
            CREDITS REMAINING
          </span>
        </div>
        <div className="px-[24px] py-[16px] grid grid-cols-2 gap-x-[16px] gap-y-[8px]">
          {lobbyState.traders.slice(0, 8).map((trader) => (
            <div key={trader.id} className="flex items-center justify-between">
              <span className="font-body text-[10px] text-[#555555] truncate max-w-[70px]">
                {trader.name}
              </span>
              <span className="font-mono text-[10px] text-[#888888] number-display">
                {trader.credits}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Event Schedule */}
      <div className="flex-1">
        <div className="px-[24px] py-[12px] border-b border-[#1A1A1A] bg-[#0D0D0D]">
          <span className="font-heading text-[10px] tracking-[0.2em] text-[#555555]">
            UPCOMING EVENTS
          </span>
        </div>
        <div className="px-[24px] py-[16px] flex flex-col gap-[12px]">
          {lobbyState.nextEvent && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[8px]">
                <div className="w-[6px] h-[6px] bg-[#FF3333] animate-pulse-glow" />
                <span className="font-heading text-[12px] tracking-[0.05em] text-[#FF3333]">
                  {lobbyState.nextEvent.type}
                </span>
              </div>
              <span className="font-mono text-[13px] text-[#FF3333] number-display">
                {Math.floor(lobbyState.nextEvent.timeUntil / 60)}:{(lobbyState.nextEvent.timeUntil % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="font-heading text-[12px] tracking-[0.05em] text-[#444444]">
              MOON SHOT
            </span>
            <span className="font-mono text-[13px] text-[#444444] number-display">
              5:42
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-heading text-[12px] tracking-[0.05em] text-[#444444]">
              WHALE DUMP
            </span>
            <span className="font-mono text-[13px] text-[#444444] number-display">
              8:15
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Main Cast Page
export default function CastPage() {
  const { id: lobbyId } = useParams<{ id: string }>()
  const { lobbyState, connected } = useBroadcastData(lobbyId)

  return (
    <div
      className="relative w-[1920px] h-[1080px] overflow-hidden flex flex-col"
      style={{ backgroundColor: '#0A0A0A' }}
    >
      <ConnectionBanner isConnected={connected} />
      <HeaderBar lobbyState={lobbyState} />

      {/* Three Columns */}
      <div className="flex-1 flex overflow-hidden">
        <StandingsPanel traders={lobbyState.traders} />
        <NarrativeFeed lobbyState={lobbyState} />
        <IntelPanel lobbyState={lobbyState} />
      </div>

      <Scanlines />
    </div>
  )
}
