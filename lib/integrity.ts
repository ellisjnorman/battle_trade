// ---------------------------------------------------------------------------
// Anti-Gaming & Integrity Engine
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrityCheck {
  passed: boolean;
  violations: IntegrityViolation[];
}

export interface IntegrityViolation {
  type:
    | 'leverage_cap'
    | 'rank_distance'
    | 'wash_trading'
    | 'multi_account'
    | 'selective_history';
  severity: 'warning' | 'block' | 'ban';
  message: string;
  details: Record<string, unknown>;
}

export interface TradePattern {
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  timestamp: string;
}

export interface AccountFingerprint {
  profile_id: string;
  ip_addresses: string[];
  device_ids: string[];
  wallet_addresses: string[];
  email_domain: string | null;
}

export interface HistoryTrade {
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  pnl: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// 1. Leverage Cap
// ---------------------------------------------------------------------------

export function checkLeverageCap(
  leverage: number,
  maxAllowed: number = 10,
): { capped: boolean; effective_leverage: number } {
  if (leverage > maxAllowed) {
    return { capped: true, effective_leverage: maxAllowed };
  }
  return { capped: false, effective_leverage: leverage };
}

// ---------------------------------------------------------------------------
// 2. Rank Distance (BTR proximity for duels)
// ---------------------------------------------------------------------------

export function checkRankDistance(
  challengerBtr: number,
  opponentBtr: number,
  maxDistance: number = 200,
): IntegrityCheck {
  const distance = Math.abs(challengerBtr - opponentBtr);

  if (distance > maxDistance) {
    return {
      passed: false,
      violations: [
        {
          type: 'rank_distance',
          severity: 'block',
          message: `BTR distance ${distance} exceeds max allowed ${maxDistance}. Duel will not count toward rankings.`,
          details: {
            challenger_btr: challengerBtr,
            opponent_btr: opponentBtr,
            distance,
            max_distance: maxDistance,
          },
        },
      ],
    };
  }

  return { passed: true, violations: [] };
}

// ---------------------------------------------------------------------------
// 3. Wash Trading Detection
// ---------------------------------------------------------------------------

const WASH_TIME_WINDOW_MS = 2000; // 2 seconds
const WASH_PRICE_TOLERANCE = 0.001; // 0.1%
const WASH_WIN_RATE_THRESHOLD = 0.9; // 90%

export function detectWashTrading(
  trades1: TradePattern[],
  trades2: TradePattern[],
): IntegrityCheck {
  const violations: IntegrityViolation[] = [];

  // --- Check 1: Mirrored trades (identical symbol, quantity, near-identical price, within 2s) ---
  const mirroredPairs: Array<{ trade1: TradePattern; trade2: TradePattern }> = [];

  for (const t1 of trades1) {
    for (const t2 of trades2) {
      if (t1.symbol !== t2.symbol) continue;

      const timeDiff = Math.abs(
        new Date(t1.timestamp).getTime() - new Date(t2.timestamp).getTime(),
      );
      if (timeDiff > WASH_TIME_WINDOW_MS) continue;

      if (t1.quantity !== t2.quantity) continue;

      const priceDiff = Math.abs(t1.price - t2.price) / Math.max(t1.price, t2.price);
      if (priceDiff > WASH_PRICE_TOLERANCE) continue;

      // Opposite sides (one buys, one sells)
      if (t1.side === t2.side) continue;

      mirroredPairs.push({ trade1: t1, trade2: t2 });
    }
  }

  if (mirroredPairs.length > 0) {
    // More than 3 mirrored pairs is a ban, otherwise warning
    const severity = mirroredPairs.length > 3 ? 'ban' : 'warning';
    violations.push({
      type: 'wash_trading',
      severity,
      message: `Detected ${mirroredPairs.length} mirrored trade pair(s): same symbol, opposite sides, matching quantity, within 2s and 0.1% price.`,
      details: {
        mirrored_count: mirroredPairs.length,
        samples: mirroredPairs.slice(0, 5).map((p) => ({
          symbol: p.trade1.symbol,
          time_diff_ms: Math.abs(
            new Date(p.trade1.timestamp).getTime() -
              new Date(p.trade2.timestamp).getTime(),
          ),
          price1: p.trade1.price,
          price2: p.trade2.price,
          quantity: p.trade1.quantity,
        })),
      },
    });
  }

  // --- Check 2: One-sided win pattern (>90% of duels between same two players) ---
  // We approximate this by checking if one side's trades are consistently profitable
  // relative to the other (buy low / sell high pattern)
  const pairings: Array<{ t1_profit: boolean }> = [];
  for (const t1 of trades1) {
    for (const t2 of trades2) {
      if (t1.symbol !== t2.symbol) continue;
      if (t1.side === t2.side) continue;

      const timeDiff = Math.abs(
        new Date(t1.timestamp).getTime() - new Date(t2.timestamp).getTime(),
      );
      // Wider window for pattern analysis
      if (timeDiff > 60_000) continue;

      // Did trader 1 buy lower or sell higher?
      const t1IsBuyer = t1.side === 'buy' || t1.side === 'long';
      const t1Profit = t1IsBuyer ? t1.price < t2.price : t1.price > t2.price;
      pairings.push({ t1_profit: t1Profit });
    }
  }

  if (pairings.length >= 5) {
    const t1Wins = pairings.filter((p) => p.t1_profit).length;
    const t1WinRate = t1Wins / pairings.length;
    const dominantWinRate = Math.max(t1WinRate, 1 - t1WinRate);

    if (dominantWinRate > WASH_WIN_RATE_THRESHOLD) {
      violations.push({
        type: 'wash_trading',
        severity: 'ban',
        message: `One trader wins ${(dominantWinRate * 100).toFixed(1)}% of ${pairings.length} paired trades — suspected collusion.`,
        details: {
          total_pairings: pairings.length,
          dominant_win_rate: dominantWinRate,
          threshold: WASH_WIN_RATE_THRESHOLD,
        },
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

// ---------------------------------------------------------------------------
// 4. Multi-Account Detection
// ---------------------------------------------------------------------------

const SHARED_IP_THRESHOLD = 3;

export function detectMultiAccount(
  fingerprints: AccountFingerprint[],
): IntegrityCheck {
  const violations: IntegrityViolation[] = [];

  if (fingerprints.length < 2) {
    return { passed: true, violations: [] };
  }

  // Build pairwise comparisons
  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      const a = fingerprints[i];
      const b = fingerprints[j];

      // --- Shared wallet addresses → instant ban ---
      const sharedWallets = a.wallet_addresses.filter((w) =>
        b.wallet_addresses.includes(w),
      );
      if (sharedWallets.length > 0) {
        violations.push({
          type: 'multi_account',
          severity: 'ban',
          message: `Accounts ${a.profile_id} and ${b.profile_id} share ${sharedWallets.length} wallet address(es). Instant ban.`,
          details: {
            profile_a: a.profile_id,
            profile_b: b.profile_id,
            shared_wallets: sharedWallets,
          },
        });
      }

      // --- Shared device IDs → block ---
      const sharedDevices = a.device_ids.filter((d) => b.device_ids.includes(d));
      if (sharedDevices.length > 0) {
        violations.push({
          type: 'multi_account',
          severity: 'block',
          message: `Accounts ${a.profile_id} and ${b.profile_id} share ${sharedDevices.length} device ID(s).`,
          details: {
            profile_a: a.profile_id,
            profile_b: b.profile_id,
            shared_device_count: sharedDevices.length,
          },
        });
      }

      // --- Shared IPs (>3) → warning (could be VPN/school) ---
      const sharedIPs = a.ip_addresses.filter((ip) => b.ip_addresses.includes(ip));
      if (sharedIPs.length > SHARED_IP_THRESHOLD) {
        violations.push({
          type: 'multi_account',
          severity: 'warning',
          message: `Accounts ${a.profile_id} and ${b.profile_id} share ${sharedIPs.length} IP addresses (threshold: ${SHARED_IP_THRESHOLD}).`,
          details: {
            profile_a: a.profile_id,
            profile_b: b.profile_id,
            shared_ip_count: sharedIPs.length,
            shared_ips: sharedIPs,
          },
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

// ---------------------------------------------------------------------------
// 5. History Import Validation
// ---------------------------------------------------------------------------

const MIN_HISTORY_SPAN_DAYS = 90;
const MIN_TRADE_COUNT = 50;
const MAX_GAP_DAYS = 30;
const MIN_SYMBOLS = 3;

export function validateHistoryImport(
  trades: HistoryTrade[],
  accountCreatedAt: string,
): IntegrityCheck {
  const violations: IntegrityViolation[] = [];
  const now = new Date();

  if (trades.length < MIN_TRADE_COUNT) {
    violations.push({
      type: 'selective_history',
      severity: 'block',
      message: `Only ${trades.length} trades provided — minimum ${MIN_TRADE_COUNT} required.`,
      details: { trade_count: trades.length, minimum: MIN_TRADE_COUNT },
    });
  }

  if (trades.length === 0) {
    return { passed: false, violations };
  }

  // Check chronological ordering
  const timestamps = trades.map((t) => new Date(t.timestamp).getTime());
  let isOrdered = true;
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] < timestamps[i - 1]) {
      isOrdered = false;
      break;
    }
  }
  if (!isOrdered) {
    violations.push({
      type: 'selective_history',
      severity: 'block',
      message: 'Trade history is not in chronological order — possible manipulation.',
      details: {},
    });
  }

  // Check for future-dated trades
  const futureTrades = trades.filter(
    (t) => new Date(t.timestamp).getTime() > now.getTime(),
  );
  if (futureTrades.length > 0) {
    violations.push({
      type: 'selective_history',
      severity: 'ban',
      message: `Found ${futureTrades.length} trade(s) with future timestamps.`,
      details: {
        future_count: futureTrades.length,
        first_future: futureTrades[0].timestamp,
      },
    });
  }

  // Check time span (min 90 days)
  const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
  const earliest = sortedTimestamps[0];
  const latest = sortedTimestamps[sortedTimestamps.length - 1];
  const spanDays = (latest - earliest) / (1000 * 60 * 60 * 24);

  if (spanDays < MIN_HISTORY_SPAN_DAYS) {
    violations.push({
      type: 'selective_history',
      severity: 'block',
      message: `Trade history spans ${spanDays.toFixed(1)} days — minimum ${MIN_HISTORY_SPAN_DAYS} days required.`,
      details: {
        span_days: spanDays,
        minimum: MIN_HISTORY_SPAN_DAYS,
        earliest: new Date(earliest).toISOString(),
        latest: new Date(latest).toISOString(),
      },
    });
  }

  // Check for gaps > 30 days (cherry-picking indicator)
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const gaps: Array<{ from: string; to: string; days: number }> = [];
  for (let i = 1; i < sortedTrades.length; i++) {
    const prevTime = new Date(sortedTrades[i - 1].timestamp).getTime();
    const currTime = new Date(sortedTrades[i].timestamp).getTime();
    const gapDays = (currTime - prevTime) / (1000 * 60 * 60 * 24);
    if (gapDays > MAX_GAP_DAYS) {
      gaps.push({
        from: sortedTrades[i - 1].timestamp,
        to: sortedTrades[i].timestamp,
        days: Math.round(gapDays),
      });
    }
  }

  if (gaps.length > 0) {
    violations.push({
      type: 'selective_history',
      severity: 'warning',
      message: `Found ${gaps.length} gap(s) exceeding ${MAX_GAP_DAYS} days — possible cherry-picking of profitable periods.`,
      details: { gaps, max_gap_days: MAX_GAP_DAYS },
    });
  }

  // Check symbol diversity (min 3 different symbols)
  const uniqueSymbols = new Set(trades.map((t) => t.symbol));
  if (uniqueSymbols.size < MIN_SYMBOLS) {
    violations.push({
      type: 'selective_history',
      severity: 'warning',
      message: `Only ${uniqueSymbols.size} unique symbol(s) traded — minimum ${MIN_SYMBOLS} required to prevent single-asset farming.`,
      details: {
        symbol_count: uniqueSymbols.size,
        symbols: Array.from(uniqueSymbols),
        minimum: MIN_SYMBOLS,
      },
    });
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

// ---------------------------------------------------------------------------
// 6. BTR Decay for Inactivity
// ---------------------------------------------------------------------------

const DECAY_GRACE_DAYS = 30;
const DECAY_RATE_PER_WEEK = 0.03; // 3%
const DECAY_FLOOR = 100;

export function enforceDecay(
  btrScore: number,
  lastBattleAt: Date,
  now?: Date,
): { decayed_btr: number; weeks_inactive: number; is_decaying: boolean } {
  const current = now ?? new Date();
  const msSinceLastBattle = current.getTime() - lastBattleAt.getTime();
  const daysSinceLastBattle = msSinceLastBattle / (1000 * 60 * 60 * 24);

  if (daysSinceLastBattle <= DECAY_GRACE_DAYS) {
    return {
      decayed_btr: btrScore,
      weeks_inactive: 0,
      is_decaying: false,
    };
  }

  const daysIntoDecay = daysSinceLastBattle - DECAY_GRACE_DAYS;
  const weeksInactive = Math.floor(daysIntoDecay / 7);

  if (weeksInactive <= 0) {
    return {
      decayed_btr: btrScore,
      weeks_inactive: 0,
      is_decaying: false,
    };
  }

  // Compound decay: score * (1 - rate)^weeks
  const multiplier = Math.pow(1 - DECAY_RATE_PER_WEEK, weeksInactive);
  const decayedScore = Math.max(DECAY_FLOOR, Math.round(btrScore * multiplier));

  return {
    decayed_btr: decayedScore,
    weeks_inactive: weeksInactive,
    is_decaying: true,
  };
}

// ---------------------------------------------------------------------------
// 7. Duel Ranking Eligibility
// ---------------------------------------------------------------------------

const VALID_DUEL_DURATIONS = [15, 30, 60, 240];

export function canCountForRanking(duel: {
  challenger_btr: number;
  opponent_btr: number;
  duration_minutes: number;
}): boolean {
  const distance = Math.abs(duel.challenger_btr - duel.opponent_btr);
  if (distance > 200) return false;
  if (!VALID_DUEL_DURATIONS.includes(duel.duration_minutes)) return false;
  return true;
}
