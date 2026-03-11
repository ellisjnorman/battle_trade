import { getServerSupabase } from '@/lib/supabase-server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopySubscription {
  id: string;
  follower_id: string;
  leader_id: string;
  budget_usd: number;
  leverage_multiplier: number;
  is_active: boolean;
  created_at: string;
  paused_at: string | null;
  pause_reason: string | null;
}

export interface CopiedTrade {
  id: string;
  subscription_id: string;
  leader_position_id: string;
  follower_position_id: string | null;
  leader_entry_price: number;
  follower_entry_price: number | null;
  size_ratio: number;
  status: 'pending' | 'executed' | 'failed' | 'closed';
  pnl_usd: number | null;
  fee_usd: number | null;
  created_at: string;
}

export interface CopyStats {
  total_followers: number;
  total_aum_usd: number;
  total_pnl_generated: number;
  total_fees_earned: number;
  platform_fees: number;
  monthly_pnl: number;
  monthly_fees: number;
}

export interface CopyLeader {
  profile: {
    id: string;
    display_name: string;
    handle: string | null;
    avatar_url: string | null;
    tr_score: number;
    rank_tier: string;
    total_lobbies_played: number;
    best_return: number;
  };
  stats: CopyStats;
  rank: number;
}

export interface FollowerPortfolio {
  subscriptions: Array<CopySubscription & { leader_name: string; leader_handle: string | null }>;
  active_trades: CopiedTrade[];
  total_pnl: number;
  total_fees_paid: number;
}

// ---------------------------------------------------------------------------
// Fee constants
// ---------------------------------------------------------------------------

const LEADER_FEE_PCT = 0.15;
const PLATFORM_FEE_PCT = 0.10;

// ---------------------------------------------------------------------------
// Top 20 eligibility
// ---------------------------------------------------------------------------

const MIN_BATTLES = 20;
const MAX_DRAWDOWN_THRESHOLD = -15;
const GRACE_PERIOD_DAYS = 7;

/**
 * Check if a profile is eligible to be a copy-trading leader.
 * Requirements: rank <= 20 by tr_score, 20+ battles played, max drawdown > -15%.
 */
export async function checkTop20Eligibility(profileId: string): Promise<{
  eligible: boolean;
  rank: number | null;
  reason: string | null;
}> {
  const sb = getServerSupabase();

  // Get the profile
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('id, tr_score, total_lobbies_played, best_return')
    .eq('id', profileId)
    .single();

  if (profileErr || !profile) {
    return { eligible: false, rank: null, reason: 'Profile not found' };
  }

  // Get rank by tr_score (count how many profiles have a higher score)
  const { count: higherCount, error: rankErr } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gt('tr_score', profile.tr_score);

  if (rankErr) {
    return { eligible: false, rank: null, reason: 'Failed to determine rank' };
  }

  const rank = (higherCount ?? 0) + 1;

  if (rank > 20) {
    return { eligible: false, rank, reason: `Rank ${rank} is outside Top 20` };
  }

  if (profile.total_lobbies_played < MIN_BATTLES) {
    return {
      eligible: false,
      rank,
      reason: `Only ${profile.total_lobbies_played} battles played (minimum ${MIN_BATTLES})`,
    };
  }

  // best_return is stored as a percentage; check if worst drawdown exceeds threshold
  // For drawdown we check if best_return (which tracks worst too via sessions) is below threshold.
  // In practice, we look at the profile's session history for max drawdown.
  // Find trader IDs for this profile, then query sessions
  const { data: traderRows } = await sb
    .from('traders')
    .select('id')
    .eq('profile_id', profileId);

  const traderIds = (traderRows ?? []).map((t) => t.id);

  if (traderIds.length > 0) {
    const { data: sessions } = await sb
      .from('sessions')
      .select('starting_balance, final_balance')
      .in('trader_id', traderIds)
      .not('final_balance', 'is', null);

    if (sessions && sessions.length > 0) {
      const worstReturn = sessions.reduce((worst, s) => {
        if (s.final_balance == null || s.starting_balance === 0) return worst;
        const ret = ((s.final_balance - s.starting_balance) / s.starting_balance) * 100;
        return Math.min(worst, ret);
      }, 0);

      if (worstReturn < MAX_DRAWDOWN_THRESHOLD) {
        return {
          eligible: false,
          rank,
          reason: `Max drawdown ${worstReturn.toFixed(1)}% exceeds ${MAX_DRAWDOWN_THRESHOLD}% threshold`,
        };
      }
    }
  }

  return { eligible: true, rank, reason: null };
}

/**
 * Return Top 20 copy-eligible leaders with their copy stats.
 */
export async function getTop20Leaders(): Promise<CopyLeader[]> {
  const sb = getServerSupabase();

  // Get top 20 profiles by tr_score that meet minimum battles
  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, display_name, handle, avatar_url, tr_score, rank_tier, total_lobbies_played, best_return')
    .gte('total_lobbies_played', MIN_BATTLES)
    .order('tr_score', { ascending: false })
    .limit(20);

  if (error || !profiles) return [];

  // For each, check drawdown eligibility and get stats
  const leaders: CopyLeader[] = [];
  let rank = 0;

  for (const profile of profiles) {
    rank++;

    // Check drawdown — find trader IDs for this profile first
    const { data: profileTraders } = await sb
      .from('traders')
      .select('id')
      .eq('profile_id', profile.id);

    const profileTraderIds = (profileTraders ?? []).map((t) => t.id);

    if (profileTraderIds.length > 0) {
      const { data: sessions } = await sb
        .from('sessions')
        .select('starting_balance, final_balance')
        .in('trader_id', profileTraderIds)
        .not('final_balance', 'is', null);

      if (sessions && sessions.length > 0) {
        const worstReturn = sessions.reduce((worst, s) => {
          if (s.final_balance == null || s.starting_balance === 0) return worst;
          const ret = ((s.final_balance - s.starting_balance) / s.starting_balance) * 100;
          return Math.min(worst, ret);
        }, 0);

        if (worstReturn < MAX_DRAWDOWN_THRESHOLD) continue;
      }
    }

    const stats = await getLeaderStats(profile.id);
    leaders.push({ profile, stats, rank });
  }

  return leaders;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe a follower to copy a leader's trades.
 */
export async function subscribe(
  followerId: string,
  leaderId: string,
  budgetUsd: number,
  leverageMultiplier: number = 1.0,
): Promise<{ subscription: CopySubscription | null; error: string | null }> {
  if (followerId === leaderId) {
    return { subscription: null, error: 'Cannot copy your own trades' };
  }

  if (budgetUsd <= 0) {
    return { subscription: null, error: 'Budget must be greater than zero' };
  }

  if (leverageMultiplier < 0.5 || leverageMultiplier > 2.0) {
    return { subscription: null, error: 'Leverage multiplier must be between 0.5 and 2.0' };
  }

  // Validate leader eligibility
  const eligibility = await checkTop20Eligibility(leaderId);
  if (!eligibility.eligible) {
    return { subscription: null, error: `Leader not eligible: ${eligibility.reason}` };
  }

  const sb = getServerSupabase();

  // Check for existing subscription (active or paused)
  const { data: existing } = await sb
    .from('copy_subscriptions')
    .select('id, is_active')
    .eq('follower_id', followerId)
    .eq('leader_id', leaderId)
    .single();

  if (existing) {
    if (existing.is_active) {
      return { subscription: null, error: 'Already subscribed to this leader' };
    }
    // Reactivate paused/inactive subscription
    const { data: reactivated, error: reactivateErr } = await sb
      .from('copy_subscriptions')
      .update({
        is_active: true,
        budget_usd: budgetUsd,
        leverage_multiplier: leverageMultiplier,
        paused_at: null,
        pause_reason: null,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (reactivateErr) {
      return { subscription: null, error: reactivateErr.message };
    }
    return { subscription: reactivated as CopySubscription, error: null };
  }

  // Create new subscription
  const { data, error } = await sb
    .from('copy_subscriptions')
    .insert({
      follower_id: followerId,
      leader_id: leaderId,
      budget_usd: budgetUsd,
      leverage_multiplier: leverageMultiplier,
    })
    .select()
    .single();

  if (error) {
    return { subscription: null, error: error.message };
  }

  return { subscription: data as CopySubscription, error: null };
}

/**
 * Unsubscribe (deactivate). Does NOT close open mirror positions.
 */
export async function unsubscribe(
  subscriptionId: string,
): Promise<{ success: boolean; error: string | null }> {
  const sb = getServerSupabase();

  const { data, error } = await sb
    .from('copy_subscriptions')
    .update({ is_active: false })
    .eq('id', subscriptionId)
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: 'Subscription not found' };
  }

  return { success: true, error: null };
}

/**
 * Pause a subscription with a reason (e.g. leader dropped out of Top 20).
 */
export async function pauseSubscription(
  subscriptionId: string,
  reason: string,
): Promise<{ success: boolean; error: string | null }> {
  const sb = getServerSupabase();

  const { error } = await sb
    .from('copy_subscriptions')
    .update({
      is_active: false,
      paused_at: new Date().toISOString(),
      pause_reason: reason,
    })
    .eq('id', subscriptionId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

/**
 * Resume a paused subscription if the leader is back in Top 20.
 */
export async function resumeSubscription(
  subscriptionId: string,
): Promise<{ success: boolean; error: string | null }> {
  const sb = getServerSupabase();

  // Get the subscription to check leader eligibility
  const { data: sub, error: subErr } = await sb
    .from('copy_subscriptions')
    .select('leader_id, paused_at')
    .eq('id', subscriptionId)
    .single();

  if (subErr || !sub) {
    return { success: false, error: 'Subscription not found' };
  }

  if (!sub.paused_at) {
    return { success: false, error: 'Subscription is not paused' };
  }

  const eligibility = await checkTop20Eligibility(sub.leader_id);
  if (!eligibility.eligible) {
    return { success: false, error: `Leader not eligible: ${eligibility.reason}` };
  }

  const { error } = await sb
    .from('copy_subscriptions')
    .update({
      is_active: true,
      paused_at: null,
      pause_reason: null,
    })
    .eq('id', subscriptionId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

// ---------------------------------------------------------------------------
// Trade mirroring
// ---------------------------------------------------------------------------

/**
 * Mirror a leader's position for a subscription.
 * Scales size by (budget / leader_equity) * leverage_multiplier, capped at budget.
 */
export async function mirrorPosition(
  subscriptionId: string,
  leaderPositionId: string,
): Promise<{ trade: CopiedTrade | null; error: string | null }> {
  const sb = getServerSupabase();

  // Load subscription
  const { data: sub, error: subErr } = await sb
    .from('copy_subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('is_active', true)
    .single();

  if (subErr || !sub) {
    return { trade: null, error: 'Active subscription not found' };
  }

  // Load leader's position
  const { data: leaderPos, error: posErr } = await sb
    .from('positions')
    .select('*')
    .eq('id', leaderPositionId)
    .single();

  if (posErr || !leaderPos) {
    return { trade: null, error: 'Leader position not found' };
  }

  // Get leader's current equity from their most recent active session
  const { data: leaderSession } = await sb
    .from('sessions')
    .select('starting_balance, final_balance')
    .eq('trader_id', sub.leader_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const leaderEquity = leaderSession
    ? (leaderSession.final_balance ?? leaderSession.starting_balance)
    : 10000;

  // Calculate size ratio: (budget / leader_equity) * leverage_multiplier
  const rawRatio = (sub.budget_usd / leaderEquity) * sub.leverage_multiplier;
  const followerSize = Math.min(
    leaderPos.size * rawRatio,
    sub.budget_usd / leaderPos.entry_price, // cap at what budget can afford
  );
  const sizeRatio = leaderPos.size > 0 ? followerSize / leaderPos.size : 0;

  // Check if follower has an exchange connected
  const { data: exchangeConn } = await sb
    .from('exchange_connections')
    .select('id')
    .eq('profile_id', sub.follower_id)
    .eq('is_active', true)
    .limit(1);

  const hasExchange = exchangeConn && exchangeConn.length > 0;

  // Create the follower's paper position (or mark for exchange execution)
  let followerPositionId: string | null = null;

  if (!hasExchange) {
    // Create a paper position mirroring the leader
    const { data: paperPos, error: paperErr } = await sb
      .from('positions')
      .insert({
        trader_id: sub.follower_id,
        round_id: leaderPos.round_id,
        symbol: leaderPos.symbol,
        direction: leaderPos.direction,
        size: followerSize,
        leverage: leaderPos.leverage * sub.leverage_multiplier,
        entry_price: leaderPos.entry_price,
        order_type: 'market',
        status: 'open',
      })
      .select('id')
      .single();

    if (paperErr) {
      // Record the failed attempt
      const { data: failedTrade } = await sb
        .from('copied_trades')
        .insert({
          subscription_id: subscriptionId,
          leader_position_id: leaderPositionId,
          leader_entry_price: leaderPos.entry_price,
          size_ratio: sizeRatio,
          status: 'failed',
        })
        .select()
        .single();

      return { trade: failedTrade as CopiedTrade | null, error: `Failed to create paper position: ${paperErr.message}` };
    }

    followerPositionId = paperPos?.id ?? null;
  } else {
    // Exchange connected: in production, this would call the exchange adapter
    // to place a real order. For now, we create the record as pending and the
    // exchange adapter (out of scope) would update it to 'executed' once filled.
    // We still create a paper position to track internally.
    const { data: trackerPos } = await sb
      .from('positions')
      .insert({
        trader_id: sub.follower_id,
        round_id: leaderPos.round_id,
        symbol: leaderPos.symbol,
        direction: leaderPos.direction,
        size: followerSize,
        leverage: leaderPos.leverage * sub.leverage_multiplier,
        entry_price: leaderPos.entry_price,
        order_type: 'market',
        status: 'open',
      })
      .select('id')
      .single();

    followerPositionId = trackerPos?.id ?? null;
  }

  // Record the copied trade
  const { data: copiedTrade, error: tradeErr } = await sb
    .from('copied_trades')
    .insert({
      subscription_id: subscriptionId,
      leader_position_id: leaderPositionId,
      follower_position_id: followerPositionId,
      leader_entry_price: leaderPos.entry_price,
      follower_entry_price: leaderPos.entry_price, // same price for paper; exchange fill price would differ
      size_ratio: sizeRatio,
      status: followerPositionId ? 'executed' : 'failed',
    })
    .select()
    .single();

  if (tradeErr) {
    return { trade: null, error: tradeErr.message };
  }

  return { trade: copiedTrade as CopiedTrade, error: null };
}

/**
 * Close a mirror position when the leader closes theirs.
 * Calculates PnL and fees.
 */
export async function closeMirrorPosition(
  copiedTradeId: string,
): Promise<{ trade: CopiedTrade | null; error: string | null }> {
  const sb = getServerSupabase();

  // Load the copied trade
  const { data: copiedTrade, error: tradeErr } = await sb
    .from('copied_trades')
    .select('*, copy_subscriptions!copied_trades_subscription_id_fkey(follower_id, leader_id)')
    .eq('id', copiedTradeId)
    .single();

  if (tradeErr || !copiedTrade) {
    return { trade: null, error: 'Copied trade not found' };
  }

  if (copiedTrade.status === 'closed') {
    return { trade: copiedTrade as CopiedTrade, error: null };
  }

  if (!copiedTrade.follower_position_id) {
    return { trade: null, error: 'No follower position to close (trade was failed)' };
  }

  // Get the leader's position to find exit price
  const { data: leaderPos } = await sb
    .from('positions')
    .select('exit_price, realized_pnl, direction, size, leverage')
    .eq('id', copiedTrade.leader_position_id)
    .single();

  if (!leaderPos || leaderPos.exit_price == null) {
    return { trade: null, error: 'Leader position has not been closed yet' };
  }

  // Close the follower's position
  const { data: followerPos } = await sb
    .from('positions')
    .select('size, leverage, entry_price, direction')
    .eq('id', copiedTrade.follower_position_id)
    .single();

  if (!followerPos) {
    return { trade: null, error: 'Follower position not found' };
  }

  // Calculate follower PnL
  const direction = followerPos.direction === 'long' ? 1 : -1;
  const priceDelta = leaderPos.exit_price - followerPos.entry_price;
  const pnlUsd = direction * priceDelta * followerPos.size * followerPos.leverage;

  // Calculate fees
  const { leaderFee, platformFee, totalFee } = calculateFees(pnlUsd);

  // Close the follower's position in the positions table
  await sb
    .from('positions')
    .update({
      exit_price: leaderPos.exit_price,
      realized_pnl: pnlUsd,
      closed_at: new Date().toISOString(),
      status: 'closed',
    })
    .eq('id', copiedTrade.follower_position_id);

  // Update the copied trade record
  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await sb
    .from('copied_trades')
    .update({
      status: 'closed',
      pnl_usd: pnlUsd,
      fee_usd: totalFee,
      closed_at: now,
    })
    .eq('id', copiedTradeId)
    .select()
    .single();

  if (updateErr) {
    return { trade: null, error: updateErr.message };
  }

  // Record fee ledger entry (only if there are fees to record)
  const sub = copiedTrade.copy_subscriptions as unknown as { follower_id: string; leader_id: string };
  if (totalFee > 0) {
    await sb.from('copy_fee_ledger').insert({
      copied_trade_id: copiedTradeId,
      leader_fee: leaderFee,
      platform_fee: platformFee,
      follower_id: sub.follower_id,
      leader_id: sub.leader_id,
    });
  }

  return { trade: updated as CopiedTrade, error: null };
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

/**
 * Calculate fee split. Fees only apply to positive PnL.
 * 15% to leader, 10% to platform, 75% to follower.
 */
export function calculateFees(pnlUsd: number): {
  leaderFee: number;
  platformFee: number;
  totalFee: number;
} {
  if (pnlUsd <= 0) {
    return { leaderFee: 0, platformFee: 0, totalFee: 0 };
  }
  const leaderFee = Math.round(pnlUsd * LEADER_FEE_PCT * 100) / 100;
  const platformFee = Math.round(pnlUsd * PLATFORM_FEE_PCT * 100) / 100;
  return {
    leaderFee,
    platformFee,
    totalFee: leaderFee + platformFee,
  };
}

// ---------------------------------------------------------------------------
// Stats & Portfolio
// ---------------------------------------------------------------------------

/**
 * Get aggregate copy-trading stats for a leader.
 */
export async function getLeaderStats(leaderId: string): Promise<CopyStats> {
  const sb = getServerSupabase();

  // Total followers and AUM
  const { data: subs } = await sb
    .from('copy_subscriptions')
    .select('budget_usd')
    .eq('leader_id', leaderId)
    .eq('is_active', true);

  const totalFollowers = subs?.length ?? 0;
  const totalAumUsd = subs?.reduce((sum, s) => sum + Number(s.budget_usd), 0) ?? 0;

  // All-time PnL and fees from closed copied trades
  const { data: allSubIds } = await sb
    .from('copy_subscriptions')
    .select('id')
    .eq('leader_id', leaderId);

  const subIdList = (allSubIds ?? []).map((s) => s.id);

  let allTrades: Array<{ pnl_usd: number | null; fee_usd: number | null; created_at: string; subscription_id: string }> | null = null;
  if (subIdList.length > 0) {
    const { data } = await sb
      .from('copied_trades')
      .select('pnl_usd, fee_usd, created_at, subscription_id')
      .eq('status', 'closed')
      .in('subscription_id', subIdList);
    allTrades = data;
  }

  const totalPnl = allTrades?.reduce((sum, t) => sum + Number(t.pnl_usd ?? 0), 0) ?? 0;

  // Fees from ledger
  const { data: fees } = await sb
    .from('copy_fee_ledger')
    .select('leader_fee, platform_fee, created_at')
    .eq('leader_id', leaderId);

  const totalFeesEarned = fees?.reduce((sum, f) => sum + Number(f.leader_fee), 0) ?? 0;
  const platformFees = fees?.reduce((sum, f) => sum + Number(f.platform_fee), 0) ?? 0;

  // Monthly stats (current calendar month)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();

  const monthlyTrades = allTrades?.filter((t) => t.created_at >= monthIso) ?? [];
  const monthlyPnl = monthlyTrades.reduce((sum, t) => sum + Number(t.pnl_usd ?? 0), 0);

  const monthlyFeeEntries = fees?.filter((f) => f.created_at >= monthIso) ?? [];
  const monthlyFees = monthlyFeeEntries.reduce((sum, f) => sum + Number(f.leader_fee), 0);

  return {
    total_followers: totalFollowers,
    total_aum_usd: totalAumUsd,
    total_pnl_generated: totalPnl,
    total_fees_earned: totalFeesEarned,
    platform_fees: platformFees,
    monthly_pnl: monthlyPnl,
    monthly_fees: monthlyFees,
  };
}

/**
 * Get a follower's complete copy-trading portfolio.
 */
export async function getFollowerPortfolio(followerId: string): Promise<FollowerPortfolio> {
  const sb = getServerSupabase();

  // All subscriptions with leader info
  const { data: subs } = await sb
    .from('copy_subscriptions')
    .select('*, profiles!copy_subscriptions_leader_id_fkey(display_name, handle)')
    .eq('follower_id', followerId)
    .eq('is_active', true);

  const subscriptions = (subs ?? []).map((s) => {
    const leader = s.profiles as unknown as { display_name: string; handle: string | null } | null;
    return {
      id: s.id,
      follower_id: s.follower_id,
      leader_id: s.leader_id,
      budget_usd: Number(s.budget_usd),
      leverage_multiplier: Number(s.leverage_multiplier),
      is_active: s.is_active,
      created_at: s.created_at,
      paused_at: s.paused_at,
      pause_reason: s.pause_reason,
      leader_name: leader?.display_name ?? 'Unknown',
      leader_handle: leader?.handle ?? null,
    };
  });

  // Get all subscription IDs
  const subIds = subscriptions.map((s) => s.id);

  // Active copied trades
  let activeTrades: CopiedTrade[] = [];
  let totalPnl = 0;
  let totalFeesPaid = 0;

  if (subIds.length > 0) {
    const { data: trades } = await sb
      .from('copied_trades')
      .select('*')
      .in('subscription_id', subIds)
      .in('status', ['pending', 'executed']);

    activeTrades = (trades ?? []) as CopiedTrade[];

    // Total PnL across all closed trades for this follower
    const { data: closedTrades } = await sb
      .from('copied_trades')
      .select('pnl_usd, fee_usd')
      .in('subscription_id', subIds)
      .eq('status', 'closed');

    totalPnl = closedTrades?.reduce((sum, t) => sum + Number(t.pnl_usd ?? 0), 0) ?? 0;
    totalFeesPaid = closedTrades?.reduce((sum, t) => sum + Number(t.fee_usd ?? 0), 0) ?? 0;
  }

  return {
    subscriptions,
    active_trades: activeTrades,
    total_pnl: totalPnl,
    total_fees_paid: totalFeesPaid,
  };
}

// ---------------------------------------------------------------------------
// Grace period enforcement
// ---------------------------------------------------------------------------

/**
 * Enforce Top 20 grace period for a leader.
 * If the leader has been outside Top 20 for more than 7 days, pause all subscriptions.
 * Called periodically (e.g. by a cron or after leaderboard recalc).
 */
export async function enforceTop20Grace(
  leaderId: string,
): Promise<{ paused: number; error: string | null }> {
  const eligibility = await checkTop20Eligibility(leaderId);

  if (eligibility.eligible) {
    // Leader is eligible, nothing to do
    return { paused: 0, error: null };
  }

  const sb = getServerSupabase();

  // Get active subscriptions for this leader
  const { data: activeSubs, error: subsErr } = await sb
    .from('copy_subscriptions')
    .select('id, paused_at')
    .eq('leader_id', leaderId)
    .eq('is_active', true);

  if (subsErr) return { paused: 0, error: subsErr.message };
  if (!activeSubs || activeSubs.length === 0) return { paused: 0, error: null };

  // Check if any were already paused with a timestamp (grace tracking)
  // For subs that haven't been paused yet, record the pause start
  const now = new Date();
  let pausedCount = 0;

  for (const sub of activeSubs) {
    if (sub.paused_at) {
      // Already in grace period - check if grace expired
      const pausedDate = new Date(sub.paused_at);
      const daysSincePause = (now.getTime() - pausedDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSincePause >= GRACE_PERIOD_DAYS) {
        // Grace expired: deactivate
        await sb
          .from('copy_subscriptions')
          .update({
            is_active: false,
            pause_reason: `Leader dropped out of Top 20 for ${Math.floor(daysSincePause)} days (grace period expired)`,
          })
          .eq('id', sub.id);
        pausedCount++;
      }
      // Still within grace: do nothing, leave paused_at as-is
    } else {
      // First time detecting drop: start grace period by recording paused_at
      // but keep is_active true during grace
      await sb
        .from('copy_subscriptions')
        .update({
          paused_at: now.toISOString(),
          pause_reason: `Leader dropped out of Top 20. Grace period ends ${new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`,
        })
        .eq('id', sub.id);
    }
  }

  return { paused: pausedCount, error: null };
}
