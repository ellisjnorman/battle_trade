import { supabase } from './supabase';

const SYMBOLS = ['btcusdt', 'ethusdt', 'solusdt'];
const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';

const latestPrices: Record<string, number> = {};
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let flushInterval: ReturnType<typeof setInterval> | null = null;

function buildStreamUrl(): string {
  const streams = SYMBOLS.map((s) => `${s}@trade`).join('/');
  return `${BINANCE_WS_URL}/${streams}`;
}

function connect() {
  ws = new WebSocket(buildStreamUrl());

  ws.onmessage = (event) => {
    const data = JSON.parse(String(event.data));
    if (data.s && data.p) {
      latestPrices[data.s] = parseFloat(data.p);
    }
  };

  ws.onclose = () => {
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, 3000);
}

async function flushPricesToSupabase() {
  const entries = Object.entries(latestPrices);
  if (entries.length === 0) return;

  const rows = entries.map(([symbol, price]) => ({
    symbol,
    price,
    updated_at: new Date().toISOString(),
  }));

  await supabase.from('prices').upsert(rows, { onConflict: 'symbol' });
}

export function startPriceFeed() {
  connect();
  flushInterval = setInterval(flushPricesToSupabase, 1000);
}

export function stopPriceFeed() {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  ws?.close();
  ws = null;
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
