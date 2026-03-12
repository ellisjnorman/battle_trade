'use client'

import { font, c } from '@/app/design'

interface StreakBadgeProps {
  streak: number
}

const streakCSS = `
@keyframes streakPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

@keyframes streakShake {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  10% { transform: translateX(-2px) rotate(-3deg); }
  20% { transform: translateX(2px) rotate(3deg); }
  30% { transform: translateX(-2px) rotate(-2deg); }
  40% { transform: translateX(2px) rotate(2deg); }
  50% { transform: translateX(-1px) rotate(-1deg); }
  60% { transform: translateX(1px) rotate(1deg); }
  70% { transform: translateX(-1px) rotate(0deg); }
  80% { transform: translateX(1px) rotate(0deg); }
  90% { transform: translateX(0) rotate(0deg); }
}

@keyframes streakParticleRise {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-18px) scale(0.3); }
}

@keyframes streakGlow {
  0%, 100% { text-shadow: 0 0 8px rgba(255,215,0,.4), 0 0 20px rgba(255,215,0,.2); }
  50% { text-shadow: 0 0 16px rgba(255,215,0,.7), 0 0 40px rgba(255,215,0,.3); }
}
`

export default function StreakBadge({ streak }: StreakBadgeProps) {
  if (streak < 2) return null

  const tier = streak >= 5 ? 'unstoppable' : streak >= 3 ? 'fire' : 'warm'

  const color = tier === 'unstoppable' ? c.gold : tier === 'fire' ? c.pink : '#FF8C00'
  const flameSize = tier === 'unstoppable' ? 28 : tier === 'fire' ? 22 : 16
  const label = tier === 'unstoppable' ? 'UNSTOPPABLE' : tier === 'fire' ? 'ON FIRE' : `${streak} streak`

  return (
    <>
      <style>{streakCSS}</style>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: tier === 'unstoppable' ? 8 : 6,
          padding: tier === 'unstoppable' ? '6px 14px' : '4px 10px',
          borderRadius: 999,
          background: tier === 'unstoppable'
            ? 'rgba(255,215,0,.1)'
            : tier === 'fire'
              ? 'rgba(245,160,208,.08)'
              : 'rgba(255,140,0,.08)',
          border: `1px solid ${
            tier === 'unstoppable'
              ? 'rgba(255,215,0,.2)'
              : tier === 'fire'
                ? 'rgba(245,160,208,.12)'
                : 'rgba(255,140,0,.12)'
          }`,
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {/* Flame icon */}
        <span
          style={{
            fontSize: flameSize,
            lineHeight: 1,
            animation:
              tier === 'unstoppable'
                ? 'streakShake 0.6s ease-in-out infinite'
                : tier === 'fire'
                  ? 'streakPulse 1.2s ease-in-out infinite'
                  : 'none',
            filter: tier === 'unstoppable' ? `drop-shadow(0 0 6px ${color})` : 'none',
          }}
          role="img"
          aria-label="flame"
        >
          🔥
        </span>

        {/* Label */}
        <span
          style={{
            fontFamily: tier === 'unstoppable' ? font.display : font.sans,
            fontSize: tier === 'unstoppable' ? 16 : tier === 'fire' ? 13 : 12,
            fontWeight: tier === 'warm' ? 500 : 700,
            color,
            letterSpacing: tier === 'unstoppable' ? '0.06em' : '0.03em',
            textTransform: 'uppercase' as const,
            animation: tier === 'unstoppable' ? 'streakGlow 2s ease-in-out infinite' : 'none',
          }}
        >
          {label}
        </span>

        {/* Streak count for fire+ tiers */}
        {tier !== 'warm' && (
          <span
            style={{
              fontFamily: font.mono,
              fontSize: tier === 'unstoppable' ? 14 : 12,
              fontWeight: 700,
              color,
              opacity: 0.7,
            }}
          >
            ×{streak}
          </span>
        )}

        {/* Particle effects for unstoppable tier */}
        {tier === 'unstoppable' && (
          <div
            style={{
              position: 'absolute',
              top: -4,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: `${15 + i * 18}%`,
                  top: 0,
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: i % 2 === 0 ? c.gold : c.pink,
                  animation: `streakParticleRise 1.4s ease-out infinite`,
                  animationDelay: `${i * 0.25}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
