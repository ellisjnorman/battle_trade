import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Hyperliquid API Client
// ---------------------------------------------------------------------------
// Talks to Hyperliquid's REST API for perps trading.
// Uses an agent wallet (single private key) to sign all orders on behalf of
// the platform. Paper positions are always recorded separately in Supabase —
// the Hyperliquid order mirrors the paper position as a real on-chain trade.
// ---------------------------------------------------------------------------

const MAINNET_URL = 'https://api.hyperliquid.xyz';
const TESTNET_URL = 'https://api.hyperliquid-testnet.xyz';

// EIP-712 domain used by Hyperliquid for signing exchange actions
const HL_DOMAIN_MAINNET = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
};

const HL_DOMAIN_TESTNET = {
  name: 'Exchange',
  version: '1',
  chainId: 421614,
  verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
};

// Hyperliquid exchange action EIP-712 types
const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HyperliquidMeta {
  universe: Array<{
    name: string;
    szDecimals: number;
    maxLeverage: number;
    onlyIsolated?: boolean;
  }>;
}

export interface HyperliquidPosition {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
}

export interface HyperliquidAccountState {
  assetPositions: Array<{ position: HyperliquidPosition }>;
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
  };
}

export interface OrderResult {
  status: string;
  response?: {
    type: string;
    data?: {
      statuses: Array<{
        resting?: { oid: number };
        filled?: { totalSz: string; avgPx: string; oid: number };
        error?: string;
      }>;
    };
  };
}

export interface PlaceOrderParams {
  coin: string;       // e.g. "BTC", "ETH", "SOL"
  isBuy: boolean;
  sz: number;         // size in asset units
  limitPx: number;    // for market orders, use a slippage price
  leverage: number;
  orderType: 'market' | 'limit';
  reduceOnly?: boolean;
  cloid?: string;     // optional client order ID
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class HyperliquidClient {
  private wallet: ethers.Wallet;
  private baseUrl: string;
  private domain: typeof HL_DOMAIN_MAINNET;
  private testnet: boolean;
  // Cache: coin name -> asset index (from meta)
  private assetIndexCache: Map<string, number> = new Map();
  private szDecimalsCache: Map<string, number> = new Map();

  constructor(privateKey: string, testnet = false) {
    this.wallet = new ethers.Wallet(privateKey);
    this.testnet = testnet;
    this.baseUrl = testnet ? TESTNET_URL : MAINNET_URL;
    this.domain = testnet ? HL_DOMAIN_TESTNET : HL_DOMAIN_MAINNET;
  }

  // -------------------------------------------------------------------------
  // Info endpoints (no signing required)
  // -------------------------------------------------------------------------

  /** Get available markets and asset metadata */
  async getMeta(): Promise<HyperliquidMeta> {
    const res = await this.postInfo({ type: 'meta' });
    return res as HyperliquidMeta;
  }

  /** Get account clearing house state (positions + balances) */
  async getAccountState(user?: string): Promise<HyperliquidAccountState> {
    const address = user ?? this.wallet.address;
    const res = await this.postInfo({
      type: 'clearinghouseState',
      user: address,
    });
    return res as HyperliquidAccountState;
  }

  /** Get all positions for the agent wallet */
  async getPositions(user?: string): Promise<HyperliquidPosition[]> {
    const state = await this.getAccountState(user);
    return state.assetPositions.map((ap) => ap.position);
  }

  /** Get open orders for the agent wallet */
  async getOpenOrders(user?: string): Promise<
    Array<{
      coin: string;
      oid: number;
      side: string;
      limitPx: string;
      sz: string;
      timestamp: number;
    }>
  > {
    const address = user ?? this.wallet.address;
    const res = await this.postInfo({ type: 'openOrders', user: address });
    return res as Array<{
      coin: string;
      oid: number;
      side: string;
      limitPx: string;
      sz: string;
      timestamp: number;
    }>;
  }

  // -------------------------------------------------------------------------
  // Exchange endpoints (require signing)
  // -------------------------------------------------------------------------

  /** Place an order on Hyperliquid perps */
  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    await this.ensureMetaCached();

    const assetIndex = this.assetIndexCache.get(params.coin);
    if (assetIndex === undefined) {
      throw new Error(`Unknown asset: ${params.coin}. Not found in Hyperliquid meta.`);
    }

    const szDecimals = this.szDecimalsCache.get(params.coin) ?? 3;

    // Round size to the asset's size decimals
    const sz = roundToDecimals(params.sz, szDecimals);
    // Round price to reasonable precision (Hyperliquid uses string prices with 5 significant figures)
    const limitPx = formatPrice(params.limitPx);

    // Build the order wire format
    const orderWire = {
      a: assetIndex,
      b: params.isBuy,
      p: limitPx,
      s: sz,
      r: params.reduceOnly ?? false,
      t: params.orderType === 'market'
        ? { limit: { tif: 'Ioc' as const } }   // market = IOC
        : { limit: { tif: 'Gtc' as const } },   // limit = GTC
      c: params.cloid ?? undefined,
    };

    const action = {
      type: 'order' as const,
      orders: [orderWire],
      grouping: 'na' as const,
    };

    // Set leverage before placing the order
    await this.setLeverage(assetIndex, params.leverage);

    return this.sendExchangeAction(action);
  }

  /** Cancel an order */
  async cancelOrder(coin: string, oid: number): Promise<OrderResult> {
    await this.ensureMetaCached();

    const assetIndex = this.assetIndexCache.get(coin);
    if (assetIndex === undefined) {
      throw new Error(`Unknown asset: ${coin}`);
    }

    const action = {
      type: 'cancel' as const,
      cancels: [{ a: assetIndex, o: oid }],
    };

    return this.sendExchangeAction(action);
  }

  /** Close an entire position for a given coin by placing an opposing market order */
  async closePosition(coin: string): Promise<void> {
    const positions = await this.getPositions();
    const pos = positions.find((p) => p.coin === coin);
    if (!pos) {
      console.warn(`[hyperliquid] No open position for ${coin} to close`);
      return;
    }

    const szi = parseFloat(pos.szi);
    if (szi === 0) return;

    // If szi > 0, we're long and need to sell. If szi < 0, we're short and need to buy.
    const isBuy = szi < 0;
    const sz = Math.abs(szi);

    // Use a wide slippage price for market close
    const entryPx = parseFloat(pos.entryPx);
    const slippagePx = isBuy ? entryPx * 1.05 : entryPx * 0.95;

    await this.placeOrder({
      coin,
      isBuy,
      sz,
      limitPx: slippagePx,
      leverage: pos.leverage.value,
      orderType: 'market',
      reduceOnly: true,
    });
  }

  /** Set leverage for an asset */
  private async setLeverage(assetIndex: number, leverage: number): Promise<void> {
    const action = {
      type: 'updateLeverage' as const,
      asset: assetIndex,
      isCross: true,
      leverage,
    };

    try {
      await this.sendExchangeAction(action);
    } catch (err) {
      // Leverage update can fail if already set — non-blocking
      console.warn('[hyperliquid] Leverage update:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async postInfo(body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Hyperliquid info request failed (${res.status}): ${text}`);
    }

    return res.json();
  }

  /**
   * Send a signed action to the /exchange endpoint.
   *
   * Hyperliquid signing flow:
   * 1. JSON-stringify the action
   * 2. Create a nonce (current timestamp ms)
   * 3. Build EIP-712 typed data with the action hash and nonce
   * 4. Sign and send
   */
  private async sendExchangeAction(action: Record<string, unknown>): Promise<OrderResult> {
    const nonce = Date.now();

    // Hyperliquid uses a phantom agent approach for signing:
    // The action is hashed, then an "agent" message is signed with EIP-712.
    const actionHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(action))
    );

    // Create the connection ID (action hash as bytes32)
    const connectionId = actionHash as `0x${string}`;

    // Sign using agent types (this is Hyperliquid's signing pattern)
    const signature = await this.wallet.signTypedData(
      this.domain,
      AGENT_TYPES,
      {
        source: this.testnet ? 'b' : 'a',
        connectionId,
      }
    );

    // Parse signature into r, s, v
    const sig = ethers.Signature.from(signature);

    const payload = {
      action,
      nonce,
      signature: {
        r: sig.r,
        s: sig.s,
        v: sig.v,
      },
      vaultAddress: null,
    };

    const res = await fetch(`${this.baseUrl}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Hyperliquid exchange request failed (${res.status}): ${text}`);
    }

    const result = await res.json();
    return result as OrderResult;
  }

  /** Load and cache meta (asset indices + size decimals) */
  private async ensureMetaCached(): Promise<void> {
    if (this.assetIndexCache.size > 0) return;

    const meta = await this.getMeta();
    meta.universe.forEach((asset, index) => {
      this.assetIndexCache.set(asset.name, index);
      this.szDecimalsCache.set(asset.name, asset.szDecimals);
    });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function roundToDecimals(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  return (Math.round(value * factor) / factor).toString();
}

function formatPrice(price: number): string {
  // Hyperliquid accepts prices as strings with up to 5 significant figures
  // Use toPrecision for large prices, toFixed for small
  if (price >= 1) {
    // For prices >= 1, use up to 6 significant figures
    return parseFloat(price.toPrecision(6)).toString();
  }
  // For small prices, use up to 8 decimal places
  return parseFloat(price.toFixed(8)).toString();
}
