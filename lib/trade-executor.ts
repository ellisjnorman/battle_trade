import type { Position } from '@/types';

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

    // Check sabotage: lockout
    if (!params.is_forced) {
      const { data: session } = await supabase
        .from('sessions')
        .select('positions_locked, frozen_asset')
        .eq('trader_id', params.trader_id)
        .eq('lobby_id', params.lobby_id)
        .single();

      if (session?.positions_locked) {
        return { success: false, position_id: '', error: 'LOCKED_OUT' };
      }

      // Check sabotage: asset freeze
      if (session?.frozen_asset && params.asset !== session.frozen_asset) {
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

    // Insert position
    const { data: position, error } = await supabase
      .from('positions')
      .insert({
        trader_id: params.trader_id,
        round_id: params.round_id,
        symbol: params.asset,
        direction: params.direction,
        size: params.size_usd,
        leverage: params.leverage,
        entry_price: params.entry_price,
        opened_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !position) {
      return { success: false, position_id: '', error: error?.message ?? 'Insert failed' };
    }

    return { success: true, position_id: position.id };
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
// LiveExecutor (stub)
// ---------------------------------------------------------------------------

export class LiveExecutor implements TradeExecutor {
  async execute(_params: TradeParams): Promise<TradeResult> {
    throw new Error('Live trading not implemented. Wire to DEX API when approved.');
  }

  async closePosition(_params: CloseParams): Promise<TradeResult> {
    throw new Error('Live trading not implemented.');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type TradeExecutionMode = 'paper_only' | 'paper_plus_onchain' | 'live';

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
    default:
      return new PaperOnlyExecutor();
  }
}
