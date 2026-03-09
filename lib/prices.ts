import { getServerSupabase } from './supabase-server';
import { PYTH_FEEDS, feedIdToSymbol, denormalizeSymbol } from './pyth-feeds';

const PYTH_BASE_URL = 'https://hermes.pyth.network/v2/updates/price/latest';
const BATCH_SIZE = 50; // Pyth max per request

const latestPrices: Record<string, number> = {};
let pollInterval: ReturnType<typeof setInterval> | null = null;
let running = false;

function buildPythUrls(): string[] {
  const allIds = Object.values(PYTH_FEEDS).map((f) => f.id);
  const urls: string[] = [];
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE);
    const params = batch.map((id) => `ids[]=${id}`).join('&');
    urls.push(`${PYTH_BASE_URL}?${params}`);
  }
  return urls;
}

async function fetchPythPrices() {
  try {
    const urls = buildPythUrls();
    const responses = await Promise.allSettled(
      urls.map((url) =>
        fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) }),
      ),
    );

    for (const res of responses) {
      if (res.status !== 'fulfilled' || !res.value.ok) continue;
      const data = await res.value.json();
      const parsed: Array<{
        id: string;
        price: { price: string; expo: number };
      }> = data.parsed ?? [];

      for (const feed of parsed) {
        const symbol = feedIdToSymbol[feed.id];
        if (!symbol) continue;
        const raw = parseInt(feed.price.price, 10);
        const expo = feed.price.expo;
        const price = raw * Math.pow(10, expo);
        if (price > 0) {
          latestPrices[symbol] = price;
          // Also store USDT-suffixed alias for backwards compat
          const usdt = denormalizeSymbol(symbol);
          if (usdt !== symbol) latestPrices[usdt] = price;
        }
      }
    }
  } catch {
    // Network error — will retry next tick
  }
}

async function flushPricesToSupabase() {
  const entries = Object.entries(latestPrices);
  if (entries.length === 0) return;

  const rows = entries.map(([symbol, price]) => ({
    symbol,
    price,
    recorded_at: new Date().toISOString(),
  }));

  // Batch upsert in chunks to avoid payload size issues
  for (let i = 0; i < rows.length; i += 50) {
    await getServerSupabase().from('prices').upsert(rows.slice(i, i + 50), { onConflict: 'symbol' });
  }
}

export function startPriceFeed() {
  if (running) return;
  running = true;

  // Initial fetch
  fetchPythPrices().then(flushPricesToSupabase);

  // Poll every 2 seconds
  pollInterval = setInterval(async () => {
    await fetchPythPrices();
    await flushPricesToSupabase();
  }, 2000);
}

export function stopPriceFeed() {
  running = false;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export function getLatestPrice(symbol: string): number | undefined {
  return latestPrices[symbol];
}

// Per-lobby price modifier support via volatility engine instances
const lobbyEngines: Map<string, import('./volatility-engine').VolatilityEngine> = new Map();

export function registerLobbyEngine(lobbyId: string, engine: import('./volatility-engine').VolatilityEngine) {
  lobbyEngines.set(lobbyId, engine);
}

export function unregisterLobbyEngine(lobbyId: string) {
  lobbyEngines.delete(lobbyId);
}

export function getModifiedPrice(asset: string, basePrice: number, lobbyId: string): number {
  const engine = lobbyEngines.get(lobbyId);
  if (!engine) return basePrice;
  return engine.getModifiedPrice(asset, basePrice);
}

export function getModifiedPricesForLobby(lobbyId: string): Record<string, number> {
  const engine = lobbyEngines.get(lobbyId);
  const raw = { ...latestPrices };
  if (!engine) return raw;
  return engine.getModifiedPrices(raw);
}
