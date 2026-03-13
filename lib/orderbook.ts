/**
 * Pluggable order book adapter.
 * Supports Hyperliquid (default), with interface ready for CEX/DEX swap-in.
 *
 * Usage:
 *   const ob = getOrderBookAdapter('hyperliquid');
 *   const book = await ob.getOrderBook('BTC');
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderBookLevel {
  price: number;
  size: number;      // in asset units
  total?: number;    // cumulative size (computed client-side)
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];   // sorted highest first
  asks: OrderBookLevel[];   // sorted lowest first
  spread: number;           // ask[0].price - bid[0].price
  spreadPct: number;        // spread as % of mid price
  midPrice: number;
  source: string;           // adapter name
  timestamp: number;
}

export interface OrderBookAdapter {
  name: string;
  getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;
  getSupportedSymbols(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Hyperliquid adapter (no auth needed for order book — public info endpoint)
// ---------------------------------------------------------------------------

const HL_URL = 'https://api.hyperliquid.xyz';

interface HLBookLevel {
  px: string;
  sz: string;
  n: number;
}

class HyperliquidOrderBook implements OrderBookAdapter {
  name = 'hyperliquid';

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    // Hyperliquid uses just the base symbol (BTC, ETH, SOL)
    const coin = symbol.replace('USDT', '').replace('USD', '').replace('PERP', '');

    const res = await fetch(`${HL_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'l2Book', coin }),
    });

    if (!res.ok) {
      throw new Error(`Hyperliquid order book failed (${res.status})`);
    }

    const data = await res.json() as {
      levels: [HLBookLevel[], HLBookLevel[]];
    };

    const bids: OrderBookLevel[] = data.levels[0].slice(0, depth).map(l => ({
      price: parseFloat(l.px),
      size: parseFloat(l.sz),
    }));

    const asks: OrderBookLevel[] = data.levels[1].slice(0, depth).map(l => ({
      price: parseFloat(l.px),
      size: parseFloat(l.sz),
    }));

    // Compute cumulative totals
    let bidTotal = 0;
    for (const b of bids) { bidTotal += b.size; b.total = bidTotal; }
    let askTotal = 0;
    for (const a of asks) { askTotal += a.size; a.total = askTotal; }

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;

    return {
      symbol: coin,
      bids,
      asks,
      spread,
      spreadPct: midPrice > 0 ? (spread / midPrice) * 100 : 0,
      midPrice,
      source: this.name,
      timestamp: Date.now(),
    };
  }

  async getSupportedSymbols(): Promise<string[]> {
    const res = await fetch(`${HL_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    });

    if (!res.ok) return [];
    const data = await res.json() as { universe: Array<{ name: string }> };
    return data.universe.map(a => a.name);
  }
}

// ---------------------------------------------------------------------------
// Binance adapter (stub — swap in when ready)
// ---------------------------------------------------------------------------

class BinanceOrderBook implements OrderBookAdapter {
  name = 'binance';

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    const pair = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
    const res = await fetch(`https://api.binance.com/api/v3/depth?symbol=${pair}&limit=${depth}`);

    if (!res.ok) throw new Error(`Binance order book failed (${res.status})`);

    const data = await res.json() as {
      bids: [string, string][];
      asks: [string, string][];
    };

    const bids: OrderBookLevel[] = data.bids.map(([px, sz]) => ({ price: parseFloat(px), size: parseFloat(sz) }));
    const asks: OrderBookLevel[] = data.asks.map(([px, sz]) => ({ price: parseFloat(px), size: parseFloat(sz) }));

    let bidTotal = 0;
    for (const b of bids) { bidTotal += b.size; b.total = bidTotal; }
    let askTotal = 0;
    for (const a of asks) { askTotal += a.size; a.total = askTotal; }

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;

    return { symbol, bids, asks, spread, spreadPct: midPrice > 0 ? (spread / midPrice) * 100 : 0, midPrice, source: this.name, timestamp: Date.now() };
  }

  async getSupportedSymbols(): Promise<string[]> {
    return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'XRPUSDT'];
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const adapters: Record<string, () => OrderBookAdapter> = {
  hyperliquid: () => new HyperliquidOrderBook(),
  binance: () => new BinanceOrderBook(),
  // Future: bybit, okx, dydx, etc.
};

let _default: OrderBookAdapter | null = null;

export function getOrderBookAdapter(name?: string): OrderBookAdapter {
  if (name && adapters[name]) return adapters[name]();
  if (!_default) _default = new HyperliquidOrderBook();
  return _default;
}

export function listOrderBookAdapters(): string[] {
  return Object.keys(adapters);
}
