import { getServerSupabase } from './supabase-server';
import { PYTH_FEEDS, feedIdToSymbol, denormalizeSymbol } from './pyth-feeds';
import type { LobbyStandingsGap } from './volatility-engine';
import type { Position } from '@/types';
import { calcPortfolioValue, calcReturnPct } from './pnl';

const PYTH_BASE_URL = 'https://hermes.pyth.network/v2/updates/price/latest';
const BATCH_SIZE = 50; // Pyth max per request

const latestPrices: Record<string, number> = {};
const lastUpdateTime: Record<string, number> = {};
let pollInterval: ReturnType<typeof setInterval> | null = null;
let staleCheckInterval: ReturnType<typeof setInterval> | null = null;
let running = false;

const STALE_THRESHOLD_MS = 30_000; // 30 seconds
const STALE_CHECK_INTERVAL_MS = 10_000; // check every 10 seconds

// Core symbols to fetch from Binance REST as fallback
const BINANCE_FALLBACK_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const BINANCE_REST_URL = `https://api.binance.com/api/v3/ticker/price?symbols=${JSON.stringify([...BINANCE_FALLBACK_SYMBOLS])}`;

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
          lastUpdateTime[symbol] = Date.now();
          // Also store USDT-suffixed alias for backwards compat
          const usdt = denormalizeSymbol(symbol);
          if (usdt !== symbol) {
            latestPrices[usdt] = price;
            lastUpdateTime[usdt] = Date.now();
          }
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

// ---------------------------------------------------------------------------
// Binance REST fallback for stale prices
// ---------------------------------------------------------------------------

async function fetchBinanceFallback(): Promise<void> {
  try {
    const res = await fetch(BINANCE_REST_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;

    const data: Array<{ symbol: string; price: string }> = await res.json();

    for (const entry of data) {
      const price = parseFloat(entry.price);
      if (price <= 0) continue;

      // Store with USDT suffix (Binance native format)
      latestPrices[entry.symbol] = price;
      lastUpdateTime[entry.symbol] = Date.now();

      // Also store normalized (without USDT) for Pyth-style lookups
      const normalized = entry.symbol.replace(/USDT$/, '');
      if (normalized !== entry.symbol) {
        latestPrices[normalized] = price;
        lastUpdateTime[normalized] = Date.now();
      }
    }
  } catch {
    // Binance fallback failed — will retry next check
  }
}

function checkStalePrices(): void {
  const now = Date.now();
  const staleSymbols: string[] = [];

  for (const symbol of BINANCE_FALLBACK_SYMBOLS) {
    const lastUpdate = lastUpdateTime[symbol] ?? 0;
    if (now - lastUpdate > STALE_THRESHOLD_MS) {
      staleSymbols.push(symbol);
    }
  }

  if (staleSymbols.length > 0) {
    console.warn(
      `[prices] Stale prices detected (>${STALE_THRESHOLD_MS / 1000}s): ${staleSymbols.join(', ')}. Falling back to Binance REST API.`,
    );
    fetchBinanceFallback().then(flushPricesToSupabase);
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
    // Auto-liquidation check for all active lobbies
    runLiquidationSweep();
    // Auto-elimination check for traders with wiped portfolios
    runEliminationSweep();
    // Auto-volatility event trigger for algorithmic lobbies
    runVolatilityAutoTrigger();
  }, 2000);

  // Check for stale prices every 10 seconds and fall back to Binance REST
  staleCheckInterval = setInterval(checkStalePrices, STALE_CHECK_INTERVAL_MS);
}

export function stopPriceFeed() {
  running = false;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (staleCheckInterval) {
    clearInterval(staleCheckInterval);
    staleCheckInterval = null;
  }
}

export function getLatestPrice(symbol: string): number | undefined {
  return latestPrices[symbol];
}

// ---------------------------------------------------------------------------
// Auto-liquidation sweep (runs every price tick)
// ---------------------------------------------------------------------------

let liquidationRunning = false;

async function runLiquidationSweep() {
  if (liquidationRunning) return; // skip if previous sweep still running
  liquidationRunning = true;
  try {
    const { checkAndLiquidate } = await import('./liquidation');
    const sb = getServerSupabase();
    const { data: lobbies } = await sb
      .from('rounds')
      .select('lobby_id')
      .in('status', ['active', 'frozen']);
    if (!lobbies) return;
    const lobbyIds = [...new Set(lobbies.map(r => r.lobby_id))];
    await Promise.allSettled(lobbyIds.map(id => checkAndLiquidate(id)));
  } catch {
    // Best-effort
  } finally {
    liquidationRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Auto-elimination sweep (runs every price tick)
// ---------------------------------------------------------------------------

let eliminationRunning = false;

async function runEliminationSweep() {
  if (eliminationRunning) return; // skip if previous sweep still running
  eliminationRunning = true;
  try {
    const { checkAndEliminate } = await import('./elimination');
    const sb = getServerSupabase();
    const { data: lobbies } = await sb
      .from('rounds')
      .select('lobby_id')
      .in('status', ['active', 'frozen']);
    if (!lobbies) return;
    const lobbyIds = [...new Set(lobbies.map(r => r.lobby_id))];
    await Promise.allSettled(lobbyIds.map(id => checkAndEliminate(id)));
  } catch {
    // Best-effort
  } finally {
    eliminationRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Auto-volatility trigger sweep (runs every price tick)
// ---------------------------------------------------------------------------

let volatilityRunning = false;

async function calculateStandingsGap(
  lobbyId: string,
  roundId: string,
  startingBalance: number,
  roundStartedAt: string | null,
  roundDurationSeconds: number,
): Promise<LobbyStandingsGap | null> {
  const sb = getServerSupabase();

  // Get non-eliminated traders for this lobby
  const { data: traders } = await sb
    .from('traders')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('is_eliminated', false);

  if (!traders || traders.length < 2) return null;

  // Get all positions for this round
  const { data: positions } = await sb
    .from('positions')
    .select('*')
    .eq('round_id', roundId);

  const allPositions = (positions ?? []) as Position[];

  // Build current prices from in-memory cache
  const currentPrices = { ...latestPrices };

  // Calculate return % for each trader
  const returns: number[] = [];
  for (const trader of traders) {
    const traderPositions = allPositions.filter(p => p.trader_id === trader.id);
    const open = traderPositions.filter(p => !p.closed_at);
    const closed = traderPositions.filter(p => p.closed_at);
    const value = calcPortfolioValue(startingBalance, open, closed, currentPrices);
    returns.push(calcReturnPct(value, startingBalance));
  }

  returns.sort((a, b) => b - a); // descending

  const topReturnPct = returns[0];
  const bottomReturnPct = returns[returns.length - 1];
  const gap = topReturnPct - bottomReturnPct;

  // Calculate round elapsed percentage
  let roundElapsedPct = 0.5; // default to midpoint if we can't determine
  if (roundStartedAt && roundDurationSeconds > 0) {
    const elapsedMs = Date.now() - new Date(roundStartedAt).getTime();
    roundElapsedPct = Math.min(elapsedMs / (roundDurationSeconds * 1000), 1);
  }

  return {
    lobby_id: lobbyId,
    topReturnPct,
    bottomReturnPct,
    gap,
    traderCount: traders.length,
    roundElapsedPct,
  };
}

async function runVolatilityAutoTrigger() {
  if (volatilityRunning) return;
  volatilityRunning = true;
  try {
    const { VolatilityEngine } = await import('./volatility-engine');
    const sb = getServerSupabase();

    // Get all active rounds
    const { data: rounds } = await sb
      .from('rounds')
      .select('id, lobby_id, starting_balance, started_at, duration_seconds')
      .eq('status', 'active');

    if (!rounds || rounds.length === 0) return;

    // Deduplicate by lobby_id (take first active round per lobby)
    const lobbyRounds = new Map<string, typeof rounds[0]>();
    for (const r of rounds) {
      if (r.lobby_id && !lobbyRounds.has(r.lobby_id)) {
        lobbyRounds.set(r.lobby_id, r);
      }
    }

    // Get lobby configs for all active lobbies
    const lobbyIds = [...lobbyRounds.keys()];
    const { data: lobbies } = await sb
      .from('lobbies')
      .select('id, config')
      .in('id', lobbyIds);

    if (!lobbies) return;

    for (const lobby of lobbies) {
      const config = lobby.config as { volatility_engine?: string } | null;
      if (!config || config.volatility_engine !== 'algorithmic') continue;

      const round = lobbyRounds.get(lobby.id);
      if (!round) continue;

      // Get or create engine for this lobby
      let engine = lobbyEngines.get(lobby.id);
      if (!engine) {
        engine = new VolatilityEngine(lobby.id, {
          algoConfig: { enabled: true },
        });
        lobbyEngines.set(lobby.id, engine);
      }

      // Ensure algo mode is enabled on the engine
      const algoConf = engine.getAlgoConfig();
      if (!algoConf.enabled) {
        engine.setAlgoConfig({ enabled: true });
      }

      // Calculate standings gap
      const standings = await calculateStandingsGap(
        lobby.id,
        round.id,
        round.starting_balance,
        round.started_at,
        round.duration_seconds,
      );
      if (!standings) continue;

      // Let the engine decide whether to fire
      const event = engine.evaluateAlgoTrigger(standings);
      if (!event) continue;

      // Persist fired event to volatility_events table
      await sb.from('volatility_events').insert({
        lobby_id: lobby.id,
        type: event.type,
        asset: event.asset,
        magnitude: event.magnitude,
        duration_seconds: event.duration_seconds,
        headline: event.headline ?? null,
        trigger_mode: 'algorithmic',
        fired_at: new Date(event.triggered_at!).toISOString(),
      });

      console.log(
        `[volatility] Auto-triggered "${event.type}" in lobby ${lobby.id} (gap=${standings.gap.toFixed(1)}%, elapsed=${(standings.roundElapsedPct * 100).toFixed(0)}%)`,
      );
    }
  } catch {
    // Best-effort — don't crash the price feed
  } finally {
    volatilityRunning = false;
  }
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
