'use client'

import { forwardRef, useEffect, useState, useCallback } from 'react'
import { c, font, radius, tierName, tierColor } from '@/app/design'

// --------------------------------------------------------------------------
// This component renders a 360x640 card (9:16 story ratio).
// Attach a ref to the outer div so html2canvas can capture it as an image:
//   import html2canvas from 'html2canvas'
//   const ref = useRef<HTMLDivElement>(null)
//   const canvas = await html2canvas(ref.current!)
// --------------------------------------------------------------------------

export interface RecapCardProps {
  playerName: string
  btrScore: number
  returnPct: number           // e.g. 43.2
  rank: number                // final position
  totalPlayers: number
  sabotagesLanded: number
  sabotagesDodged: number
  tradesExecuted: number
  bestTrade: { symbol: string; returnPct: number } | null
  worstTrade: { symbol: string; returnPct: number } | null
  lobbyName: string
  duration: string            // e.g. "15m"
  tier?: string               // e.g. "whale", "degen_king"
}

// ── helpers ────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function rankColor(rank: number): string {
  if (rank === 1) return '#FFD700'
  if (rank === 2) return '#C0C0C0'
  if (rank === 3) return '#CD7F32'
  return c.text2
}

function rankGlow(rank: number): string {
  if (rank === 1) return '0 0 24px rgba(255,215,0,.35), 0 0 60px rgba(255,215,0,.10)'
  if (rank === 2) return '0 0 16px rgba(192,192,192,.25)'
  if (rank === 3) return '0 0 16px rgba(205,127,50,.25)'
  return 'none'
}

function pctColor(pct: number): string {
  return pct >= 0 ? c.green : c.red
}

function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

// ── keyframes (injected once) ──────────────────────────────────

const RECAP_CSS = `
@keyframes recapFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: none; }
}
@keyframes recapShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes recapPulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: .6; }
}
`

// ── component ──────────────────────────────────────────────────

export const RecapCard = forwardRef<HTMLDivElement, RecapCardProps>(function RecapCard(props, ref) {
  const {
    playerName,
    btrScore,
    returnPct,
    rank,
    totalPlayers,
    sabotagesLanded,
    sabotagesDodged,
    tradesExecuted,
    bestTrade,
    worstTrade,
    lobbyName,
    duration,
    tier,
  } = props

  const [visible, setVisible] = useState(false)
  useEffect(() => { setVisible(true) }, [])

  const handleShare = useCallback(async () => {
    const text = [
      `${playerName} placed ${ordinal(rank)} in ${lobbyName}`,
      `Return: ${formatPct(returnPct)} | Trades: ${tradesExecuted}`,
      `Rank: ${btrScore}`,
      'battletrade.gg',
    ].join('\n')

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'My Battle Trade Recap', text })
        return
      } catch { /* user cancelled or unsupported */ }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard!')
    }
  }, [playerName, rank, lobbyName, returnPct, tradesExecuted, btrScore])

  // tier display
  const tName = tierName(tier)
  const tColor = tierColor(tier)

  return (
    <>
      <style>{RECAP_CSS}</style>

      <div
        ref={ref}
        style={{
          width: 360,
          height: 640,
          background: `linear-gradient(168deg, ${c.bg} 0%, #0E0E12 40%, #100D14 100%)`,
          borderRadius: radius.xl,
          overflow: 'hidden',
          position: 'relative',
          fontFamily: font.sans,
          display: 'flex',
          flexDirection: 'column',
          opacity: visible ? 1 : 0,
          transform: visible ? 'none' : 'translateY(16px)',
          transition: 'opacity .5s cubic-bezier(.4,0,.2,1), transform .5s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* subtle top accent line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${c.pink}, transparent)`,
        }} />

        {/* ambient glow */}
        <div style={{
          position: 'absolute',
          top: -60,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 260,
          height: 260,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${returnPct >= 0 ? 'rgba(0,220,130,.06)' : 'rgba(255,68,102,.06)'} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        {/* ── LOGO ── */}
        <div style={{
          padding: '20px 24px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: visible ? 'recapFadeIn .4s .1s both' : undefined,
        }}>
          <img
            src="/brand/logo-main.png"
            alt="Battle Trade"
            style={{ height: 24, width: 'auto' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <span style={{
            fontFamily: font.mono,
            fontSize: 10,
            color: c.text3,
            letterSpacing: '.06em',
          }}>
            POST-BATTLE RECAP
          </span>
        </div>

        {/* ── LOBBY & DURATION ── */}
        <div style={{
          padding: '12px 24px 0',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          animation: visible ? 'recapFadeIn .4s .15s both' : undefined,
        }}>
          <span style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: c.text3,
            background: c.surface,
            padding: '3px 8px',
            borderRadius: radius.sm,
            border: `1px solid ${c.border}`,
          }}>
            {lobbyName}
          </span>
          <span style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: c.text4,
          }}>
            {duration}
          </span>
        </div>

        {/* ── PLAYER NAME ── */}
        <div style={{
          padding: '16px 24px 0',
          animation: visible ? 'recapFadeIn .4s .2s both' : undefined,
        }}>
          <div style={{
            fontFamily: font.display,
            fontSize: 36,
            color: c.text,
            lineHeight: 1,
            letterSpacing: '.02em',
            textTransform: 'uppercase',
          }}>
            {playerName}
          </div>
        </div>

        {/* ── HERO STAT: RETURN % ── */}
        <div style={{
          padding: '12px 24px 0',
          animation: visible ? 'recapFadeIn .4s .3s both' : undefined,
        }}>
          <div style={{
            fontFamily: font.mono,
            fontSize: 10,
            fontWeight: 600,
            color: c.text3,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            RETURN
          </div>
          <div style={{
            fontFamily: font.display,
            fontSize: 72,
            fontWeight: 700,
            color: pctColor(returnPct),
            lineHeight: 1,
            letterSpacing: '-.01em',
            textShadow: returnPct >= 0
              ? '0 0 40px rgba(0,220,130,.25)'
              : '0 0 40px rgba(255,68,102,.25)',
          }}>
            {formatPct(returnPct)}
          </div>
        </div>

        {/* ── RANK BADGE ── */}
        <div style={{
          padding: '16px 24px 0',
          animation: visible ? 'recapFadeIn .4s .35s both' : undefined,
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 8,
            background: c.surface,
            border: `1px solid ${rank <= 3 ? rankColor(rank) + '33' : c.border}`,
            borderRadius: radius.md,
            padding: '8px 14px',
            boxShadow: rankGlow(rank),
          }}>
            <span style={{
              fontFamily: font.display,
              fontSize: 28,
              color: rankColor(rank),
              lineHeight: 1,
            }}>
              {ordinal(rank)}
            </span>
            <span style={{
              fontFamily: font.sans,
              fontSize: 13,
              color: c.text3,
            }}>
              / {totalPlayers} players
            </span>
          </div>
        </div>

        {/* ── STATS GRID ── */}
        <div style={{
          padding: '16px 24px 0',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          animation: visible ? 'recapFadeIn .4s .4s both' : undefined,
        }}>
          {[
            { label: 'TRADES', value: tradesExecuted },
            { label: 'EVENTS SENT', value: sabotagesLanded },
            { label: 'EVENTS DODGED', value: sabotagesDodged },
          ].map(s => (
            <div key={s.label} style={{
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: radius.md,
              padding: '10px 0',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: font.mono,
                fontSize: 22,
                fontWeight: 700,
                color: c.text,
                lineHeight: 1,
              }}>
                {s.value}
              </div>
              <div style={{
                fontFamily: font.sans,
                fontSize: 9,
                fontWeight: 600,
                color: c.text4,
                letterSpacing: '.08em',
                marginTop: 4,
                textTransform: 'uppercase',
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── BEST / WORST TRADE ── */}
        {(bestTrade || worstTrade) && (
          <div style={{
            padding: '12px 24px 0',
            display: 'flex',
            gap: 8,
            animation: visible ? 'recapFadeIn .4s .45s both' : undefined,
          }}>
            {bestTrade && (
              <div style={{
                flex: 1,
                background: c.greenDim,
                border: `1px solid rgba(0,220,130,.12)`,
                borderRadius: radius.md,
                padding: '8px 12px',
              }}>
                <div style={{
                  fontFamily: font.sans,
                  fontSize: 9,
                  fontWeight: 600,
                  color: c.text3,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}>
                  BEST TRADE
                </div>
                <div style={{
                  fontFamily: font.mono,
                  fontSize: 14,
                  fontWeight: 700,
                  color: c.green,
                  marginTop: 2,
                }}>
                  {bestTrade.symbol} {formatPct(bestTrade.returnPct)}
                </div>
              </div>
            )}
            {worstTrade && (
              <div style={{
                flex: 1,
                background: c.redDim,
                border: `1px solid rgba(255,68,102,.12)`,
                borderRadius: radius.md,
                padding: '8px 12px',
              }}>
                <div style={{
                  fontFamily: font.sans,
                  fontSize: 9,
                  fontWeight: 600,
                  color: c.text3,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}>
                  WORST TRADE
                </div>
                <div style={{
                  fontFamily: font.mono,
                  fontSize: 14,
                  fontWeight: 700,
                  color: c.red,
                  marginTop: 2,
                }}>
                  {worstTrade.symbol} {formatPct(worstTrade.returnPct)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RANK + TIER ── */}
        <div style={{
          padding: '14px 24px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          animation: visible ? 'recapFadeIn .4s .5s both' : undefined,
        }}>
          <div style={{
            borderLeft: `3px solid ${tColor}`,
            paddingLeft: 12,
          }}>
            <div style={{
              fontFamily: font.display,
              fontSize: 32,
              color: c.text,
              lineHeight: 1,
            }}>
              {btrScore}
            </div>
            <div style={{
              fontFamily: font.sans,
              fontSize: 11,
              fontWeight: 600,
              color: tColor,
              letterSpacing: '.06em',
              marginTop: 2,
              textTransform: 'uppercase',
            }}>
              {tName}
            </div>
          </div>
          <div style={{
            fontFamily: font.mono,
            fontSize: 9,
            color: c.text4,
            letterSpacing: '.04em',
          }}>
            RANK
          </div>
        </div>

        {/* ── spacer ── */}
        <div style={{ flex: 1 }} />

        {/* ── SHARE BUTTON ── */}
        <div style={{
          padding: '0 24px 12px',
          animation: visible ? 'recapFadeIn .4s .55s both' : undefined,
        }}>
          <button
            onClick={handleShare}
            className="btn-p"
            style={{
              width: '100%',
              padding: '12px 0',
              fontFamily: font.sans,
              fontSize: 14,
              fontWeight: 700,
              color: c.bg,
              background: c.pink,
              border: 'none',
              borderRadius: radius.md,
              cursor: 'pointer',
              letterSpacing: '.02em',
            }}
          >
            Share Recap
          </button>
        </div>

        {/* ── WATERMARK ── */}
        <div style={{
          padding: '0 24px 16px',
          textAlign: 'center',
          animation: visible ? 'recapFadeIn .4s .6s both' : undefined,
        }}>
          <span style={{
            fontFamily: font.mono,
            fontSize: 9,
            color: c.text4,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
          }}>
            battletrade.gg
          </span>
        </div>
      </div>
    </>
  )
})
