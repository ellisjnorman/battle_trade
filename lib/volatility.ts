// ---------------------------------------------------------------------------
// 30-day volatility calculation + return adjustment
// ---------------------------------------------------------------------------

const BINANCE_API = 'https://api.binance.com';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const cache: Map<string, { vol: number; fetchedAt: number }> = new Map();

interface BinanceKline {
  open: number;
  close: number;
}

/**
 * Fetches 30-day average daily volatility for a symbol from Binance public API.
 * Returns standard deviation of daily returns as a decimal (e.g. 0.03 = 3%).
 */
export async function get30DayVolatility(symbol: string): Promise<number> {
  const upperSymbol = symbol.toUpperCase();
  const cached = cache.get(upperSymbol);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.vol;
  }

  const url = `${BINANCE_API}/api/v3/klines?symbol=${encodeURIComponent(upperSymbol)}&interval=1d&limit=30`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance klines ${res.status}: ${body}`);
  }

  // Binance kline array format:
  // [openTime, open, high, low, close, volume, closeTime, ...]
  const raw = (await res.json()) as Array<
    [number, string, string, string, string, string, number, ...unknown[]]
  >;

  if (raw.length < 2) {
    throw new Error(`Insufficient kline data for ${upperSymbol}: got ${raw.length} candles`);
  }

  const klines: BinanceKline[] = raw.map((k) => ({
    open: parseFloat(k[1]),
    close: parseFloat(k[4]),
  }));

  // Daily returns: (close - open) / open
  const returns = klines.map((k) => {
    if (k.open === 0) return 0;
    return (k.close - k.open) / k.open;
  });

  // Standard deviation of daily returns
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const vol = Math.sqrt(variance);

  cache.set(upperSymbol, { vol, fetchedAt: Date.now() });

  return vol;
}

/**
 * Adjusts a raw return by the asset's volatility.
 * Higher-vol assets produce lower adjusted returns for the same raw return.
 *
 * Example: 5% return on BTC (2% vol) = 2.5 adjusted
 *          5% return on SHIB (15% vol) = 0.33 adjusted
 */
export function adjustReturn(rawReturn: number, volatility: number): number {
  if (volatility < 0.001) return rawReturn;
  return rawReturn / volatility;
}
