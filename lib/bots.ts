/**
 * NPC Bot Trading Engine
 *
 * Gives bot traders realistic trading behavior during practice lobbies.
 * Each bot has a personality (aggressive, conservative, momentum, contrarian)
 * that determines position sizing, direction bias, and sabotage usage.
 */

import { getServerSupabase } from './supabase-server';
import { PaperOnlyExecutor } from './trade-executor';
import { calcUnrealizedPnl } from './pnl';
import { ATTACKS } from './weapons';
import type { Position } from '@/types';

// ---------------------------------------------------------------------------
// Bot personality types
// ---------------------------------------------------------------------------

type Personality = 'aggressive' | 'conservative' | 'momentum' | 'contrarian' | 'scalper';

interface BotConfig {
  personality: Personality;
  tradeChance: number;      // 0-1 probability of trading per tick
  closeChance: number;      // 0-1 probability of closing a winning position
  sabotageChance: number;   // 0-1 probability of using sabotage per tick
  longBias: number;         // 0-1 bias toward long (0.5 = neutral)
  leveragePrefs: number[];  // preferred leverage tiers
  sizeRange: [number, number]; // [min, max] position size in USD
}

const PERSONALITIES: Record<Personality, BotConfig> = {
  aggressive: {
    personality: 'aggressive',
    tradeChance: 0.35,
    closeChance: 0.15,
    sabotageChance: 0.12,
    longBias: 0.6,
    leveragePrefs: [10, 20],
    sizeRange: [1500, 4000],
  },
  conservative: {
    personality: 'conservative',
    tradeChance: 0.15,
    closeChance: 0.25,
    sabotageChance: 0.05,
    longBias: 0.55,
    leveragePrefs: [5, 10],
    sizeRange: [500, 2000],
  },
  momentum: {
    personality: 'momentum',
    tradeChance: 0.25,
    closeChance: 0.2,
    sabotageChance: 0.08,
    longBias: 0.5, // adjusts based on price trend
    leveragePrefs: [10, 20],
    sizeRange: [1000, 3000],
  },
  contrarian: {
    personality: 'contrarian',
    tradeChance: 0.2,
    closeChance: 0.3,
    sabotageChance: 0.1,
    longBias: 0.4, // slightly short-biased
    leveragePrefs: [5, 10],
    sizeRange: [800, 2500],
  },
  scalper: {
    personality: 'scalper',
    tradeChance: 0.4,
    closeChance: 0.35,
    sabotageChance: 0.06,
    longBias: 0.5,
    leveragePrefs: [5, 10],
    sizeRange: [300, 1500],
  },
};

const PERSONALITY_LIST: Personality[] = Object.keys(PERSONALITIES) as Personality[];

// Assign personality deterministically by bot name hash
function getPersonality(botName: string): BotConfig {
  let hash = 0;
  for (let i = 0; i < botName.length; i++) {
    hash = ((hash << 5) - hash + botName.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PERSONALITY_LIST.length;
  return PERSONALITIES[PERSONALITY_LIST[idx]];
}

// ---------------------------------------------------------------------------
// Core bot tick — called periodically during active rounds
// ---------------------------------------------------------------------------

const executor = new PaperOnlyExecutor();

export async function tickBots(lobbyId: string, roundId: string): Promise<void> {
  const sb = getServerSupabase();

  // Get all alive bot traders (profile_id IS NULL = NPC)
  const { data: bots } = await sb
    .from('traders')
    .select('id, name, is_eliminated')
    .eq('lobby_id', lobbyId)
    .is('profile_id', null)
    .eq('is_eliminated', false);

  if (!bots || bots.length === 0) return;

  // Get current prices and available symbols
  const { data: prices } = await sb.from('prices').select('symbol, price');
  if (!prices || prices.length === 0) return;

  const priceMap: Record<string, number> = {};
  for (const p of prices) priceMap[p.symbol] = p.price;

  // Get lobby config for available symbols
  const { data: lobby } = await sb
    .from('lobbies')
    .select('config')
    .eq('id', lobbyId)
    .single();

  const config = lobby?.config as Record<string, unknown> | null;
  const availableSymbols = (config?.available_symbols as string[]) ?? Object.keys(priceMap);
  const leverageTiers = (config?.leverage_tiers as number[]) ?? [5, 10, 20];

  // Filter to symbols that have prices
  const tradableSymbols = availableSymbols.filter(s => priceMap[s] != null);
  if (tradableSymbols.length === 0) return;

  // Process each bot concurrently
  await Promise.all(bots.map(bot => tickSingleBot(
    bot.id, bot.name, lobbyId, roundId,
    tradableSymbols, priceMap, leverageTiers,
  )));
}

async function tickSingleBot(
  traderId: string,
  traderName: string,
  lobbyId: string,
  roundId: string,
  symbols: string[],
  priceMap: Record<string, number>,
  leverageTiers: number[],
): Promise<void> {
  const sb = getServerSupabase();
  const botConfig = getPersonality(traderName);

  // Get bot's current open positions
  const { data: openPositions } = await sb
    .from('positions')
    .select('id, trader_id, round_id, symbol, direction, size, leverage, entry_price, exit_price, realized_pnl, opened_at, closed_at, order_type, limit_price, stop_price, trail_pct, trail_peak, status')
    .eq('trader_id', traderId)
    .eq('round_id', roundId)
    .eq('status', 'open')
    .is('closed_at', null);

  const positions = (openPositions ?? []) as Position[];

  // --- Close positions if profitable enough ---
  for (const pos of positions) {
    const currentPrice = priceMap[pos.symbol];
    if (!currentPrice) continue;

    const pnl = calcUnrealizedPnl(pos, currentPrice);
    const returnPct = (pnl / pos.size) * 100;

    // Close if: profitable and random chance, or loss exceeds -8%
    const shouldClose = (returnPct > 2 && Math.random() < botConfig.closeChance)
      || returnPct < -8;

    if (shouldClose) {
      await executor.closePosition({
        position_id: pos.id,
        exit_price: currentPrice,
        lobby_id: lobbyId,
      });
    }
  }

  // Recount after potential closes
  const openCount = positions.length;

  // --- Open new position ---
  if (openCount < 3 && Math.random() < botConfig.tradeChance) {
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const price = priceMap[symbol];
    if (price) {
      const direction: 'long' | 'short' = Math.random() < botConfig.longBias ? 'long' : 'short';
      const [minSize, maxSize] = botConfig.sizeRange;
      const size = Math.round(minSize + Math.random() * (maxSize - minSize));
      const lev = botConfig.leveragePrefs.filter(l => leverageTiers.includes(l));
      const leverage = lev.length > 0
        ? lev[Math.floor(Math.random() * lev.length)]
        : leverageTiers[0] ?? 5;

      await executor.execute({
        lobby_id: lobbyId,
        trader_id: traderId,
        round_id: roundId,
        asset: symbol,
        direction,
        size_usd: size,
        entry_price: price,
        leverage,
        order_type: 'market',
      }).catch(() => {/* best effort */});
    }
  }

  // --- Sabotage usage ---
  if (Math.random() < botConfig.sabotageChance) {
    await botUseSabotage(traderId, lobbyId).catch(() => {/* best effort */});
  }
}

// ---------------------------------------------------------------------------
// Bot sabotage — pick cheapest available attack on random target
// ---------------------------------------------------------------------------

async function botUseSabotage(traderId: string, lobbyId: string): Promise<void> {
  const sb = getServerSupabase();

  // Get bot's credit balance
  const { data: alloc } = await sb
    .from('credit_allocations')
    .select('balance')
    .eq('trader_id', traderId)
    .eq('lobby_id', lobbyId)
    .single();

  const balance = alloc?.balance ?? 0;
  if (balance < 50) return;

  // Pick an affordable attack (prefer cheap ones)
  const affordable = ATTACKS.filter(a => a.cost <= balance);
  if (affordable.length === 0) return;

  const sorted = [...affordable].sort((a, b) => a.cost - b.cost);
  const attack = sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];

  // Pick random alive target (not self)
  const { data: targets } = await sb
    .from('traders')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('is_eliminated', false)
    .neq('id', traderId)
    .limit(10);

  if (!targets || targets.length === 0) return;
  const target = targets[Math.floor(Math.random() * targets.length)];

  // Deduct credits and apply effect directly (skip HTTP overhead)
  const { deductCredits, applySabotageEffect } = await import('./sabotage');
  const deducted = await deductCredits(traderId, lobbyId, attack.cost);
  if (!deducted) return;

  const expiresAt = attack.duration
    ? new Date(Date.now() + attack.duration * 1000).toISOString()
    : null;

  // Record in DB
  const { data: record } = await sb
    .from('sabotages')
    .insert({
      lobby_id: lobbyId,
      attacker_id: traderId,
      target_id: target.id,
      type: attack.id,
      cost: attack.cost,
      status: 'active',
      payload: null,
      duration_seconds: attack.duration,
      fired_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  // Apply the effect
  await applySabotageEffect({
    id: record?.id ?? '',
    lobby_id: lobbyId,
    attacker_id: traderId,
    target_id: target.id,
    type: attack.id as import('./weapons').AttackId,
    cost: attack.cost,
    status: 'active',
    payload: null,
    duration_seconds: attack.duration,
    fired_at: new Date().toISOString(),
    expires_at: expiresAt,
    sponsor_name: null,
  }, lobbyId);
}
