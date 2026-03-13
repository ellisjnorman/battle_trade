"use client"
// Battle Trade Live Platform v5.0 - Volatility Engine UI Layer
// Wired to live Supabase data with Realtime subscriptions
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
import { supabase } from "@/lib/supabase"
import { calcPortfolioValue, calcReturnPct } from "@/lib/pnl"
import type { Position } from "@/types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Team {
  rank: number
  teamName: string
  traderName: string
  xHandle: string
  avatar: string
  balance: number
  returnPct: number
  movement: string
  balanceHistory: number[]
  odds: number
  streak: number
  pnlVelocity: "up_fast" | "up_slow" | "down_fast" | "down_slow" | "flat"
  hasPosition: boolean
  position?: { asset: string; direction: "LONG" | "SHORT"; leverage: number; size: number }
  crowdHeat: number
  isComeback?: boolean
  btcExposed?: boolean
  profileId?: string | null
}

interface Trade {
  team: string
  asset: string
  direction: string
  pnl: number
  secondsAgo: number
}

interface RoundHistory {
  round: number
  eliminatedTeam: string
  isCurrent: boolean
  events?: { type: string; time: string }[]
}

interface MarketEvent {
  type: "flash_crash" | "moon_shot" | "margin_call"
  asset: string
  percentChange: number
  countdownSeconds: number
  active: boolean
  endSeconds?: number
}

interface EventFeedItem {
  type: "event_active" | "position_wiped" | "held_through" | "closed_position" | "event_ended"
  text: string
  subtext?: string
  color: string
  bgColor?: string
  borderColor?: string
}

interface ScheduledEvent {
  type: string
  time: string
  asset: string
}

interface OddsRow {
  rank: number
  name: string
  odds: number
  trend: string
  popular?: boolean
  longshot?: boolean
  avatar?: string
}

type ViewState = "active" | "elimination" | "round_complete" | "connection_lost" | "share_card"

// ---------------------------------------------------------------------------
// Default avatar placeholder
// ---------------------------------------------------------------------------

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44'%3E%3Crect fill='%231A1A1A' width='44' height='44'/%3E%3C/svg%3E"

function avatarSrc(url: string | null | undefined): string {
  return url || DEFAULT_AVATAR
}

// ---------------------------------------------------------------------------
// CSS for animations
// ---------------------------------------------------------------------------

const cssAnimations = `
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes confetti-fall {
  0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(1100px) rotate(720deg); opacity: 0; }
}
@keyframes pulse-bar {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
@keyframes pulse-return {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}
`

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

function Sparkline({ data, isPositive, teamId }: { data: number[]; isPositive: boolean; teamId?: string }) {
  const [liveData, setLiveData] = useState(data)

  useEffect(() => {
    setLiveData(data)
  }, [data])

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveData(prev => {
        const lastValue = prev[prev.length - 1]
        const volatility = isPositive ? 0.02 : 0.03
        const trend = isPositive ? 0.005 : -0.005
        const change = (Math.random() - 0.5) * volatility + trend
        const newValue = lastValue * (1 + change)
        return [...prev.slice(1), newValue]
      })
    }, 800)
    return () => clearInterval(interval)
  }, [isPositive])

  const min = Math.min(...liveData)
  const max = Math.max(...liveData)
  const range = max - min || 1
  const color = isPositive ? "#00FF88" : "#FF3333"
  const width = 300
  const height = 40

  const points = liveData.map((value, index) => ({
    x: (index / (liveData.length - 1)) * width,
    y: (height - 4) - ((value - min) / range) * (height - 8)
  }))

  const createSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return ""
    let path = `M ${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]
      const tension = 0.4
      const cp1x = p1.x + (p2.x - p0.x) * tension
      const cp1y = p1.y + (p2.y - p0.y) * tension
      const cp2x = p2.x - (p3.x - p1.x) * tension
      const cp2y = p2.y - (p3.y - p1.y) * tension
      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
    }
    return path
  }

  const linePath = createSmoothPath(points)
  const fillPath = `${linePath} L ${width},${height} L 0,${height} Z`
  const gradientId = `sparkfill-${teamId || 'default'}-${isPositive ? 'pos' : 'neg'}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[40px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={isPositive ? 0.15 : 0.12} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradientId})`} d={fillPath} style={{ transition: "d 0.3s ease-out" }} />
      <path
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d={linePath}
        vectorEffect="non-scaling-stroke"
        style={{ transition: "d 0.3s ease-out" }}
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// PNL Velocity Indicator
// ---------------------------------------------------------------------------

function PnlVelocity({ velocity }: { velocity: Team["pnlVelocity"] }) {
  const getArrow = () => {
    switch (velocity) {
      case "up_fast": return { text: "↑↑", color: "#00FF88", opacity: 1 }
      case "up_slow": return { text: "↑", color: "#00FF88", opacity: 0.5 }
      case "down_fast": return { text: "↓↓", color: "#FF3333", opacity: 1 }
      case "down_slow": return { text: "↓", color: "#FF3333", opacity: 0.5 }
      case "flat": return { text: "→", color: "#444", opacity: 1 }
    }
  }
  const arrow = getArrow()
  return (
    <span
      className="font-display tracking-[0.05em] text-[14px] ml-2"
      style={{ color: arrow.color, opacity: arrow.opacity }}
    >
      {arrow.text}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Crowd Heat Bar
// ---------------------------------------------------------------------------

function CrowdHeatBar({ heat }: { heat: number }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px]">
      <div
        style={{
          width: `${heat}%`,
          height: "100%",
          backgroundColor: "#F5A0D0",
          opacity: heat / 100
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team Avatar with position indicator
// ---------------------------------------------------------------------------

function TeamAvatar({ team, size = 44, isEliminated = false }: { team: Team; size?: number; isEliminated?: boolean }) {
  const getBorderColor = () => {
    if (isEliminated) return "#444"
    if (team.rank === 1) return "#F5A0D0"
    if (team.rank === 8) return "#FF3333"
    return "#333"
  }

  return (
    <div className="relative flex-shrink-0">
      <div
        className="overflow-hidden"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: `2px solid ${getBorderColor()}`,
          filter: isEliminated ? "grayscale(100%)" : "none"
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarSrc(team.avatar)}
          alt={team.teamName}
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      </div>
      {team.hasPosition && team.position && (
        <div
          className="absolute -bottom-1 left-0 overflow-hidden"
          style={{
            width: size,
            height: 3,
            backgroundColor: `${team.position.direction === "LONG" ? "#00FF88" : "#FF3333"}33`
          }}
          title={`${team.position.asset} ${team.position.direction} · ${team.position.leverage}X · ${team.position.size.toLocaleString()}`}
        >
          <div
            className="h-full w-1/2"
            style={{
              backgroundColor: team.position.direction === "LONG" ? "#00FF88" : "#FF3333",
              animation: "shimmer 1.5s ease-in-out infinite"
            }}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event Countdown Bar
// ---------------------------------------------------------------------------

function EventCountdownBar({ event }: { event: MarketEvent }) {
  return (
    <div
      className="h-[32px] w-full flex items-center justify-center px-8"
      style={{
        backgroundColor: "#0D0D0D",
        borderTop: "1px solid #FF3333",
        borderBottom: "1px solid #FF3333",
        animation: "pulse-bar 1s ease-in-out infinite"
      }}
    >
      <div className="flex items-center gap-4">
        <span className="font-display tracking-[0.05em] text-[20px] text-white">
          ⚠ MARKET EVENT IN 0:{event.countdownSeconds.toString().padStart(2, "0")}
        </span>
        <span className="text-[#555]">·</span>
        <span className="font-display tracking-[0.05em] text-[20px] text-[#FF3333]">
          {event.type.replace(/_/g, " ").toUpperCase()} · {event.asset} {event.percentChange}%
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event Active Overlay
// ---------------------------------------------------------------------------

function EventActiveOverlay({ event }: { event: MarketEvent }) {
  return (
    <div
      className="absolute top-[104px] left-0 right-[480px] h-[48px] z-40 flex items-center justify-between px-8"
      style={{
        backgroundColor: "rgba(255,51,51,0.08)",
        borderBottom: "1px solid #FF3333"
      }}
    >
      <div className="flex items-center gap-4">
        <span className="font-display tracking-[0.05em] text-[18px] text-[#FF3333]">
          {event.type.replace(/_/g, " ").toUpperCase()} ACTIVE
        </span>
        <span
          className="font-mono tracking-[-0.02em] text-[24px] text-[#FF3333]"
          style={{ letterSpacing: "-0.02em" }}
        >
          {event.asset} {event.percentChange}%
        </span>
      </div>
      <span className="font-mono tracking-[-0.02em] text-[18px] text-[#FF3333]">
        ENDS IN 0:{event.endSeconds?.toString().padStart(2, "0")}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scheduled Events Panel
// ---------------------------------------------------------------------------

function ScheduledEventsPanel({ events }: { events: ScheduledEvent[] }) {
  const getIcon = (type: string) => {
    if (type.includes("CRASH")) return "⚡"
    if (type.includes("MOON")) return "🌙"
    if (type.includes("MARGIN")) return "💀"
    return "⚠"
  }

  return (
    <div className="mt-3">
      <span className="font-display tracking-[0.05em] text-[11px] text-[#1A1A1A]">NEXT EVENTS</span>
      <div className="mt-1 flex flex-col gap-1">
        {events.map((event, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="font-sans text-[10px]">{getIcon(event.type)}</span>
            <span className="font-mono tracking-[-0.02em] text-[10px] text-[#F5A0D0]">{event.time}</span>
            <span className="font-sans text-[10px] text-[#444]">· {event.type} · {event.asset}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Odds Board
// ---------------------------------------------------------------------------

function OddsBoard({ teams, oddsData, totalBets }: { teams: Team[]; oddsData: OddsRow[]; totalBets: number }) {
  const getOddsColor = (rank: number) => {
    if (rank <= 3) return "#F5A0D0"
    if (rank >= 6) return "#FF3333"
    return "#888"
  }

  return (
    <div className="border-t border-[#1A1A1A] pt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="font-display tracking-[0.05em] text-[13px] text-[#333]">LIVE ODDS</span>
        <span className="font-mono tracking-[-0.02em] text-[12px] text-[#F5A0D0]">{totalBets} BETS PLACED</span>
      </div>

      <div className="text-center mb-2">
        <span className="font-sans text-[10px] text-[#444]">WHO WINS THIS ROUND?</span>
      </div>

      <div className="flex flex-col gap-[2px]">
        {oddsData.map((item) => {
          const team = teams.find(t => t.rank === item.rank)
          const color = getOddsColor(item.rank)
          return (
            <div key={item.rank} className="flex items-center gap-2">
              {team && (
                <div
                  className="w-[20px] h-[20px] flex-shrink-0 overflow-hidden"
                  style={{ borderRadius: "50%" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarSrc(team.avatar)} alt={item.name} width={20} height={20} className="w-full h-full object-cover" />
                </div>
              )}
              <span className="font-sans text-[11px] text-[#555] flex-shrink-0">{item.name}</span>
              <span className="flex-1 text-[#1A1A1A] text-[10px] overflow-hidden whitespace-nowrap">
                {"·".repeat(20)}
              </span>
              <span className="font-display tracking-[0.05em] text-[18px] flex-shrink-0" style={{ color }}>
                {item.odds.toFixed(1)}X
              </span>
              <span className="font-sans text-[10px] flex-shrink-0" style={{ color }}>
                {item.trend}
              </span>
              {item.popular && (
                <span className="font-sans text-[8px] text-[#F5A0D0]">POPULAR</span>
              )}
              {item.longshot && (
                <span className="font-sans text-[8px] text-[#FF3333]">LONG SHOT</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Round History Bar
// ---------------------------------------------------------------------------

function RoundHistoryBar({ history }: { history: RoundHistory[] }) {
  return (
    <div className="h-[32px] w-full bg-[#0A0A0A] border-b border-[#1A1A1A] flex items-center px-8 gap-6">
      {history.map((round, i) => (
        <div key={round.round} className="flex items-center gap-2">
          {i > 0 && <div className="w-[1px] h-4 bg-[#1A1A1A]" />}
          <span className="font-display tracking-[0.05em] text-[11px] text-[#444]">ROUND {round.round}</span>
          {round.events?.map((event, j) => (
            <span
              key={j}
              className="font-display tracking-[0.05em] text-[10px] text-[#FF3333] border border-[#FF3333] px-2 py-px"
            >
              {event.type} @ {event.time}
            </span>
          ))}
          {round.isCurrent ? (
            <div className="flex items-center gap-1">
              <div className="w-[6px] h-[6px] bg-[#F5A0D0] animate-pulse" />
              <span className="font-display tracking-[0.05em] text-[11px] text-[#F5A0D0]">ACTIVE</span>
            </div>
          ) : (
            round.eliminatedTeam && (
              <span className="font-display tracking-[0.05em] text-[11px] text-[#FF3333]">[ELIMINATED: {round.eliminatedTeam}]</span>
            )
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top Bar
// ---------------------------------------------------------------------------

function TopBar({ timeRemaining, spectators, biggestTrade, roundInfo, lobbyName }: {
  timeRemaining: number; spectators: number; biggestTrade: { team: string; amount: number };
  roundInfo: { number: number; total: number; maxLeverage: number } | null;
  lobbyName: string;
}) {
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60
  const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`
  const isUrgent = timeRemaining < 120

  return (
    <div className="h-[72px] w-full flex items-center justify-between px-8 border-b-2 border-[#F5A0D0]">
      <div className="flex items-center gap-4">
        <Image src="/logo.png" alt="Battle Trade" width={280} height={70} className="h-[56px] w-auto" />
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#FF3333]" />
          <span className="font-sans text-[11px] text-white">LIVE</span>
        </div>
        <span className="text-[#333]">|</span>
        <span className="font-sans text-[11px] text-[#555]">{spectators.toLocaleString()} WATCHING</span>
        <span className="text-[#333]">|</span>
        <div className="flex flex-col">
          <span className="font-sans text-[9px] text-[#444] uppercase">TOP TRADE</span>
          <span className="font-mono tracking-[-0.02em] text-[12px] text-[#00FF88]">{biggestTrade.team} +${biggestTrade.amount.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-display tracking-[0.05em] text-[22px] text-[#888]">
          ROUND {roundInfo?.number ?? 1} OF {roundInfo?.total ?? 4}
        </span>
        <span className="text-[#444]">|</span>
        <span className="font-display tracking-[0.05em] text-[22px] text-[#F5A0D0]">
          LEVERAGE {roundInfo?.maxLeverage ?? 5}X
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className="font-sans text-[9px] text-[#555] uppercase tracking-[0.2em]">ROUND ENDS</span>
          <span className={`font-mono tracking-[-0.02em] text-[56px] leading-none ${isUrgent ? "text-[#FF3333]" : "text-white"}`}>
            {timeString}
          </span>
        </div>
        <span className="font-sans text-[11px] text-[#444]">{lobbyName}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exposed Badge
// ---------------------------------------------------------------------------

function ExposedBadge({ asset }: { asset: string }) {
  return (
    <span
      className="font-sans text-[10px] text-[#FF3333] border border-[#FF3333] ml-2"
      style={{ padding: "4px 8px" }}
    >
      ⚠ {asset} EXPOSED
    </span>
  )
}

// ---------------------------------------------------------------------------
// Team Row
// ---------------------------------------------------------------------------

function TeamRow({ team, isEliminated = false, eventActive = false, totalTeams = 8 }: { team: Team; isEliminated?: boolean; eventActive?: boolean; totalTeams?: number }) {
  const isFirst = team.rank === 1
  const isLast = team.rank === totalTeams
  const isPositive = team.returnPct >= 0
  const isExposed = team.btcExposed && eventActive

  const getBorderColor = () => {
    if (team.isComeback) return "#FF3333"
    if (isFirst) return "#F5A0D0"
    if (isLast) return "#FF3333"
    return "#1A1A1A"
  }

  const getBackground = () => {
    if (isExposed) {
      return "linear-gradient(90deg, rgba(255,51,51,0.06) 0%, transparent 50%)"
    }
    if (isFirst) return "#111"
    if (isLast) return "#0D0D0D"
    return "#0D0D0D"
  }

  const getRankColor = () => {
    if (team.rank === 1) return "#FFFFFF"
    if (team.rank <= 4) return "#888"
    if (team.rank <= 7) return "#444"
    return "#FF3333"
  }

  const getMovementColor = () => {
    if (team.movement.includes("▲")) return "#00FF88"
    if (team.movement.includes("▼")) return "#FF3333"
    return "#444"
  }

  const getOddsColor = () => {
    if (team.rank <= 3) return "#F5A0D0"
    if (isLast) return "#FF3333"
    return "#888"
  }

  return (
    <div
      className="relative flex items-center h-full border-b border-[#1A1A1A]"
      style={{
        background: getBackground(),
        borderLeft: `4px solid ${isEliminated ? "#FF3333" : getBorderColor()}`,
        borderLeftWidth: team.isComeback ? "2px" : isEliminated ? "6px" : "4px",
        opacity: isEliminated ? 1 : undefined
      }}
    >
      <div className="w-[70px] flex-shrink-0 flex items-center justify-center">
        <span className="font-display tracking-[0.05em] text-[64px] leading-none" style={{ color: getRankColor() }}>
          {team.rank}
        </span>
      </div>

      <div className="w-[280px] flex-shrink-0 flex items-center gap-3">
        <TeamAvatar team={team} isEliminated={isEliminated} />
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span
              className={`font-display tracking-[0.05em] text-[26px] leading-tight ${isEliminated ? "line-through text-[#FF3333]" : "text-white"}`}
            >
              {team.teamName}
            </span>
            {team.isComeback && !isEliminated && (
              <span
                className="font-display tracking-[0.05em] text-[11px] text-white px-2 py-0.5"
                style={{ backgroundColor: "#FF3333" }}
              >
                COMEBACK
              </span>
            )}
            {isFirst && !isEliminated && !team.isComeback && (
              <span className="font-sans text-[10px] text-[#F5A0D0] border border-[#F5A0D0] px-2 py-0.5">
                LEADING
              </span>
            )}
            {isLast && !isEliminated && (
              <span className="font-sans text-[10px] text-[#FF3333] border border-[#FF3333] px-2 py-0.5">
                DANGER
              </span>
            )}
            {isEliminated && (
              <span className="font-sans text-[10px] text-white bg-[#FF3333] px-2 py-0.5">
                ELIMINATED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-sans text-[11px] text-[#444]">{team.xHandle}</span>
            {team.streak >= 3 && (
              <span className="font-sans text-[10px] text-[#FF3333]">x{team.streak}</span>
            )}
          </div>
        </div>
      </div>

      <div className="w-[80px] flex-shrink-0 flex flex-col">
        <span className="font-sans text-[8px] text-[#333] uppercase">ODDS</span>
        <span className="font-display tracking-[0.05em] text-[20px]" style={{ color: getOddsColor() }}>
          {team.odds.toFixed(1)}x
        </span>
      </div>

      <div className="w-[140px] flex-shrink-0">
        <span className="font-mono tracking-[-0.02em] text-[22px] text-[#888]">
          ${team.balance.toLocaleString()}
        </span>
      </div>

      <div className="w-[180px] flex-shrink-0 flex items-center flex-wrap">
        <span
          className="font-display tracking-[0.05em] leading-none"
          style={{
            fontSize: isLast ? "72px" : "64px",
            color: isPositive ? "#00FF88" : "#FF3333",
            letterSpacing: "0.05em",
            animation: isExposed ? "pulse-return 500ms ease-in-out infinite" : "none"
          }}
        >
          {isPositive ? "+" : ""}{team.returnPct.toFixed(1)}%
        </span>
        <PnlVelocity velocity={team.pnlVelocity} />
        {isExposed && <ExposedBadge asset="BTC" />}
      </div>

      <div className="w-[60px] flex-shrink-0">
        <span className="font-sans text-[13px]" style={{ color: getMovementColor() }}>
          {team.movement}
        </span>
      </div>

      <div className="flex-1 flex items-center">
        <Sparkline data={team.balanceHistory} isPositive={isPositive} teamId={team.teamName} />
      </div>

      <CrowdHeatBar heat={team.crowdHeat} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live Trades Column
// ---------------------------------------------------------------------------

function LiveTradesColumn({ trades, teams, eventActive, eventFeed, oddsData, totalBets, scheduledEvents }: {
  trades: Trade[]; teams: Team[]; eventActive?: boolean; eventFeed?: EventFeedItem[];
  oddsData: OddsRow[]; totalBets: number; scheduledEvents: ScheduledEvent[];
}) {
  const isBigTrade = (pnl: number) => Math.abs(pnl) >= 500

  return (
    <div className="w-[480px] flex-shrink-0 border-l border-[#1A1A1A] flex flex-col h-full">
      <div className="px-4 py-2 border-b border-[#1A1A1A]">
        <span className="font-display tracking-[0.05em] text-[13px] text-[#333]">LIVE TRADES</span>
      </div>
      <div className="overflow-hidden px-4 py-2" style={{ maxHeight: "220px" }}>
        {eventActive && eventFeed?.map((item, i) => (
          <div
            key={`event-${i}`}
            className="py-2 mb-2"
            style={{
              backgroundColor: item.bgColor || "transparent",
              borderLeft: item.borderColor ? `3px solid ${item.borderColor}` : undefined,
              paddingLeft: item.borderColor ? "8px" : undefined
            }}
          >
            {item.type === "event_active" ? (
              <>
                <span className="font-display tracking-[0.05em] text-[13px] text-[#FF3333] block">💥 {item.text}</span>
                <span className="font-sans text-[11px] text-[#FF3333]">{item.subtext}</span>
              </>
            ) : item.type === "position_wiped" ? (
              <span className="font-mono tracking-[-0.02em] text-[12px] text-[#FF3333]">💀 {item.text} · {item.subtext}</span>
            ) : item.type === "held_through" ? (
              <span className="font-sans text-[12px] text-[#00FF88]">🔥 {item.text} · {item.subtext}</span>
            ) : item.type === "closed_position" ? (
              <span className="font-mono tracking-[-0.02em] text-[12px] text-[#888]">📉 {item.text} · {item.subtext}</span>
            ) : null}
          </div>
        ))}

        {trades.map((trade, i) => {
          const big = isBigTrade(trade.pnl)
          return (
            <div key={i} className={`py-1 ${big ? "py-2" : ""}`}>
              {big && (
                <span className="font-display tracking-[0.05em] text-[10px] text-[#F5A0D0] block">BIG TRADE</span>
              )}
              <span
                className={`font-mono tracking-[-0.02em] ${big ? "text-[14px]" : "text-[11px]"}`}
                style={{ color: trade.pnl >= 0 ? "#00FF88" : "#FF3333" }}
              >
                {trade.team} · {trade.asset} {trade.direction} · {trade.pnl >= 0 ? "+" : ""}${Math.abs(trade.pnl)} · {trade.secondsAgo}s
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto px-4 py-2">
        <OddsBoard teams={teams} oddsData={oddsData} totalBets={totalBets} />
        <ScheduledEventsPanel events={scheduledEvents} />

        <div className="mt-3 flex flex-col items-center">
          <span className="font-sans text-[9px] text-[#333] uppercase">MARKETS BY</span>
          <div className="w-[120px] h-[28px] border border-[#1A1A1A] flex items-center justify-center mt-1">
            <span className="font-sans text-[9px] text-[#333]">PARTNER LOGO</span>
          </div>
          <div className="flex flex-col items-center mt-2">
            <div className="w-[56px] h-[56px] bg-[#1A1A1A] flex items-center justify-center">
              <span className="font-sans text-[8px] text-[#333]">QR</span>
            </div>
            <span className="font-sans text-[9px] text-[#444] mt-1">scan to bet</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Elimination Line
// ---------------------------------------------------------------------------

function EliminationLine({ dangerTeamName, timeRemaining }: { dangerTeamName?: string; timeRemaining?: number }) {
  const minutesLeft = timeRemaining ? Math.round(timeRemaining / 60) : 0
  return (
    <div className="relative w-full h-10 flex flex-col items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-[#FF3333]" />
      <div className="relative bg-[#0D0D0D] px-4 z-10 flex flex-col items-center">
        <span className="font-display tracking-[0.05em] text-[11px] text-[#FF3333]">
          ELIMINATION ZONE
        </span>
        {dangerTeamName && (
          <span className="font-sans text-[10px] text-[#FF3333] italic">
            {dangerTeamName} ELIMINATED IN ~{minutesLeft} MIN AT CURRENT RATE
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bottom Bar
// ---------------------------------------------------------------------------

function BottomBar({ lastUpdate, teamCount, totalTrades, prices, lobbyName }: {
  lastUpdate: number; teamCount: number; totalTrades: number;
  prices: Record<string, number>; lobbyName: string;
}) {
  const fmtPrice = (sym: string) => {
    const p = prices[sym] ?? prices[sym.toUpperCase()]
    return p ? `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"
  }

  return (
    <div className="h-[40px] w-full flex items-center justify-between px-8 border-t border-[#1A1A1A]">
      <div className="flex items-center gap-2">
        <span className="font-sans text-[12px] text-[#444]">{teamCount} TEAMS ACTIVE</span>
        <span className="text-[#333]">|</span>
        <span className="font-sans text-[12px] text-[#444]">{totalTrades} TRADES THIS ROUND</span>
      </div>

      <div className="flex items-center gap-4">
        <span className="font-mono tracking-[-0.02em] text-[13px] text-[#F5A0D0]">
          BTC {fmtPrice("BTCUSDT")} · ETH {fmtPrice("ETHUSDT")} · SOL {fmtPrice("SOLUSDT")}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="font-sans text-[12px] text-[#333]">{lobbyName}</span>
        <span
          className="font-mono tracking-[-0.02em] text-[11px]"
          style={{ color: lastUpdate > 10 ? "#FF3333" : "#333" }}
        >
          LAST UPDATE {lastUpdate}s AGO
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confetti Particle
// ---------------------------------------------------------------------------

function ConfettiParticle({ delay, x }: { delay: number; x: number }) {
  const isPink = Math.random() > 0.5
  return (
    <div
      className="absolute w-2 h-2"
      style={{
        left: `${x}%`,
        top: -10,
        backgroundColor: isPink ? "#F5A0D0" : "#FFFFFF",
        animation: `confetti-fall 3s ease-in ${delay}s forwards`
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// View States
// ---------------------------------------------------------------------------

function ActiveRoundView({ teams, timeRemaining, lastUpdate, spectators, eventActive, activeEvent, eventFeedItems, oddsData, totalBets, scheduledEvents, roundHistory, totalTrades, prices, lobbyName, roundInfo }: {
  teams: Team[]; timeRemaining: number; lastUpdate: number; spectators: number; eventActive: boolean;
  activeEvent: MarketEvent | null; eventFeedItems: EventFeedItem[]; oddsData: OddsRow[];
  totalBets: number; scheduledEvents: ScheduledEvent[]; roundHistory: RoundHistory[];
  totalTrades: number; prices: Record<string, number>; lobbyName: string;
  roundInfo: { number: number; total: number; maxLeverage: number } | null;
}) {
  const totalTeams = teams.length
  const topTeams = teams.filter(t => t.rank < totalTeams)
  const dangerTeam = teams.find(t => t.rank === totalTeams)
  const biggestTrade: { team: string; amount: number } = teams.length > 0
    ? { team: teams[0].teamName, amount: Math.round(teams[0].balance - (roundInfo ? 10000 : 10000)) }
    : { team: "—", amount: 0 }

  return (
    <div className="relative w-[1920px] h-[1080px] bg-[#0D0D0D] flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: cssAnimations }} />
      <TopBar timeRemaining={timeRemaining} spectators={spectators} biggestTrade={biggestTrade} roundInfo={roundInfo} lobbyName={lobbyName} />
      <RoundHistoryBar history={roundHistory} />

      {activeEvent && <EventCountdownBar event={activeEvent} />}
      {eventActive && activeEvent && <EventActiveOverlay event={activeEvent} />}

      <div className="flex-1 flex" style={{ marginTop: eventActive && activeEvent ? "80px" : "0" }}>
        <div className="flex-1 flex flex-col">
          {topTeams.map(team => (
            <div key={team.rank} className="flex-1">
              <TeamRow team={team} eventActive={eventActive} totalTeams={totalTeams} />
            </div>
          ))}
          <EliminationLine dangerTeamName={dangerTeam?.teamName} timeRemaining={timeRemaining} />
          {dangerTeam && (
            <div className="flex-1">
              <TeamRow team={dangerTeam} eventActive={eventActive} totalTeams={totalTeams} />
            </div>
          )}
        </div>

        <LiveTradesColumn
          trades={[]}
          teams={teams}
          eventActive={eventActive}
          eventFeed={eventFeedItems}
          oddsData={oddsData}
          totalBets={totalBets}
          scheduledEvents={scheduledEvents}
        />
      </div>

      <BottomBar lastUpdate={lastUpdate} teamCount={teams.filter(t => !t.isComeback).length} totalTrades={totalTrades} prices={prices} lobbyName={lobbyName} />
    </div>
  )
}

function EliminationMomentView({ teams, timeRemaining, lastUpdate, spectators, roundHistory, totalTrades, prices, lobbyName, roundInfo, oddsData, totalBets, scheduledEvents }: {
  teams: Team[]; timeRemaining: number; lastUpdate: number; spectators: number;
  roundHistory: RoundHistory[]; totalTrades: number; prices: Record<string, number>;
  lobbyName: string; roundInfo: { number: number; total: number; maxLeverage: number } | null;
  oddsData: OddsRow[]; totalBets: number; scheduledEvents: ScheduledEvent[];
}) {
  const totalTeams = teams.length
  const topTeams = teams.filter(t => t.rank < totalTeams)
  const eliminatedTeam = teams.find(t => t.rank === totalTeams)
  const biggestTrade = { team: teams[0]?.teamName ?? "—", amount: 0 }

  return (
    <div className="relative w-[1920px] h-[1080px] bg-[#0D0D0D] flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: cssAnimations }} />
      <div className="absolute top-0 left-0 right-0 z-50 flex flex-col items-center pt-4">
        <span className="font-display tracking-[0.05em] text-[120px] text-[#FF3333] leading-none">ELIMINATED</span>
        <span className="font-display tracking-[0.05em] text-[48px] text-white">{eliminatedTeam?.teamName}</span>
      </div>

      <div className="opacity-20">
        <TopBar timeRemaining={timeRemaining} spectators={spectators} biggestTrade={biggestTrade} roundInfo={roundInfo} lobbyName={lobbyName} />
        <RoundHistoryBar history={roundHistory} />
      </div>

      <div className="flex-1 flex">
        <div className="flex-1 flex flex-col">
          {topTeams.map(team => (
            <div key={team.rank} className="flex-1 opacity-20">
              <TeamRow team={team} totalTeams={totalTeams} />
            </div>
          ))}
          <div className="opacity-20">
            <EliminationLine />
          </div>
          {eliminatedTeam && (
            <div className="flex-1" style={{ background: "#0D0D0D" }}>
              <TeamRow team={eliminatedTeam} isEliminated totalTeams={totalTeams} />
            </div>
          )}
        </div>

        <div className="opacity-20">
          <LiveTradesColumn trades={[]} teams={teams} oddsData={oddsData} totalBets={totalBets} scheduledEvents={scheduledEvents} />
        </div>
      </div>

      <div className="opacity-20">
        <BottomBar lastUpdate={lastUpdate} teamCount={teams.length} totalTrades={totalTrades} prices={prices} lobbyName={lobbyName} />
      </div>
    </div>
  )
}

function RoundCompleteView({ teams, roundNumber }: { teams: Team[]; roundNumber: number }) {
  const totalTeams = teams.length
  const eliminatedTeam = teams.find(t => t.rank === totalTeams)
  const remainingTeams = teams.filter(t => t.rank < totalTeams).slice(0, 5)

  return (
    <div className="relative w-[1920px] h-[1080px] bg-[#0D0D0D] flex flex-col items-center justify-center overflow-hidden">
      <div className="flex flex-col items-center">
        <span className="font-display tracking-[0.05em] text-[96px] text-white leading-none">ROUND {roundNumber} COMPLETE</span>

        <div className="mt-8 flex flex-col items-center">
          <span className="font-display tracking-[0.05em] text-[32px] text-[#FF3333]">ELIMINATED:</span>
          <span className="font-display tracking-[0.05em] text-[64px] text-[#FF3333] leading-tight">{eliminatedTeam?.teamName}</span>
          <span className="font-sans text-[20px] text-[#555]">{eliminatedTeam?.traderName}</span>
        </div>

        <div className="w-[400px] h-[1px] bg-[#1A1A1A] my-8" />

        <span className="font-display tracking-[0.05em] text-[28px] text-[#888]">NEXT ROUND BEGINS SOON</span>
      </div>

      <div className="absolute bottom-12 left-0 right-0 flex justify-center gap-12">
        {remainingTeams.map(team => (
          <div key={team.rank} className="flex items-center gap-3">
            <span className="font-display tracking-[0.05em] text-[24px] text-[#444]">{team.rank}</span>
            <span className="font-display tracking-[0.05em] text-[24px] text-white">{team.teamName}</span>
            <span
              className="font-display tracking-[0.05em] text-[24px]"
              style={{ color: team.returnPct >= 0 ? "#00FF88" : "#FF3333" }}
            >
              {team.returnPct >= 0 ? "+" : ""}{team.returnPct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConnectionLostView({ lastUpdate }: { lastUpdate: number }) {
  return (
    <div className="relative w-[1920px] h-[1080px] overflow-hidden">
      <div className="absolute inset-0 bg-black flex flex-col items-center justify-center">
        <span className="font-display tracking-[0.05em] text-[96px] text-[#FF3333] leading-none">CONNECTION LOST</span>
        <span className="font-mono tracking-[-0.02em] text-[24px] text-[#555] mt-6">LAST UPDATED {lastUpdate}s AGO</span>
        <span className="font-sans text-[16px] text-[#444] mt-4">ATTEMPTING RECONNECT...</span>
      </div>
    </div>
  )
}

function ShareCardView({ teams, lobbyName, roundNumber }: { teams: Team[]; lobbyName: string; roundNumber: number }) {
  const [showConfetti, setShowConfetti] = useState(true)
  const winner = teams[0]
  const leftColumn = teams.slice(0, 4)
  const rightColumn = teams.slice(4, 8)

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  const confettiParticles = Array.from({ length: 20 }, () => ({
    delay: Math.random() * 0.5,
    x: Math.random() * 100
  }))

  if (!winner) return null

  return (
    <div className="relative w-[1080px] h-[1080px] bg-[#0A0A0A] flex flex-col p-12 mx-auto overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: cssAnimations }} />

      {showConfetti && confettiParticles.map((p, i) => (
        <ConfettiParticle key={i} delay={p.delay} x={p.x} />
      ))}

      <div className="flex flex-col items-center mb-8">
        <Image src="/logo.png" alt="Battle Trade" width={320} height={80} className="h-[60px] w-auto" />
        <span className="font-display tracking-[0.05em] text-[24px] text-[#555]">ROUND {roundNumber} RESULTS</span>
      </div>

      <div className="flex flex-col items-center flex-1">
        <div
          className="w-[120px] h-[120px] overflow-hidden mb-4"
          style={{ borderRadius: "50%", border: "3px solid #F5A0D0" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarSrc(winner.avatar)} alt={winner.teamName} width={120} height={120} className="w-full h-full object-cover" />
        </div>

        <span className="font-display tracking-[0.05em] text-[96px] text-white leading-none">{winner.teamName}</span>
        <span className="font-sans text-[18px] text-[#555]">{winner.xHandle}</span>

        <span
          className="font-display tracking-[0.05em] text-[120px] text-[#00FF88] leading-none mt-4"
          style={{ letterSpacing: "0.05em" }}
        >
          +{winner.returnPct.toFixed(1)}%
        </span>

        <div className="bg-[#F5A0D0] text-[#0A0A0A] font-display tracking-[0.05em] text-[18px] px-[16px] py-[8px] mt-[8px]">
          ROUND WINNER
        </div>

        <span className="font-mono tracking-[-0.02em] text-[16px] text-[#F5A0D0] mt-3">OPENING ODDS: {winner.odds.toFixed(1)}X</span>
        <span className="font-sans text-[11px] text-[#444] mt-1">BATTLE TRADE MARKETS</span>
      </div>

      <div className="w-full h-[1px] bg-[#1A1A1A] my-6" />

      <div className="flex gap-8 justify-center mb-8">
        <div className="flex flex-col gap-2">
          {leftColumn.map(team => (
            <div key={team.rank} className="flex items-center gap-3">
              <span className="font-display tracking-[0.05em] text-[18px] text-[#444] w-[20px]">{team.rank}</span>
              <div className="w-[28px] h-[28px] overflow-hidden flex-shrink-0" style={{ borderRadius: "50%", border: "1px solid #333" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarSrc(team.avatar)} alt={team.teamName} width={28} height={28} className="w-full h-full object-cover" />
              </div>
              <span className="font-display tracking-[0.05em] text-[18px] text-white w-[140px]">{team.teamName}</span>
              <span className="font-mono tracking-[-0.02em] text-[16px]" style={{ color: team.returnPct >= 0 ? "#00FF88" : "#FF3333" }}>
                {team.returnPct >= 0 ? "+" : ""}{team.returnPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {rightColumn.map(team => (
            <div key={team.rank} className="flex items-center gap-3">
              <span className="font-display tracking-[0.05em] text-[18px] text-[#444] w-[20px]">{team.rank}</span>
              <div className="w-[28px] h-[28px] overflow-hidden flex-shrink-0" style={{ borderRadius: "50%", border: "1px solid #333" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarSrc(team.avatar)} alt={team.teamName} width={28} height={28} className="w-full h-full object-cover" />
              </div>
              <span className="font-display tracking-[0.05em] text-[18px] text-white w-[140px]">{team.teamName}</span>
              <span className="font-mono tracking-[-0.02em] text-[16px]" style={{ color: team.returnPct >= 0 ? "#00FF88" : "#FF3333" }}>
                {team.returnPct >= 0 ? "+" : ""}{team.returnPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between w-full">
        <div className="flex-1 text-center">
          <span className="font-sans text-[13px] text-[#444]">{lobbyName} · battle.fyi</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <div className="w-[72px] h-[72px] bg-[#1A1A1A] flex items-center justify-center">
              <span className="font-sans text-[9px] text-[#333]">QR</span>
            </div>
          </div>
          <Image src="/logo.png" alt="Battle Trade" width={100} height={25} className="h-[24px] w-auto opacity-60" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading View
// ---------------------------------------------------------------------------

function LoadingView() {
  return (
    <div className="w-[1920px] h-[1080px] bg-[#0D0D0D] flex flex-col items-center justify-center">
      <Image src="/logo.png" alt="Battle Trade" width={400} height={100} className="h-[80px] w-auto mb-8" />
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 bg-[#F5A0D0] animate-pulse" />
        <span className="font-display tracking-[0.05em] text-[24px] text-[#555]">CONNECTING TO LIVE DATA...</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// useLobbyData — live Supabase data + Realtime subscriptions
// ---------------------------------------------------------------------------

interface RawTrader {
  id: string
  name: string
  team_id: string | null
  avatar_url: string | null
  is_eliminated: boolean
  lobby_id: string | null
  profile_id: string | null
}

interface RawTeam {
  id: string
  name: string
}

function useLobbyData(lobbyId: string) {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(true)
  const [lobbyName, setLobbyName] = useState("")
  const [lobbyConfig, setLobbyConfig] = useState<Record<string, unknown> | null>(null)
  const [currentRound, setCurrentRound] = useState<{ id: string; round_number: number; status: string; started_at: string | null; duration_seconds: number; starting_balance: number } | null>(null)
  const [allRounds, setAllRounds] = useState<Array<{ id: string; round_number: number; status: string }>>([])
  const [rawTraders, setRawTraders] = useState<RawTrader[]>([])
  const [rawTeams, setRawTeams] = useState<RawTeam[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [marketOutcomes, setMarketOutcomes] = useState<Array<{ id: string; team_id: string; probability: number; odds: number; volume: number }>>([])
  const [totalBets, setTotalBets] = useState(0)
  const [volatilityEvent, setVolatilityEvent] = useState<{ type: string; asset: string; magnitude: number; duration_seconds: number; secondsRemaining: number } | null>(null)
  const [eventFeedItems, setEventFeedItems] = useState<EventFeedItem[]>([])
  const [spectators, setSpectators] = useState(0)
  const [lastUpdate, setLastUpdate] = useState(0)

  const prevRanksRef = useRef<Record<string, number>>({})
  const balanceHistoriesRef = useRef<Record<string, number[]>>({})
  const prevBalancesRef = useRef<Record<string, number[]>>({})
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([])

  // ---- Initial data fetch ----
  const fetchAll = useCallback(async () => {
    // Lobby
    const { data: lobby } = await supabase
      .from("lobbies")
      .select("name, config")
      .eq("id", lobbyId)
      .single()

    if (lobby) {
      setLobbyName(lobby.name)
      setLobbyConfig(lobby.config as Record<string, unknown>)
    }

    // All rounds
    const { data: rounds } = await supabase
      .from("rounds")
      .select("id, round_number, status, started_at, duration_seconds, starting_balance")
      .eq("lobby_id", lobbyId)
      .order("round_number", { ascending: true })

    if (rounds) {
      setAllRounds(rounds)
      const active = rounds.find(r => r.status === "active" || r.status === "frozen")
        ?? rounds[rounds.length - 1]
      if (active) setCurrentRound(active)
    }

    // Teams
    const { data: traders } = await supabase
      .from("traders")
      .select("id, name, team_id, avatar_url, is_eliminated, lobby_id, profile_id")
      .eq("lobby_id", lobbyId)

    if (traders) setRawTraders(traders as RawTrader[])

    const teamIds = [...new Set((traders ?? []).map(t => t.team_id).filter(Boolean))]
    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", teamIds)
      if (teams) setRawTeams(teams)
    }

    // Positions for active round
    const activeRound = (rounds ?? []).find(r => r.status === "active" || r.status === "frozen")
      ?? (rounds ?? [])[rounds?.length ? rounds.length - 1 : 0]

    if (activeRound) {
      const { data: pos } = await supabase
        .from("positions")
        .select("*")
        .eq("round_id", activeRound.id)
      if (pos) setPositions(pos as Position[])
    }

    // Prices
    const { data: priceRows } = await supabase.from("prices").select("symbol, price")
    if (priceRows) {
      const p: Record<string, number> = {}
      for (const row of priceRows) p[row.symbol] = row.price
      setPrices(p)
    }

    // Market outcomes
    if (activeRound) {
      const { data: market } = await supabase
        .from("prediction_markets")
        .select("id")
        .eq("lobby_id", lobbyId)
        .eq("round_id", activeRound.id)
        .single()

      if (market) {
        const { data: outcomes } = await supabase
          .from("market_outcomes")
          .select("id, team_id, probability, odds, volume")
          .eq("market_id", market.id)
        if (outcomes) setMarketOutcomes(outcomes)

        const { count } = await supabase
          .from("bets")
          .select("id", { count: "exact", head: true })
          .eq("market_id", market.id)
        setTotalBets(count ?? 0)
      }
    }

    // Volatility events
    const { data: events } = await supabase
      .from("volatility_events")
      .select("*")
      .eq("lobby_id", lobbyId)
      .order("fired_at", { ascending: false })
      .limit(1)

    if (events && events.length > 0) {
      const ev = events[0]
      const firedAt = new Date(ev.fired_at).getTime()
      const elapsed = (Date.now() - firedAt) / 1000
      const remaining = (ev.duration_seconds ?? 60) - elapsed
      if (remaining > 0) {
        setVolatilityEvent({
          type: ev.type,
          asset: ev.asset ?? "ALL",
          magnitude: ev.magnitude ?? 0.1,
          duration_seconds: ev.duration_seconds ?? 60,
          secondsRemaining: Math.ceil(remaining),
        })
      }
    }

    setLoading(false)
    setLastUpdate(0)
  }, [lobbyId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ---- Realtime subscriptions ----
  useEffect(() => {
    if (!lobbyId) return

    // Positions changes
    const posChannel = supabase.channel(`lb-${lobbyId}-positions`)
      .on("postgres_changes", { event: "*", schema: "public", table: "positions" }, (payload) => {
        setLastUpdate(0)
        if (payload.eventType === "INSERT") {
          setPositions(prev => [...prev, payload.new as Position])
        } else if (payload.eventType === "UPDATE") {
          setPositions(prev => prev.map(p => p.id === (payload.new as Position).id ? payload.new as Position : p))
        }
      })
      .subscribe()

    // Prices changes
    const priceChannel = supabase.channel(`lb-${lobbyId}-prices`)
      .on("postgres_changes", { event: "*", schema: "public", table: "prices" }, (payload) => {
        setLastUpdate(0)
        const row = payload.new as { symbol: string; price: number }
        setPrices(prev => ({ ...prev, [row.symbol]: row.price }))
      })
      .subscribe()

    // Traders changes (eliminations)
    const traderChannel = supabase.channel(`lb-${lobbyId}-traders`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "traders" }, (payload) => {
        setLastUpdate(0)
        const updated = payload.new as RawTrader
        if (updated.lobby_id === lobbyId) {
          setRawTraders(prev => prev.map(t => t.id === updated.id ? updated : t))
        }
      })
      .subscribe()

    // Rounds changes
    const roundChannel = supabase.channel(`lb-${lobbyId}-rounds`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, (payload) => {
        setLastUpdate(0)
        const updated = payload.new as { id: string; round_number: number; status: string; started_at: string | null; duration_seconds: number; starting_balance: number; lobby_id?: string }
        if (updated.lobby_id === lobbyId || !updated.lobby_id) {
          setAllRounds(prev => {
            const idx = prev.findIndex(r => r.id === updated.id)
            if (idx >= 0) return prev.map(r => r.id === updated.id ? updated : r)
            return [...prev, updated]
          })
          if (updated.status === "active" || updated.status === "frozen") {
            setCurrentRound(updated)
          }
        }
      })
      .subscribe()

    // Volatility events broadcast
    const eventChannel = supabase.channel(`lobby-${lobbyId}-events`)
      .on("broadcast", { event: "volatility" }, (payload) => {
        setLastUpdate(0)
        const msg = payload.payload as Record<string, unknown>
        if (msg.type === "event_start") {
          const ev = msg.event as Record<string, unknown>
          setVolatilityEvent({
            type: (ev.type as string) ?? "flash_crash",
            asset: (ev.asset as string) ?? "ALL",
            magnitude: (ev.magnitude as number) ?? 0.1,
            duration_seconds: (ev.duration_seconds as number) ?? 60,
            secondsRemaining: (msg.secondsRemaining as number) ?? 60,
          })
          setEventFeedItems(prev => [{
            type: "event_active",
            text: `${((ev.type as string) ?? "EVENT").replace(/_/g, " ").toUpperCase()} ACTIVE`,
            subtext: `${ev.asset ?? "ALL"} · ${msg.secondsRemaining}s left`,
            color: "#FF3333",
            bgColor: "rgba(255,51,51,0.06)",
            borderColor: "#FF3333",
          }, ...prev.slice(0, 5)])
        } else if (msg.type === "event_complete") {
          setVolatilityEvent(null)
          setEventFeedItems(prev => [{
            type: "event_ended",
            text: "EVENT ENDED",
            color: "#888",
          }, ...prev.slice(0, 5)])
        }
      })
      .subscribe()

    // Markets broadcast
    const marketChannel = supabase.channel(`lobby-${lobbyId}-markets`)
      .on("broadcast", { event: "market" }, (payload) => {
        setLastUpdate(0)
        const msg = payload.payload as Record<string, unknown>
        if (msg.type === "odds_update" && msg.outcomes) {
          const outcomes = msg.outcomes as Array<{ id: string; team_id: string; probability: number; odds: number; volume: number }>
          setMarketOutcomes(outcomes)
        }
      })
      .subscribe()

    // Presence for spectator count
    const presenceChannel = supabase.channel(`lobby-${lobbyId}-presence`)
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState()
        setSpectators(Object.keys(state).length)
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ viewer: true, joined_at: Date.now() })
        }
        setConnected(status === "SUBSCRIBED")
      })

    channelsRef.current = [posChannel, priceChannel, traderChannel, roundChannel, eventChannel, marketChannel, presenceChannel]

    return () => {
      for (const ch of channelsRef.current) {
        supabase.removeChannel(ch)
      }
      channelsRef.current = []
    }
  }, [lobbyId])

  // ---- Countdown timers ----
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(prev => prev + 1)
      setVolatilityEvent(prev => {
        if (!prev) return null
        const next = prev.secondsRemaining - 1
        if (next <= 0) return null
        return { ...prev, secondsRemaining: next }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // ---- Derive Team[] ----
  const startingBalance = currentRound?.starting_balance ?? 10000

  const teams: Team[] = useMemo(() => {
    // Group traders by team
    const teamGroups = new Map<string, { team: RawTeam; traders: RawTrader[] }>()

    for (const trader of rawTraders) {
      if (!trader.team_id) continue
      const team = rawTeams.find(t => t.id === trader.team_id)
      if (!team) continue
      const existing = teamGroups.get(team.id)
      if (existing) {
        existing.traders.push(trader)
      } else {
        teamGroups.set(team.id, { team, traders: [trader] })
      }
    }

    // Also include traders without teams as individual "teams"
    for (const trader of rawTraders) {
      if (trader.team_id) continue
      teamGroups.set(`solo-${trader.id}`, {
        team: { id: trader.id, name: trader.name },
        traders: [trader],
      })
    }

    // Calculate portfolio value per team
    const teamEntries = Array.from(teamGroups.entries()).map(([teamId, { team, traders }]) => {
      const traderIds = new Set(traders.map(t => t.id))
      const teamPositions = positions.filter(p => traderIds.has(p.trader_id))
      const openPos = teamPositions.filter(p => !p.closed_at)
      const closedPos = teamPositions.filter(p => p.closed_at)
      const balance = calcPortfolioValue(startingBalance, openPos, closedPos, prices)
      const returnPct = calcReturnPct(balance, startingBalance)

      // Open position for display
      const firstOpen = openPos[0]
      const hasPosition = openPos.length > 0
      const btcExposed = openPos.some(p => p.symbol.includes("BTC"))

      // Odds from market
      const outcome = marketOutcomes.find(o => o.team_id === team.id)
      const odds = outcome ? Number(outcome.odds) : 10

      // Volume for crowd heat
      const volume = outcome ? Number(outcome.volume) : 0

      // Lead trader info
      const leadTrader = traders[0]
      const isEliminated = traders.every(t => t.is_eliminated)

      return {
        teamId,
        teamName: team.name,
        traderName: leadTrader?.name ?? "Unknown",
        avatar: leadTrader?.avatar_url ?? null,
        profileId: leadTrader?.profile_id ?? null,
        balance,
        returnPct,
        odds,
        volume,
        hasPosition,
        firstOpen,
        btcExposed,
        isEliminated,
      }
    })

    // Sort by returnPct descending
    teamEntries.sort((a, b) => b.returnPct - a.returnPct)

    // Calculate max volume for crowd heat normalization
    const maxVolume = Math.max(1, ...teamEntries.map(e => e.volume))

    // Build Team objects
    return teamEntries.map((entry, index) => {
      const rank = index + 1
      const prevRank = prevRanksRef.current[entry.teamId]
      let movement = "—"
      if (prevRank !== undefined) {
        const diff = prevRank - rank
        if (diff > 0) movement = `▲${diff}`
        else if (diff < 0) movement = `▼${Math.abs(diff)}`
      }
      prevRanksRef.current[entry.teamId] = rank

      // Balance history
      const history = balanceHistoriesRef.current[entry.teamId] ?? Array(20).fill(startingBalance)
      const updatedHistory = [...history.slice(1), entry.balance]
      balanceHistoriesRef.current[entry.teamId] = updatedHistory

      // PnL velocity from recent balance changes
      const prevBalances = prevBalancesRef.current[entry.teamId] ?? []
      prevBalances.push(entry.balance)
      if (prevBalances.length > 5) prevBalances.shift()
      prevBalancesRef.current[entry.teamId] = prevBalances

      let pnlVelocity: Team["pnlVelocity"] = "flat"
      if (prevBalances.length >= 3) {
        const recent = prevBalances[prevBalances.length - 1] - prevBalances[prevBalances.length - 3]
        const pctChange = (recent / startingBalance) * 100
        if (pctChange > 2) pnlVelocity = "up_fast"
        else if (pctChange > 0.5) pnlVelocity = "up_slow"
        else if (pctChange < -2) pnlVelocity = "down_fast"
        else if (pctChange < -0.5) pnlVelocity = "down_slow"
      }

      // Streak — count consecutive winning closed positions
      const traderIds = new Set(
        rawTraders.filter(t =>
          (t.team_id && rawTeams.find(tm => tm.id === t.team_id)?.name === entry.teamName)
          || (!t.team_id && t.name === entry.teamName)
        ).map(t => t.id)
      )
      const closedForTeam = positions
        .filter(p => traderIds.has(p.trader_id) && p.closed_at)
        .sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime())
      let streak = 0
      for (const p of closedForTeam) {
        if ((p.realized_pnl ?? 0) > 0) streak++
        else break
      }

      // Comeback: was in bottom half, now in top half
      const totalTeams = teamEntries.length
      const isComeback = rank <= Math.ceil(totalTeams / 2) && (prevRank ?? rank) > Math.ceil(totalTeams / 2)

      return {
        rank,
        teamName: entry.teamName,
        traderName: entry.traderName,
        xHandle: `@${entry.traderName.toLowerCase().replace(/\s/g, "")}`,
        avatar: entry.avatar ?? "",
        balance: Math.round(entry.balance),
        returnPct: Math.round(entry.returnPct * 10) / 10,
        movement,
        balanceHistory: updatedHistory,
        odds: entry.odds,
        streak,
        pnlVelocity,
        hasPosition: entry.hasPosition,
        position: entry.firstOpen ? {
          asset: entry.firstOpen.symbol.replace("USDT", ""),
          direction: entry.firstOpen.direction.toUpperCase() as "LONG" | "SHORT",
          leverage: entry.firstOpen.leverage,
          size: entry.firstOpen.size,
        } : undefined,
        crowdHeat: Math.round((entry.volume / maxVolume) * 100),
        isComeback,
        btcExposed: entry.btcExposed,
        profileId: entry.profileId,
      } satisfies Team
    })
  }, [rawTraders, rawTeams, positions, prices, marketOutcomes, startingBalance])

  // ---- Time remaining ----
  const timeRemaining = useMemo(() => {
    if (!currentRound?.started_at) return 0
    const startedAt = new Date(currentRound.started_at).getTime()
    const durationMs = (currentRound.duration_seconds ?? 300) * 1000
    const endsAt = startedAt + durationMs
    const remaining = Math.max(0, Math.floor((endsAt - Date.now()) / 1000))
    return remaining
  }, [currentRound, lastUpdate]) // lastUpdate dependency causes recalc every second

  // ---- Round history ----
  const roundHistory: RoundHistory[] = useMemo(() => {
    return allRounds.map(r => ({
      round: r.round_number,
      eliminatedTeam: "", // Would need to query eliminated traders per round
      isCurrent: r.status === "active" || r.status === "frozen",
    }))
  }, [allRounds])

  // ---- Active event as MarketEvent ----
  const activeMarketEvent: MarketEvent | null = useMemo(() => {
    if (!volatilityEvent) return null
    return {
      type: volatilityEvent.type as MarketEvent["type"],
      asset: volatilityEvent.asset,
      percentChange: -(volatilityEvent.magnitude * 100),
      countdownSeconds: volatilityEvent.secondsRemaining,
      active: true,
      endSeconds: volatilityEvent.secondsRemaining,
    }
  }, [volatilityEvent])

  // ---- Odds data ----
  const oddsData: OddsRow[] = useMemo(() => {
    return teams.map(t => ({
      rank: t.rank,
      name: t.teamName,
      odds: t.odds,
      trend: t.movement.includes("▲") ? "▼" : t.movement.includes("▼") ? "▲" : "→",
      popular: t.rank === 1,
      longshot: t.rank === teams.length,
      avatar: t.avatar,
    }))
  }, [teams])

  // ---- Round info ----
  const roundInfo = useMemo(() => {
    if (!currentRound) return null
    const maxLev = (lobbyConfig?.leverage_tiers as number[] | undefined)
    return {
      number: currentRound.round_number,
      total: allRounds.length,
      maxLeverage: maxLev ? Math.max(...maxLev) : 5,
    }
  }, [currentRound, allRounds, lobbyConfig])

  // ---- Total trades this round ----
  const totalTrades = positions.length

  return {
    loading,
    connected,
    teams,
    trades: [] as Trade[], // Live trades built from position stream
    roundHistory,
    activeMarketEvent,
    eventActive: !!volatilityEvent,
    eventFeedItems,
    scheduledEvents: [] as ScheduledEvent[],
    oddsData,
    totalBets,
    timeRemaining,
    spectators,
    lastUpdate,
    prices,
    lobbyName,
    roundInfo,
    totalTrades,
    roundNumber: currentRound?.round_number ?? 1,
    roundStatus: currentRound?.status ?? "pending",
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BattleTradeLeaderboard() {
  const params = useParams()
  const lobbyId = params.id as string

  const {
    loading,
    connected,
    teams,
    roundHistory,
    activeMarketEvent,
    eventActive,
    eventFeedItems,
    scheduledEvents,
    oddsData,
    totalBets,
    timeRemaining,
    spectators,
    lastUpdate,
    prices,
    lobbyName,
    roundInfo,
    totalTrades,
    roundNumber,
    roundStatus,
  } = useLobbyData(lobbyId)

  const [currentState, setCurrentState] = useState<ViewState>("active")

  // Auto-transition to connection_lost
  useEffect(() => {
    if (!connected && currentState !== "connection_lost") {
      setCurrentState("connection_lost")
    } else if (connected && currentState === "connection_lost") {
      setCurrentState("active")
    }
  }, [connected, currentState])

  // Auto-transition to round_complete
  useEffect(() => {
    if (roundStatus === "completed" && currentState === "active") {
      setCurrentState("round_complete")
    }
  }, [roundStatus, currentState])

  // Viewport scaling
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const updateScale = () => {
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const contentWidth = 1920
      const contentHeight = 1080
      const scaleX = viewportWidth / contentWidth
      const scaleY = viewportHeight / contentHeight
      const newScale = Math.min(scaleX, scaleY, 1)
      setScale(newScale)
    }
    updateScale()
    window.addEventListener("resize", updateScale)
    return () => window.removeEventListener("resize", updateScale)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000000] overflow-hidden flex flex-col items-center justify-center">
        <div
          className="origin-top"
          style={{ transform: `scale(${scale})`, width: 1920, height: 1080 }}
        >
          <LoadingView />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#000000] overflow-hidden flex flex-col items-center justify-start">
      {/* State selector */}
      <div className="z-50 flex flex-wrap justify-center gap-2 py-4 px-4">
        {(["active", "elimination", "round_complete", "connection_lost", "share_card"] as ViewState[]).map(state => (
          <button
            key={state}
            onClick={() => setCurrentState(state)}
            className={`font-display tracking-[0.05em] text-[12px] md:text-[14px] px-3 py-2 border ${
              currentState === state
                ? "border-[#F5A0D0] text-[#F5A0D0] bg-[#1A1A1A]"
                : "border-[#333] text-[#555] hover:border-[#555] bg-[#0A0A0A]"
            }`}
          >
            {state.toUpperCase().replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Main view */}
      <div
        className="origin-top"
        style={{
          transform: `scale(${scale})`,
          width: 1920,
          height: 1080,
        }}
      >
        <div className="border border-[#333]">
          {currentState === "active" && (
            <ActiveRoundView
              teams={teams}
              timeRemaining={timeRemaining}
              lastUpdate={lastUpdate}
              spectators={spectators}
              eventActive={eventActive}
              activeEvent={activeMarketEvent}
              eventFeedItems={eventFeedItems}
              oddsData={oddsData}
              totalBets={totalBets}
              scheduledEvents={scheduledEvents}
              roundHistory={roundHistory}
              totalTrades={totalTrades}
              prices={prices}
              lobbyName={lobbyName}
              roundInfo={roundInfo}
            />
          )}
          {currentState === "elimination" && (
            <EliminationMomentView
              teams={teams}
              timeRemaining={timeRemaining}
              lastUpdate={lastUpdate}
              spectators={spectators}
              roundHistory={roundHistory}
              totalTrades={totalTrades}
              prices={prices}
              lobbyName={lobbyName}
              roundInfo={roundInfo}
              oddsData={oddsData}
              totalBets={totalBets}
              scheduledEvents={scheduledEvents}
            />
          )}
          {currentState === "round_complete" && (
            <RoundCompleteView teams={teams} roundNumber={roundNumber} />
          )}
          {currentState === "connection_lost" && (
            <ConnectionLostView lastUpdate={lastUpdate} />
          )}
          {currentState === "share_card" && (
            <ShareCardView teams={teams} lobbyName={lobbyName} roundNumber={roundNumber} />
          )}
        </div>
      </div>
    </div>
  )
}
