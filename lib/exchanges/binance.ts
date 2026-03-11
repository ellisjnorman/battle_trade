import crypto from 'crypto';
import type {
  ExchangeAdapter,
  ExchangeCredentials,
  NormalizedPosition,
  NormalizedTrade,
} from './types';

// ---------------------------------------------------------------------------
// Binance Futures (USDM) adapter
// ---------------------------------------------------------------------------

const BASE_URL = 'https://fapi.binance.com';

function sign(queryString: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

async function signedRequest<T>(
  path: string,
  params: Record<string, string | number>,
  creds: ExchangeCredentials,
): Promise<T> {
  const timestamp = Date.now();
  const allParams: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
    timestamp: String(timestamp),
  };

  const queryString = new URLSearchParams(allParams).toString();
  const signature = sign(queryString, creds.api_secret);
  const url = `${BASE_URL}${path}?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': creds.api_key,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance ${path} ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Binance response shapes
// ---------------------------------------------------------------------------

interface BinanceAccountResponse {
  totalWalletBalance: string;
  availableBalance: string;
  positions: Array<{
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    markPrice: string;
    unRealizedProfit: string;
    leverage: string;
    marginType: string;
    updateTime: number;
  }>;
}

interface BinanceTrade {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  realizedPnl: string;
  time: number;
}

interface BinanceTickerPrice {
  symbol: string;
  price: string;
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export const binanceAdapter: ExchangeAdapter = {
  name: 'binance',

  async validateCredentials(creds: ExchangeCredentials): Promise<boolean> {
    try {
      await signedRequest<BinanceAccountResponse>(
        '/fapi/v2/account',
        {},
        creds,
      );
      return true;
    } catch {
      return false;
    }
  },

  async getOpenPositions(
    creds: ExchangeCredentials,
  ): Promise<NormalizedPosition[]> {
    const account = await signedRequest<BinanceAccountResponse>(
      '/fapi/v2/account',
      {},
      creds,
    );

    return account.positions
      .filter((p) => parseFloat(p.positionAmt) !== 0)
      .map((p) => {
        const amt = parseFloat(p.positionAmt);
        return {
          exchange: 'binance',
          symbol: p.symbol,
          side: amt > 0 ? 'long' : 'short',
          size: Math.abs(amt),
          entry_price: parseFloat(p.entryPrice),
          current_price: parseFloat(p.markPrice),
          unrealized_pnl: parseFloat(p.unRealizedProfit),
          leverage: parseInt(p.leverage, 10),
          margin_type:
            p.marginType.toLowerCase() === 'isolated' ? 'isolated' : 'cross',
          opened_at: new Date(p.updateTime).toISOString(),
        } satisfies NormalizedPosition;
      });
  },

  async getTradeHistory(
    creds: ExchangeCredentials,
    since: Date,
    until?: Date,
  ): Promise<NormalizedTrade[]> {
    const trades: NormalizedTrade[] = [];
    const endTime = until ? until.getTime() : Date.now();
    let startTime = since.getTime();
    const PAGE_LIMIT = 1000;

    // Paginate forward in time
    while (startTime < endTime) {
      const params: Record<string, string | number> = {
        startTime,
        limit: PAGE_LIMIT,
      };

      const page = await signedRequest<BinanceTrade[]>(
        '/fapi/v1/userTrades',
        params,
        creds,
      );

      if (page.length === 0) break;

      for (const t of page) {
        if (t.time > endTime) break;
        trades.push({
          exchange: 'binance',
          trade_id: String(t.id),
          symbol: t.symbol,
          side: t.side === 'BUY' ? 'buy' : 'sell',
          price: parseFloat(t.price),
          quantity: parseFloat(t.qty),
          fee: parseFloat(t.commission),
          fee_asset: t.commissionAsset,
          realized_pnl: parseFloat(t.realizedPnl),
          timestamp: new Date(t.time).toISOString(),
        });
      }

      // If we got less than a full page, we're done
      if (page.length < PAGE_LIMIT) break;

      // Move startTime past the last trade we received
      const lastTradeTime = page[page.length - 1].time;
      if (lastTradeTime <= startTime) break; // safety: avoid infinite loop
      startTime = lastTradeTime + 1;
    }

    return trades;
  },

  async getAccountBalance(
    creds: ExchangeCredentials,
  ): Promise<{ total_usd: number; available_usd: number }> {
    const account = await signedRequest<BinanceAccountResponse>(
      '/fapi/v2/account',
      {},
      creds,
    );

    return {
      total_usd: parseFloat(account.totalWalletBalance),
      available_usd: parseFloat(account.availableBalance),
    };
  },

  async getCurrentPrice(symbol: string): Promise<number> {
    const url = `${BASE_URL}/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Binance ticker ${res.status}: ${body}`);
    }

    const data = (await res.json()) as BinanceTickerPrice;
    return parseFloat(data.price);
  },
};
