// ---------------------------------------------------------------------------
// Normalized exchange types — adapter layer
// ---------------------------------------------------------------------------

export interface ExchangeCredentials {
  exchange: 'binance' | 'bybit' | 'okx' | 'coinbase' | 'kraken';
  api_key: string;
  api_secret: string;
  passphrase?: string; // OKX/Coinbase require this
}

export interface NormalizedPosition {
  exchange: string;
  symbol: string; // e.g. 'BTCUSDT'
  side: 'long' | 'short';
  size: number; // in base asset
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  leverage: number;
  margin_type: 'cross' | 'isolated';
  opened_at: string; // ISO timestamp
}

export interface NormalizedTrade {
  exchange: string;
  trade_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  fee: number;
  fee_asset: string;
  realized_pnl: number;
  timestamp: string;
}

export interface ExchangeAdapter {
  readonly name: string;
  validateCredentials(creds: ExchangeCredentials): Promise<boolean>;
  getOpenPositions(creds: ExchangeCredentials): Promise<NormalizedPosition[]>;
  getTradeHistory(
    creds: ExchangeCredentials,
    since: Date,
    until?: Date,
  ): Promise<NormalizedTrade[]>;
  getAccountBalance(
    creds: ExchangeCredentials,
  ): Promise<{ total_usd: number; available_usd: number }>;
  getCurrentPrice(symbol: string): Promise<number>;
}
