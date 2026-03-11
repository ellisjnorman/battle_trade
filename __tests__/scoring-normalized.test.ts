import { normalizeTrade, scoreBattle, type RealTrade } from '../lib/scoring-normalized'

describe('Normalized Tournament Scoring', () => {
  describe('normalizeTrade', () => {
    it('scales position size proportionally to virtual allocation', () => {
      const trade: RealTrade = {
        symbol: 'BTCUSDT', side: 'long', size_usd: 10000,
        entry_price: 50000, exit_price: 51000, leverage: 5, pnl_usd: 1000,
      }
      // $10K position on $50K account = 20% of capital
      // Virtual alloc $10K → virtual size = 20% * $10K = $2K
      const result = normalizeTrade(trade, 50000, 10000)
      expect(result.virtual_size_usd).toBe(2000)
      expect(result.capital_deployed_pct).toBe(20)
    })

    it('scales PnL proportionally', () => {
      const trade: RealTrade = {
        symbol: 'BTCUSDT', side: 'long', size_usd: 25000,
        entry_price: 50000, exit_price: 51000, leverage: 2, pnl_usd: 500,
      }
      // 50% of $50K account, virtual = 50% of $10K = $5K
      // PnL ratio = 500/25000 = 0.02, virtual PnL = 5000 * 0.02 = 100
      const result = normalizeTrade(trade, 50000, 10000)
      expect(result.virtual_size_usd).toBe(5000)
      expect(result.virtual_pnl_usd).toBe(100)
      expect(result.return_pct).toBe(1) // 100/10000 = 1%
    })

    it('caps leverage at 10x for scoring', () => {
      const trade: RealTrade = {
        symbol: 'BTCUSDT', side: 'long', size_usd: 10000,
        entry_price: 50000, exit_price: 52500, leverage: 50, pnl_usd: 2500,
      }
      // At 50x leverage with 10x cap: leverageRatio = 10/50 = 0.2
      // pnlRatio = (2500/10000) * 0.2 = 0.05
      // virtualSize = (10000/50000) * 10000 = 2000
      // virtualPnl = 2000 * 0.05 = 100
      const result = normalizeTrade(trade, 50000, 10000, 10)
      expect(result.virtual_pnl_usd).toBe(100)
    })

    it('handles zero equity gracefully', () => {
      const trade: RealTrade = {
        symbol: 'BTCUSDT', side: 'long', size_usd: 1000,
        entry_price: 50000, exit_price: 51000, leverage: 1, pnl_usd: 20,
      }
      const result = normalizeTrade(trade, 0, 10000)
      expect(result.virtual_size_usd).toBe(0)
      expect(result.virtual_pnl_usd).toBe(0)
      expect(result.return_pct).toBe(0)
    })

    it('handles losing trades correctly', () => {
      const trade: RealTrade = {
        symbol: 'ETHUSDT', side: 'short', size_usd: 5000,
        entry_price: 3000, exit_price: 3150, leverage: 3, pnl_usd: -250,
      }
      const result = normalizeTrade(trade, 50000, 10000)
      expect(result.virtual_pnl_usd).toBeLessThan(0)
      expect(result.return_pct).toBeLessThan(0)
    })
  })

  describe('scoreBattle', () => {
    it('aggregates multiple trades correctly', () => {
      const trades: RealTrade[] = [
        { symbol: 'BTCUSDT', side: 'long', size_usd: 5000, entry_price: 50000, exit_price: 51000, leverage: 2, pnl_usd: 100 },
        { symbol: 'ETHUSDT', side: 'short', size_usd: 3000, entry_price: 3000, exit_price: 2900, leverage: 3, pnl_usd: 100 },
        { symbol: 'SOLUSDT', side: 'long', size_usd: 2000, entry_price: 100, exit_price: 98, leverage: 5, pnl_usd: -200 },
      ]
      const result = scoreBattle(trades, 50000, 10000)
      expect(result.trade_count).toBe(3)
      expect(result.normalized_trades).toHaveLength(3)
      // Total PnL is sum of all normalized PnLs
      const manualSum = result.normalized_trades.reduce((s, n) => s + n.virtual_pnl_usd, 0)
      expect(result.total_virtual_pnl).toBeCloseTo(manualSum)
    })

    it('returns zero for empty trades', () => {
      const result = scoreBattle([], 50000, 10000)
      expect(result.total_virtual_pnl).toBe(0)
      expect(result.total_return_pct).toBe(0)
      expect(result.trade_count).toBe(0)
    })

    it('equalizes different account sizes', () => {
      // Same proportional trade on different account sizes should yield same result
      const smallAcctTrade: RealTrade = {
        symbol: 'BTCUSDT', side: 'long', size_usd: 1000,
        entry_price: 50000, exit_price: 51000, leverage: 2, pnl_usd: 20,
      }
      const bigAcctTrade: RealTrade = {
        symbol: 'BTCUSDT', side: 'long', size_usd: 100000,
        entry_price: 50000, exit_price: 51000, leverage: 2, pnl_usd: 2000,
      }
      const small = scoreBattle([smallAcctTrade], 5000, 10000)
      const big = scoreBattle([bigAcctTrade], 500000, 10000)
      expect(small.total_return_pct).toBeCloseTo(big.total_return_pct, 5)
    })
  })
})
