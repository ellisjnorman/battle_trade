import type { Position } from '@/types';
import { HyperliquidClient } from './hyperliquid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradeParams {
  lobby_id: string;
  trader_id: string;
  round_id: string;
  asset: string;
  direction: 'long' | 'short';
  size_usd: number;
  entry_price: number;
  leverage: number;
  is_forced?: boolean;
  order_type?: 'market' | 'limit' | 'stop_limit' | 'trailing_stop';
  limit_price?: number;
  stop_price?: number;
  trail_pct?: number;
}

export interface TradeResult {
  success: boolean;
  position_id: string;
  external_tx_id?: string;
  error?: string;
}

export interface CloseParams {
  position_id: string;
  exit_price: number;
  lobby_id: string;
}

export interface TradeExecutor {
  execute(params: TradeParams): Promise<TradeResult>;
  closePosition(params: CloseParams): Promise<TradeResult>;
}

export interface SponsorApiConfig {
  base_url: string;
  api_key: string;
  testnet: boolean;
}

// ---------------------------------------------------------------------------
// PaperOnlyExecutor
// ---------------------------------------------------------------------------

export class PaperOnlyExecutor implements TradeExecutor {
  async execute(params: TradeParams): Promise<TradeResult> {
    const { supabase } = await import('./supabase');

    // Check sabotage: blackout
    if (!params.is_forced) {
      let session: { positions_locked?: boolean; frozen_asset?: string | null } | null = null;
      const { data: s1, error: s1Err } = await supabase
        .from('sessions')
        .select('positions_locked, frozen_asset')
        .eq('trader_id', params.trader_id)
        .eq('lobby_id', params.lobby_id)
        .single();

      if (!s1Err) {
        session = s1;
      } else {
        // Fallback: schema cache may not have these columns — skip sabotage checks
        const { data: s2 } = await supabase
          .from('sessions')
          .select('id')
          .eq('trader_id', params.trader_id)
          .eq('lobby_id', params.lobby_id)
          .single();
        session = s2 ? { positions_locked: false, frozen_asset: null } : null;
      }

      if (session?.positions_locked) {
        return { success: false, position_id: '', error: 'LOCKED_OUT' };
      }

      // Check sabotage: trading halt — block trading the halted asset
      if (session?.frozen_asset && params.asset === session.frozen_asset) {
        return { success: false, position_id: '', error: 'ASSET_FROZEN' };
      }
    }

    // Check position count < 3
    const { count } = await supabase
      .from('positions')
      .select('id', { count: 'exact', head: true })
      .eq('trader_id', params.trader_id)
      .eq('round_id', params.round_id)
      .is('closed_at', null);

    if ((count ?? 0) >= 3) {
      return { success: false, position_id: '', error: 'MAX_POSITIONS_REACHED' };
    }

    const ot = params.order_type ?? 'market';
    const isPending = ot !== 'market';

    // Insert position — progressive fallback for schema cache issues
    const fullRow: Record<string, unknown> = {
      trader_id: params.trader_id,
      round_id: params.round_id,
      symbol: params.asset,
      direction: params.direction,
      size: params.size_usd,
      leverage: params.leverage,
      entry_price: isPending ? 0 : params.entry_price,
      opened_at: isPending ? null : new Date().toISOString(),
      order_type: ot,
      limit_price: params.limit_price ?? null,
      stop_price: params.stop_price ?? null,
      trail_pct: params.trail_pct ?? null,
      trail_peak: ot === 'trailing_stop' ? params.entry_price : null,
      status: isPending ? 'pending' : 'open',
    };

    // Tier 0: full row, Tier 1: without order_type columns (migration 005)
    const tiers = [
      fullRow,
      (() => {
        const { order_type: _a, limit_price: _b, stop_price: _c, trail_pct: _d, trail_peak: _e, status: _f, ...r } = fullRow;
        return r;
      })(),
    ];

    for (const row of tiers) {
      const { data: position, error } = await supabase
        .from('positions')
        .insert(row)
        .select('id')
        .single();

      if (!error && position) {
        return { success: true, position_id: position.id };
      }
      console.error('Position insert error:', error?.message, 'keys:', Object.keys(row));
    }

    return { success: false, position_id: '', error: 'Insert failed after all attempts' };
  }

  async closePosition(params: CloseParams): Promise<TradeResult> {
    const { supabase } = await import('./supabase');
    const { calcUnrealizedPnl } = await import('./pnl');

    const { data: position, error: fetchError } = await supabase
      .from('positions')
      .select('*')
      .eq('id', params.position_id)
      .is('closed_at', null)
      .single();

    if (fetchError || !position) {
      return { success: false, position_id: params.position_id, error: 'Position not found' };
    }

    const pos = position as Position;
    const realizedPnl = calcUnrealizedPnl(pos, params.exit_price);

    const { error: updateError } = await supabase
      .from('positions')
      .update({
        exit_price: params.exit_price,
        realized_pnl: realizedPnl,
        closed_at: new Date().toISOString(),
      })
      .eq('id', params.position_id);

    if (updateError) {
      return { success: false, position_id: params.position_id, error: updateError.message };
    }

    return { success: true, position_id: params.position_id };
  }
}

// ---------------------------------------------------------------------------
// PaperPlusOnchainExecutor
// ---------------------------------------------------------------------------

export class PaperPlusOnchainExecutor implements TradeExecutor {
  private paper = new PaperOnlyExecutor();
  private sponsorApi: SponsorApiConfig;

  constructor(sponsorApi: SponsorApiConfig) {
    this.sponsorApi = sponsorApi;
  }

  async execute(params: TradeParams): Promise<TradeResult> {
    const paperResult = await this.paper.execute(params);
    if (!paperResult.success) return paperResult;

    // Attempt external API call — fail silently
    try {
      const res = await fetch(`${this.sponsorApi.base_url}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.sponsorApi.api_key}`,
        },
        body: JSON.stringify({
          asset: params.asset,
          direction: params.direction,
          size: params.size_usd,
          testnet: this.sponsorApi.testnet,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return { ...paperResult, external_tx_id: data.tx_id };
      }
    } catch {
      // External failure is non-blocking
    }

    return paperResult;
  }

  async closePosition(params: CloseParams): Promise<TradeResult> {
    const paperResult = await this.paper.closePosition(params);
    if (!paperResult.success) return paperResult;

    // Attempt external close — fail silently
    try {
      await fetch(`${this.sponsorApi.base_url}/orders/${params.position_id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.sponsorApi.api_key}`,
        },
        body: JSON.stringify({
          exit_price: params.exit_price,
          testnet: this.sponsorApi.testnet,
        }),
      });
    } catch {
      // External failure is non-blocking
    }

    return paperResult;
  }
}

// ---------------------------------------------------------------------------
// LiveExecutor
// ---------------------------------------------------------------------------
// Falls back to paper trading when no DEX API is configured.
// Wire LIVE_DEX_API_URL + LIVE_DEX_API_KEY env vars to enable real execution.

export class LiveExecutor implements TradeExecutor {
  private paper = new PaperOnlyExecutor();

  async execute(params: TradeParams): Promise<TradeResult> {
    const dexUrl = process.env.LIVE_DEX_API_URL;
    const dexKey = process.env.LIVE_DEX_API_KEY;

    // Always record in paper DB
    const paperResult = await this.paper.execute(params);
    if (!paperResult.success) return paperResult;

    // If DEX is configured, submit real order
    if (dexUrl && dexKey) {
      try {
        const res = await fetch(`${dexUrl}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dexKey}` },
          body: JSON.stringify({
            asset: params.asset,
            direction: params.direction,
            size_usd: params.size_usd,
            leverage: params.leverage,
            order_type: params.order_type ?? 'market',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return { ...paperResult, external_tx_id: data.tx_id ?? data.order_id };
        }
      } catch {
        // DEX failure is non-blocking — paper position is already recorded
      }
    }

    return paperResult;
  }

  async closePosition(params: CloseParams): Promise<TradeResult> {
    const paperResult = await this.paper.closePosition(params);
    if (!paperResult.success) return paperResult;

    const dexUrl = process.env.LIVE_DEX_API_URL;
    const dexKey = process.env.LIVE_DEX_API_KEY;

    if (dexUrl && dexKey) {
      try {
        await fetch(`${dexUrl}/orders/${params.position_id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dexKey}` },
          body: JSON.stringify({ exit_price: params.exit_price }),
        });
      } catch {
        // Non-blocking
      }
    }

    return paperResult;
  }
}

// ---------------------------------------------------------------------------
// HyperliquidExecutor
// ---------------------------------------------------------------------------
// Mirrors paper positions to Hyperliquid perps via the agent wallet pattern.
// Paper position is always recorded first. Hyperliquid order is best-effort.

export class HyperliquidExecutor implements TradeExecutor {
  private paper = new PaperOnlyExecutor();
  private client: HyperliquidClient | null = null;

  constructor() {
    const key = process.env.HYPERLIQUID_PRIVATE_KEY;
    const testnet = process.env.HYPERLIQUID_TESTNET === 'true';
    if (key) {
      this.client = new HyperliquidClient(key, testnet);
    } else {
      console.warn(
        '[hyperliquid] HYPERLIQUID_PRIVATE_KEY not set — running in paper-only fallback'
      );
    }
  }

  async execute(params: TradeParams): Promise<TradeResult> {
    // Always record paper position first
    const paperResult = await this.paper.execute(params);
    if (!paperResult.success) return paperResult;

    // Mirror to Hyperliquid if client is available
    if (this.client) {
      try {
        // Convert symbol: "BTCUSDT" -> "BTC", "ETHUSDT" -> "ETH"
        const coin = params.asset.replace(/USDT$/, '');

        // Convert USD size to asset size: size_usd / entry_price
        const sz = params.size_usd / params.entry_price;

        // Apply slippage for market orders (0.5%)
        const slippage = params.direction === 'long' ? 1.005 : 0.995;
        const limitPx = params.entry_price * slippage;

        const result = await this.client.placeOrder({
          coin,
          isBuy: params.direction === 'long',
          sz,
          limitPx,
          leverage: params.leverage,
          orderType: params.order_type === 'limit' ? 'limit' : 'market',
        });

        // Extract order ID from response
        const status = result.response?.data?.statuses?.[0];
        const oid =
          status?.resting?.oid ?? status?.filled?.oid;

        return {
          ...paperResult,
          external_tx_id: oid?.toString() ?? 'hl-submitted',
        };
      } catch (err) {
        console.error(
          '[hyperliquid] Order failed (paper position preserved):',
          err
        );
      }
    }

    return paperResult;
  }

  async closePosition(params: CloseParams): Promise<TradeResult> {
    const paperResult = await this.paper.closePosition(params);
    if (!paperResult.success) return paperResult;

    // Close the matching position on Hyperliquid
    if (this.client) {
      try {
        const { supabase } = await import('./supabase');
        const { data: pos } = await supabase
          .from('positions')
          .select('symbol')
          .eq('id', params.position_id)
          .single();

        if (pos) {
          const coin = pos.symbol.replace(/USDT$/, '');
          await this.client.closePosition(coin);
        }
      } catch (err) {
        console.error(
          '[hyperliquid] Close failed (paper position closed):',
          err
        );
      }
    }

    return paperResult;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type TradeExecutionMode = 'paper_only' | 'paper_plus_onchain' | 'live' | 'hyperliquid';

export function getExecutor(config: {
  trade_execution_mode?: TradeExecutionMode;
  sponsor_api?: SponsorApiConfig;
}): TradeExecutor {
  switch (config.trade_execution_mode) {
    case 'paper_plus_onchain':
      if (!config.sponsor_api) {
        return new PaperOnlyExecutor();
      }
      return new PaperPlusOnchainExecutor(config.sponsor_api);
    case 'live':
      return new LiveExecutor();
    case 'hyperliquid':
      return new HyperliquidExecutor();
    default:
      return new PaperOnlyExecutor();
  }
}
