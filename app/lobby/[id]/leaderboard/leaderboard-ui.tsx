"use client"
// Battle Trade Live Platform v5.0 - Volatility Engine UI Layer
import { useState, useEffect, Suspense } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"

// Types
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
  type: "circuit_breaker" | "moon_shot" | "margin_call"
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

type ViewState = "active" | "elimination" | "round_complete" | "connection_lost" | "share_card"

// Data with identity
const teamsData: Team[] = [
  { rank: 1, teamName: "WOLFPACK", traderName: "Ellis", xHandle: "@wolfpacktrades", avatar: "/avatars/wolfpack.jpg", balance: 14220, returnPct: 42.2, movement: "▲2", balanceHistory: [10000, 10500, 11200, 10800, 11500, 12000, 11800, 12500, 13000, 12700, 13200, 13800, 13500, 14000, 13700, 14200, 13900, 14100, 14050, 14220], odds: 1.4, streak: 5, pnlVelocity: "up_fast", hasPosition: true, position: { asset: "BTC", direction: "LONG", leverage: 10, size: 2000 }, crowdHeat: 100, btcExposed: true },
  { rank: 2, teamName: "VEGA", traderName: "Marcus", xHandle: "@vegaonchain", avatar: "/avatars/vega.jpg", balance: 12100, returnPct: 21.0, movement: "▼1", balanceHistory: [10000, 10200, 10500, 10300, 10800, 11000, 10900, 11200, 11500, 11300, 11600, 11800, 11700, 12000, 11900, 12050, 12000, 12100, 12050, 12100], odds: 2.1, streak: 3, pnlVelocity: "up_slow", hasPosition: false, crowdHeat: 60 },
  { rank: 3, teamName: "IRON HANDS", traderName: "Sarah", xHandle: "@ironhandstrader", avatar: "/avatars/ironhands.jpg", balance: 11847, returnPct: 18.4, movement: "▲1", balanceHistory: [10000, 10100, 10300, 10500, 10400, 10700, 10900, 11000, 10800, 11100, 11300, 11200, 11400, 11500, 11600, 11700, 11650, 11800, 11820, 11847], odds: 2.8, streak: 0, pnlVelocity: "flat", hasPosition: false, crowdHeat: 45 },
  { rank: 4, teamName: "DEGEN ALPHA", traderName: "Jake", xHandle: "@degenalpha_", avatar: "/avatars/degenalpha.jpg", balance: 10940, returnPct: 9.4, movement: "—", balanceHistory: [10000, 10050, 10100, 10200, 10150, 10300, 10400, 10350, 10500, 10600, 10550, 10700, 10750, 10800, 10850, 10900, 10880, 10920, 10930, 10940], odds: 4.2, streak: 0, pnlVelocity: "up_slow", hasPosition: true, position: { asset: "ETH", direction: "SHORT", leverage: 5, size: 1500 }, crowdHeat: 40 },
  { rank: 5, teamName: "SIGMA", traderName: "Priya", xHandle: "@sigma_trades", avatar: "/avatars/sigma.jpg", balance: 10200, returnPct: 2.0, movement: "▲1", balanceHistory: [10000, 10050, 9950, 10000, 10100, 10050, 10000, 10100, 10150, 10100, 10200, 10150, 10100, 10200, 10250, 10200, 10180, 10190, 10195, 10200], odds: 6.5, streak: 0, pnlVelocity: "down_slow", hasPosition: false, crowdHeat: 20, isComeback: true },
  { rank: 6, teamName: "REKT CLUB", traderName: "Tom", xHandle: "@rektclub", avatar: "/avatars/rektclub.jpg", balance: 9800, returnPct: -2.0, movement: "▼1", balanceHistory: [10000, 9950, 10000, 9900, 9850, 9900, 9950, 9850, 9800, 9850, 9900, 9850, 9800, 9750, 9800, 9850, 9800, 9780, 9790, 9800], odds: 9.0, streak: 0, pnlVelocity: "down_slow", hasPosition: false, crowdHeat: 15 },
  { rank: 7, teamName: "PAPER HANDS", traderName: "Chen", xHandle: "@paperhandspete", avatar: "/avatars/paperhands.jpg", balance: 8900, returnPct: -11.0, movement: "▼2", balanceHistory: [10000, 9800, 9600, 9700, 9500, 9400, 9500, 9300, 9200, 9300, 9100, 9000, 9100, 8900, 9000, 8950, 8900, 8920, 8910, 8900], odds: 14.0, streak: 0, pnlVelocity: "down_fast", hasPosition: true, position: { asset: "BTC", direction: "LONG", leverage: 5, size: 800 }, crowdHeat: 25, btcExposed: true },
  { rank: 8, teamName: "LIQUIDATED", traderName: "Sam", xHandle: "@liquidated_sam", avatar: "/avatars/liquidated.jpg", balance: 7200, returnPct: -28.0, movement: "—", balanceHistory: [10000, 9500, 9000, 8800, 8500, 8200, 8000, 7800, 7900, 7600, 7500, 7400, 7600, 7300, 7200, 7400, 7300, 7250, 7220, 7200], odds: 28.0, streak: 0, pnlVelocity: "down_fast", hasPosition: false, crowdHeat: 35 },
]

const liveTrades: Trade[] = [
  { team: "WOLFPACK", asset: "BTC", direction: "LONG", pnl: 2400, secondsAgo: 2 },
  { team: "PAPER HANDS", asset: "ETH", direction: "SHORT", pnl: -203, secondsAgo: 8 },
  { team: "VEGA", asset: "SOL", direction: "LONG", pnl: 847, secondsAgo: 14 },
  { team: "IRON HANDS", asset: "BTC", direction: "LONG", pnl: 201, secondsAgo: 19 },
  { team: "REKT CLUB", asset: "BTC", direction: "SHORT", pnl: -88, secondsAgo: 24 },
  { team: "DEGEN ALPHA", asset: "ETH", direction: "LONG", pnl: 612, secondsAgo: 31 },
  { team: "SIGMA", asset: "SOL", direction: "SHORT", pnl: -42, secondsAgo: 38 },
]

const roundHistory: RoundHistory[] = [
  { round: 1, eliminatedTeam: "GHOST PROTOCOL", isCurrent: false, events: [{ type: "CRASH", time: "8:00" }] },
  { round: 2, eliminatedTeam: "", isCurrent: true },
]

const activeEvent: MarketEvent = {
  type: "circuit_breaker",
  asset: "BTC",
  percentChange: -12.4,
  countdownSeconds: 23,
  active: true,
  endSeconds: 43
}

const eventFeedItems: EventFeedItem[] = [
  { type: "event_active", text: "CIRCUIT BREAKER ACTIVE", subtext: "BTC -12% · 43s left", color: "#FF3333", bgColor: "rgba(255,51,51,0.06)", borderColor: "#FF3333" },
  { type: "position_wiped", text: "PAPER HANDS position wiped", subtext: "-$800", color: "#FF3333" },
  { type: "held_through", text: "WOLFPACK held through crash", subtext: "still +38%", color: "#00FF88" },
  { type: "closed_position", text: "SIGMA just closed BTC", subtext: "cut losses · -$200", color: "#888" },
]

const scheduledEvents: ScheduledEvent[] = [
  { type: "CIRCUIT BREAKER", time: "08:00", asset: "BTC" },
  { type: "MOON SHOT", time: "05:00", asset: "ETH" },
  { type: "MARGIN CALL", time: "02:00", asset: "ALL" },
]

const activityStatus: Record<string, "active" | "warning" | "critical"> = {
  "WOLFPACK": "active",
  "VEGA": "active",
  "IRON HANDS": "active",
  "DEGEN ALPHA": "warning",
  "SIGMA": "active",
  "REKT CLUB": "active",
  "PAPER HANDS": "critical",
  "LIQUIDATED": "warning",
}

// CSS for animations
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
@keyframes pulse-warning {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
`

// Activity Indicator — styled components instead of emoji
function ActivityIndicator({ status }: { status: "active" | "warning" | "critical" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-[4px]" style={{ padding: "4px 8px" }}>
        <span className="block w-[8px] h-[8px] bg-[#00FF88]" />
        <span className="font-display tracking-[0.05em] text-[10px] text-[#00FF88]">ACTIVE</span>
      </span>
    )
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-[4px]" style={{ padding: "4px 8px" }}>
        <span className="block w-[8px] h-[8px] bg-[#FF3333]" style={{ animation: "pulse-warning 1s ease-in-out infinite" }} />
        <span className="font-display tracking-[0.05em] text-[10px] text-[#FF3333]">IDLE</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-[4px]" style={{ padding: "4px 8px" }}>
      <span className="block w-[8px] h-[8px] bg-[#FF3333]" />
      <span className="font-display tracking-[0.05em] text-[10px] text-[#FF3333]">CRITICAL</span>
    </span>
  )
}

// Sparkline
function Sparkline({ data, isPositive, teamId }: { data: number[]; isPositive: boolean; teamId?: string }) {
  const [liveData, setLiveData] = useState(data)

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
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        d={linePath}
        vectorEffect="non-scaling-stroke"
        opacity={0.8}
        style={{ transition: "d 0.3s ease-out" }}
      />
    </svg>
  )
}

// PNL Velocity Indicator
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
      className="font-display tracking-[0.05em] text-[14px] ml-[8px]"
      style={{ color: arrow.color, opacity: arrow.opacity }}
    >
      {arrow.text}
    </span>
  )
}

// Crowd Heat Bar
function CrowdHeatBar({ heat }: { heat: number }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[4px]">
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

// Team Avatar
function TeamAvatar({ team, size = 48, isEliminated = false }: { team: Team; size?: number; isEliminated?: boolean }) {
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
        <Image
          src={team.avatar}
          alt={team.teamName}
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      </div>
      {team.hasPosition && team.position && (
        <div
          className="absolute -bottom-[4px] left-0 overflow-hidden"
          style={{
            width: size,
            height: 4,
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

// Event Countdown Bar
function EventCountdownBar({ event }: { event: MarketEvent }) {
  return (
    <div
      className="h-[32px] w-full flex items-center justify-center px-[32px]"
      style={{
        backgroundColor: "#0D0D0D",
        borderTop: "1px solid #FF3333",
        borderBottom: "1px solid #FF3333",
        animation: "pulse-bar 1s ease-in-out infinite"
      }}
    >
      <div className="flex items-center gap-[16px]">
        <span className="font-display tracking-[0.05em] text-[20px] text-white">
          MARKET EVENT IN 0:{event.countdownSeconds.toString().padStart(2, "0")}
        </span>
        <span className="text-[#555]">·</span>
        <span className="font-display tracking-[0.05em] text-[20px] text-[#FF3333]">
          CIRCUIT BREAKER · BTC -15%
        </span>
      </div>
    </div>
  )
}

// Event Active Overlay
function EventActiveOverlay({ event }: { event: MarketEvent }) {
  return (
    <div
      className="absolute top-[104px] left-0 right-[480px] h-[48px] z-40 flex items-center justify-between px-[32px]"
      style={{
        backgroundColor: "rgba(255,51,51,0.08)",
        borderBottom: "1px solid #FF3333"
      }}
    >
      <div className="flex items-center gap-[16px]">
        <span className="font-display tracking-[0.05em] text-[18px] text-[#FF3333]">
          CIRCUIT BREAKER ACTIVE
        </span>
        <span
          className="font-mono tracking-[-0.02em] text-[24px] text-[#FF3333]"
        >
          BTC {event.percentChange}%
        </span>
      </div>
      <span className="font-mono tracking-[-0.02em] text-[18px] text-[#FF3333]">
        ENDS IN 0:{event.endSeconds?.toString().padStart(2, "0")}
      </span>
    </div>
  )
}

// Scheduled Events Panel
function ScheduledEventsPanel({ events }: { events: ScheduledEvent[] }) {
  return (
    <div className="mt-[12px]">
      <span className="font-display tracking-[0.05em] text-[11px] text-[#1A1A1A]">NEXT EVENTS</span>
      <div className="mt-[4px] flex flex-col gap-[4px]">
        {events.map((event, i) => (
          <div key={i} className="flex items-center gap-[4px]">
            <span className="font-mono tracking-[-0.02em] text-[10px] text-[#F5A0D0]">{event.time}</span>
            <span className="font-sans text-[10px] text-[#444]">· {event.type} · {event.asset}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Odds Board
const oddsData = [
  { rank: 1, name: "WOLFPACK", odds: 1.4, trend: "▼", popular: true },
  { rank: 2, name: "VEGA", odds: 2.1, trend: "▼", popular: false },
  { rank: 3, name: "IRON HANDS", odds: 2.8, trend: "→", popular: false },
  { rank: 4, name: "DEGEN ALPHA", odds: 4.2, trend: "→", popular: false },
  { rank: 5, name: "SIGMA", odds: 6.5, trend: "▼", popular: false },
  { rank: 6, name: "REKT CLUB", odds: 9.0, trend: "▲", popular: false },
  { rank: 7, name: "PAPER HANDS", odds: 14.0, trend: "▲", popular: false },
  { rank: 8, name: "LIQUIDATED", odds: 28.0, trend: "▲", longshot: true },
]

function OddsBoard({ teams }: { teams: Team[] }) {
  const getOddsColor = (rank: number) => {
    if (rank <= 3) return "#F5A0D0"
    if (rank >= 6) return "#FF3333"
    return "#888"
  }

  return (
    <div className="border-t border-[#1A1A1A] pt-[12px]">
      <div className="flex items-center justify-between mb-[4px]">
        <span className="font-display tracking-[0.05em] text-[13px] text-[#333]">LIVE ODDS</span>
        <span className="font-mono tracking-[-0.02em] text-[12px] text-[#F5A0D0]">247 BETS PLACED</span>
      </div>

      <div className="text-center mb-[8px]">
        <span className="font-sans text-[10px] text-[#444]">WHO WINS THIS ROUND?</span>
      </div>

      <div className="flex flex-col gap-[4px]">
        {oddsData.map((item) => {
          const team = teams.find(t => t.rank === item.rank)
          const color = getOddsColor(item.rank)
          return (
            <div key={item.rank} className="flex items-center gap-[8px]">
              {team && (
                <div
                  className="w-[20px] h-[20px] flex-shrink-0 overflow-hidden"
                  style={{ borderRadius: "50%" }}
                >
                  <Image src={team.avatar} alt={item.name} width={20} height={20} className="w-full h-full object-cover" />
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

      <ScheduledEventsPanel events={scheduledEvents} />

      <div className="mt-[12px] flex flex-col items-center">
        <span className="font-sans text-[9px] text-[#333] uppercase">MARKETS BY</span>
        <div className="w-[120px] h-[24px] border border-[#1A1A1A] flex items-center justify-center mt-[4px]">
          <span className="font-sans text-[9px] text-[#333]">PARTNER LOGO</span>
        </div>
        <div className="flex flex-col items-center mt-[8px]">
          <div className="w-[56px] h-[56px] bg-[#1A1A1A] flex items-center justify-center">
            <span className="font-sans text-[8px] text-[#333]">QR</span>
          </div>
          <span className="font-sans text-[9px] text-[#444] mt-[4px]">scan to bet</span>
        </div>
      </div>
    </div>
  )
}

// Round History Bar
function RoundHistoryBar({ history }: { history: RoundHistory[] }) {
  return (
    <div className="h-[32px] w-full bg-[#0A0A0A] border-b border-[#1A1A1A] flex items-center px-[32px] gap-[24px]">
      {history.map((round, i) => (
        <div key={round.round} className="flex items-center gap-[8px]">
          {i > 0 && <div className="w-[1px] h-[16px] bg-[#1A1A1A]" />}
          <span className="font-display tracking-[0.05em] text-[11px] text-[#444]">ROUND {round.round}</span>
          {round.events?.map((event, j) => (
            <span
              key={j}
              className="font-display tracking-[0.05em] text-[10px] text-[#FF3333] border border-[#FF3333] px-[8px] py-px"
            >
              {event.type} @ {event.time}
            </span>
          ))}
          {round.isCurrent ? (
            <div className="flex items-center gap-[4px]">
              <div className="w-[8px] h-[8px] bg-[#F5A0D0] animate-pulse" />
              <span className="font-display tracking-[0.05em] text-[11px] text-[#F5A0D0]">ACTIVE</span>
            </div>
          ) : (
            <span className="font-display tracking-[0.05em] text-[11px] text-[#FF3333]">[ELIMINATED: {round.eliminatedTeam}]</span>
          )}
        </div>
      ))}
    </div>
  )
}

// Top Bar
function TopBar({ timeRemaining, spectators, biggestTrade }: { timeRemaining: number; spectators: number; biggestTrade: { team: string; amount: number } }) {
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60
  const timeString = `${minutes}:${seconds.toString().padStart(2, "0")}`
  const isUrgent = timeRemaining < 120

  return (
    <div className="h-[72px] w-full flex items-center justify-between px-[32px] border-b-2 border-[#F5A0D0]">
      <div className="flex items-center gap-[16px]">
        <Image src="/logo.png" alt="Battle Trade" width={280} height={70} className="h-[56px] w-auto" />
        <div className="flex items-center gap-[8px]">
          <div className="w-[8px] h-[8px] bg-[#FF3333]" />
          <span className="font-sans text-[11px] text-white">LIVE</span>
        </div>
        <span className="text-[#333]">|</span>
        <span className="font-sans text-[11px] text-[#555]">{spectators.toLocaleString()} WATCHING</span>
        <span className="font-sans text-[10px] text-[#555]">· 6/8 ACTIVE TRADERS</span>
        <span className="text-[#333]">|</span>
        <div className="flex flex-col">
          <span className="font-sans text-[9px] text-[#444] uppercase">TOP TRADE</span>
          <span className="font-mono tracking-[-0.02em] text-[12px] text-[#00FF88]">{biggestTrade.team} +${biggestTrade.amount.toLocaleString()}</span>
        </div>
      </div>

      <div className="flex items-center gap-[12px]">
        <span className="font-display tracking-[0.05em] text-[22px] text-[#888]">ROUND 2 OF 4</span>
        <span className="text-[#444]">|</span>
        <span className="font-display tracking-[0.05em] text-[22px] text-[#F5A0D0]">LEVERAGE 5X</span>
      </div>

      <div className="flex items-center gap-[24px]">
        <div className="flex flex-col items-end">
          <span className="font-sans text-[9px] text-[#555] uppercase tracking-[0.2em]">ROUND ENDS</span>
          <span className={`font-mono tracking-[-0.02em] text-[56px] leading-none ${isUrgent ? "text-[#FF3333]" : "text-white"}`}>
            {timeString}
          </span>
        </div>
        <span className="font-sans text-[11px] text-[#444]">CONSENSUS 2026</span>
      </div>
    </div>
  )
}

// Exposed Badge
function ExposedBadge({ asset }: { asset: string }) {
  return (
    <span
      className="font-sans text-[10px] text-[#FF3333] border border-[#FF3333] ml-[8px]"
      style={{ padding: "4px 8px" }}
    >
      {asset} EXPOSED
    </span>
  )
}

// Team Row
function TeamRow({ team, isEliminated = false, eventActive = false }: { team: Team; isEliminated?: boolean; eventActive?: boolean }) {
  const isFirst = team.rank === 1
  const isLast = team.rank === 8
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
    if (team.rank === 8) return "#FF3333"
    return "#888"
  }

  return (
    <div
      className="relative flex items-center h-full border-b border-[#1A1A1A]"
      style={{
        background: getBackground(),
        borderLeft: `4px solid ${isEliminated ? "#FF3333" : getBorderColor()}`,
        borderLeftWidth: team.isComeback ? "2px" : isEliminated ? "4px" : "4px",
        opacity: isEliminated ? 1 : undefined
      }}
    >
      {/* RANK */}
      <div className="w-[72px] flex-shrink-0 flex items-center justify-center">
        <span className="font-display tracking-[0.05em] text-[64px] leading-none" style={{ color: getRankColor() }}>
          {team.rank}
        </span>
      </div>

      {/* AVATAR + TEAM */}
      <div className="w-[280px] flex-shrink-0 flex items-center gap-[12px]">
        <TeamAvatar team={team} isEliminated={isEliminated} />
        <div className="flex flex-col">
          <div className="flex items-center gap-[8px]">
            <span
              className={`font-display tracking-[0.05em] text-[24px] leading-tight ${isEliminated ? "line-through text-[#FF3333]" : "text-white"}`}
            >
              {team.teamName}
            </span>
            {team.isComeback && !isEliminated && (
              <span
                className="font-display tracking-[0.05em] text-[11px] text-white"
                style={{ backgroundColor: "#FF3333", padding: "4px 8px" }}
              >
                COMEBACK
              </span>
            )}
            {isFirst && !isEliminated && !team.isComeback && (
              <span className="font-sans text-[10px] text-[#F5A0D0] border border-[#F5A0D0]" style={{ padding: "4px 8px" }}>
                LEADING
              </span>
            )}
            {!isEliminated && (
              <ActivityIndicator status={activityStatus[team.teamName] || "active"} />
            )}
            {isLast && !isEliminated && (
              <span className="font-sans text-[10px] text-[#FF3333] border border-[#FF3333]" style={{ padding: "4px 8px" }}>
                DANGER
              </span>
            )}
            {isEliminated && (
              <span className="font-sans text-[10px] text-white bg-[#FF3333]" style={{ padding: "4px 8px" }}>
                ELIMINATED
              </span>
            )}
          </div>
          <div className="flex items-center gap-[8px]">
            <span className="font-sans text-[11px] text-[#444]">{team.xHandle}</span>
            {team.streak >= 3 && (
              <span className="font-sans text-[10px] text-[#FF3333]">x{team.streak}</span>
            )}
          </div>
        </div>
      </div>

      {/* ODDS */}
      <div className="w-[80px] flex-shrink-0 flex flex-col">
        <span className="font-sans text-[8px] text-[#333] uppercase">ODDS</span>
        <span className="font-display tracking-[0.05em] text-[20px]" style={{ color: getOddsColor() }}>
          {team.odds.toFixed(1)}x
        </span>
      </div>

      {/* BALANCE */}
      <div className="w-[140px] flex-shrink-0">
        <span className="font-mono tracking-[-0.02em] text-[22px] text-[#888]">
          ${team.balance.toLocaleString()}
        </span>
      </div>

      {/* RETURN — hero number */}
      <div className="w-[180px] flex-shrink-0 flex items-center flex-wrap">
        <span
          className="font-display tracking-[0.05em] leading-none"
          style={{
            fontSize: isLast ? "72px" : "64px",
            color: isPositive ? "#00FF88" : "#FF3333",
            animation: isExposed ? "pulse-return 500ms ease-in-out infinite" : "none"
          }}
        >
          {isPositive ? "+" : ""}{team.returnPct.toFixed(1)}%
        </span>
        <PnlVelocity velocity={team.pnlVelocity} />
        {isExposed && <ExposedBadge asset="BTC" />}
      </div>

      {/* MOVEMENT */}
      <div className="w-[64px] flex-shrink-0">
        <span className="font-sans text-[13px]" style={{ color: getMovementColor() }}>
          {team.movement}
        </span>
      </div>

      {/* SPARKLINE */}
      <div className="flex-1 flex items-center">
        <Sparkline data={team.balanceHistory} isPositive={isPositive} teamId={team.teamName} />
      </div>

      <CrowdHeatBar heat={team.crowdHeat} />
    </div>
  )
}

// Live Trades Column
function LiveTradesColumn({ trades, teams, eventActive, eventFeed }: { trades: Trade[]; teams: Team[]; eventActive?: boolean; eventFeed?: EventFeedItem[] }) {
  const isBigTrade = (pnl: number) => Math.abs(pnl) >= 500

  return (
    <div className="w-[480px] flex-shrink-0 border-l border-[#1A1A1A] flex flex-col h-full">
      <div className="px-[16px] py-[8px] border-b border-[#1A1A1A]">
        <span className="font-display tracking-[0.05em] text-[13px] text-[#333]">LIVE TRADES</span>
      </div>
      <div className="overflow-hidden px-[16px] py-[8px]" style={{ maxHeight: "220px" }}>
        {eventActive && eventFeed?.map((item, i) => (
          <div
            key={`event-${i}`}
            className="py-[8px] mb-[8px]"
            style={{
              backgroundColor: item.bgColor || "transparent",
              borderLeft: item.borderColor ? `2px solid ${item.borderColor}` : undefined,
              paddingLeft: item.borderColor ? "8px" : undefined
            }}
          >
            {item.type === "event_active" ? (
              <>
                <span className="font-display tracking-[0.05em] text-[13px] text-[#FF3333] block">{item.text}</span>
                <span className="font-sans text-[11px] text-[#FF3333]">{item.subtext}</span>
              </>
            ) : item.type === "position_wiped" ? (
              <span className="font-mono tracking-[-0.02em] text-[12px] text-[#FF3333]">{item.text} · {item.subtext}</span>
            ) : item.type === "held_through" ? (
              <span className="font-sans text-[12px] text-[#00FF88]">{item.text} · {item.subtext}</span>
            ) : item.type === "closed_position" ? (
              <span className="font-mono tracking-[-0.02em] text-[12px] text-[#888]">{item.text} · {item.subtext}</span>
            ) : null}
          </div>
        ))}

        {trades.map((trade, i) => {
          const big = isBigTrade(trade.pnl)
          return (
            <div key={i} className={`py-[4px] ${big ? "py-[8px]" : ""}`}>
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

      <div className="flex-1 overflow-auto px-[16px] py-[8px]">
        <OddsBoard teams={teams} />
      </div>
    </div>
  )
}

// Elimination Line
function EliminationLine() {
  return (
    <div className="relative w-full h-[40px] flex flex-col items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-[#FF3333]" />
      <div className="relative bg-[#0D0D0D] px-[16px] z-10 flex flex-col items-center">
        <span className="font-display tracking-[0.05em] text-[11px] text-[#FF3333]">
          ELIMINATION ZONE
        </span>
        <span className="font-sans text-[10px] text-[#FF3333] italic">
          LIQUIDATED ELIMINATED IN ~8 MIN AT CURRENT RATE
        </span>
      </div>
    </div>
  )
}

// Bottom Bar — prices with proper coloring
function BottomBar({ lastUpdate }: { lastUpdate: number }) {
  return (
    <div className="h-[40px] w-full flex items-center justify-between px-[32px] border-t border-[#1A1A1A]">
      <div className="flex items-center gap-[8px]">
        <span className="font-sans text-[12px] text-[#444]">8 TEAMS ACTIVE</span>
        <span className="text-[#333]">|</span>
        <span className="font-sans text-[12px] text-[#444]">247 TRADES THIS ROUND</span>
        <span className="font-mono tracking-[-0.02em] text-[12px] text-[#555]">· 2 IDLE · 1 CRITICAL</span>
      </div>

      <div className="flex items-center gap-[16px]">
        <span className="font-sans text-[12px] text-[#444]">BTC</span>
        <span className="font-mono tracking-[-0.02em] text-[13px] text-white">$97,442</span>
        <span className="font-mono tracking-[-0.02em] text-[11px] text-[#00FF88]">+2.1%</span>
        <span className="text-[#333]">·</span>
        <span className="font-sans text-[12px] text-[#444]">ETH</span>
        <span className="font-mono tracking-[-0.02em] text-[13px] text-white">$3,211</span>
        <span className="font-mono tracking-[-0.02em] text-[11px] text-[#FF3333]">-0.8%</span>
        <span className="text-[#333]">·</span>
        <span className="font-sans text-[12px] text-[#444]">SOL</span>
        <span className="font-mono tracking-[-0.02em] text-[13px] text-white">$189</span>
        <span className="font-mono tracking-[-0.02em] text-[11px] text-[#00FF88]">+1.4%</span>
      </div>

      <div className="flex items-center gap-[16px]">
        <span className="font-sans text-[12px] text-[#333]">CONSENSUS MIAMI 2026</span>
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

// Confetti
function ConfettiParticle({ delay, x }: { delay: number; x: number }) {
  const isPink = Math.random() > 0.5
  return (
    <div
      className="absolute w-[8px] h-[8px]"
      style={{
        left: `${x}%`,
        top: -10,
        backgroundColor: isPink ? "#F5A0D0" : "#FFFFFF",
        animation: `confetti-fall 3s ease-in ${delay}s forwards`
      }}
    />
  )
}

// STATE 1: Active Round
function ActiveRoundView({ teams, timeRemaining, lastUpdate, spectators, eventActive = true }: { teams: Team[]; timeRemaining: number; lastUpdate: number; spectators: number; eventActive?: boolean }) {
  const topTeams = teams.filter(t => t.rank <= 7)
  const dangerTeam = teams.find(t => t.rank === 8)
  const biggestTrade = liveTrades.reduce((max, t) => t.pnl > max.pnl ? t : max, liveTrades[0])

  return (
    <div className="relative w-[1920px] h-[1080px] bg-[#0D0D0D] flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: cssAnimations }} />
      <TopBar timeRemaining={timeRemaining} spectators={spectators} biggestTrade={{ team: biggestTrade.team, amount: biggestTrade.pnl }} />
      <RoundHistoryBar history={roundHistory} />

      <EventCountdownBar event={activeEvent} />
      {eventActive && <EventActiveOverlay event={activeEvent} />}

      <div className="flex-1 flex" style={{ marginTop: eventActive ? "80px" : "0" }}>
        <div className="flex-1 flex flex-col">
          {topTeams.map(team => (
            <div key={team.rank} className="flex-1">
              <TeamRow team={team} eventActive={eventActive} />
            </div>
          ))}
          <EliminationLine />
          {dangerTeam && (
            <div className="flex-1">
              <TeamRow team={dangerTeam} eventActive={eventActive} />
            </div>
          )}
        </div>

        <LiveTradesColumn trades={liveTrades} teams={teams} eventActive={eventActive} eventFeed={eventFeedItems} />
      </div>

      <BottomBar lastUpdate={lastUpdate} />
    </div>
  )
}

// STATE 2: Elimination Moment
function EliminationMomentView({ teams, timeRemaining, lastUpdate, spectators }: { teams: Team[]; timeRemaining: number; lastUpdate: number; spectators: number }) {
  const topTeams = teams.filter(t => t.rank <= 7)
  const eliminatedTeam = teams.find(t => t.rank === 8)
  const biggestTrade = liveTrades.reduce((max, t) => t.pnl > max.pnl ? t : max, liveTrades[0])

  return (
    <div className="relative w-[1920px] h-[1080px] bg-[#0D0D0D] flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: cssAnimations }} />
      <div className="absolute top-0 left-0 right-0 z-50 flex flex-col items-center pt-[16px]">
        <span className="font-display tracking-[0.05em] text-[120px] text-[#FF3333] leading-none">ELIMINATED</span>
        <span className="font-display tracking-[0.05em] text-[48px] text-white">{eliminatedTeam?.teamName}</span>
      </div>

      <div className="opacity-20">
        <TopBar timeRemaining={timeRemaining} spectators={spectators} biggestTrade={{ team: biggestTrade.team, amount: biggestTrade.pnl }} />
        <RoundHistoryBar history={roundHistory} />
      </div>

      <div className="flex-1 flex">
        <div className="flex-1 flex flex-col">
          {topTeams.map(team => (
            <div key={team.rank} className="flex-1 opacity-20">
              <TeamRow team={team} />
            </div>
          ))}
          <div className="opacity-20">
            <EliminationLine />
          </div>
          {eliminatedTeam && (
            <div className="flex-1" style={{ background: "#0D0D0D" }}>
              <TeamRow team={eliminatedTeam} isEliminated />
            </div>
          )}
        </div>

        <div className="opacity-20">
          <LiveTradesColumn trades={liveTrades} teams={teams} />
        </div>
      </div>

      <div className="opacity-20">
        <BottomBar lastUpdate={lastUpdate} />
      </div>
    </div>
  )
}

// STATE 3: Round Complete
function RoundCompleteView({ teams }: { teams: Team[] }) {
  const eliminatedTeam = teams.find(t => t.rank === 8)
  const remainingTeams = teams.filter(t => t.rank <= 7).slice(0, 5)

  return (
    <div className="relative w-[1920px] h-[1080px] bg-[#0D0D0D] flex flex-col items-center justify-center overflow-hidden">
      <div className="flex flex-col items-center">
        <span className="font-display tracking-[0.05em] text-[96px] text-white leading-none">ROUND 2 COMPLETE</span>

        <div className="mt-[32px] flex flex-col items-center">
          <span className="font-display tracking-[0.05em] text-[32px] text-[#FF3333]">ELIMINATED:</span>
          <span className="font-display tracking-[0.05em] text-[64px] text-[#FF3333] leading-tight">{eliminatedTeam?.teamName}</span>
          <span className="font-sans text-[20px] text-[#555]">{eliminatedTeam?.traderName}</span>
        </div>

        <div className="w-[400px] h-[1px] bg-[#1A1A1A] my-[32px]" />

        <span className="font-display tracking-[0.05em] text-[28px] text-[#888]">ROUND 3 BEGINS IN</span>
        <span className="font-mono tracking-[-0.02em] text-[80px] text-white leading-none mt-[8px]">3:00</span>
      </div>

      <div className="absolute bottom-[48px] left-0 right-0 flex justify-center gap-[48px]">
        {remainingTeams.map(team => (
          <div key={team.rank} className="flex items-center gap-[12px]">
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

// STATE 4: Connection Lost
function ConnectionLostView({ teams, timeRemaining, lastUpdate, spectators }: { teams: Team[]; timeRemaining: number; lastUpdate: number; spectators: number }) {
  return (
    <div className="relative w-[1920px] h-[1080px] overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <ActiveRoundView teams={teams} timeRemaining={timeRemaining} lastUpdate={lastUpdate} spectators={spectators} eventActive={false} />
      </div>

      <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center">
        <span className="font-display tracking-[0.05em] text-[96px] text-[#FF3333] leading-none">CONNECTION LOST</span>
        <span className="font-mono tracking-[-0.02em] text-[24px] text-[#555] mt-[24px]">LAST UPDATED {lastUpdate}s AGO</span>
        <span className="font-sans text-[16px] text-[#444] mt-[16px]">ATTEMPTING RECONNECT...</span>
      </div>
    </div>
  )
}

// STATE 5: Share Card
function ShareCardView({ teams }: { teams: Team[] }) {
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

  return (
    <div className="relative w-[1080px] h-[1080px] bg-[#0A0A0A] flex flex-col p-[48px] mx-auto overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: cssAnimations }} />

      {showConfetti && confettiParticles.map((p, i) => (
        <ConfettiParticle key={i} delay={p.delay} x={p.x} />
      ))}

      <div className="flex flex-col items-center mb-[32px]">
        <Image src="/logo.png" alt="Battle Trade" width={320} height={80} className="h-[64px] w-auto" />
        <span className="font-display tracking-[0.05em] text-[24px] text-[#555]">ROUND 2 RESULTS</span>
      </div>

      <div className="flex flex-col items-center flex-1">
        <div
          className="w-[120px] h-[120px] overflow-hidden mb-[16px]"
          style={{
            borderRadius: "50%",
            border: "2px solid #F5A0D0"
          }}
        >
          <Image
            src={winner.avatar}
            alt={winner.teamName}
            width={120}
            height={120}
            className="w-full h-full object-cover"
          />
        </div>

        <span className="font-display tracking-[0.05em] text-[96px] text-white leading-none">{winner.teamName}</span>
        <span className="font-sans text-[18px] text-[#555]">{winner.xHandle}</span>

        <span
          className="font-display tracking-[0.05em] text-[120px] text-[#00FF88] leading-none mt-[16px]"
        >
          +{winner.returnPct.toFixed(1)}%
        </span>

        <div className="bg-[#F5A0D0] text-[#0A0A0A] font-display tracking-[0.05em] text-[18px] mt-[16px]" style={{ padding: "8px 16px" }}>
          ROUND WINNER
        </div>

        <span className="font-mono tracking-[-0.02em] text-[16px] text-[#F5A0D0] mt-[12px]">OPENING ODDS: 4.2X</span>
        <span className="font-sans text-[11px] text-[#444] mt-[4px]">BATTLE TRADE MARKETS</span>
      </div>

      <div className="w-full h-[1px] bg-[#1A1A1A] my-[24px]" />

      <div className="flex gap-[32px] justify-center mb-[32px]">
        <div className="flex flex-col gap-[8px]">
          {leftColumn.map(team => (
            <div key={team.rank} className="flex items-center gap-[12px]">
              <span className="font-display tracking-[0.05em] text-[18px] text-[#444] w-[20px]">{team.rank}</span>
              <div
                className="w-[24px] h-[24px] overflow-hidden flex-shrink-0"
                style={{ borderRadius: "50%", border: "1px solid #333" }}
              >
                <Image src={team.avatar} alt={team.teamName} width={24} height={24} className="w-full h-full object-cover" />
              </div>
              <span className="font-display tracking-[0.05em] text-[18px] text-white w-[140px]">{team.teamName}</span>
              <span
                className="font-mono tracking-[-0.02em] text-[16px]"
                style={{ color: team.returnPct >= 0 ? "#00FF88" : "#FF3333" }}
              >
                {team.returnPct >= 0 ? "+" : ""}{team.returnPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-[8px]">
          {rightColumn.map(team => (
            <div key={team.rank} className="flex items-center gap-[12px]">
              <span className="font-display tracking-[0.05em] text-[18px] text-[#444] w-[20px]">{team.rank}</span>
              <div
                className="w-[24px] h-[24px] overflow-hidden flex-shrink-0"
                style={{ borderRadius: "50%", border: "1px solid #333" }}
              >
                <Image src={team.avatar} alt={team.teamName} width={24} height={24} className="w-full h-full object-cover" />
              </div>
              <span className="font-display tracking-[0.05em] text-[18px] text-white w-[140px]">{team.teamName}</span>
              <span
                className="font-mono tracking-[-0.02em] text-[16px]"
                style={{ color: team.returnPct >= 0 ? "#00FF88" : "#FF3333" }}
              >
                {team.returnPct >= 0 ? "+" : ""}{team.returnPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between w-full">
        <div className="flex-1 text-center">
          <span className="font-sans text-[13px] text-[#444]">CONSENSUS MIAMI 2026 · battle.fyi</span>
        </div>
        <div className="flex items-center gap-[16px]">
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

// Main Component
export default function LeaderboardUI() {
  return (
    <Suspense fallback={<div style={{ background: '#000000', minHeight: '100vh' }} />}>
      <LeaderboardUIInner />
    </Suspense>
  )
}

function LeaderboardUIInner() {
  const searchParams = useSearchParams()
  const stateParam = searchParams.get("state") as ViewState | null
  const currentState: ViewState = stateParam && ["active", "elimination", "round_complete", "connection_lost", "share_card"].includes(stateParam) ? stateParam : "active"

  const [teams] = useState<Team[]>(teamsData)
  const [timeRemaining, setTimeRemaining] = useState(873)
  const [lastUpdate, setLastUpdate] = useState(0)
  const [spectators, setSpectators] = useState(847)

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(prev => (prev > 0 ? prev - 1 : 0))
      setLastUpdate(prev => prev + 1)
      setSpectators(prev => prev + Math.floor(Math.random() * 11) - 5)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(0)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

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
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  return (
    <div className="min-h-screen bg-[#000000] overflow-hidden flex flex-col items-center justify-center">
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
            <ActiveRoundView teams={teams} timeRemaining={timeRemaining} lastUpdate={lastUpdate} spectators={spectators} eventActive={true} />
          )}
          {currentState === "elimination" && (
            <EliminationMomentView teams={teams} timeRemaining={timeRemaining} lastUpdate={lastUpdate} spectators={spectators} />
          )}
          {currentState === "round_complete" && (
            <RoundCompleteView teams={teams} />
          )}
          {currentState === "connection_lost" && (
            <ConnectionLostView teams={teams} timeRemaining={timeRemaining} lastUpdate={lastUpdate} spectators={spectators} />
          )}
          {currentState === "share_card" && (
            <ShareCardView teams={teams} />
          )}
        </div>
      </div>
    </div>
  )
}
