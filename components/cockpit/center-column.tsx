'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { PYTH_FEEDS, MARKET_TYPES, getFeedsByMarket, type FeedEntry } from '@/lib/pyth-feeds'

interface Position {
  id: string
  type: 'long' | 'short'
  asset: string
  size: number
  entryPrice: number
  leverage: number
  pnl: number
  pnlPct: number
  liqPrice: number
  isNearLiquidation?: boolean
}

interface CenterColumnProps {
  assets: { symbol: string; price: number }[]
  selectedAsset: string
  onAssetChange: (symbol: string) => void
  positions: Position[]
  onClosePosition: (id: string) => void
  currentPosition?: { type: 'long' | 'short'; entryPrice: number; liqPrice: number }
}

// Grouped asset categories for the selector
const CORE_ASSETS = ['BTC', 'ETH', 'SOL', 'DOGE', 'AVAX', 'LINK', 'XRP']

function getAssetMarket(symbol: string): string {
  const key = `${symbol}USD`
  const feed = PYTH_FEEDS[key] as FeedEntry | undefined
  if (!feed) return 'other'
  return feed.market
}

export function CenterColumn({ assets, selectedAsset, onAssetChange, positions, onClosePosition, currentPosition }: CenterColumnProps) {
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const currentAsset = assets.find(a => a.symbol === selectedAsset)
  const price = currentAsset?.price ?? 0

  const fmtPrice = (p: number) => {
    if (p === 0) return '---'
    return p > 100 ? p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p > 1 ? p.toFixed(2) : p.toFixed(6)
  }

  // Non-core assets grouped by market type
  const nonCoreAssets = assets.filter(a => !CORE_ASSETS.includes(a.symbol))
  const marketGroups = MARKET_TYPES.map(mt => ({
    label: mt.label,
    items: nonCoreAssets.filter(a => getAssetMarket(a.symbol) === mt.key),
  })).filter(g => g.items.length > 0)

  return (
    <div className="flex-1 flex flex-col bg-[#0A0A0A] min-w-0 overflow-hidden">
      {/* Asset selector strip */}
      <div className="h-[40px] flex items-center border-b border-[#1A1A1A] shrink-0">
        {/* Core asset tabs */}
        <div className="flex items-center h-full overflow-x-auto">
          {CORE_ASSETS.map(sym => {
            const a = assets.find(x => x.symbol === sym)
            const isSelected = sym === selectedAsset
            return (
              <button
                key={sym}
                onClick={() => onAssetChange(sym)}
                className="h-full flex items-center gap-[6px] px-[14px] shrink-0"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: '0.05em',
                  fontSize: 16,
                  color: isSelected ? 'white' : '#444',
                  borderBottom: isSelected ? '2px solid #F5A0D0' : '2px solid transparent',
                  backgroundColor: isSelected ? 'rgba(245,160,208,0.03)' : 'transparent',
                }}
              >
                {sym}
                {a && a.price > 0 && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: isSelected ? '#888' : '#333', letterSpacing: '-0.02em' }}>
                    ${a.price > 100 ? a.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : a.price.toFixed(2)}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* More assets dropdown */}
        <div className="relative h-full ml-auto shrink-0">
          <button
            onClick={() => setShowAssetPicker(!showAssetPicker)}
            className="h-full px-[14px] flex items-center gap-[4px]"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: '0.05em',
              fontSize: 14,
              color: !CORE_ASSETS.includes(selectedAsset) ? '#F5A0D0' : '#333',
              borderBottom: !CORE_ASSETS.includes(selectedAsset) ? '2px solid #F5A0D0' : '2px solid transparent',
            }}
          >
            {!CORE_ASSETS.includes(selectedAsset) ? selectedAsset : 'ALL ASSETS'} &#9662;
          </button>

          {showAssetPicker && (
            <div
              className="absolute top-full right-0 z-50 w-[280px] max-h-[400px] overflow-y-auto"
              style={{ backgroundColor: '#0D0D0D', border: '1px solid #333' }}
            >
              {marketGroups.map(group => group.items.length > 0 && (
                <div key={group.label}>
                  <div className="px-[12px] py-[6px]" style={{ backgroundColor: '#111' }}>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.1em' }} className="text-[10px] text-[#333]">{group.label}</span>
                  </div>
                  {group.items.map(a => (
                    <button
                      key={a.symbol}
                      onClick={() => { onAssetChange(a.symbol); setShowAssetPicker(false) }}
                      className="w-full flex items-center justify-between px-[12px] py-[8px] border-b border-[#111]"
                      style={{ backgroundColor: a.symbol === selectedAsset ? '#1A1A1A' : 'transparent' }}
                    >
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[14px] text-white">{a.symbol}</span>
                      {a.price > 0 && (
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }} className="text-[11px] text-[#555]">
                          ${fmtPrice(a.price)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Price hero + stats */}
      <div className="px-[16px] py-[8px] flex items-center justify-between shrink-0 border-b border-[#0D0D0D]">
        <div className="flex items-center gap-[16px]">
          <span
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}
            className="text-[32px] text-white leading-none"
          >
            ${fmtPrice(price)}
          </span>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[20px] text-[#333]">
            {selectedAsset}/USD
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative min-h-[200px]">
        <LivePriceChart
          price={price}
          entryPrice={currentPosition?.entryPrice}
          liqPrice={currentPosition?.liqPrice}
          direction={currentPosition?.type}
        />
      </div>

      {/* Positions strip */}
      {positions.length > 0 && (
        <div className="border-t border-[#1A1A1A] shrink-0">
          <div className="flex items-center px-[16px] py-[6px] border-b border-[#0D0D0D]">
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[11px] text-[#333]">
              OPEN POSITIONS ({positions.length}/3)
            </span>
          </div>
          <div className="flex flex-col">
            {positions.map(pos => (
              <PositionRow key={pos.id} position={pos} onClose={onClosePosition} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Position Row — compact horizontal position display
// ---------------------------------------------------------------------------

function PositionRow({ position, onClose }: { position: Position; onClose: (id: string) => void }) {
  const isLong = position.type === 'long'
  const isProfit = position.pnl >= 0
  const dirColor = isLong ? '#00FF88' : '#FF3333'

  const fmtPrice = (p: number) => p > 100 ? p.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.toFixed(2)

  return (
    <div
      className="flex items-center justify-between px-[16px] py-[8px] border-b border-[#0D0D0D]"
      style={{ borderLeft: `3px solid ${dirColor}` }}
    >
      <div className="flex items-center gap-[12px]">
        <span
          className="w-[20px] h-[20px] flex items-center justify-center text-[10px]"
          style={{ fontFamily: "'Bebas Neue', sans-serif", backgroundColor: dirColor, color: isLong ? '#0A0A0A' : 'white' }}
        >
          {isLong ? 'L' : 'S'}
        </span>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.05em' }} className="text-[15px] text-white">{position.asset}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[11px] text-[#555]">${position.size.toLocaleString()}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] text-[#333]">{position.leverage}x</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[10px] text-[#333]">@ ${fmtPrice(position.entryPrice)}</span>
      </div>
      <div className="flex items-center gap-[16px]">
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em', color: isProfit ? '#00FF88' : '#FF3333' }}
          className="text-[14px]"
        >
          {isProfit ? '+' : ''}${position.pnl.toFixed(2)} ({isProfit ? '+' : ''}{position.pnlPct.toFixed(1)}%)
        </span>
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          className={`text-[10px] text-[#FF3333] ${position.isNearLiquidation ? 'animate-pulse' : ''}`}
        >
          LIQ ${fmtPrice(position.liqPrice)}
        </span>
        <button
          onClick={() => onClose(position.id)}
          className="px-[10px] py-[4px]"
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: '0.05em',
            fontSize: 11,
            backgroundColor: '#1A1A1A',
            color: '#888',
            border: '1px solid #333',
            cursor: 'pointer',
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live Price Chart — smooth canvas-based line chart
// ---------------------------------------------------------------------------

function LivePriceChart({ price, entryPrice, liqPrice, direction }: {
  price: number; entryPrice?: number; liqPrice?: number; direction?: 'long' | 'short'
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const priceHistory = useRef<{ price: number; time: number }[]>([])
  const animFrame = useRef<number>(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const W = rect.width
    const H = rect.height

    const history = priceHistory.current
    if (history.length < 2) {
      // Show empty state
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#111'
      ctx.font = "14px 'Bebas Neue', sans-serif"
      ctx.textAlign = 'center'
      ctx.fillText('WAITING FOR PRICE DATA...', W / 2, H / 2)
      return
    }

    const prices = history.map(h => h.price)
    const allPrices = [...prices]
    if (entryPrice) allPrices.push(entryPrice)
    if (liqPrice) allPrices.push(liqPrice)
    const min = Math.min(...allPrices) * 0.9995
    const max = Math.max(...allPrices) * 1.0005
    const range = max - min || 1

    const PAD_TOP = 24
    const PAD_BOTTOM = 24
    const PAD_RIGHT = 80
    const chartH = H - PAD_TOP - PAD_BOTTOM
    const chartW = W - PAD_RIGHT

    const toY = (p: number) => PAD_TOP + chartH - ((p - min) / range) * chartH
    const toX = (i: number) => (i / (prices.length - 1)) * chartW

    // Clear
    ctx.clearRect(0, 0, W, H)

    // Background grid
    ctx.strokeStyle = '#0D0D0D'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= 6; i++) {
      const y = PAD_TOP + (chartH / 6) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(chartW, y)
      ctx.stroke()
    }
    // Vertical grid
    for (let i = 0; i <= 8; i++) {
      const x = (chartW / 8) * i
      ctx.beginPath()
      ctx.moveTo(x, PAD_TOP)
      ctx.lineTo(x, H - PAD_BOTTOM)
      ctx.stroke()
    }

    // Price area fill
    const isUp = prices[prices.length - 1] >= prices[0]
    const lineColor = isUp ? '#00FF88' : '#FF3333'

    const gradient = ctx.createLinearGradient(0, PAD_TOP, 0, H - PAD_BOTTOM)
    gradient.addColorStop(0, isUp ? 'rgba(0,255,136,0.06)' : 'rgba(255,51,51,0.06)')
    gradient.addColorStop(1, 'rgba(10,10,10,0)')

    ctx.beginPath()
    ctx.moveTo(toX(0), H - PAD_BOTTOM)
    for (let i = 0; i < prices.length; i++) {
      ctx.lineTo(toX(i), toY(prices[i]))
    }
    ctx.lineTo(toX(prices.length - 1), H - PAD_BOTTOM)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()

    // Price line with smooth curves
    ctx.beginPath()
    ctx.moveTo(toX(0), toY(prices[0]))
    for (let i = 1; i < prices.length; i++) {
      const prevX = toX(i - 1)
      const prevY = toY(prices[i - 1])
      const currX = toX(i)
      const currY = toY(prices[i])
      const midX = (prevX + currX) / 2
      ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + currY) / 2)
    }
    const lastIdx = prices.length - 1
    ctx.lineTo(toX(lastIdx), toY(prices[lastIdx]))
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Current price horizontal line (dashed, subtle)
    const lastPrice = prices[prices.length - 1]
    const lastY = toY(lastPrice)
    ctx.setLineDash([2, 3])
    ctx.strokeStyle = isUp ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,51,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(toX(lastIdx), lastY)
    ctx.lineTo(W, lastY)
    ctx.stroke()
    ctx.setLineDash([])

    // Current price dot (pulsing effect)
    ctx.beginPath()
    ctx.arc(toX(lastIdx), lastY, 4, 0, Math.PI * 2)
    ctx.fillStyle = lineColor
    ctx.fill()
    ctx.beginPath()
    ctx.arc(toX(lastIdx), lastY, 7, 0, Math.PI * 2)
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.3
    ctx.stroke()
    ctx.globalAlpha = 1

    // Price label on right edge
    const priceLabel = `$${lastPrice > 100 ? lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : lastPrice.toFixed(4)}`
    ctx.fillStyle = isUp ? '#0A2A0A' : '#2A0A0A'
    const labelW = ctx.measureText(priceLabel).width + 16
    ctx.fillRect(chartW + 4, lastY - 10, labelW, 20)
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 1
    ctx.strokeRect(chartW + 4, lastY - 10, labelW, 20)
    ctx.fillStyle = lineColor
    ctx.font = "11px 'JetBrains Mono', monospace"
    ctx.textAlign = 'left'
    ctx.fillText(priceLabel, chartW + 12, lastY + 4)

    // Entry price line
    if (entryPrice && entryPrice >= min && entryPrice <= max) {
      const ey = toY(entryPrice)
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#F5A0D0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, ey)
      ctx.lineTo(chartW, ey)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = '#1A0A1A'
      ctx.fillRect(chartW + 4, ey - 10, 72, 20)
      ctx.strokeStyle = '#F5A0D0'
      ctx.strokeRect(chartW + 4, ey - 10, 72, 20)
      ctx.fillStyle = '#F5A0D0'
      ctx.font = "9px 'JetBrains Mono', monospace"
      ctx.textAlign = 'left'
      ctx.fillText(`ENTRY $${fmtPriceShort(entryPrice)}`, chartW + 8, ey + 3)
    }

    // Liquidation price line
    if (liqPrice && liqPrice >= min && liqPrice <= max) {
      const ly = toY(liqPrice)
      ctx.setLineDash([2, 4])
      ctx.strokeStyle = '#FF3333'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, ly)
      ctx.lineTo(chartW, ly)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = '#2A0A0A'
      ctx.fillRect(chartW + 4, ly - 10, 72, 20)
      ctx.strokeStyle = '#FF3333'
      ctx.strokeRect(chartW + 4, ly - 10, 72, 20)
      ctx.fillStyle = '#FF3333'
      ctx.font = "9px 'JetBrains Mono', monospace"
      ctx.textAlign = 'left'
      ctx.fillText(`LIQ $${fmtPriceShort(liqPrice)}`, chartW + 8, ly + 3)
    }

    // Y-axis price scale
    ctx.fillStyle = '#222'
    ctx.font = "9px 'JetBrains Mono', monospace"
    ctx.textAlign = 'left'
    for (let i = 0; i <= 6; i++) {
      const p = min + range * (i / 6)
      const y = PAD_TOP + chartH - (chartH / 6) * i
      ctx.fillText(`$${fmtPriceShort(p)}`, chartW + 8, y + 3)
    }
  }, [entryPrice, liqPrice, direction])

  // Accumulate price ticks
  useEffect(() => {
    if (price <= 0) return
    const history = priceHistory.current
    history.push({ price, time: Date.now() })
    // Keep last 180 ticks (~6 minutes at 2s intervals)
    if (history.length > 180) history.shift()
    animFrame.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrame.current)
  }, [price, draw])

  // Redraw on resize
  useEffect(() => {
    const handleResize = () => { animFrame.current = requestAnimationFrame(draw) }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: 'block', backgroundColor: '#0A0A0A' }}
    />
  )
}

function fmtPriceShort(p: number): string {
  return p > 100 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p > 1 ? p.toFixed(2) : p.toFixed(4)
}
