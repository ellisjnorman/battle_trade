// Local price cache — keeps last-known prices in localStorage so charts
// and tickers don't blank out during temporary connectivity drops at IRL events.

const CACHE_KEY = 'bt_price_cache';

export interface CachedPrice {
  symbol: string;
  price: number;
  timestamp: number;
}

type PriceMap = Record<string, CachedPrice>;

function readMap(): PriceMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as PriceMap;
  } catch {
    return {};
  }
}

function writeMap(map: PriceMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('[price-cache] failed to write', err);
  }
}

/**
 * Store (or update) the cached price for a symbol.
 * Call this every time you receive a fresh price from the websocket or API.
 */
export function cachePrice(symbol: string, price: number): void {
  const map = readMap();
  map[symbol] = { symbol, price, timestamp: Date.now() };
  writeMap(map);
}

/**
 * Retrieve the last cached price for a symbol, or `null` if none exists.
 */
export function getCachedPrice(symbol: string): CachedPrice | null {
  const map = readMap();
  return map[symbol] ?? null;
}

/**
 * Retrieve all cached prices, sorted alphabetically by symbol.
 */
export function getAllCachedPrices(): CachedPrice[] {
  const map = readMap();
  return Object.values(map).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * Returns `true` if every cached price is older than `maxAgeMs` (default 60 s).
 * If the cache is empty, it is considered stale.
 */
export function isCacheStale(maxAgeMs: number = 60_000): boolean {
  const prices = getAllCachedPrices();
  if (prices.length === 0) return true;
  const now = Date.now();
  return prices.every((p) => now - p.timestamp > maxAgeMs);
}
