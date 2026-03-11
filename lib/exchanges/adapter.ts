import type { ExchangeAdapter } from './types';
import { binanceAdapter } from './binance';

const adapters: Record<string, ExchangeAdapter> = {
  binance: binanceAdapter,
};

export function getAdapter(exchange: string): ExchangeAdapter {
  const adapter = adapters[exchange.toLowerCase()];
  if (!adapter) {
    throw new Error(`Exchange not yet supported: ${exchange}`);
  }
  return adapter;
}
