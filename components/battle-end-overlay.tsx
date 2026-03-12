'use client'

import { useEffect, useCallback } from 'react'
import { font, c, radius, btnPrimary, btnSecondary } from '@/app/design'

interface BattleEndOverlayProps {
  visible: boolean
  rank: number
  totalPlayers: number
  returnPct: number
  lobbyId: string
  onRematch: () => void
  onViewRecap: () => void
  onBackToDashboard: () => void
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function rankColor(rank: number): string {
  if (rank === 1) return c.gold
  if (rank === 2) return '#C0C0C0'
  if (rank === 3) return '#CD7F32'
  return c.text2
}

const overlayCSS = `
@keyframes battleOverlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes battleContentSlideUp {
  from { opacity: 0; transform: translateY(32px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes battleRankPop {
  0% { transform: scale(0.3); opacity: 0; }
  60% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes battleConfettiBurst {
  0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translateY(-120px) rotate(720deg) scale(0); opacity: 0; }
}

@keyframes battleGoldPulse {
  0%, 100% { box-shadow: 0 0 30px rgba(255,215,0,.15), 0 0 80px rgba(255,215,0,.05); }
  50% { box-shadow: 0 0 50px rgba(255,215,0,.3), 0 0 120px rgba(255,215,0,.1); }
}

@keyframes battleHeroPulse {
  0%, 100% { text-shadow: 0 0 20px rgba(255,215,0,.3); }
  50% { text-shadow: 0 0 40px rgba(255,215,0,.5), 0 0 80px rgba(255,215,0,.2); }
}

@keyframes battleBtnGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(245,160,208,.15), 0 0 60px rgba(245,160,208,.05); }
  50% { box-shadow: 0 0 30px rgba(245,160,208,.3), 0 0 80px rgba(245,160,208,.1); }
}
`

export default function BattleEndOverlay({
  visible,
  rank,
  totalPlayers,
  returnPct,
  lobbyId,
  onRematch,
  onViewRecap,
  onBackToDashboard,
}: BattleEndOverlayProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onBackToDashboard()
  }, [onBackToDashboard])

  useEffect(() => {
    if (!visible) return
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [visible, handleEscape])

  if (!visible) return null

  const isWinner = rank === 1
  const isPodium = rank <= 3
  const pctColor = returnPct >= 0 ? c.green : c.red
  const pctSign = returnPct >= 0 ? '+' : ''

  return (
    <>
      <style>{overlayCSS}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Battle ended — you placed ${ordinal(rank)}`}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,.75)',
          backdropFilter: 'blur(16px) saturate(1.2)',
          animation: 'battleOverlayFadeIn 0.4s ease-out both',
        }}
      >
        {/* Confetti particles for 1st place */}
        {isWinner && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            {Array.from({ length: 24 }).map((_, i) => {
              const colors = [c.gold, c.pink, c.green, '#FF8C00', c.blue, '#FFFFFF']
              const color = colors[i % colors.length]
              const left = 10 + Math.random() * 80
              const delay = Math.random() * 2
              const duration = 1.8 + Math.random() * 1.2
              const size = 4 + Math.random() * 6
              return (
                <span
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: '55%',
                    width: size,
                    height: size,
                    borderRadius: i % 3 === 0 ? '50%' : 2,
                    background: color,
                    animation: `battleConfettiBurst ${duration}s ease-out infinite`,
                    animationDelay: `${delay}s`,
                  }}
                />
              )
            })}
          </div>
        )}

        {/* Main content card */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 400,
            margin: '0 20px',
            padding: '48px 32px 36px',
            background: c.surface,
            border: `1px solid ${isWinner ? 'rgba(255,215,0,.2)' : c.border}`,
            borderRadius: radius.xl,
            textAlign: 'center',
            animation: `battleContentSlideUp 0.5s cubic-bezier(.4,0,.2,1) 0.15s both${
              isWinner ? ', battleGoldPulse 3s ease-in-out infinite 0.8s' : ''
            }`,
          }}
        >
          {/* Rank badge */}
          <div
            style={{
              animation: 'battleRankPop 0.6s cubic-bezier(.34,1.56,.64,1) 0.4s both',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontFamily: font.display,
                fontSize: isWinner ? 72 : 56,
                lineHeight: 1,
                color: rankColor(rank),
                letterSpacing: '0.02em',
                animation: isWinner ? 'battleHeroPulse 2.5s ease-in-out infinite 1s' : 'none',
              }}
            >
              {ordinal(rank)}
            </div>
            <div
              style={{
                fontFamily: font.sans,
                fontSize: 14,
                fontWeight: 600,
                color: isPodium ? rankColor(rank) : c.text3,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginTop: 4,
                opacity: 0.8,
              }}
            >
              PLACE
            </div>
          </div>

          {/* Out of total */}
          <div
            style={{
              fontFamily: font.sans,
              fontSize: 13,
              color: c.text3,
              marginBottom: 28,
            }}
          >
            out of {totalPlayers} traders
          </div>

          {/* Return percentage — hero number */}
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 48,
              fontWeight: 700,
              color: pctColor,
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {pctSign}{returnPct.toFixed(2)}%
          </div>
          <div
            style={{
              fontFamily: font.sans,
              fontSize: 12,
              fontWeight: 500,
              color: c.text3,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 40,
            }}
          >
            RETURN
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* REMATCH — primary CTA */}
            <button
              className="btn-p"
              onClick={onRematch}
              aria-label="Rematch — play again"
              style={{
                ...btnPrimary,
                width: '100%',
                padding: '16px 24px',
                fontSize: 17,
                letterSpacing: '0.06em',
                animation: 'battleBtnGlow 2.5s ease-in-out infinite 1.2s',
              }}
            >
              REMATCH
            </button>

            {/* VIEW RECAP — secondary */}
            <button
              className="btn-s"
              onClick={onViewRecap}
              aria-label="View round recap"
              style={{
                ...btnSecondary,
                width: '100%',
                padding: '13px 24px',
                fontSize: 14,
                letterSpacing: '0.04em',
              }}
            >
              VIEW RECAP
            </button>

            {/* Back to Dashboard — ghost */}
            <button
              onClick={onBackToDashboard}
              aria-label="Back to dashboard"
              style={{
                background: 'none',
                border: 'none',
                fontFamily: font.sans,
                fontSize: 13,
                fontWeight: 400,
                color: c.text3,
                cursor: 'pointer',
                padding: '10px 0',
                transition: 'color .15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = c.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = c.text3)}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
