'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { type LobbyState, type VolatilityEvent } from '@/lib/battle-trade-types'
import { useBroadcastData } from '@/hooks/use-broadcast-data'
import { Scanlines } from '@/components/broadcast/scanlines'
import { ConnectionBanner } from '@/components/broadcast/connection-banner'
import PredictionPanel from '@/components/prediction-panel'

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

// Prediction Market Component — uses PredictionPanel in compact/view-only mode
function RightPanel({ lobbyId }: { lobbyId: string }) {
  return (
    <div className="absolute right-0 bottom-[56px] w-[300px] h-[420px] flex flex-col broadcast-panel overflow-hidden">
      <PredictionPanel
        lobbyId={lobbyId}
        compact
      />
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
      case 'CIRCUIT_BREAKER':
        return {
          icon: '▼',
          title: 'CIRCUIT BREAKER',
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
      case 'BLACKOUT':
        return {
          icon: '■',
          title: 'BLACKOUT',
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
// ---------------------------------------------------------------------------
// Stream Control Panel (admin only — shown when ?admin_pw=xxx is in the URL)
// ---------------------------------------------------------------------------
function StreamControlPanel({ lobbyId, adminPw }: { lobbyId: string; adminPw: string }) {
  const [streamStatus, setStreamStatus] = useState<'none' | 'idle' | 'active' | 'disconnected'>('none')
  const [streamKey, setStreamKey] = useState<string | null>(null)
  const [rtmpUrl, setRtmpUrl] = useState<string | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const headers = { Authorization: adminPw }

  const fetchStreamInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/stream`)
      const data = await res.json()
      if (data.stream) {
        setStreamStatus(data.stream.status)
        setPlaybackUrl(data.stream.playback_url)
        // Fetch key info (admin only)
        const keyRes = await fetch(`/api/lobby/${lobbyId}/stream/key`, { headers })
        if (keyRes.ok) {
          const keyData = await keyRes.json()
          setStreamKey(keyData.stream_key)
          setRtmpUrl(keyData.rtmp_url)
        }
      } else {
        setStreamStatus('none')
        setStreamKey(null)
        setRtmpUrl(null)
        setPlaybackUrl(null)
      }
    } catch {
      // ignore
    }
  }, [lobbyId, adminPw])

  useEffect(() => {
    fetchStreamInfo()
    const interval = setInterval(fetchStreamInfo, 10000)
    return () => clearInterval(interval)
  }, [fetchStreamInfo])

  const handleGoLive = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/stream`, {
        method: 'POST',
        headers,
      })
      if (res.ok) await fetchStreamInfo()
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleEndStream = async () => {
    setLoading(true)
    try {
      await fetch(`/api/lobby/${lobbyId}/stream`, {
        method: 'DELETE',
        headers,
      })
      setStreamStatus('none')
      setStreamKey(null)
      setRtmpUrl(null)
      setPlaybackUrl(null)
    } catch { /* ignore */ }
    setLoading(false)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const statusColor = streamStatus === 'active' ? '#00FF88' : streamStatus === 'idle' ? '#F5A0D0' : streamStatus === 'disconnected' ? '#FF3333' : '#555'

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: collapsed ? 48 : 340,
        background: '#0A0A0A',
        border: '1px solid #222',
        zIndex: 9999,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        overflow: 'hidden',
        transition: 'width 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: collapsed ? 'none' : '1px solid #1A1A1A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: '0.1em', color: '#888' }}>
              STREAM
            </span>
            <span style={{ fontSize: 10, color: statusColor, textTransform: 'uppercase' }}>
              {streamStatus}
            </span>
          </div>
        )}
        <span style={{ color: '#555', fontSize: 14 }}>{collapsed ? '◀' : '▶'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {streamStatus === 'none' ? (
            <button
              onClick={handleGoLive}
              disabled={loading}
              style={{
                width: '100%',
                height: 44,
                background: '#F5A0D0',
                color: '#0A0A0A',
                border: 'none',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 18,
                letterSpacing: '0.08em',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? 'CREATING...' : 'GO LIVE'}
            </button>
          ) : (
            <>
              {/* RTMP URL */}
              {rtmpUrl && (
                <div>
                  <div style={{ color: '#555', fontSize: 10, marginBottom: 4, letterSpacing: '0.05em' }}>RTMP URL</div>
                  <div
                    onClick={() => copyToClipboard(rtmpUrl, 'rtmp')}
                    style={{
                      padding: '8px 10px',
                      background: '#111',
                      border: '1px solid #222',
                      color: '#999',
                      cursor: 'pointer',
                      wordBreak: 'break-all',
                      fontSize: 11,
                    }}
                  >
                    {rtmpUrl}
                    <span style={{ color: copied === 'rtmp' ? '#00FF88' : '#F5A0D0', marginLeft: 8 }}>
                      {copied === 'rtmp' ? 'COPIED' : 'CLICK TO COPY'}
                    </span>
                  </div>
                </div>
              )}

              {/* Stream Key */}
              {streamKey && (
                <div>
                  <div style={{ color: '#555', fontSize: 10, marginBottom: 4, letterSpacing: '0.05em' }}>STREAM KEY</div>
                  <div
                    onClick={() => copyToClipboard(streamKey, 'key')}
                    style={{
                      padding: '8px 10px',
                      background: '#111',
                      border: '1px solid #222',
                      color: '#999',
                      cursor: 'pointer',
                      wordBreak: 'break-all',
                      fontSize: 11,
                    }}
                  >
                    {'•'.repeat(Math.min(streamKey.length, 24))}
                    <span style={{ color: copied === 'key' ? '#00FF88' : '#F5A0D0', marginLeft: 8 }}>
                      {copied === 'key' ? 'COPIED' : 'CLICK TO COPY'}
                    </span>
                  </div>
                </div>
              )}

              {/* Playback URL */}
              {playbackUrl && (
                <div>
                  <div style={{ color: '#555', fontSize: 10, marginBottom: 4, letterSpacing: '0.05em' }}>HLS PLAYBACK</div>
                  <div
                    onClick={() => copyToClipboard(playbackUrl, 'hls')}
                    style={{
                      padding: '8px 10px',
                      background: '#111',
                      border: '1px solid #222',
                      color: '#666',
                      cursor: 'pointer',
                      wordBreak: 'break-all',
                      fontSize: 10,
                    }}
                  >
                    {playbackUrl}
                    <span style={{ color: copied === 'hls' ? '#00FF88' : '#F5A0D0', marginLeft: 8 }}>
                      {copied === 'hls' ? 'COPIED' : 'COPY'}
                    </span>
                  </div>
                </div>
              )}

              {/* End Stream */}
              <button
                onClick={handleEndStream}
                disabled={loading}
                style={{
                  width: '100%',
                  height: 36,
                  background: 'transparent',
                  color: '#FF3333',
                  border: '1px solid #FF3333',
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 14,
                  letterSpacing: '0.08em',
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? 'ENDING...' : 'END STREAM'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Main Broadcast Page
export default function BroadcastPage() {
  return (
    <Suspense fallback={<div style={{ background: '#0A0A0A', width: 1920, height: 1080 }} />}>
      <BroadcastPageInner />
    </Suspense>
  )
}

function BroadcastPageInner() {
  const { id: lobbyId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const sponsorLogo = searchParams.get('sponsor_logo')
  const adminPw = searchParams.get('admin_pw')
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
          <RightPanel lobbyId={lobbyId} />
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

      {/* Stream control panel — only visible when admin_pw query param is provided */}
      {adminPw && <StreamControlPanel lobbyId={lobbyId} adminPw={adminPw} />}
    </div>
  )
}
