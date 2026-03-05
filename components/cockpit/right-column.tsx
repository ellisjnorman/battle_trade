'use client'

import { useState } from 'react'
import { ATTACKS, DEFENSES, getAttack, getDefense } from '@/lib/weapons'
import type { AttackId, DefenseId } from '@/lib/weapons'

interface PriceData { symbol: string; price: number; change: number }
interface ActiveEffect { id: string; type: string; source: 'attack' | 'defense'; label: string; expiresAt: number | null; secondsRemaining: number }
interface Prediction { trader: string; odds: number; potentialWin: number }
interface RightColumnProps {
  prices: PriceData[]; activeEffects: ActiveEffect[]; prediction?: Prediction; credits: number
  onBetOnSelf: () => void
  onLaunchAttack: (attackId: string, targetId: string) => void
  onActivateDefense: (defenseId: string) => void
  traders: { id: string; name: string }[]
  defenseDisabled?: boolean
}

export function RightColumn({ prices, activeEffects, prediction, credits, onBetOnSelf, onLaunchAttack, onActivateDefense, traders, defenseDisabled }: RightColumnProps) {
  const [activeTab, setActiveTab] = useState<'intel' | 'weapons'>('intel')
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [hoveredAttack, setHoveredAttack] = useState<string | null>(null)
  const [hoveredDefense, setHoveredDefense] = useState<string | null>(null)

  return (
    <aside className="w-[220px] border-l border-[#1A1A1A] flex flex-col bg-[#0A0A0A]">
      <div className="h-[32px] flex bg-[#0D0D0D] border-b border-[#1A1A1A]">
        {(['intel','weapons'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ flex: 1, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 16, color: activeTab === tab ? 'white' : '#333', borderBottom: activeTab === tab ? '2px solid #F5A0D0' : 'none' }}>
            {tab.toUpperCase()}
          </button>
        ))}
      </div>
      {activeTab === 'intel'
        ? <IntelTab prices={prices} activeEffects={activeEffects} prediction={prediction} onBetOnSelf={onBetOnSelf} />
        : <WeaponsTab credits={credits} traders={traders} selectedTarget={selectedTarget} onSelectTarget={setSelectedTarget} hoveredAttack={hoveredAttack} onHoverAttack={setHoveredAttack} hoveredDefense={hoveredDefense} onHoverDefense={setHoveredDefense} onLaunchAttack={onLaunchAttack} onActivateDefense={onActivateDefense} defenseDisabled={defenseDisabled} />
      }
    </aside>
  )
}

function IntelTab({ prices, activeEffects, prediction, onBetOnSelf }: { prices: PriceData[]; activeEffects: ActiveEffect[]; prediction?: Prediction; onBetOnSelf: () => void }) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="p-[12px] border-b border-[#1A1A1A]">
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 11, color: '#1A1A1A', marginBottom: 8 }}>PRICES</h3>
        <div className="flex flex-col gap-[4px]">
          {prices.map(p => (
            <div key={p.symbol} className="flex items-center justify-between">
              <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[12px] text-white">{p.symbol}</span>
              <div className="flex items-center gap-[8px]">
                <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[12px] text-white">${p.price.toLocaleString()}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: p.change >= 0 ? '#00FF88' : '#FF3333' }} className="text-[12px]">
                  {p.change >= 0 ? '+' : ''}{p.change.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="p-[12px] border-b border-[#1A1A1A]">
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 13, color: '#333', marginBottom: 4 }}>PREDICTION</h3>
        <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[10px] text-[#444] mb-[8px]">WHO WINS THIS ROUND?</p>
        {prediction ? (
          <div className="text-center">
            <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 14, color: 'white' }}>{prediction.trader} TO WIN</p>
            <p style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 26, color: '#F5A0D0', marginTop: 4 }}>{prediction.odds}X</p>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: '#00FF88', marginTop: 4 }} className="text-[11px]">+{prediction.potentialWin.toLocaleString()}CR</p>
          </div>
        ) : (
          <button onClick={onBetOnSelf} className="w-full py-[8px]" style={{ border: '1px solid #F5A0D0', color: '#F5A0D0', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 13 }}>
            BET ON YOURSELF
          </button>
        )}
      </div>
      <div className="p-[12px] flex-1">
        <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 11, color: '#1A1A1A', marginBottom: 8 }}>EFFECTS</h3>
        {activeEffects.length === 0
          ? <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[10px] text-[#333] italic">NO ACTIVE EFFECTS</p>
          : <div className="flex flex-col gap-[8px]">{activeEffects.map(e => <EffectCard key={e.id} effect={e} />)}</div>
        }
      </div>
    </div>
  )
}

function getEffectDisplay(effect: ActiveEffect): { color: string; label: string } {
  const attack = getAttack(effect.type)
  if (attack) return { color: '#FF3333', label: attack.name }
  const defense = getDefense(effect.type)
  if (defense) return { color: '#F5A0D0', label: defense.name }
  switch (effect.type) {
    case 'lockout_lifted': return { color: '#00FF88', label: 'UNLOCKED' }
    case 'fake_news_dismissed': return { color: '#888', label: 'NEWS DISMISSED' }
    default: return { color: '#888', label: effect.label || 'EFFECT' }
  }
}

function EffectCard({ effect }: { effect: ActiveEffect }) {
  const display = getEffectDisplay(effect)
  const hasTimer = effect.expiresAt !== null && effect.secondsRemaining > 0
  const fmt = (s: number) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`
  return (
    <div className="p-[8px]" style={{ border: `1px solid ${display.color}` }}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 14, color: display.color }}>
          {display.label}
        </span>
        {hasTimer && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: display.color }} className="text-[11px]">
            {fmt(effect.secondsRemaining)}
          </span>
        )}
      </div>
    </div>
  )
}

function WeaponsTab({ credits, traders, selectedTarget, onSelectTarget, hoveredAttack, onHoverAttack, hoveredDefense, onHoverDefense, onLaunchAttack, onActivateDefense, defenseDisabled }: {
  credits: number; traders: { id: string; name: string }[]
  selectedTarget: string | null; onSelectTarget: (t: string | null) => void
  hoveredAttack: string | null; onHoverAttack: (id: string | null) => void
  hoveredDefense: string | null; onHoverDefense: (id: string | null) => void
  onLaunchAttack: (attackId: string, targetId: string) => void
  onActivateDefense: (defenseId: string) => void
  defenseDisabled?: boolean
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-[8px] border-b border-[#1A1A1A]">
        <div className="flex items-center justify-between mb-[8px]">
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 14, color: '#F5A0D0' }}>ATTACK</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[13px] text-[#888]">{credits}CR</span>
        </div>
        <select value={selectedTarget||''} onChange={e => onSelectTarget(e.target.value||null)}
          className="w-full text-[12px] p-[8px] mb-[8px]" style={{ fontFamily: "'DM Sans', sans-serif", backgroundColor: '#0D0D0D', border: '1px solid #1A1A1A', color: 'white' }}>
          <option value="">SELECT TARGET</option>
          {traders.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex flex-col">
          {ATTACKS.map(attack => {
            const canAfford = credits >= attack.cost
            return (
              <div key={attack.id} className="p-[8px]" style={{ backgroundColor: '#0D0D0D', borderBottom: '1px solid #1A1A1A', borderLeft: '2px solid #F5A0D0', opacity: canAfford ? 1 : 0.4 }}
                onMouseEnter={() => onHoverAttack(attack.id)} onMouseLeave={() => onHoverAttack(null)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[14px]">{attack.icon}</span>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 13, color: 'white' }}>{attack.name}</span>
                  </div>
                  <div className="flex items-center gap-[8px]">
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 14, color: '#F5A0D0' }}>{attack.cost}CR</span>
                    <button onClick={() => selectedTarget && onLaunchAttack(attack.id, selectedTarget)} disabled={!canAfford || !selectedTarget}
                      style={{ backgroundColor: '#F5A0D0', color: '#0A0A0A', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 10, padding: '4px 8px', opacity: (!canAfford || !selectedTarget) ? 0.5 : 1, cursor: (!canAfford || !selectedTarget) ? 'not-allowed' : 'pointer' }}>
                      LAUNCH
                    </button>
                  </div>
                </div>
                {hoveredAttack === attack.id && <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[9px] text-[#555] mt-[4px]">{attack.desc}</p>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="p-[8px] flex-1">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 14, color: '#888', display: 'block', marginBottom: 8 }}>DEFEND</span>
        <div className="flex flex-col">
          {DEFENSES.map(defense => {
            const canAfford = credits >= defense.cost
            return (
              <div key={defense.id} className="p-[8px]" style={{ backgroundColor: '#0D0D0D', borderBottom: '1px solid #1A1A1A', borderLeft: '2px solid #555', opacity: canAfford && !defenseDisabled ? 1 : 0.4 }}
                onMouseEnter={() => onHoverDefense(defense.id)} onMouseLeave={() => onHoverDefense(null)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-[8px]">
                    <span className="text-[14px]">{defense.icon}</span>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 13, color: 'white' }}>{defense.name}</span>
                  </div>
                  <div className="flex items-center gap-[8px]">
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 14, color: '#888' }}>{defense.cost}CR</span>
                    <button onClick={() => onActivateDefense(defense.id)} disabled={!canAfford || defenseDisabled}
                      style={{ backgroundColor: '#333', color: 'white', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 10, padding: '4px 8px', opacity: (!canAfford || defenseDisabled) ? 0.5 : 1, cursor: (!canAfford || defenseDisabled) ? 'not-allowed' : 'pointer' }}>
                      ACTIVATE
                    </button>
                  </div>
                </div>
                {hoveredDefense === defense.id && <p style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[9px] text-[#555] mt-[4px]">{defense.desc}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
