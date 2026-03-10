'use client'

import { useState } from 'react'
import { ATTACKS } from '@/lib/weapons'

interface ActiveEffect { id: string; type: string; source: 'attack' | 'defense'; label: string; expiresAt: number | null; secondsRemaining: number }
interface Standing { rank: number; name: string; returnPct: number; isYou?: boolean; isEliminated?: boolean; activityStatus: 'active' | 'warning' | 'critical' }

interface RightColumnProps {
  standings: Standing[]
  activeEffects: ActiveEffect[]
  credits: number
  onLaunchAttack: (attackId: string, targetId: string) => void
  traders: { id: string; name: string }[]
  returnPct: number
  portfolioValue: number
  activityState: 'active' | 'warning' | 'critical'
}

export function RightColumn({ standings, activeEffects, credits, onLaunchAttack, traders, returnPct, portfolioValue, activityState }: RightColumnProps) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const isProfit = returnPct >= 0

  return (
    <aside className="w-[260px] border-l border-[#1A1A1A] flex flex-col bg-[#0A0A0A] shrink-0 overflow-y-auto">
      {/* Portfolio hero */}
      <div className="px-[14px] py-[12px] border-b border-[#1A1A1A]">
        <div className="flex items-center justify-between mb-[4px]">
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-[#333]">YOUR P&L</span>
          <ActivityDot state={activityState} />
        </div>
        <div className="flex items-baseline gap-[10px]">
          <span
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', color: isProfit ? '#00FF88' : '#FF3333' }}
            className="text-[40px] leading-none"
          >
            {isProfit ? '+' : ''}{returnPct.toFixed(1)}%
          </span>
        </div>
        <div className="w-full h-[3px] bg-[#111] mt-[8px]">
          <div
            style={{
              width: `${Math.min(Math.abs(returnPct) * 3, 100)}%`,
              backgroundColor: isProfit ? '#00FF88' : '#FF3333',
              transition: 'width 500ms ease',
            }}
            className="h-full"
          />
        </div>
      </div>

      {/* Active Effects */}
      {activeEffects.length > 0 && (
        <div className="px-[14px] py-[8px] border-b border-[#1A1A1A]">
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[10px] text-[#333] block mb-[6px]">ACTIVE EFFECTS</span>
          <div className="flex flex-col gap-[4px]">
            {activeEffects.map(e => {
              const color = e.source === 'attack' ? '#FF3333' : '#F5A0D0'
              const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
              return (
                <div key={e.id} className="flex items-center justify-between px-[8px] py-[4px]" style={{ border: `1px solid ${color}` }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', color }} className="text-[11px]">{e.label}</span>
                  {e.expiresAt && e.secondsRemaining > 0 && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color }} className="text-[10px]">{fmt(e.secondsRemaining)}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Standings */}
      <div className="px-[14px] py-[10px] border-b border-[#1A1A1A]">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-[#333] block mb-[8px]">LEADERBOARD</span>
        <div className="flex flex-col">
          {standings.length === 0 ? (
            <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[10px] text-[#222] italic py-[8px]">WAITING FOR TRADES...</span>
          ) : standings.map(s => (
            <div
              key={s.rank}
              className="flex items-center justify-between py-[5px]"
              style={{
                ...(s.isYou ? { backgroundColor: 'rgba(245,160,208,0.03)', borderLeft: '2px solid #F5A0D0', marginLeft: '-14px', paddingLeft: '14px', marginRight: '-14px', paddingRight: '14px' } : {}),
              }}
            >
              <div className="flex items-center gap-[6px]">
                <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[13px] text-[#555] w-[20px]">
                  {s.isEliminated ? <span className="block w-[6px] h-[6px] bg-[#FF3333]" /> : `#${s.rank}`}
                </span>
                <span style={{ fontFamily: "'DM Sans', sans-serif" }} className={`text-[10px] truncate max-w-[80px] ${s.isYou ? 'text-[#F5A0D0]' : 'text-white'}`}>
                  {s.name}{s.isYou ? ' (YOU)' : ''}
                </span>
                {s.activityStatus === 'active' && <span className="block w-[4px] h-[4px] bg-[#00FF88]" />}
                {s.activityStatus === 'warning' && <span className="block w-[4px] h-[4px] bg-[#FF3333] animate-pulse" />}
              </div>
              <span
                style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: s.returnPct >= 0 ? '#00FF88' : '#FF3333' }}
                className="text-[11px]"
              >
                {s.returnPct >= 0 ? '+' : ''}{s.returnPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Arsenal (Weapons) */}
      <div className="px-[14px] py-[10px] flex-1">
        <div className="flex items-center justify-between mb-[8px]">
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-[#F5A0D0]">ARSENAL</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[11px] text-[#F5A0D0]">{credits}CR</span>
        </div>

        {/* Target selector */}
        <select
          value={selectedTarget || ''}
          onChange={e => setSelectedTarget(e.target.value || null)}
          className="w-full text-[11px] p-[6px] mb-[8px]"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            backgroundColor: '#0D0D0D',
            border: '1px solid #1A1A1A',
            color: selectedTarget ? 'white' : '#333',
          }}
        >
          <option value="">SELECT TARGET</option>
          {traders.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        {/* Attack list */}
        <div className="flex flex-col gap-[3px]">
          {ATTACKS.map(attack => {
            const canAfford = credits >= attack.cost
            const canLaunch = canAfford && !!selectedTarget
            return (
              <button
                key={attack.id}
                onClick={() => selectedTarget && canAfford && onLaunchAttack(attack.id, selectedTarget)}
                disabled={!canLaunch}
                className="flex items-center justify-between px-[8px] py-[6px]"
                style={{
                  backgroundColor: '#0D0D0D',
                  border: '1px solid #111',
                  borderLeft: `2px solid ${canAfford ? '#F5A0D0' : '#111'}`,
                  opacity: canAfford ? 1 : 0.3,
                  cursor: canLaunch ? 'pointer' : 'not-allowed',
                }}
              >
                <div className="flex items-center gap-[6px]">
                  <span className="text-[11px]">{attack.icon}</span>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-white">{attack.name}</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] text-[#F5A0D0]">{attack.cost}CR</span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

function ActivityDot({ state }: { state: 'active' | 'warning' | 'critical' }) {
  const color = state === 'active' ? '#00FF88' : '#FF3333'
  const label = state === 'active' ? 'ACTIVE' : state === 'warning' ? 'IDLE' : 'CRITICAL'
  return (
    <div className="flex items-center gap-[4px]">
      <span className={`block w-[6px] h-[6px] ${state !== 'active' ? 'animate-pulse' : ''}`} style={{ backgroundColor: color }} />
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', color }} className="text-[9px]">{label}</span>
    </div>
  )
}
