/**
 * Market data enrichment — 24h change, volume, sentiment, long/short ratio.
 * Pulls from CoinGecko (free, no key) + Binance Futures data.
 * Caches aggressively to stay within rate limits.
 */

// CoinGecko ID mapping for our Pyth symbols
const GECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', AVAX: 'avalanche-2',
  DOT: 'polkadot', ADA: 'cardano', NEAR: 'near', SUI: 'sui',
  APT: 'aptos', SEI: 'sei-network', TIA: 'celestia', INJ: 'injective-protocol',
  XRP: 'ripple', LINK: 'chainlink', OP: 'optimism', ARB: 'arbitrum',
  POL: 'matic-network', W: 'wormhole', FET: 'fetch-ai', RND: 'render-token',
  UNI: 'uniswap', AAVE: 'aave', LDO: 'lido-dao', SNX: 'havven',
  CRV: 'curve-dao-token', PENDLE: 'pendle', JUP: 'jupiter-exchange-solana',
  ONDO: 'ondo-finance', JTO: 'jito-governance-token',
  DOGE: 'dogecoin', PEPE: 'pepe', WIF: 'dogwifcoin', BONK: 'bonk',
  WLD: 'worldcoin-wld', PYTH: 'pyth-network',
  AAPL: 'apple', TSLA: 'tesla', NVDA: 'nvidia', // Won't resolve on CoinGecko — that's ok
};

// Binance futures symbols for long/short ratio
const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', DOGE: 'DOGEUSDT',
  AVAX: 'AVAXUSDT', LINK: 'LINKUSDT', XRP: 'XRPUSDT', ADA: 'ADAUSDT',
  DOT: 'DOTUSDT', NEAR: 'NEARUSDT', INJ: 'INJUSDT', UNI: 'UNIUSDT',
  AAVE: 'AAVEUSDT', ARB: 'ARBUSDT', OP: 'OPUSDT', PEPE: '1000PEPEUSDT',
  WIF: 'WIFUSDT', BONK: '1000BONKUSDT', SUI: 'SUIUSDT', APT: 'APTUSDT',
  SEI: 'SEIUSDT', TIA: 'TIAUSDT', WLD: 'WLDUSDT', FET: 'FETUSDT',
  JUP: 'JUPUSDT', PENDLE: 'PENDLEUSDT', SNX: 'SNXUSDT',
};

export interface AssetMarketData {
  symbol: string;
  change24h: number | null;     // percentage
  volume24h: number | null;     // USD
  sentiment: number | null;     // 0-100 (fear/greed for market, or bull% for specific)
  longRatio: number | null;     // 0-1 (% of accounts long)
  shortRatio: number | null;    // 0-1
  buyVolume: number | null;
  sellVolume: number | null;
}

// In-memory cache
let cache: Record<string, AssetMarketData> = {};
let fearGreedValue: number | null = null;
let fearGreedLabel: string | null = null;
let lastFetch = 0;
const CACHE_TTL = 60_000; // 60 seconds

export function getCachedMarketData(): { assets: Record<string, AssetMarketData>; fearGreed: { value: number | null; label: string | null } } {
  return { assets: cache, fearGreed: { value: fearGreedValue, label: fearGreedLabel } };
}

export async function refreshMarketData(): Promise<void> {
  if (Date.now() - lastFetch < CACHE_TTL) return;
  lastFetch = Date.now();

  await Promise.allSettled([
    fetchCoinGeckoData(),
    fetchFearGreed(),
    fetchBinanceLongShort(),
  ]);
}

async function fetchCoinGeckoData() {
  try {
    // Batch all gecko IDs into one call
    const ids = Object.values(GECKO_IDS).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const data = await res.json();

    // Reverse map gecko id → symbol
    const reverseMap: Record<string, string> = {};
    for (const [sym, geckoId] of Object.entries(GECKO_IDS)) reverseMap[geckoId] = sym;

    for (const [geckoId, info] of Object.entries(data) as [string, Record<string, number>][]) {
      const sym = reverseMap[geckoId];
      if (!sym) continue;
      if (!cache[sym]) cache[sym] = { symbol: sym, change24h: null, volume24h: null, sentiment: null, longRatio: null, shortRatio: null, buyVolume: null, sellVolume: null };
      cache[sym].change24h = info.usd_24h_change ?? null;
      cache[sym].volume24h = info.usd_24h_vol ?? null;
    }
  } catch {
    // Rate limited or network error
  }
}

async function fetchFearGreed() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const data = await res.json();
    const entry = data?.data?.[0];
    if (entry) {
      fearGreedValue = parseInt(entry.value, 10);
      fearGreedLabel = entry.value_classification;
    }
  } catch {}
}

async function fetchBinanceLongShort() {
  // Fetch long/short ratios for major pairs (limit to avoid hammering)
  const pairs = Object.entries(BINANCE_SYMBOLS).slice(0, 15); // Top 15 only
  const results = await Promise.allSettled(
    pairs.map(async ([sym, binSym]) => {
      const [lsRes, takerRes] = await Promise.allSettled([
        fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${binSym}&period=1h&limit=1`, { signal: AbortSignal.timeout(5000) }),
        fetch(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${binSym}&period=1h&limit=1`, { signal: AbortSignal.timeout(5000) }),
      ]);

      if (!cache[sym]) cache[sym] = { symbol: sym, change24h: null, volume24h: null, sentiment: null, longRatio: null, shortRatio: null, buyVolume: null, sellVolume: null };

      if (lsRes.status === 'fulfilled' && lsRes.value.ok) {
        const d = await lsRes.value.json();
        const entry = Array.isArray(d) ? d[0] : d;
        if (entry) {
          cache[sym].longRatio = parseFloat(entry.longAccount) || null;
          cache[sym].shortRatio = parseFloat(entry.shortAccount) || null;
        }
      }
      if (takerRes.status === 'fulfilled' && takerRes.value.ok) {
        const d = await takerRes.value.json();
        const entry = Array.isArray(d) ? d[0] : d;
        if (entry) {
          cache[sym].buyVolume = parseFloat(entry.buyVol) || null;
          cache[sym].sellVolume = parseFloat(entry.sellVol) || null;
        }
      }
    })
  );
}
