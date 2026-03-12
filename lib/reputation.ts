// ---------------------------------------------------------------------------
// Reputation Scoring Engine
// ---------------------------------------------------------------------------
// Calculates the Trader Reputation (TR) score — a composite 0-100 rating
// built from five pillars: performance, combat, strategy, community, streak.
// ---------------------------------------------------------------------------

import type { RankTier, TRScore } from '@/types';

// ---------------------------------------------------------------------------
// Rank tiers
// ---------------------------------------------------------------------------

export interface RankTierDef {
  id: RankTier;
  name: string;
  minScore: number;
  maxScore: number;
  color: string;
  borderColor: string;
}

export const RANK_TIERS: RankTierDef[] = [
  { id: 'paper_hands',   name: 'Paper Hands',   minScore: 0,   maxScore: 19,  color: '#8B8B8B', borderColor: '#6B6B6B' },
  { id: 'retail',        name: 'Retail',         minScore: 20,  maxScore: 39,  color: '#4FC3F7', borderColor: '#0288D1' },
  { id: 'swing_trader',  name: 'Swing Trader',   minScore: 40,  maxScore: 59,  color: '#81C784', borderColor: '#388E3C' },
  { id: 'market_maker',  name: 'Market Maker',   minScore: 60,  maxScore: 79,  color: '#CE93D8', borderColor: '#8E24AA' },
  { id: 'whale',         name: 'Whale',          minScore: 80,  maxScore: 89,  color: '#FFD54F', borderColor: '#F9A825' },
  { id: 'degen_king',    name: 'Degen King',     minScore: 90,  maxScore: 99,  color: '#FF8A65', borderColor: '#E64A19' },
  { id: 'legendary',     name: 'Legendary',      minScore: 100, maxScore: 100, color: '#F5A0D0', borderColor: '#FF4081' },
];

// ---------------------------------------------------------------------------
// Badge definitions
// ---------------------------------------------------------------------------

export type BadgeCategory = 'performance' | 'combat' | 'trading' | 'community' | 'special';
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
}

export const BADGE_DEFINITIONS: BadgeDef[] = [
  // Performance
  { id: 'first_blood',    name: 'First Blood',    icon: 'drop',        description: 'Win your first round',                     category: 'performance', rarity: 'common' },
  { id: 'streak_3',       name: 'Hat Trick',       icon: 'fire',        description: 'Win 3 rounds in a row',                    category: 'performance', rarity: 'rare' },
  { id: 'streak_5',       name: 'On Fire',         icon: 'flame',       description: 'Win 5 rounds in a row',                    category: 'performance', rarity: 'epic' },
  { id: 'comeback_king',  name: 'Comeback King',   icon: 'crown',       description: 'Win a round after finishing last place',    category: 'performance', rarity: 'epic' },
  { id: 'perfect_round',  name: 'Perfect Round',   icon: 'star',        description: 'Achieve 100%+ return in a single round',   category: 'performance', rarity: 'legendary' },

  // Combat
  { id: 'saboteur',       name: 'Saboteur',        icon: 'bomb',        description: 'Land 50 sabotage attacks',                 category: 'combat', rarity: 'rare' },
  { id: 'iron_wall',      name: 'Iron Wall',       icon: 'shield',      description: 'Block 10 incoming attacks',                category: 'combat', rarity: 'rare' },
  { id: 'deflector',      name: 'Deflector',       icon: 'mirror',      description: 'Deflect 5 attacks back at opponents',      category: 'combat', rarity: 'epic' },
  { id: 'assassin',       name: 'Assassin',        icon: 'skull',       description: 'Eliminate an opponent via sabotage',        category: 'combat', rarity: 'epic' },
  { id: 'pacifist',       name: 'Pacifist',        icon: 'dove',        description: 'Win a lobby without using any attacks',     category: 'combat', rarity: 'legendary' },

  // Trading
  { id: 'whale_trade',    name: 'Whale Trade',     icon: 'whale',       description: 'Open a single position worth $5K+',        category: 'trading', rarity: 'rare' },
  { id: 'diamond_hands',  name: 'Diamond Hands',   icon: 'diamond',     description: 'Hold through -20% drawdown and profit',    category: 'trading', rarity: 'epic' },
  { id: 'scalper_king',   name: 'Scalper King',    icon: 'bolt',        description: 'Execute 10+ trades in a single round',     category: 'trading', rarity: 'rare' },
  { id: 'diversifier',    name: 'Diversifier',     icon: 'pie',         description: 'Trade 5+ different assets in one round',   category: 'trading', rarity: 'common' },

  // Community
  { id: 'mentor',         name: 'Mentor',          icon: 'book',        description: 'Complete 5 mentor sessions',               category: 'community', rarity: 'rare' },
  { id: 'strategist',     name: 'Strategist',      icon: 'scroll',      description: 'Publish a strategy with 20+ upvotes',      category: 'community', rarity: 'epic' },
  { id: 'veteran',        name: 'Veteran',         icon: 'medal',       description: 'Play in 100 lobbies',                      category: 'community', rarity: 'epic' },
  { id: 'og',             name: 'OG',              icon: 'badge',       description: 'Among the first 1,000 registered users',   category: 'community', rarity: 'legendary' },

  // Special
  { id: 'tournament_winner', name: 'Tournament Winner', icon: 'trophy',  description: 'Win an official tournament',              category: 'special', rarity: 'legendary' },
  { id: 'event_champion',   name: 'Event Champion',    icon: 'flag',    description: 'Win a live event championship',            category: 'special', rarity: 'legendary' },
  { id: 'undefeated',       name: 'Undefeated',        icon: 'infinity', description: 'Win an entire game without being eliminated', category: 'special', rarity: 'legendary' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch all trader IDs for a given profile */
async function getTraderIdsForProfile(profileId: string): Promise<string[]> {
  const { supabase } = await import('./supabase');
  const { data } = await supabase
    .from('traders')
    .select('id')
    .eq('profile_id', profileId);
  return (data ?? []).map(t => t.id);
}

/** Clamp a value to 0-100 */
function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Smooth scoring curve:  maps a raw ratio (0-1) into a score (0-100)
 * using a tunable midpoint and steepness.
 *   - midpoint: the ratio that yields ~50 points
 *   - steepness: higher = sharper sigmoid
 */
function sigmoid(ratio: number, midpoint = 0.5, steepness = 8): number {
  const x = (ratio - midpoint) * steepness;
  return 100 / (1 + Math.exp(-x));
}

/**
 * Confidence multiplier: more data = more reliable score.
 * With < 5 samples the score is dampened toward 50.
 */
function confidence(n: number, threshold = 20): number {
  return Math.min(1, n / threshold);
}

// ---------------------------------------------------------------------------
// Pillar: Performance (30%)
// ---------------------------------------------------------------------------

export async function calcPerformance(profileId: string, traderIds?: string[]): Promise<number> {
  const { supabase } = await import('./supabase');

  const ids = traderIds ?? await getTraderIdsForProfile(profileId);
  if (ids.length === 0) return 0;

  // Pull completed sessions for this profile's traders
  const { data: sessions } = await supabase
    .from('sessions')
    .select('final_balance, starting_balance, final_rank')
    .in('trader_id', ids)
    .not('final_balance', 'is', null);

  if (!sessions || sessions.length === 0) return 0;

  const total = sessions.length;

  // Win = final_rank === 1
  const wins = sessions.filter((s) => s.final_rank === 1).length;
  const winRate = wins / total;

  // Average return %
  const returns = sessions.map((s) => {
    const start = s.starting_balance ?? 1;
    return ((s.final_balance - start) / start) * 100;
  });
  const avgReturn = returns.reduce((a, b) => a + b, 0) / total;

  // Win rate contributes 60%, avgReturn 40%
  // Win rate: 50%+ is good, 80%+ is max
  const winScore = sigmoid(winRate, 0.5, 6) * 0.6;

  // Average return: 20% is solid, 50%+ is max
  const returnRatio = Math.min(avgReturn / 50, 1);
  const returnScore = sigmoid(returnRatio, 0.4, 6) * 0.4;

  const raw = winScore + returnScore;
  const conf = confidence(total);

  return clamp(raw * conf + 50 * (1 - conf));
}

// ---------------------------------------------------------------------------
// Pillar: Combat (20%)
// ---------------------------------------------------------------------------

export async function calcCombat(profileId: string, traderIds?: string[]): Promise<number> {
  const { supabase } = await import('./supabase');

  const ids = traderIds ?? await getTraderIdsForProfile(profileId);
  if (ids.length === 0) return 0;

  // Attacks sent
  const { count: attacksSent } = await supabase
    .from('sabotages')
    .select('*', { count: 'exact', head: true })
    .in('attacker_id', ids)
    .eq('landed', true);

  // Blocks
  const { count: blocks } = await supabase
    .from('sabotages')
    .select('*', { count: 'exact', head: true })
    .in('defender_id', ids)
    .eq('blocked', true);

  // Deflects
  const { count: deflects } = await supabase
    .from('sabotages')
    .select('*', { count: 'exact', head: true })
    .in('defender_id', ids)
    .eq('deflected', true);

  const attacks = attacksSent ?? 0;
  const def = (blocks ?? 0) + (deflects ?? 0);

  // Attack score: 50 attacks = ~max
  const attackScore = sigmoid(Math.min(attacks / 50, 1), 0.4, 6) * 0.6;
  // Defense score: 20 blocks/deflects = ~max
  const defScore = sigmoid(Math.min(def / 20, 1), 0.4, 6) * 0.4;

  const totalEngagements = attacks + def;
  const conf = confidence(totalEngagements, 15);

  const raw = attackScore + defScore;
  return clamp(raw * conf + 50 * (1 - conf));
}

// ---------------------------------------------------------------------------
// Pillar: Strategy (20%)
// ---------------------------------------------------------------------------

export async function calcStrategy(profileId: string, traderIds?: string[]): Promise<number> {
  const { supabase } = await import('./supabase');

  const ids = traderIds ?? await getTraderIdsForProfile(profileId);
  if (ids.length === 0) return 0;

  // Get closed positions for all traders belonging to this profile
  const { data: positions } = await supabase
    .from('positions')
    .select('symbol, leverage, order_type, round_id, size')
    .in('trader_id', ids)
    .eq('status', 'closed');

  if (!positions || positions.length === 0) return 0;

  const total = positions.length;

  // 1. Asset diversity: unique symbols traded
  const uniqueSymbols = new Set(positions.map((p) => p.symbol)).size;
  const diversityScore = sigmoid(Math.min(uniqueSymbols / 8, 1), 0.35, 6) * 0.35;

  // 2. Leverage discipline: average leverage < 5x is disciplined
  const avgLeverage = positions.reduce((a, p) => a + p.leverage, 0) / total;
  // Lower leverage = higher discipline score (inverse)
  const leverageRatio = Math.max(0, 1 - avgLeverage / 20);
  const leverageScore = sigmoid(leverageRatio, 0.5, 6) * 0.35;

  // 3. Order type variety: using limit, stop, trailing = more sophisticated
  const orderTypes = new Set(positions.map((p) => p.order_type));
  const orderTypeScore = sigmoid(Math.min(orderTypes.size / 4, 1), 0.3, 6) * 0.30;

  const raw = diversityScore + leverageScore + orderTypeScore;
  const conf = confidence(total, 15);

  return clamp(raw * conf + 50 * (1 - conf));
}

// ---------------------------------------------------------------------------
// Pillar: Community (15%)
// ---------------------------------------------------------------------------

export async function calcCommunity(profileId: string): Promise<number> {
  const { supabase } = await import('./supabase');

  // Strategies published + upvotes
  const { data: strategies } = await supabase
    .from('strategies')
    .select('upvotes')
    .eq('author_id', profileId);

  const stratCount = strategies?.length ?? 0;
  const totalUpvotes = strategies?.reduce((a, s) => a + (s.upvotes ?? 0), 0) ?? 0;

  // Followers
  const { data: profile } = await supabase
    .from('profiles')
    .select('followers_count')
    .eq('id', profileId)
    .single();

  const followers = profile?.followers_count ?? 0;

  // Strategy contribution: 5+ strategies is strong
  const stratScore = sigmoid(Math.min(stratCount / 5, 1), 0.4, 6) * 0.30;

  // Upvotes: 50+ total upvotes is strong
  const upvoteScore = sigmoid(Math.min(totalUpvotes / 50, 1), 0.35, 6) * 0.35;

  // Followers: 100+ is strong
  const followerScore = sigmoid(Math.min(followers / 100, 1), 0.35, 6) * 0.35;

  const raw = stratScore + upvoteScore + followerScore;
  const activity = stratCount + totalUpvotes + followers;
  const conf = confidence(activity, 10);

  return clamp(raw * conf + 50 * (1 - conf));
}

// ---------------------------------------------------------------------------
// Pillar: Streak (15%)
// ---------------------------------------------------------------------------

export async function calcStreak(profileId: string, traderIds?: string[]): Promise<number> {
  const { supabase } = await import('./supabase');

  // Profile streak data
  const { data: profile } = await supabase
    .from('profiles')
    .select('streak_current, streak_best')
    .eq('id', profileId)
    .single();

  const current = profile?.streak_current ?? 0;
  const best = profile?.streak_best ?? 0;

  const ids = traderIds ?? await getTraderIdsForProfile(profileId);

  // Daily consistency: count distinct active days
  const { data: dailyStats } = ids.length > 0
    ? await supabase
        .from('daily_stats')
        .select('date')
        .in('trader_id', ids)
    : { data: null };

  const activeDays = dailyStats?.length ?? 0;

  // Current streak: 5+ is strong
  const currentScore = sigmoid(Math.min(current / 5, 1), 0.4, 6) * 0.35;

  // Best streak: 10+ is impressive
  const bestScore = sigmoid(Math.min(best / 10, 1), 0.3, 6) * 0.30;

  // Consistency: 30+ active days shows dedication
  const consistencyScore = sigmoid(Math.min(activeDays / 30, 1), 0.3, 6) * 0.35;

  const raw = currentScore + bestScore + consistencyScore;
  const conf = confidence(activeDays, 7);

  return clamp(raw * conf + 50 * (1 - conf));
}

// ---------------------------------------------------------------------------
// Composite TR Score
// ---------------------------------------------------------------------------

const WEIGHTS = {
  performance: 0.30,
  combat: 0.20,
  strategy: 0.20,
  community: 0.15,
  streak: 0.15,
} as const;

export function getRankTier(score: number): RankTier {
  const clamped = clamp(score);
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (clamped >= RANK_TIERS[i].minScore) {
      return RANK_TIERS[i].id;
    }
  }
  return 'paper_hands';
}

export async function calcTR(profileId: string): Promise<TRScore> {
  // Fetch all trader IDs for this profile once, pass to each pillar
  const traderIds = await getTraderIdsForProfile(profileId);

  const [performance, combat, strategy, community, streak] = await Promise.all([
    calcPerformance(profileId, traderIds),
    calcCombat(profileId, traderIds),
    calcStrategy(profileId, traderIds),
    calcCommunity(profileId), // community uses profileId (author_id, profiles table)
    calcStreak(profileId, traderIds),
  ]);

  const total = clamp(
    performance * WEIGHTS.performance +
    combat * WEIGHTS.combat +
    strategy * WEIGHTS.strategy +
    community * WEIGHTS.community +
    streak * WEIGHTS.streak,
  );

  const tier = getRankTier(total);

  return { total, performance, combat, strategy, community, streak, tier };
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

export async function recalcAndSave(profileId: string): Promise<void> {
  const { supabase } = await import('./supabase');
  const tr = await calcTR(profileId);

  await supabase
    .from('profiles')
    .update({
      tr_score: tr.total,
      tr_performance: tr.performance,
      tr_combat: tr.combat,
      tr_strategy: tr.strategy,
      tr_community: tr.community,
      tr_streak: tr.streak,
      rank_tier: tr.tier,
    })
    .eq('id', profileId);
}

// ---------------------------------------------------------------------------
// Badge evaluation
// ---------------------------------------------------------------------------

export interface EarnedBadge extends BadgeDef {
  earned_at: string;
}

export async function evaluateBadges(profileId: string): Promise<EarnedBadge[]> {
  const { supabase } = await import('./supabase');
  const now = new Date().toISOString();
  const earned: EarnedBadge[] = [];

  // Fetch all trader IDs for this profile
  const traderIds = await getTraderIdsForProfile(profileId);

  // Fetch existing badges so we only return newly earned ones
  const { data: profile } = await supabase
    .from('profiles')
    .select('badges, total_lobbies_played, total_wins, streak_current, streak_best, created_at')
    .eq('id', profileId)
    .single();

  if (!profile) return [];

  const existingIds = new Set(
    (profile.badges as Array<{ id: string }> | null)?.map((b) => b.id) ?? [],
  );

  function award(id: string) {
    if (existingIds.has(id)) return;
    const def = BADGE_DEFINITIONS.find((b) => b.id === id);
    if (def) earned.push({ ...def, earned_at: now });
  }

  // If no traders exist, we can still check profile-level badges
  // but skip trader-level queries
  const hasTraders = traderIds.length > 0;

  // --- Performance badges ---

  // first_blood: at least 1 win
  if (profile.total_wins >= 1) award('first_blood');

  // streak_3 / streak_5
  if (profile.streak_best >= 3 || profile.streak_current >= 3) award('streak_3');
  if (profile.streak_best >= 5 || profile.streak_current >= 5) award('streak_5');

  // perfect_round: any session with 100%+ return
  const { data: perfectSessions } = hasTraders
    ? await supabase
        .from('sessions')
        .select('starting_balance, final_balance')
        .in('trader_id', traderIds)
        .not('final_balance', 'is', null)
    : { data: null };

  if (perfectSessions?.some((s) => {
    const ret = ((s.final_balance - s.starting_balance) / s.starting_balance) * 100;
    return ret >= 100;
  })) {
    award('perfect_round');
  }

  // comeback_king: won a round after finishing last in a previous round
  const { data: comebackSessions } = hasTraders
    ? await supabase
        .from('sessions')
        .select('final_rank, lobby_id')
        .in('trader_id', traderIds)
        .not('final_rank', 'is', null)
        .order('created_at', { ascending: true })
    : { data: null };

  if (comebackSessions && comebackSessions.length >= 2) {
    let wasLast = false;
    for (const s of comebackSessions) {
      if (wasLast && s.final_rank === 1) {
        award('comeback_king');
        break;
      }
      // Check if this was last place — need lobby participant count
      const { count } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('lobby_id', s.lobby_id);
      wasLast = s.final_rank === (count ?? 0);
    }
  }

  // --- Combat badges ---

  if (hasTraders) {
    const { count: attacksLanded } = await supabase
      .from('sabotages')
      .select('*', { count: 'exact', head: true })
      .in('attacker_id', traderIds)
      .eq('landed', true);

    if ((attacksLanded ?? 0) >= 50) award('saboteur');

    const { count: blocksCount } = await supabase
      .from('sabotages')
      .select('*', { count: 'exact', head: true })
      .in('defender_id', traderIds)
      .eq('blocked', true);

    if ((blocksCount ?? 0) >= 10) award('iron_wall');

    const { count: deflectsCount } = await supabase
      .from('sabotages')
      .select('*', { count: 'exact', head: true })
      .in('defender_id', traderIds)
      .eq('deflected', true);

    if ((deflectsCount ?? 0) >= 5) award('deflector');

    // assassin: eliminated someone via sabotage
    const { count: eliminations } = await supabase
      .from('sabotages')
      .select('*', { count: 'exact', head: true })
      .in('attacker_id', traderIds)
      .eq('caused_elimination', true);

    if ((eliminations ?? 0) >= 1) award('assassin');

    // pacifist: won a lobby with 0 attacks sent
    const { data: wonSessions } = await supabase
      .from('sessions')
      .select('lobby_id')
      .in('trader_id', traderIds)
      .eq('final_rank', 1);

    if (wonSessions) {
      for (const ws of wonSessions) {
        const { count: lobbyAttacks } = await supabase
          .from('sabotages')
          .select('*', { count: 'exact', head: true })
          .in('attacker_id', traderIds)
          .eq('lobby_id', ws.lobby_id);

        if ((lobbyAttacks ?? 0) === 0) {
          award('pacifist');
          break;
        }
      }
    }
  }

  // --- Trading badges ---

  if (hasTraders) {
    const { data: bigPositions } = await supabase
      .from('positions')
      .select('size')
      .in('trader_id', traderIds)
      .gte('size', 5000)
      .limit(1);

    if (bigPositions && bigPositions.length > 0) award('whale_trade');

    // scalper_king: 10+ trades in a single round
    const { data: roundCounts } = await supabase
      .from('positions')
      .select('round_id')
      .in('trader_id', traderIds);

    if (roundCounts) {
      const perRound = new Map<string, number>();
      for (const p of roundCounts) {
        perRound.set(p.round_id, (perRound.get(p.round_id) ?? 0) + 1);
      }
      if ([...perRound.values()].some((c) => c >= 10)) award('scalper_king');
    }

    // diversifier: 5+ unique symbols in one round
    const { data: roundSymbols } = await supabase
      .from('positions')
      .select('round_id, symbol')
      .in('trader_id', traderIds);

    if (roundSymbols) {
      const symbolsPerRound = new Map<string, Set<string>>();
      for (const p of roundSymbols) {
        if (!symbolsPerRound.has(p.round_id)) symbolsPerRound.set(p.round_id, new Set());
        symbolsPerRound.get(p.round_id)!.add(p.symbol);
      }
      if ([...symbolsPerRound.values()].some((s) => s.size >= 5)) award('diversifier');
    }

    // diamond_hands: held through -20% and still profited
    const { data: diamondPositions } = await supabase
      .from('positions')
      .select('entry_price, exit_price, direction, trail_peak')
      .in('trader_id', traderIds)
      .eq('status', 'closed')
      .not('exit_price', 'is', null);

    if (diamondPositions) {
      for (const p of diamondPositions) {
        if (!p.exit_price) continue;
        const pnl = p.direction === 'long'
          ? (p.exit_price - p.entry_price) / p.entry_price
          : (p.entry_price - p.exit_price) / p.entry_price;
        // trail_peak tracks worst drawdown implicitly; if profitable and had -20%+ drawdown
        // We approximate: if profitable but trail_peak indicates a significant dip
        if (pnl > 0 && p.trail_peak) {
          const worstDrawdown = p.direction === 'long'
            ? (p.trail_peak - p.entry_price) / p.entry_price
            : (p.entry_price - p.trail_peak) / p.entry_price;
          if (worstDrawdown <= -0.20) {
            award('diamond_hands');
            break;
          }
        }
      }
    }
  } // end hasTraders (trading badges)

  // --- Community badges ---

  const { data: strategies } = await supabase
    .from('strategies')
    .select('upvotes')
    .eq('author_id', profileId);

  if (strategies?.some((s) => s.upvotes >= 20)) award('strategist');

  // veteran: 100+ lobbies
  if (profile.total_lobbies_played >= 100) award('veteran');

  // og: first 1000 users (check if their profile.created_at is within first 1000)
  const { count: earlierProfiles } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .lte('created_at', profile.created_at);

  if ((earlierProfiles ?? Infinity) <= 1000) award('og');

  // mentor: placeholder — requires mentor_sessions table
  // tournament_winner, event_champion, undefeated: awarded manually or via admin

  return earned;
}
