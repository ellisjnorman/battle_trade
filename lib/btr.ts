// ---------------------------------------------------------------------------
// Battle Trade Rating (BTR) — composite score for global ranking (0–2000)
// ---------------------------------------------------------------------------

export interface BattleResult {
  id: string;
  lobby_id: string;
  profile_id: string;
  return_pct: number;
  won: boolean;
  max_drawdown_pct: number;       // negative number (e.g. -15 means -15%)
  asset_volatility: number;       // 30-day avg daily vol of primary asset traded
  created_at: string;             // ISO date
}

export interface BTRBreakdown {
  win_rate: number;               // 0–100
  sharpe: number;                 // 0–100
  consistency: number;            // 0–100
  avg_roi: number;                // 0–100
  max_drawdown: number;           // 0–100
  battle_count: number;           // 0–100
}

export interface BTRResult {
  btr: number;                    // 0–2000
  breakdown: BTRBreakdown;
}

// Component weights
const WEIGHT_WIN_RATE = 0.25;
const WEIGHT_SHARPE = 0.25;
const WEIGHT_CONSISTENCY = 0.20;
const WEIGHT_AVG_ROI = 0.15;
const WEIGHT_MAX_DRAWDOWN = 0.10;
const WEIGHT_BATTLE_COUNT = 0.05;

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - m;
    sumSq += d * d;
  }
  // population std dev — we want the actual spread, not a sample estimate
  return Math.sqrt(sumSq / values.length);
}

/** Sigmoid mapping: raw sharpe → 0–100. Centered at 0, saturates around ±3. */
function sigmoidNormalize(value: number): number {
  // 1 / (1 + e^(-k*x)) scaled to 0–100
  // k=2 gives nice spread: sharpe 0 → 50, sharpe 1.5 → ~95, sharpe -1.5 → ~5
  return 100 / (1 + Math.exp(-2 * value));
}

/** Clamp a number between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Component scorers
// ---------------------------------------------------------------------------

function scoreWinRate(battles: BattleResult[]): number {
  if (battles.length === 0) return 0;
  const wins = battles.filter((b) => b.won).length;
  return (wins / battles.length) * 100;
}

function scoreSharpe(battles: BattleResult[]): number {
  if (battles.length < 2) return 50; // neutral with insufficient data
  const returns = battles.map((b) => b.return_pct);
  const m = mean(returns);
  const sd = stddev(returns);
  if (sd === 0) return m >= 0 ? 100 : 0;
  const rawSharpe = m / sd;
  return sigmoidNormalize(rawSharpe);
}

function scoreConsistency(battles: BattleResult[]): number {
  if (battles.length < 2) return 100; // perfect consistency with one battle
  const returns = battles.map((b) => b.return_pct);
  const sd = stddev(returns);
  return Math.max(0, 100 - Math.min(sd * 2, 100));
}

function scoreAvgRoi(battles: BattleResult[]): number {
  if (battles.length === 0) return 0;
  // Cap each battle return to ±50% before averaging
  const capped = battles.map((b) => clamp(b.return_pct, -50, 50));
  const avg = mean(capped);

  // Volatility-adjust: scale by inverse of avg asset volatility
  const avgVol = mean(battles.map((b) => b.asset_volatility));
  const volMultiplier = avgVol > 0 ? 1 / (1 + avgVol) : 1;
  const adjusted = avg * volMultiplier;

  // Map adjusted avg from [-50, 50] → [0, 100]
  return clamp((adjusted + 50) * (100 / 100), 0, 100);
}

function scoreMaxDrawdown(battles: BattleResult[]): number {
  if (battles.length === 0) return 100;
  // Worst single-battle drawdown (most negative number)
  const worstDrawdown = Math.min(...battles.map((b) => b.max_drawdown_pct));
  // -0% → 100, -100% → 0
  return clamp(100 + worstDrawdown, 0, 100);
}

function scoreBattleCount(battles: BattleResult[]): number {
  return Math.min(battles.length / 50, 1) * 100;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the full BTR breakdown for a set of battle results.
 * Each component is scored on a 0–100 scale.
 */
export function getBTRBreakdown(battles: BattleResult[]): BTRBreakdown {
  return {
    win_rate: scoreWinRate(battles),
    sharpe: scoreSharpe(battles),
    consistency: scoreConsistency(battles),
    avg_roi: scoreAvgRoi(battles),
    max_drawdown: scoreMaxDrawdown(battles),
    battle_count: scoreBattleCount(battles),
  };
}

/**
 * Calculate the composite BTR score (0–2000) from battle results.
 */
export function calculateBTR(battles: BattleResult[]): number {
  if (battles.length === 0) return 0;

  const b = getBTRBreakdown(battles);

  const weightedSum =
    b.win_rate * WEIGHT_WIN_RATE +
    b.sharpe * WEIGHT_SHARPE +
    b.consistency * WEIGHT_CONSISTENCY +
    b.avg_roi * WEIGHT_AVG_ROI +
    b.max_drawdown * WEIGHT_MAX_DRAWDOWN +
    b.battle_count * WEIGHT_BATTLE_COUNT;

  // weightedSum is 0–100 → scale to 0–2000
  return Math.round((weightedSum / 100) * 2000);
}

/**
 * Apply inactivity decay to a BTR score.
 * After 30 days with no battle, decays 3% per additional week.
 * Minimum score after decay: 0.
 */
export function applyDecay(btr: number, lastBattleDate: Date): number {
  const now = new Date();
  const msPerDay = 86_400_000;
  const daysSinceLast = (now.getTime() - lastBattleDate.getTime()) / msPerDay;

  if (daysSinceLast <= 30) return btr;

  const daysOverThreshold = daysSinceLast - 30;
  const weeksOverThreshold = Math.floor(daysOverThreshold / 7);

  if (weeksOverThreshold <= 0) return btr;

  // Compound decay: btr * (1 - 0.03)^weeks
  const decayFactor = Math.pow(0.97, weeksOverThreshold);
  return Math.max(0, Math.round(btr * decayFactor));
}

/**
 * A player needs at least 10 completed battles to appear on the leaderboard.
 */
export function qualifiesForLeaderboard(battles: BattleResult[]): boolean {
  return battles.length >= 10;
}

/**
 * Copy trading eligibility:
 * - Top 20 in global rank
 * - 20+ completed battles
 * - Worst single-battle max drawdown no worse than -15%
 */
export function qualifiesForCopyTrading(
  btr: number,
  rank: number,
  battles: BattleResult[],
): boolean {
  if (rank > 20) return false;
  if (battles.length < 20) return false;

  const worstDrawdown = Math.min(...battles.map((b) => b.max_drawdown_pct));
  // "max drawdown < -15%" means the worst drawdown must be no worse than -15%
  if (worstDrawdown < -15) return false;

  return true;
}
