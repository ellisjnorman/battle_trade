'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { type LobbyState, type BroadcastTrader } from '@/lib/battle-trade-types'
import { useBroadcastData } from '@/hooks/use-broadcast-data'
import { Scanlines } from '@/components/broadcast/scanlines'
import { ConnectionBanner } from '@/components/broadcast/connection-banner'

type StageState = 'PRE_SHOW' | 'BETWEEN_ROUNDS' | 'CHAMPION'

// Pre-Show Countdown State
function PreShowState({ countdown, sponsorLogo }: { countdown: number; sponsorLogo: string | null }) {
  const hours = Math.floor(countdown / 3600)
  const minutes = Math.floor((countdown % 3600) / 60)
  const seconds = countdown % 60
  const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  const isDanger = countdown < 60
  const isPulsing = countdown < 60

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative">
      {/* Radial glow background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(245, 160, 208, 0.08) 0%, transparent 50%)',
        }}
      />

      {/* Vertical Sponsor Strips */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[100px] flex items-center justify-center"
        style={{
          background: 'linear-gradient(90deg, rgba(245, 160, 208, 0.03) 0%, transparent 100%)',
          borderRight: '1px solid rgba(34, 34, 34, 0.5)',
        }}
      >
        {sponsorLogo ? (
          <img src={sponsorLogo} className="h-[48px] w-auto object-contain" alt="Sponsor" style={{ writingMode: 'horizontal-tb' }} />
        ) : (
          <span
            className="font-heading text-[12px] tracking-[0.4em]"
            style={{
              color: '#333333',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
            }}
          >
            SPONSOR
          </span>
        )}
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 w-[100px] flex items-center justify-center"
        style={{
          background: 'linear-gradient(270deg, rgba(245, 160, 208, 0.03) 0%, transparent 100%)',
          borderLeft: '1px solid rgba(34, 34, 34, 0.5)',
        }}
      >
        {sponsorLogo ? (
          <img src={sponsorLogo} className="h-[48px] w-auto object-contain" alt="Sponsor" />
        ) : (
          <span
            className="font-heading text-[12px] tracking-[0.4em]"
            style={{
              color: '#333333',
              writingMode: 'vertical-rl',
            }}
          >
            SPONSOR
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center relative z-10">
        {/* Logo */}
        <div className="mb-[24px] animate-fade-in">
          <img
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Main%20Logo-nybM2MPFM4KGqFqGIh2sVD8QFiTxQt.png"
            alt="Battle Trade"
            className="h-[80px] w-auto"
            style={{ filter: 'drop-shadow(0 0 40px rgba(245, 160, 208, 0.3))' }}
          />
        </div>

        {/* Tagline */}
        <p
          className="font-heading text-[20px] tracking-[0.4em] mb-[80px] animate-fade-in"
          style={{ color: '#F5A0D0', animationDelay: '200ms' }}
        >
          THE FUTURE OF FINANCE IS MULTIPLAYER
        </p>

        {/* Countdown Label */}
        <span
          className="font-heading text-[14px] tracking-[0.3em] mb-[24px] animate-fade-in"
          style={{ color: '#555555', animationDelay: '400ms' }}
        >
          COMPETITION STARTS IN
        </span>

        {/* Countdown Timer */}
        <div className="relative">
          {isDanger && (
            <div
              className="absolute inset-0 animate-pulse-glow"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(255, 51, 51, 0.3) 0%, transparent 70%)',
                filter: 'blur(40px)',
              }}
            />
          )}
          <span
            className={`font-mono text-[160px] number-display relative z-10 ${isPulsing ? 'animate-pulse-danger' : ''}`}
            style={{
              color: isDanger ? '#FF3333' : '#FFFFFF',
              textShadow: isDanger
                ? '0 0 60px rgba(255, 51, 51, 0.8), 0 0 120px rgba(255, 51, 51, 0.4)'
                : '0 0 40px rgba(255, 255, 255, 0.1)',
              letterSpacing: '0.05em',
            }}
          >
            {timeStr}
          </span>
        </div>
      </div>

      {/* Bottom Sponsor Zone */}
      <div className="absolute bottom-[80px] flex flex-col items-center animate-fade-in" style={{ animationDelay: '600ms' }}>
        <span className="font-heading text-[11px] tracking-[0.2em] mb-[16px]" style={{ color: '#444444' }}>
          PRESENTED BY
        </span>
        <div
          className="w-[320px] h-[64px] flex items-center justify-center border border-dashed border-[#333333] broadcast-glass"
        >
          {sponsorLogo ? (
            <img src={sponsorLogo} className="h-full w-auto object-contain" alt="Sponsor" />
          ) : (
            <span className="font-heading text-[13px] tracking-[0.15em]" style={{ color: '#333333' }}>
              SPONSOR LOGO
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Between Rounds State (Standings Table)
function BetweenRoundsState({
  round,
  traders,
  nextRoundCountdown,
  totalRounds,
}: {
  round: number
  traders: BroadcastTrader[]
  nextRoundCountdown: number
  totalRounds: number
}) {
  const minutes = Math.floor(nextRoundCountdown / 60)
  const seconds = nextRoundCountdown % 60
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`
  const isLastRound = round === totalRounds - 1

  return (
    <div className="flex-1 flex flex-col items-center pt-[100px] relative">
      {/* Subtle background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at top, rgba(245, 160, 208, 0.05) 0%, transparent 50%)',
        }}
      />

      {/* Header */}
      <div className="flex flex-col items-center mb-[60px] relative z-10">
        <span className="font-heading text-[16px] tracking-[0.3em] text-[#555555] mb-[8px]">
          ROUND {round}
        </span>
        <h1 className="font-heading text-[64px] tracking-[0.1em] text-white animate-fade-in">
          COMPLETE
        </h1>
      </div>

      {/* Final Standings Table */}
      <div className="w-[900px] relative z-10 broadcast-panel">
        {/* Table Header */}
        <div
          className="h-[56px] flex items-center px-[32px]"
          style={{ borderBottom: '1px solid #333333' }}
        >
          <span className="font-heading text-[11px] tracking-[0.15em] w-[80px] text-[#555555]">
            RANK
          </span>
          <span className="font-heading text-[11px] tracking-[0.15em] flex-1 text-[#555555]">
            TRADER
          </span>
          <span className="font-heading text-[11px] tracking-[0.15em] w-[120px] text-right text-[#555555]">
            RETURN
          </span>
          <span className="font-heading text-[11px] tracking-[0.15em] w-[100px] text-right text-[#555555]">
            TRADES
          </span>
          <span className="font-heading text-[11px] tracking-[0.15em] w-[100px] text-right text-[#555555]">
            SABOTAGES
          </span>
        </div>

        {/* Table Rows */}
        {traders.map((trader, idx) => {
          const isFirst = trader.rank === 1
          const isTop3 = trader.rank <= 3

          return (
            <div
              key={trader.id}
              className={`h-[72px] flex items-center px-[32px] animate-fade-in stagger-${Math.min(idx + 1, 8)}`}
              style={{
                background: isFirst
                  ? 'linear-gradient(90deg, rgba(245, 160, 208, 0.1) 0%, transparent 100%)'
                  : 'transparent',
                borderLeft: isFirst ? '3px solid #F5A0D0' : '3px solid transparent',
                borderBottom: '1px solid rgba(34, 34, 34, 0.6)',
                opacity: trader.isEliminated ? 0.3 : 1,
              }}
            >
              {/* Rank */}
              <div className="w-[80px]">
                <div
                  className={`w-[44px] h-[44px] flex items-center justify-center font-heading text-[24px] ${isFirst ? 'rank-badge-1' : isTop3 ? 'rank-badge-top3' : ''}`}
                >
                  <span style={{ color: isFirst ? '#0A0A0A' : isTop3 ? '#FFFFFF' : '#444444' }}>
                    {trader.rank}
                  </span>
                </div>
              </div>

              {/* Name */}
              <span
                className={`font-heading text-[28px] flex-1 tracking-[0.05em] ${trader.isEliminated ? 'line-through' : ''}`}
                style={{ color: trader.isEliminated ? '#333333' : isFirst ? '#F5A0D0' : '#FFFFFF' }}
              >
                {trader.name}
              </span>

              {/* Return */}
              <span
                className="font-mono text-[24px] w-[120px] text-right number-display"
                style={{
                  color: trader.isEliminated ? '#333333' : trader.return >= 0 ? '#00FF88' : '#FF3333',
                  textShadow: trader.isEliminated
                    ? 'none'
                    : trader.return >= 0
                    ? '0 0 20px rgba(0, 255, 136, 0.5)'
                    : '0 0 20px rgba(255, 51, 51, 0.5)',
                }}
              >
                {trader.return >= 0 ? '+' : ''}{trader.return.toFixed(1)}%
              </span>

              {/* Trades */}
              <span
                className="font-mono text-[18px] w-[100px] text-right number-display"
                style={{ color: trader.isEliminated ? '#333333' : '#666666' }}
              >
                {5 + ((idx * 7 + 3) % 15)}
              </span>

              {/* Sabotages */}
              <span
                className="font-mono text-[18px] w-[100px] text-right number-display"
                style={{ color: trader.isEliminated ? '#333333' : '#666666' }}
              >
                {(idx * 3 + 1) % 5}
              </span>
            </div>
          )
        })}
      </div>

      {/* Next Round Countdown */}
      <div className="mt-[80px] flex flex-col items-center relative z-10">
        <span className="font-heading text-[14px] tracking-[0.3em] text-[#555555] mb-[16px]">
          {isLastRound ? 'FINAL SHOWDOWN' : `ROUND ${round + 1}`} BEGINS IN
        </span>
        <span
          className="font-mono text-[72px] number-display"
          style={{
            color: '#FFFFFF',
            textShadow: '0 0 30px rgba(255, 255, 255, 0.2)',
          }}
        >
          {timeStr}
        </span>
      </div>
    </div>
  )
}

// Champion State
function ChampionState({
  round,
  winner,
  sponsorLogo,
}: {
  round: number
  winner: BroadcastTrader
  sponsorLogo: string | null
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Radial glow background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(245, 160, 208, 0.2) 0%, transparent 60%)',
        }}
      />

      {/* Secondary glow for profit */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 70%, rgba(0, 255, 136, 0.15) 0%, transparent 50%)',
        }}
      />

      {/* Confetti */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 100 }).map((_, i) => {
          const left = (i * 17) % 100
          const size = 8 + (i % 10)
          const colorIndex = i % 4
          const duration = 5 + (i % 5)
          const delay = (i * 0.03) % 3
          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${left}%`,
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: ['#F5A0D0', '#FFFFFF', '#00FF88', '#F5A0D0'][colorIndex],
                animation: `confetti-fall ${duration}s linear forwards`,
                animationDelay: `${delay}s`,
                opacity: 0.9,
              }}
            />
          )
        })}
      </div>

      {/* Content */}
      <div className="flex flex-col items-center relative z-10">
        {/* Champion Badge */}
        <div
          className="flex items-center gap-[24px] mb-[48px] animate-fade-in"
        >
          <div className="w-[60px] h-[1px] bg-gradient-to-r from-transparent to-[#F5A0D0]" />
          <span
            className="font-heading text-[28px] tracking-[0.4em]"
            style={{ color: '#F5A0D0' }}
          >
            ROUND {round} CHAMPION
          </span>
          <div className="w-[60px] h-[1px] bg-gradient-to-l from-transparent to-[#F5A0D0]" />
        </div>

        {/* Winner Name */}
        <h1
          className="font-heading text-[280px] tracking-[0.06em] text-white leading-none animate-scale-in-bounce"
          style={{
            textShadow: '0 0 80px rgba(255, 255, 255, 0.2), 0 0 160px rgba(245, 160, 208, 0.2)',
          }}
        >
          {winner.name}
        </h1>

        {/* Return */}
        <div
          className="mt-[48px] animate-fade-in animate-profit-glow"
          style={{ animationDelay: '600ms' }}
        >
          <span
            className="font-heading text-[160px] tracking-[0.02em] number-display"
            style={{
              color: '#00FF88',
              textShadow: '0 0 80px rgba(0, 255, 136, 0.6), 0 0 160px rgba(0, 255, 136, 0.3)',
            }}
          >
            +{winner.return.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Bottom Sponsor */}
      <div className="absolute bottom-[80px] flex items-center gap-[24px] animate-fade-in" style={{ animationDelay: '1000ms' }}>
        <span className="font-heading text-[11px] tracking-[0.2em]" style={{ color: '#444444' }}>
          PRESENTED BY
        </span>
        <div
          className="w-[200px] h-[48px] flex items-center justify-center border border-dashed border-[#333333]"
        >
          {sponsorLogo ? (
            <img src={sponsorLogo} className="h-full w-auto object-contain" alt="Sponsor" />
          ) : (
            <span className="font-heading text-[11px] tracking-[0.15em]" style={{ color: '#333333' }}>
              SPONSOR LOGO
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Map lobby/round status to stage state
function deriveStageState(lobbyStatus: string, roundStatus: string | undefined): StageState {
  // waiting → PRE_SHOW
  if (lobbyStatus === 'waiting') return 'PRE_SHOW'
  // completed → CHAMPION
  if (lobbyStatus === 'completed') return 'CHAMPION'
  // active lobby: check round status
  if (!roundStatus || roundStatus === 'pending') return 'PRE_SHOW'
  if (roundStatus === 'completed' || roundStatus === 'frozen') return 'BETWEEN_ROUNDS'
  // active round → show between rounds (stage doesn't show live trading)
  return 'BETWEEN_ROUNDS'
}

// Main Stage Page
export default function StagePage() {
  const { id: lobbyId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const sponsorLogo = searchParams.get('sponsor_logo')
  const { lobbyState, connected, lobbyStatus, currentRound } = useBroadcastData(lobbyId)

  const stageState = deriveStageState(lobbyStatus, currentRound?.status)
  const winner = lobbyState.traders[0]

  // Pre-show uses timeRemaining from the hook (derived from round start)
  // If no round started yet, count stays at the lobby's timeRemaining
  const preShowCountdown = lobbyState.timeRemaining > 0 ? lobbyState.timeRemaining : 0
  const nextRoundCountdown = lobbyState.timeRemaining

  return (
    <div
      className="relative w-[1920px] h-[1080px] overflow-hidden flex flex-col vignette"
      style={{ backgroundColor: '#0A0A0A' }}
    >
      <ConnectionBanner isConnected={connected} />

      {stageState === 'PRE_SHOW' && <PreShowState countdown={preShowCountdown} sponsorLogo={sponsorLogo} />}

      {stageState === 'BETWEEN_ROUNDS' && (
        <BetweenRoundsState
          round={lobbyState.round}
          traders={lobbyState.traders}
          nextRoundCountdown={nextRoundCountdown}
          totalRounds={lobbyState.totalRounds}
        />
      )}

      {stageState === 'CHAMPION' && winner && (
        <ChampionState round={lobbyState.round} winner={winner} sponsorLogo={sponsorLogo} />
      )}

      <Scanlines />
    </div>
  )
}
