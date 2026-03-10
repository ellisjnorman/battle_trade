'use client'

import { useState } from 'react'
import { DEFENSES } from '@/lib/weapons'

interface LeftColumnProps {
  selectedAsset: string
  currentPrice: number
  selectedDirection: 'long' | 'short' | null
  onDirectionChange: (dir: 'long' | 'short') => void
  selectedSize: number
  onSizeChange: (size: number) => void
  leverage: number
  onLeverageChange: (lev: number) => void
  portfolioValue: number
  isLockedOut: boolean
  lockoutTime: number
  isFrozen: boolean
  isFullPositions: boolean
  assetRestriction?: string
  onExecute: () => void
  onActivateDefense: (defenseId: string) => void
  credits: number
  roundStatus: string
}

const PRESET_SIZES = [500, 1000, 2000, 5000]
const LEVERAGE_OPTIONS = [2, 5, 10, 20, 50]

export function LeftColumn({
  selectedAsset, currentPrice, selectedDirection, onDirectionChange,
  selectedSize, onSizeChange, leverage, onLeverageChange,
  portfolioValue, isLockedOut, lockoutTime, isFrozen, isFullPositions,
  assetRestriction, onExecute, onActivateDefense, credits, roundStatus,
}: LeftColumnProps) {
  const [customSize, setCustomSize] = useState('')
  const canExecute = selectedDirection && selectedSize > 0 && !isLockedOut && !isFrozen && !isFullPositions
    && (!assetRestriction || assetRestriction === selectedAsset) && roundStatus === 'active'

  const fmtPrice = (p: number) => p > 100 ? p.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p > 1 ? p.toFixed(2) : p.toFixed(6)

  const executeLabel = isLockedOut
    ? `BLACKED OUT ${Math.floor(lockoutTime / 60)}:${(lockoutTime % 60).toString().padStart(2, '0')}`
    : isFrozen ? 'ROUND FROZEN'
    : isFullPositions ? 'MAX POSITIONS (3/3)'
    : assetRestriction && assetRestriction !== selectedAsset ? `${assetRestriction} ONLY`
    : !selectedDirection ? 'SELECT DIRECTION'
    : `${selectedDirection.toUpperCase()} ${selectedAsset}`

  const liqPrice = currentPrice > 0 && selectedDirection
    ? selectedDirection === 'long'
      ? currentPrice * (1 - 1 / leverage)
      : currentPrice * (1 + 1 / leverage)
    : 0

  return (
    <aside className="w-[280px] bg-[#0A0A0A] border-r border-[#1A1A1A] flex flex-col shrink-0 overflow-y-auto">
      {/* Order type */}
      <div className="px-[16px] pt-[12px] pb-[8px] border-b border-[#1A1A1A]">
        <div className="flex items-center justify-between mb-[8px]">
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-[#444]">ORDER TYPE</span>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-white">MARKET</span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[10px] text-[#333]">CURRENT PRICE</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[13px] text-white">
            ${fmtPrice(currentPrice)}
          </span>
        </div>
      </div>

      {/* Direction toggle */}
      <div className="px-[16px] py-[10px] border-b border-[#1A1A1A]">
        <div className="flex h-[44px]">
          <button
            onClick={() => onDirectionChange('long')}
            className="flex-1 flex items-center justify-center gap-[6px]"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: '0.05em',
              fontSize: 20,
              backgroundColor: selectedDirection === 'long' ? '#00FF88' : '#0D0D0D',
              color: selectedDirection === 'long' ? '#0A0A0A' : '#00FF88',
              border: selectedDirection === 'long' ? 'none' : '1px solid #1A1A1A',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            LONG
          </button>
          <button
            onClick={() => onDirectionChange('short')}
            className="flex-1 flex items-center justify-center gap-[6px]"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: '0.05em',
              fontSize: 20,
              backgroundColor: selectedDirection === 'short' ? '#FF3333' : '#0D0D0D',
              color: selectedDirection === 'short' ? 'white' : '#FF3333',
              border: selectedDirection === 'short' ? 'none' : '1px solid #1A1A1A',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            SHORT
          </button>
        </div>
      </div>

      {/* Size */}
      <div className="px-[16px] py-[10px] border-b border-[#1A1A1A]">
        <div className="flex items-center justify-between mb-[8px]">
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-[#444]">SIZE (USDC)</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[9px] text-[#333]">BAL: ${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>

        {/* Custom input */}
        <div className="flex items-center h-[36px] mb-[8px]" style={{ border: '1px solid #1A1A1A', backgroundColor: '#0D0D0D' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[14px] text-[#333] pl-[10px]">$</span>
          <input
            type="number"
            value={customSize || selectedSize}
            onChange={e => {
              setCustomSize(e.target.value)
              const val = parseFloat(e.target.value)
              if (!isNaN(val) && val > 0) onSizeChange(val)
            }}
            className="flex-1 bg-transparent text-white text-[14px] px-[8px] outline-none"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}
          />
        </div>

        {/* Preset buttons */}
        <div className="grid grid-cols-4 gap-[4px]">
          {PRESET_SIZES.map(size => (
            <button
              key={size}
              onClick={() => { onSizeChange(size); setCustomSize('') }}
              className="h-[28px] flex items-center justify-center"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                letterSpacing: '0.05em',
                fontSize: 13,
                backgroundColor: selectedSize === size ? '#1A1A1A' : '#0D0D0D',
                color: selectedSize === size ? 'white' : '#444',
                border: selectedSize === size ? '1px solid #333' : '1px solid #111',
                cursor: 'pointer',
              }}
            >
              ${size >= 1000 ? `${size / 1000}K` : size}
            </button>
          ))}
        </div>

        {/* Percentage buttons */}
        <div className="grid grid-cols-4 gap-[4px] mt-[4px]">
          {[10, 25, 50, 100].map(pct => (
            <button
              key={pct}
              onClick={() => { const s = Math.floor(portfolioValue * pct / 100); onSizeChange(s); setCustomSize('') }}
              className="h-[24px] flex items-center justify-center"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 10,
                backgroundColor: '#0D0D0D',
                color: pct === 100 ? '#F5A0D0' : '#333',
                border: '1px solid #111',
                cursor: 'pointer',
              }}
            >
              {pct === 100 ? 'ALL IN' : `${pct}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Leverage */}
      <div className="px-[16px] py-[10px] border-b border-[#1A1A1A]">
        <div className="flex items-center justify-between mb-[8px]">
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-[#444]">LEVERAGE</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[14px] text-[#F5A0D0]">{leverage}x</span>
        </div>
        <div className="grid grid-cols-5 gap-[4px]">
          {LEVERAGE_OPTIONS.map(lev => (
            <button
              key={lev}
              onClick={() => onLeverageChange(lev)}
              className="h-[32px] flex items-center justify-center"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                letterSpacing: '0.05em',
                fontSize: 15,
                backgroundColor: leverage === lev ? '#F5A0D0' : '#0D0D0D',
                color: leverage === lev ? '#0A0A0A' : '#555',
                border: leverage === lev ? 'none' : '1px solid #1A1A1A',
                cursor: 'pointer',
              }}
            >
              {lev}X
            </button>
          ))}
        </div>
      </div>

      {/* Order summary */}
      {selectedDirection && currentPrice > 0 && (
        <div className="px-[16px] py-[8px] border-b border-[#1A1A1A]">
          <div className="flex flex-col gap-[4px]">
            <div className="flex justify-between">
              <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[9px] text-[#333]">POSITION VALUE</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] text-[#555]">${(selectedSize * leverage).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[9px] text-[#333]">LIQ. PRICE</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] text-[#FF3333]">${fmtPrice(liqPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[9px] text-[#333]">ENTRY PRICE</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] text-white">${fmtPrice(currentPrice)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Execute button */}
      <div className="px-[16px] py-[10px] border-b border-[#1A1A1A]">
        <button
          onClick={onExecute}
          disabled={!canExecute}
          className="w-full h-[48px] flex items-center justify-center"
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: '0.05em',
            fontSize: 22,
            backgroundColor: isLockedOut ? '#0D0D0D'
              : !canExecute ? '#1A1A1A'
              : selectedDirection === 'long' ? '#00FF88'
              : selectedDirection === 'short' ? '#FF3333'
              : '#F5A0D0',
            color: isLockedOut ? '#FF3333'
              : !canExecute ? '#333'
              : selectedDirection === 'long' ? '#0A0A0A'
              : 'white',
            border: isLockedOut ? '2px solid #FF3333' : 'none',
            cursor: canExecute ? 'pointer' : 'not-allowed',
          }}
        >
          {executeLabel}
        </button>
      </div>

      {/* Defense section */}
      <div className="px-[16px] py-[10px] flex-1">
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-[#333] block mb-[8px]">DEFENSE</span>
        <div className="flex flex-col gap-[4px]">
          {DEFENSES.map(defense => {
            const canAfford = credits >= defense.cost
            return (
              <button
                key={defense.id}
                onClick={() => canAfford && onActivateDefense(defense.id)}
                disabled={!canAfford}
                className="flex items-center justify-between px-[10px] py-[8px]"
                style={{
                  backgroundColor: '#0D0D0D',
                  border: '1px solid #1A1A1A',
                  borderLeft: '2px solid #555',
                  opacity: canAfford ? 1 : 0.35,
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                }}
              >
                <div className="flex items-center gap-[6px]">
                  <span className="text-[12px]">{defense.icon}</span>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[12px] text-white">{defense.name}</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] text-[#555]">{defense.cost}CR</span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
