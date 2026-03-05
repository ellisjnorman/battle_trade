import { ATTACKS, DEFENSES } from './weapons';
import type { AttackId, DefenseId } from './weapons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SabotageType = AttackId;
export type DefenseType = DefenseId;

export interface SabotageDefinition {
  cost: number;
  duration: number | null;
}

export interface DefenseDefinition {
  cost: number;
  duration?: number;
}

export interface SabotageRecord {
  id: string;
  lobby_id: string;
  attacker_id: string;
  target_id: string;
  type: SabotageType;
  cost: number;
  status: string;
  payload: Record<string, unknown> | null;
  duration_seconds: number | null;
  fired_at: string;
  expires_at: string | null;
  sponsor_name: string | null;
}

export interface DefenseRecord {
  id: string;
  lobby_id: string;
  trader_id: string;
  type: DefenseType;
  cost: number;
  status: string;
  activated_at: string;
  expires_at: string | null;
}

export interface CreditAllocation {
  id: string;
  lobby_id: string;
  trader_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export const SABOTAGES: Record<SabotageType, SabotageDefinition> = Object.fromEntries(
  ATTACKS.map(a => [a.id, { cost: a.cost, duration: a.duration || null }])
) as Record<SabotageType, SabotageDefinition>;

export const DEFENSE_DEFS: Record<DefenseType, DefenseDefinition> = Object.fromEntries(
  DEFENSES.map(d => [d.id, { cost: d.cost, ...(d.duration ? { duration: d.duration } : {}) }])
) as Record<DefenseType, DefenseDefinition>;

export const SABOTAGE_TYPES = ATTACKS.map(a => a.id) as SabotageType[];
export const DEFENSE_TYPES = DEFENSES.map(d => d.id) as DefenseType[];

const COOLDOWN_SECONDS = 180; // 3 minutes

// ---------------------------------------------------------------------------
// Credit functions
// ---------------------------------------------------------------------------

export async function getCredits(
  trader_id: string,
  lobby_id: string,
): Promise<number> {
  const { supabase } = await import('./supabase');
  const { data } = await supabase
    .from('credit_allocations')
    .select('balance')
    .eq('trader_id', trader_id)
    .eq('lobby_id', lobby_id)
    .single();

  return data?.balance ?? 0;
}

export async function deductCredits(
  trader_id: string,
  lobby_id: string,
  amount: number,
): Promise<void> {
  const { supabase } = await import('./supabase');
  const { data } = await supabase
    .from('credit_allocations')
    .select('balance, total_spent')
    .eq('trader_id', trader_id)
    .eq('lobby_id', lobby_id)
    .single();

  if (!data) return;

  await supabase
    .from('credit_allocations')
    .update({
      balance: data.balance - amount,
      total_spent: data.total_spent + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('trader_id', trader_id)
    .eq('lobby_id', lobby_id);
}

export async function addCredits(
  trader_id: string,
  lobby_id: string,
  amount: number,
  _reason?: string,
): Promise<void> {
  const { supabase } = await import('./supabase');
  const { data } = await supabase
    .from('credit_allocations')
    .select('balance, total_earned')
    .eq('trader_id', trader_id)
    .eq('lobby_id', lobby_id)
    .single();

  if (!data) return;

  await supabase
    .from('credit_allocations')
    .update({
      balance: data.balance + amount,
      total_earned: data.total_earned + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('trader_id', trader_id)
    .eq('lobby_id', lobby_id);
}

// ---------------------------------------------------------------------------
// Cooldown check
// ---------------------------------------------------------------------------

export async function checkCooldown(
  attacker_id: string,
  lobby_id: string,
): Promise<{ onCooldown: boolean; remainingSeconds: number }> {
  const { supabase } = await import('./supabase');
  const { data } = await supabase
    .from('sabotages')
    .select('fired_at')
    .eq('attacker_id', attacker_id)
    .eq('lobby_id', lobby_id)
    .order('fired_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return { onCooldown: false, remainingSeconds: 0 };

  const elapsed = (Date.now() - new Date(data.fired_at).getTime()) / 1000;
  if (elapsed < COOLDOWN_SECONDS) {
    return {
      onCooldown: true,
      remainingSeconds: Math.ceil(COOLDOWN_SECONDS - elapsed),
    };
  }

  return { onCooldown: false, remainingSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Defense check
// ---------------------------------------------------------------------------

export async function checkDefense(
  target_id: string,
  lobby_id: string,
  _sabotage_type: SabotageType,
): Promise<{ shield: boolean; deflect: boolean; shieldId?: string; deflectId?: string }> {
  const { supabase } = await import('./supabase');
  const now = new Date().toISOString();

  // Check for active shield
  const { data: shieldData } = await supabase
    .from('defenses')
    .select('id')
    .eq('trader_id', target_id)
    .eq('lobby_id', lobby_id)
    .eq('type', 'shield')
    .eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1)
    .single();

  // Check for active deflect
  const { data: deflectData } = await supabase
    .from('defenses')
    .select('id')
    .eq('trader_id', target_id)
    .eq('lobby_id', lobby_id)
    .eq('type', 'deflect')
    .eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1)
    .single();

  return {
    shield: !!shieldData,
    deflect: !!deflectData,
    shieldId: shieldData?.id,
    deflectId: deflectData?.id,
  };
}

// ---------------------------------------------------------------------------
// Apply sabotage effect
// ---------------------------------------------------------------------------

export async function applySabotageEffect(
  sabotage: SabotageRecord,
  lobby_id: string,
): Promise<void> {
  const { supabase } = await import('./supabase');

  const traderChannel = supabase.channel(`trader-${sabotage.target_id}`);
  const lobbyChannel = supabase.channel(`lobby-${lobby_id}-sabotage`);

  switch (sabotage.type) {
    case 'lockout': {
      // Set positions_locked flag on session
      await supabase
        .from('sessions')
        .update({ positions_locked: true })
        .eq('trader_id', sabotage.target_id)
        .eq('lobby_id', lobby_id);

      // Schedule unlock
      if (sabotage.duration_seconds) {
        setTimeout(async () => {
          const { supabase: sb } = await import('./supabase');
          await sb
            .from('sessions')
            .update({ positions_locked: false })
            .eq('trader_id', sabotage.target_id)
            .eq('lobby_id', lobby_id);

          await sb
            .from('sabotages')
            .update({ status: 'expired' })
            .eq('id', sabotage.id);

          const ch = sb.channel(`trader-${sabotage.target_id}`);
          await ch.send({
            type: 'broadcast',
            event: 'sabotage',
            payload: { type: 'lockout_lifted' },
          });
        }, sabotage.duration_seconds * 1000);
      }
      break;
    }

    case 'fake_news': {
      const headline =
        (sabotage.payload?.headline as string) ??
        'BREAKING: Exchange halting all withdrawals';
      await traderChannel.send({
        type: 'broadcast',
        event: 'sabotage',
        payload: { type: 'fake_news', headline },
      });
      break;
    }

    case 'margin_squeeze': {
      // Reduce starting_balance by 10%
      const { data: session } = await supabase
        .from('sessions')
        .select('starting_balance')
        .eq('trader_id', sabotage.target_id)
        .eq('lobby_id', lobby_id)
        .single();

      if (session) {
        const newBalance = Math.round(session.starting_balance * 0.9);
        await supabase
          .from('sessions')
          .update({ starting_balance: newBalance })
          .eq('trader_id', sabotage.target_id)
          .eq('lobby_id', lobby_id);
      }
      break;
    }

    case 'expose': {
      await supabase
        .from('sessions')
        .update({ positions_public: true })
        .eq('trader_id', sabotage.target_id)
        .eq('lobby_id', lobby_id);

      if (sabotage.duration_seconds) {
        setTimeout(async () => {
          const { supabase: sb } = await import('./supabase');
          await sb
            .from('sessions')
            .update({ positions_public: false })
            .eq('trader_id', sabotage.target_id)
            .eq('lobby_id', lobby_id);

          await sb
            .from('sabotages')
            .update({ status: 'expired' })
            .eq('id', sabotage.id);
        }, sabotage.duration_seconds * 1000);
      }
      break;
    }

    case 'asset_freeze': {
      const frozen_asset =
        (sabotage.payload?.asset as string) ?? 'BTCUSDT';
      await supabase
        .from('sessions')
        .update({ frozen_asset })
        .eq('trader_id', sabotage.target_id)
        .eq('lobby_id', lobby_id);

      if (sabotage.duration_seconds) {
        setTimeout(async () => {
          const { supabase: sb } = await import('./supabase');
          await sb
            .from('sessions')
            .update({ frozen_asset: null })
            .eq('trader_id', sabotage.target_id)
            .eq('lobby_id', lobby_id);

          await sb
            .from('sabotages')
            .update({ status: 'expired' })
            .eq('id', sabotage.id);
        }, sabotage.duration_seconds * 1000);
      }
      break;
    }

    case 'glitch': {
      await traderChannel.send({
        type: 'broadcast',
        event: 'sabotage',
        payload: { type: 'glitch', duration: 10 },
      });
      break;
    }

    case 'forced_trade': {
      // Get lobby config for available symbols
      const { data: lobby } = await supabase
        .from('lobbies')
        .select('config')
        .eq('id', lobby_id)
        .single();

      const symbols: string[] =
        (lobby?.config as Record<string, unknown>)?.available_symbols as string[] ??
        ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const direction = Math.random() > 0.5 ? 'long' : 'short';

      // Get current balance
      const { data: session } = await supabase
        .from('sessions')
        .select('starting_balance')
        .eq('trader_id', sabotage.target_id)
        .eq('lobby_id', lobby_id)
        .single();

      const size = Math.round((session?.starting_balance ?? 10000) * 0.1);

      // Get current price
      const { data: priceRow } = await supabase
        .from('prices')
        .select('price')
        .eq('symbol', symbol)
        .single();

      if (!priceRow) break;

      // Get active round
      const { data: round } = await supabase
        .from('rounds')
        .select('id')
        .eq('lobby_id', lobby_id)
        .eq('status', 'active')
        .single();

      if (!round) break;

      // Open position
      await supabase.from('positions').insert({
        trader_id: sabotage.target_id,
        round_id: round.id,
        symbol,
        direction,
        size,
        leverage: 1,
        entry_price: priceRow.price,
        opened_at: new Date().toISOString(),
      });

      await traderChannel.send({
        type: 'broadcast',
        event: 'sabotage',
        payload: {
          type: 'forced_trade',
          symbol,
          direction,
          size,
          entry_price: priceRow.price,
        },
      });
      break;
    }
  }

  // Broadcast to lobby feed
  await lobbyChannel.send({
    type: 'broadcast',
    event: 'sabotage',
    payload: {
      type: 'sabotage_launched',
      attacker_id: sabotage.attacker_id,
      target_id: sabotage.target_id,
      sabotage_type: sabotage.type,
      cost: sabotage.cost,
      sponsor_name: sabotage.sponsor_name,
    },
  });
}
