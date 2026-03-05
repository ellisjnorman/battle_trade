'use client'

import { useState, useMemo } from 'react'

interface Asset { symbol: string; price: number; change24h: number; high24h: number; low24h: number; volume: string; funding: number }
interface OrderHistory { time: string; asset: string; type: 'long' | 'short'; size: number; result: 'open' | number }
interface CenterColumnProps {
  assets: Asset[]; selectedAsset: string; onAssetChange: (symbol: string) => void
  currentPosition?: { type: 'long' | 'short'; entryPrice: number; liqPrice: number }
  roundMinimum: number; isLockedOut: boolean; lockoutTime?: number; isFrozen: boolean
  isFullPositions: boolean; assetRestriction?: string; isIdleWarning: boolean
  credits: number; orderHistory: OrderHistory[]; onExecute: (direction: 'long' | 'short', size: number) => void
}

export function CenterColumn({ assets, selectedAsset, onAssetChange, currentPosition, roundMinimum, isLockedOut, lockoutTime, isFrozen, isFullPositions, assetRestriction, orderHistory, onExecute }: CenterColumnProps) {
  const [selectedDirection, setSelectedDirection] = useState<'long' | 'short' | null>(null)
  const [selectedSize, setSelectedSize] = useState<number | 'ALL IN'>(2000)
  const [timeframe, setTimeframe] = useState('5M')
  const asset = assets.find(a => a.symbol === selectedAsset) || assets[0]
  const isProfit = asset.change24h >= 0
  const sizes = [500, 1000, 2000, 5000, 'ALL IN'] as const
  const actualSize = selectedSize === 'ALL IN' ? 99999 : selectedSize
  const canExecute = selectedDirection && (actualSize >= roundMinimum) && !isLockedOut && !isFrozen && !isFullPositions && (!assetRestriction || assetRestriction === selectedAsset)
  const candles = useMemo(() => generateCandleData(60, asset.price), [asset.price])

  const executeLabel = isLockedOut
    ? `LOCKED ${Math.floor((lockoutTime||0)/60)}:${((lockoutTime||0)%60).toString().padStart(2,'0')}`
    : isFrozen ? 'FROZEN'
    : isFullPositions ? 'FULL (3/3)'
    : assetRestriction && assetRestriction !== selectedAsset ? `${assetRestriction} ONLY`
    : 'EXECUTE'

  const executeBg = isLockedOut || (assetRestriction && assetRestriction !== selectedAsset) ? '#0D0D0D'
    : isFrozen || isFullPositions ? '#1A1A1A'
    : !canExecute ? '#1A1A1A'
    : '#F5A0D0'

  const executeColor = isLockedOut || (assetRestriction && assetRestriction !== selectedAsset) ? '#FF3333'
    : !canExecute ? '#333'
    : '#0A0A0A'

  return (
    <main className="flex-1 flex flex-col bg-[#0A0A0A] overflow-hidden">
      <div className="h-[48px] flex items-end border-b border-[#1A1A1A] shrink-0">
        {assets.map((a) => (
          <button key={a.symbol} onClick={() => onAssetChange(a.symbol)}
            style={{ paddingLeft: 24, paddingRight: 24, height: '100%', display: 'flex', alignItems: 'center', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 24, color: a.symbol === selectedAsset ? 'white' : '#333', borderBottom: a.symbol === selectedAsset ? '3px solid #F5A0D0' : 'none', backgroundColor: a.symbol === selectedAsset ? '#111' : 'transparent' }}>
            {a.symbol}
          </button>
        ))}
        <div className="ml-[16px] flex items-center h-full pb-[8px]">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[12px] text-[#555]">${asset.price.toLocaleString()}</span>
        </div>
      </div>

      <div className="px-[16px] py-[12px] flex items-start justify-between shrink-0">
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', fontSize: 44, color: 'white', lineHeight: 1 }}>
            ${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 16, marginTop: 4, color: isProfit ? '#00FF88' : '#FF3333' }}>
            {isProfit ? '+' : ''}{asset.change24h.toFixed(2)}%
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-[16px] gap-y-[4px] text-right">
          {[['24H HIGH', `${asset.high24h.toLocaleString()}`], ['24H LOW', `${asset.low24h.toLocaleString()}`], ['VOLUME', asset.volume], ['FUNDING', `${asset.funding >= 0 ? '+' : ''}${asset.funding.toFixed(2)}%`]].map(([label, val], i) => (<>
            <span key={`l${i}`} style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[10px] text-[#333]">{label}</span>
            <span key={`v${i}`} style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: label === 'FUNDING' ? '#F5A0D0' : '#333' }} className="text-[10px]">{val}</span>
          </>))}
        </div>
      </div>

      <div className="flex-1 flex flex-col mx-[16px] mb-[16px]">
        <div className="h-[320px] bg-[#0D0D0D] shrink-0 relative" style={{ borderTop: '3px solid #F5A0D0' }}>
          <div className="absolute top-[8px] right-[8px] flex gap-[8px] z-10">
            {['1M','5M','15M'].map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)} style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 11, color: tf === timeframe ? '#F5A0D0' : '#333' }}>{tf}</button>
            ))}
          </div>
          <CandlestickChart candles={candles} currentPrice={asset.price} entryPrice={currentPosition?.entryPrice} liqPrice={currentPosition?.liqPrice} />
        </div>

        <div className="flex h-[80px] shrink-0">
          {(['long','short'] as const).map(dir => (
            <button key={dir} onClick={() => setSelectedDirection(dir)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 36, backgroundColor: selectedDirection === dir ? (dir === 'long' ? '#00FF88' : '#FF3333') : '#0D0D0D', color: selectedDirection === dir ? (dir === 'long' ? '#0A0A0A' : 'white') : (dir === 'long' ? '#00FF88' : '#FF3333') }}>
              {dir.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex h-[48px] shrink-0">
          {sizes.map((size) => {
            const isDisabled = typeof size === 'number' && size < roundMinimum
            const isSelected = selectedSize === size
            const isAllIn = size === 'ALL IN'
            return (
              <button key={size} onClick={() => !isDisabled && setSelectedSize(size)} disabled={isDisabled}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 17, borderTop: isSelected ? '1px solid #F5A0D0' : '1px solid #1A1A1A', backgroundColor: isSelected ? '#1A1A1A' : '#0D0D0D', color: isDisabled ? '#333' : isAllIn ? '#F5A0D0' : 'white', cursor: isDisabled ? 'not-allowed' : 'pointer', outline: isAllIn && !isSelected ? '1px solid #F5A0D0' : 'none', textDecoration: isDisabled ? 'line-through' : 'none', opacity: isDisabled ? 0.5 : 1 }}>
                {typeof size === 'number' ? `${size.toLocaleString()}` : size}
              </button>
            )
          })}
        </div>

        <button onClick={() => selectedDirection && onExecute(selectedDirection, actualSize === 99999 ? 10000 : actualSize)} disabled={!canExecute}
          style={{ height: 64, width: '100%', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 40, backgroundColor: executeBg, color: executeColor, border: (isLockedOut || (assetRestriction && assetRestriction !== selectedAsset)) ? '2px solid #FF3333' : 'none', cursor: canExecute ? 'pointer' : 'not-allowed' }}>
          {executeLabel}
        </button>

        {selectedDirection && (
          <div className="flex items-center justify-between py-[8px] shrink-0">
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 14, color: 'white' }}>
              {selectedAsset} {selectedDirection.toUpperCase()} ${selectedSize === 'ALL IN' ? 'ALL IN' : selectedSize?.toLocaleString()} @ 5X
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[10px] text-[#555]">
              LIQ ${(asset.price * (selectedDirection === 'long' ? 0.8 : 1.2)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}

        <div className="text-right shrink-0">
          <span style={{ fontFamily: "'DM Sans', sans-serif" }} className="text-[8px] text-[#444]">ROUND MIN: ${roundMinimum.toLocaleString()}</span>
        </div>

        <div className="mt-auto pt-[8px] shrink-0">
          <h4 style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em', fontSize: 10, color: '#1A1A1A', marginBottom: 4 }}>RECENT</h4>
          <div className="flex flex-col gap-[4px]">
            {orderHistory.slice(0,3).map((order, i) => (
              <div key={i} className="flex items-center gap-[8px]">
                <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[10px] text-[#444]">{order.time}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[10px] text-[#444]">·</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[10px] text-[#444]">{order.asset} {order.type.toUpperCase()} ${order.size.toLocaleString()}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: order.result === 'open' ? '#444' : (order.result as number) >= 0 ? '#00FF88' : '#FF3333' }} className="text-[10px]">
                  {order.result === 'open' ? 'OPEN' : `${(order.result as number) >= 0 ? '+' : ''}${order.result}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

interface Candle { open: number; high: number; low: number; close: number }

function generateCandleData(count: number, currentPrice: number): Candle[] {
  const candles: Candle[] = []
  let price = currentPrice * 0.98
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * 0.005 * price
    const open = price, close = price + change
    const high = Math.max(open, close) + Math.random() * 0.002 * price
    const low = Math.min(open, close) - Math.random() * 0.002 * price
    candles.push({ open, high, low, close })
    price = close
  }
  if (candles.length > 0) candles[candles.length - 1].close = currentPrice
  return candles
}

function CandlestickChart({ candles, currentPrice, entryPrice, liqPrice }: { candles: Candle[]; currentPrice: number; entryPrice?: number; liqPrice?: number }) {
  const allPrices = candles.flatMap(c => [c.high, c.low])
  if (entryPrice) allPrices.push(entryPrice)
  if (liqPrice) allPrices.push(liqPrice)
  const minPrice = Math.min(...allPrices) * 0.999
  const maxPrice = Math.max(...allPrices) * 1.001
  const priceRange = maxPrice - minPrice
  const W = 100, H = 100
  const cw = W / candles.length * 0.8, cg = W / candles.length * 0.2
  const toY = (p: number) => ((maxPrice - p) / priceRange) * H
  return (
    <div className="w-full h-full p-[8px] pr-[64px] relative">
      <div className="absolute right-[8px] top-[8px] bottom-[8px] flex flex-col justify-between">
        {[maxPrice, maxPrice - priceRange*0.33, maxPrice - priceRange*0.66, minPrice].map((p, i) => (
          <span key={i} style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[9px] text-[#1A1A1A]">{p.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
        {candles.map((c, i) => {
          const x = i * (cw + cg) + cg / 2
          const bull = c.close >= c.open
          const col = bull ? '#00FF88' : '#FF3333'
          const bodyTop = toY(Math.max(c.open, c.close))
          const bodyH = Math.max(toY(Math.min(c.open, c.close)) - bodyTop, 0.5)
          return (
            <g key={i}>
              <line x1={x+cw/2} y1={toY(c.high)} x2={x+cw/2} y2={toY(c.low)} stroke={col} strokeWidth="0.3" />
              <rect x={x} y={bodyTop} width={cw} height={bodyH} fill={col} />
            </g>
          )
        })}
        <line x1="0" y1={toY(currentPrice)} x2={W} y2={toY(currentPrice)} stroke="#F5A0D0" strokeWidth="0.3" strokeDasharray="2 2" />
        {entryPrice && <line x1="0" y1={toY(entryPrice)} x2={W} y2={toY(entryPrice)} stroke="#555" strokeWidth="0.3" />}
        {liqPrice && <line x1="0" y1={toY(liqPrice)} x2={W} y2={toY(liqPrice)} stroke="#FF3333" strokeWidth="0.3" strokeDasharray="2 2" />}
      </svg>
    </div>
  )
}
