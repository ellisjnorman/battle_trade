// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParticipationConfig {
  min_open_position_seconds: number;
  min_position_size_usd: number;
  max_cash_pct: number;
  auto_trade_on_violation: boolean;
  leverage: number;
  position_time_limit_seconds?: number;
}

export interface ActivityStatus {
  trader_id: string;
  status: 'active' | 'warning' | 'critical';
  score: number;
  score_multiplier: number;
  seconds_idle: number;
  time_until_forced: number | null;
  cash_pct: number;
  open_position_count: number;
  violations: string[];
}

export const DEFAULT_PARTICIPATION_CONFIG: ParticipationConfig = {
  min_open_position_seconds: 90,
  min_position_size_usd: 1000,
  max_cash_pct: 0.30,
  auto_trade_on_violation: true,
  leverage: 1,
};

// ---------------------------------------------------------------------------
// Activity score (pure)
// ---------------------------------------------------------------------------

export function calcActivityScore(params: {
  trades_placed: number;
  total_volume_usd: number;
  seconds_with_position: number;
  seconds_idle: number;
}): number {
  const score =
    params.trades_placed * 10 +
    params.total_volume_usd * 0.001 +
    params.seconds_with_position * 0.1 -
    params.seconds_idle * 0.5;
  return Math.max(0, score);
}

export function getScoreMultiplier(score: number): number {
  if (score > 100) return 1.05;
  if (score >= 50) return 1.00;
  if (score >= 25) return 0.95;
  return 0.90;
}

// ---------------------------------------------------------------------------
// Status determination (pure)
// ---------------------------------------------------------------------------

export function determineStatus(params: {
  has_open_position: boolean;
  cash_pct: number;
  seconds_idle: number;
}): 'active' | 'warning' | 'critical' {
  if (params.seconds_idle >= 90 || params.cash_pct > 0.50) return 'critical';
  if (params.seconds_idle >= 60 || params.cash_pct > 0.30) return 'warning';
  if (params.has_open_position && params.cash_pct <= 0.30) return 'active';
  return 'warning';
}

// ---------------------------------------------------------------------------
// Check participation (requires Supabase)
// ---------------------------------------------------------------------------

export async function checkParticipation(
  trader_id: string,
  lobby_id: string,
  round_id: string,
  config: ParticipationConfig = DEFAULT_PARTICIPATION_CONFIG,
): Promise<ActivityStatus> {
  const { supabase } = await import('./supabase');

  // Get session balance
  const { data: session } = await supabase
    .from('sessions')
    .select('starting_balance')
    .eq('trader_id', trader_id)
    .eq('lobby_id', lobby_id)
    .single();

  const startingBalance = session?.starting_balance ?? 10000;

  // Get all positions for this round
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('trader_id', trader_id)
    .eq('round_id', round_id);

  const allPositions = positions ?? [];
  const openPositions = allPositions.filter((p) => !p.closed_at);
  const closedPositions = allPositions.filter((p) => p.closed_at);

  // Calculate idle time (seconds since last position opened)
  const now = Date.now();
  let lastPositionTime = 0;
  for (const p of allPositions) {
    const t = new Date(p.opened_at).getTime();
    if (t > lastPositionTime) lastPositionTime = t;
  }

  // If no positions ever, use round start time
  if (lastPositionTime === 0) {
    const { data: round } = await supabase
      .from('rounds')
      .select('started_at')
      .eq('id', round_id)
      .single();

    lastPositionTime = round?.started_at
      ? new Date(round.started_at).getTime()
      : now;
  }

  const secondsIdle = openPositions.length > 0 ? 0 : Math.floor((now - lastPositionTime) / 1000);

  // Calculate cash percentage
  const openSize = openPositions.reduce((sum, p) => sum + (p.size ?? 0), 0);
  const cashPct = startingBalance > 0 ? Math.max(0, (startingBalance - openSize) / startingBalance) : 1;

  // Calculate activity score
  const totalVolume = allPositions.reduce((sum, p) => sum + (p.size ?? 0), 0);
  const secondsWithPosition = allPositions.reduce((sum, p) => {
    const opened = new Date(p.opened_at).getTime();
    const closed = p.closed_at ? new Date(p.closed_at).getTime() : now;
    return sum + Math.floor((closed - opened) / 1000);
  }, 0);

  const score = calcActivityScore({
    trades_placed: allPositions.length,
    total_volume_usd: totalVolume,
    seconds_with_position: secondsWithPosition,
    seconds_idle: secondsIdle,
  });

  const scoreMultiplier = getScoreMultiplier(score);
  const status = determineStatus({
    has_open_position: openPositions.length > 0,
    cash_pct: cashPct,
    seconds_idle: secondsIdle,
  });

  const violations: string[] = [];
  if (secondsIdle >= config.min_open_position_seconds) {
    violations.push(`idle_${secondsIdle}s`);
  }
  if (cashPct > config.max_cash_pct) {
    violations.push(`cash_pct_${Math.round(cashPct * 100)}%`);
  }
  for (const p of openPositions) {
    if (p.size < config.min_position_size_usd) {
      violations.push(`small_position_${p.id}`);
    }
  }

  const timeUntilForced =
    status === 'critical' ? 0 :
    status === 'warning' ? Math.max(0, 90 - secondsIdle) :
    null;

  return {
    trader_id,
    status,
    score,
    score_multiplier: scoreMultiplier,
    seconds_idle: secondsIdle,
    time_until_forced: timeUntilForced,
    cash_pct: cashPct,
    open_position_count: openPositions.length,
    violations,
  };
}

// ---------------------------------------------------------------------------
// Execute forced trade
// ---------------------------------------------------------------------------

export async function executeForcedTrade(
  trader_id: string,
  lobby_id: string,
  round_id: string,
  config: ParticipationConfig = DEFAULT_PARTICIPATION_CONFIG,
): Promise<void> {
  const { supabase } = await import('./supabase');
  const { PaperOnlyExecutor } = await import('./trade-executor');

  // Get lobby config for available symbols
  const { data: lobby } = await supabase
    .from('lobbies')
    .select('config')
    .eq('id', lobby_id)
    .single();

  const symbols: string[] =
    (lobby?.config as Record<string, unknown>)?.available_symbols as string[] ??
    ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

  const asset = symbols[Math.floor(Math.random() * symbols.length)];
  const direction: 'long' | 'short' = Math.random() > 0.5 ? 'long' : 'short';

  // Get current price
  const { data: priceRow } = await supabase
    .from('prices')
    .select('price')
    .eq('symbol', asset)
    .single();

  if (!priceRow) return;

  const executor = new PaperOnlyExecutor();
  const result = await executor.execute({
    lobby_id,
    trader_id,
    round_id,
    asset,
    direction,
    size_usd: config.min_position_size_usd,
    entry_price: priceRow.price,
    leverage: config.leverage,
    is_forced: true,
  });

  if (!result.success) return;

  // Get trader name for public broadcast
  const { data: trader } = await supabase
    .from('traders')
    .select('name')
    .eq('id', trader_id)
    .single();

  // Broadcast to trader
  const traderChannel = supabase.channel(`trader-${trader_id}`);
  await traderChannel.send({
    type: 'broadcast',
    event: 'forced_trade',
    payload: {
      type: 'forced_trade',
      position_id: result.position_id,
      asset,
      direction,
      size_usd: config.min_position_size_usd,
      entry_price: priceRow.price,
      message: 'You were idle too long. Position opened.',
    },
  });

  // Broadcast to lobby feed
  const lobbyChannel = supabase.channel(`lobby-${lobby_id}-sabotage`);
  await lobbyChannel.send({
    type: 'broadcast',
    event: 'forced_trade_public',
    payload: {
      type: 'forced_trade_public',
      trader_id,
      trader_name: trader?.name ?? 'Unknown',
      asset,
      direction,
      size_usd: config.min_position_size_usd,
    },
  });
}

// ---------------------------------------------------------------------------
// Participation loop
// ---------------------------------------------------------------------------

export async function startParticipationLoop(
  lobby_id: string,
  round_id: string,
  config: ParticipationConfig = DEFAULT_PARTICIPATION_CONFIG,
): Promise<() => void> {
  const { supabase } = await import('./supabase');
  let stopped = false;

  const tick = async () => {
    if (stopped) return;

    // Check if round is still active
    const { data: round } = await supabase
      .from('rounds')
      .select('status')
      .eq('id', round_id)
      .single();

    if (!round || round.status !== 'active') {
      stopped = true;
      return;
    }

    // Get all active traders in lobby
    const { data: traders } = await supabase
      .from('traders')
      .select('id')
      .eq('lobby_id', lobby_id)
      .eq('is_eliminated', false);

    if (!traders || traders.length === 0) return;

    const statuses: ActivityStatus[] = [];

    for (const trader of traders) {
      const status = await checkParticipation(trader.id, lobby_id, round_id, config);
      statuses.push(status);

      // Send personal status update
      const traderChannel = supabase.channel(`trader-${trader.id}`);
      await traderChannel.send({
        type: 'broadcast',
        event: 'activity_update',
        payload: { type: 'activity_update', ...status },
      });

      // Execute forced trade on critical
      if (status.status === 'critical' && config.auto_trade_on_violation) {
        await executeForcedTrade(trader.id, lobby_id, round_id, config);
      }
    }

    // Broadcast all statuses to leaderboard
    const leaderboardChannel = supabase.channel(`lobby-${lobby_id}-leaderboard`);
    await leaderboardChannel.send({
      type: 'broadcast',
      event: 'activity_status_update',
      payload: { type: 'activity_status_update', statuses },
    });
  };

  const intervalId = setInterval(tick, 10_000);
  // Run immediately
  tick();

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}

// ---------------------------------------------------------------------------
// Score multiplier application
// ---------------------------------------------------------------------------

export async function applyScoreMultiplier(
  base_pnl_pct: number,
  trader_id: string,
  lobby_id: string,
  round_id: string,
  config: ParticipationConfig = DEFAULT_PARTICIPATION_CONFIG,
): Promise<number> {
  const status = await checkParticipation(trader_id, lobby_id, round_id, config);
  return base_pnl_pct * status.score_multiplier;
}
