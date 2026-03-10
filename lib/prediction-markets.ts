// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface PredictionMarket {
  id: string;
  lobby_id: string;
  round_id: string;
  question: string;
  outcomes: Outcome[];
  total_volume: number;
  status: 'open' | 'suspended' | 'resolved';
  provider: 'mock' | 'polymarket' | 'kalshi' | 'onchain';
}

export interface Outcome {
  id: string;
  team_id: string;
  team_name: string;
  probability: number;
  odds: number;
  volume: number;
}

export interface BetParams {
  bettor_id: string;
  market_id: string;
  outcome_id: string;
  amount_credits: number;
}

export interface BetResult {
  success: boolean;
  bet_id: string;
  credits_spent: number;
  potential_payout: number;
  new_balance: number;
}

export interface OddsSnapshot {
  outcome_id: string;
  odds: number;
  probability: number;
  recorded_at: string;
}

export interface MarketProvider {
  getMarket(id: string): Promise<PredictionMarket>;
  placeBet(params: BetParams): Promise<BetResult>;
  resolveMarket(id: string, winner_team_id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// NotImplementedError
// ---------------------------------------------------------------------------

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
  }
}

// ---------------------------------------------------------------------------
// MockProvider
// ---------------------------------------------------------------------------

export class MockProvider implements MarketProvider {
  async getMarket(id: string): Promise<PredictionMarket> {
    const { supabase } = await import('./supabase');

    const { data: market } = await supabase
      .from('prediction_markets')
      .select('*')
      .eq('id', id)
      .single();

    if (!market) throw new Error('Market not found');

    const { data: outcomes } = await supabase
      .from('market_outcomes')
      .select('*, teams(name)')
      .eq('market_id', id);

    return {
      id: market.id,
      lobby_id: market.lobby_id,
      round_id: market.round_id,
      question: market.question,
      total_volume: market.total_volume ?? 0,
      status: market.status ?? 'open',
      provider: market.provider ?? 'mock',
      outcomes: (outcomes ?? []).map((o: Record<string, unknown>) => ({
        id: o.id as string,
        team_id: o.team_id as string,
        team_name: (o.teams as Record<string, string>)?.name ?? 'Unknown',
        probability: Number(o.probability),
        odds: Number(o.odds),
        volume: Number(o.volume),
      })),
    };
  }

  async placeBet(params: BetParams): Promise<BetResult> {
    const { supabase } = await import('./supabase');
    const { bettor_id, market_id, outcome_id, amount_credits } = params;

    // Check market is open
    const { data: market } = await supabase
      .from('prediction_markets')
      .select('status')
      .eq('id', market_id)
      .single();

    if (!market || market.status !== 'open') {
      return { success: false, bet_id: '', credits_spent: 0, potential_payout: 0, new_balance: 0 };
    }

    // Get current odds
    const { data: outcome } = await supabase
      .from('market_outcomes')
      .select('odds, volume')
      .eq('id', outcome_id)
      .single();

    if (!outcome) {
      return { success: false, bet_id: '', credits_spent: 0, potential_payout: 0, new_balance: 0 };
    }

    const oddsAtPlacement = Number(outcome.odds);
    const potentialPayout = Math.round(amount_credits * oddsAtPlacement);

    // Deduct credits from bettor
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', bettor_id)
      .single();

    if (!profile || Number(profile.credits) < amount_credits) {
      return { success: false, bet_id: '', credits_spent: 0, potential_payout: 0, new_balance: 0 };
    }

    const newBalance = Number(profile.credits) - amount_credits;

    await supabase
      .from('profiles')
      .update({ credits: newBalance })
      .eq('id', bettor_id);

    // Place bet
    const { data: bet } = await supabase
      .from('bets')
      .insert({
        market_id,
        outcome_id,
        bettor_id,
        amount_credits,
        odds_at_placement: oddsAtPlacement,
        potential_payout: potentialPayout,
        status: 'pending',
      })
      .select()
      .single();

    // Update outcome volume
    const newVolume = Number(outcome.volume) + amount_credits;
    await supabase
      .from('market_outcomes')
      .update({ volume: newVolume, updated_at: new Date().toISOString() })
      .eq('id', outcome_id);

    // Update total market volume
    try {
      await supabase.rpc('increment_market_volume', {
        p_market_id: market_id,
        p_amount: amount_credits,
      });
    } catch {
      // Fallback: manually update if RPC not available
      const { data: m } = await supabase
        .from('prediction_markets')
        .select('total_volume')
        .eq('id', market_id)
        .single();

      if (m) {
        await supabase
          .from('prediction_markets')
          .update({ total_volume: (m.total_volume ?? 0) + amount_credits })
          .eq('id', market_id);
      }
    }

    // Recalculate all probabilities for this market
    await recalcProbabilities(market_id);

    return {
      success: true,
      bet_id: bet?.id ?? '',
      credits_spent: amount_credits,
      potential_payout: potentialPayout,
      new_balance: newBalance,
    };
  }

  async resolveMarket(id: string, winner_team_id: string): Promise<void> {
    const { supabase } = await import('./supabase');

    // Mark market as resolved
    await supabase
      .from('prediction_markets')
      .update({ status: 'resolved', resolved_team_id: winner_team_id })
      .eq('id', id);

    // Get winning outcome
    const { data: winningOutcome } = await supabase
      .from('market_outcomes')
      .select('id')
      .eq('market_id', id)
      .eq('team_id', winner_team_id)
      .single();

    if (!winningOutcome) return;

    // Get market to find lobby and rake config
    const { data: marketRow } = await supabase
      .from('prediction_markets')
      .select('lobby_id')
      .eq('id', id)
      .single();

    let rakePct = 10; // default 10%
    if (marketRow) {
      const { data: lobby } = await supabase
        .from('lobbies')
        .select('config')
        .eq('id', marketRow.lobby_id)
        .single();
      const cfg = lobby?.config as Record<string, unknown> | undefined;
      if (cfg?.prediction_rake_pct !== undefined) {
        rakePct = Number(cfg.prediction_rake_pct);
      }
    }

    // Get all bets for this market
    const { data: bets } = await supabase
      .from('bets')
      .select('*')
      .eq('market_id', id);

    let totalRake = 0;
    let totalPaid = 0;

    for (const bet of bets ?? []) {
      const won = bet.outcome_id === winningOutcome.id;
      await supabase
        .from('bets')
        .update({ status: won ? 'won' : 'lost' })
        .eq('id', bet.id);

      // Payout winners (minus rake)
      if (won && bet.potential_payout) {
        const grossPayout = Number(bet.potential_payout);
        const rake = Math.round(grossPayout * (rakePct / 100));
        const netPayout = grossPayout - rake;
        totalRake += rake;
        totalPaid += netPayout;

        const { data: profile } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', bet.bettor_id)
          .single();

        if (profile) {
          await supabase
            .from('profiles')
            .update({ credits: Number(profile.credits) + netPayout })
            .eq('id', bet.bettor_id);
        }

        // Update bet record with actual payout
        await supabase
          .from('bets')
          .update({ actual_payout: netPayout, rake_amount: rake })
          .eq('id', bet.id);
      }
    }

    // Record total rake on the market
    if (totalRake > 0) {
      await supabase
        .from('prediction_markets')
        .update({ total_rake: totalRake })
        .eq('id', id);
    }
  }
}

// ---------------------------------------------------------------------------
// PolymarketProvider — falls back to MockProvider until CLOB API is wired
// ---------------------------------------------------------------------------

export class PolymarketProvider implements MarketProvider {
  private fallback = new MockProvider();
  async getMarket(id: string): Promise<PredictionMarket> {
    console.warn('[PolymarketProvider] Using mock fallback — CLOB API not yet connected');
    return this.fallback.getMarket(id);
  }
  async placeBet(params: BetParams): Promise<BetResult> {
    return this.fallback.placeBet(params);
  }
  async resolveMarket(id: string, winner: string): Promise<void> {
    return this.fallback.resolveMarket(id, winner);
  }
}

// ---------------------------------------------------------------------------
// KalshiProvider — falls back to MockProvider until REST API is wired
// ---------------------------------------------------------------------------

export class KalshiProvider implements MarketProvider {
  private fallback = new MockProvider();
  async getMarket(id: string): Promise<PredictionMarket> {
    console.warn('[KalshiProvider] Using mock fallback — REST API not yet connected');
    return this.fallback.getMarket(id);
  }
  async placeBet(params: BetParams): Promise<BetResult> {
    return this.fallback.placeBet(params);
  }
  async resolveMarket(id: string, winner: string): Promise<void> {
    return this.fallback.resolveMarket(id, winner);
  }
}

// ---------------------------------------------------------------------------
// OnChainProvider — falls back to MockProvider until contract is deployed
// ---------------------------------------------------------------------------
// Target: Monad testnet (chainId 10143)
// Contract interface:
//   createMarket(roundId, teamIds, duration)
//   placeBet(marketId, outcomeId, amount)
//   resolveMarket(marketId, winnerOutcomeId)
//   claimWinnings(betId)

export class OnChainProvider implements MarketProvider {
  contractAddress: string;
  chainId: number;
  private fallback = new MockProvider();

  constructor(contractAddress: string = '0x0000000000000000000000000000000000000000', chainId: number = 10143) {
    this.contractAddress = contractAddress;
    this.chainId = chainId;
  }

  async getMarket(id: string): Promise<PredictionMarket> {
    console.warn(`[OnChainProvider] Using mock fallback — contract not deployed at ${this.contractAddress}`);
    return this.fallback.getMarket(id);
  }
  async placeBet(params: BetParams): Promise<BetResult> {
    return this.fallback.placeBet(params);
  }
  async resolveMarket(id: string, winner: string): Promise<void> {
    return this.fallback.resolveMarket(id, winner);
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function getProvider(type: 'mock' | 'polymarket' | 'kalshi' | 'onchain'): MarketProvider {
  switch (type) {
    case 'mock': return new MockProvider();
    case 'polymarket': return new PolymarketProvider();
    case 'kalshi': return new KalshiProvider();
    case 'onchain': return new OnChainProvider();
    default: return new MockProvider();
  }
}

// ---------------------------------------------------------------------------
// Market lifecycle functions
// ---------------------------------------------------------------------------

export async function createMarket(
  lobby_id: string,
  round_id: string,
  teams: Array<{ id: string; name: string }>,
): Promise<PredictionMarket> {
  const { supabase } = await import('./supabase');

  const { data: market, error } = await supabase
    .from('prediction_markets')
    .insert({
      lobby_id,
      round_id,
      question: `Which team wins Round?`,
      status: 'open',
      provider: 'mock',
      total_volume: 0,
    })
    .select()
    .single();

  if (error || !market) throw new Error(`Failed to create market: ${error?.message}`);

  const baseProbability = teams.length > 0 ? 1 / teams.length : 0.125;
  const baseOdds = teams.length > 0 ? Math.round(teams.length * 10) / 10 : 8;

  const outcomeRows = teams.map((team) => ({
    market_id: market.id,
    team_id: team.id,
    probability: baseProbability,
    odds: baseOdds,
    volume: 0,
  }));

  const { data: outcomes } = await supabase
    .from('market_outcomes')
    .insert(outcomeRows)
    .select();

  return {
    id: market.id,
    lobby_id,
    round_id,
    question: market.question,
    total_volume: 0,
    status: 'open',
    provider: 'mock',
    outcomes: (outcomes ?? []).map((o) => ({
      id: o.id,
      team_id: o.team_id,
      team_name: teams.find((t) => t.id === o.team_id)?.name ?? 'Unknown',
      probability: Number(o.probability),
      odds: Number(o.odds),
      volume: 0,
    })),
  };
}

export async function suspendMarket(market_id: string): Promise<void> {
  const { supabase } = await import('./supabase');
  await supabase
    .from('prediction_markets')
    .update({ status: 'suspended' })
    .eq('id', market_id);
}

export async function resumeMarket(market_id: string): Promise<void> {
  const { supabase } = await import('./supabase');
  await supabase
    .from('prediction_markets')
    .update({ status: 'open' })
    .eq('id', market_id);
}

export async function getOddsHistory(market_id: string): Promise<OddsSnapshot[]> {
  const { supabase } = await import('./supabase');
  const { data } = await supabase
    .from('odds_history')
    .select('*')
    .eq('market_id', market_id)
    .order('recorded_at', { ascending: true });

  return (data ?? []).map((row) => ({
    outcome_id: row.outcome_id,
    odds: Number(row.odds),
    probability: Number(row.probability),
    recorded_at: row.recorded_at,
  }));
}

// ---------------------------------------------------------------------------
// Probability recalculation
// ---------------------------------------------------------------------------

export async function recalcProbabilities(market_id: string): Promise<void> {
  const { supabase } = await import('./supabase');

  const { data: outcomes } = await supabase
    .from('market_outcomes')
    .select('*')
    .eq('market_id', market_id);

  if (!outcomes || outcomes.length === 0) return;

  const totalVolume = outcomes.reduce((sum, o) => sum + Number(o.volume), 0);

  for (const outcome of outcomes) {
    let probability: number;
    if (totalVolume === 0) {
      probability = 1 / outcomes.length;
    } else {
      // Volume-weighted probability with a base
      const volumeShare = Number(outcome.volume) / totalVolume;
      const baseProbability = 1 / outcomes.length;
      probability = baseProbability * 0.3 + volumeShare * 0.7;
    }

    const odds = probability > 0 ? Math.round((1 / probability) * 10) / 10 : 99;

    await supabase
      .from('market_outcomes')
      .update({ probability, odds, updated_at: new Date().toISOString() })
      .eq('id', outcome.id);

    // Record history
    await supabase.from('odds_history').insert({
      market_id,
      outcome_id: outcome.id,
      odds,
      probability,
    });
  }
}

// ---------------------------------------------------------------------------
// Mock odds derivation from standings
// ---------------------------------------------------------------------------

export function deriveOddsFromStandings(
  teams: Array<{ id: string; name: string; rank: number; returnPct: number }>,
  timeRemainingSeconds: number,
  totalRoundSeconds: number,
): Outcome[] {
  const totalTeams = teams.length;
  if (totalTeams === 0) return [];

  const timeWeight = 1 - (timeRemainingSeconds / totalRoundSeconds);

  // Normalize returns to 0-1
  const returns = teams.map((t) => t.returnPct);
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);
  const range = maxReturn - minReturn || 1;

  const rawProbs = teams.map((team) => {
    const rankScore = (totalTeams - team.rank + 1) / totalTeams;
    const returnScore = (team.returnPct - minReturn) / range;
    const randomFactor = 0.3 + Math.random() * 0.4;

    return (rankScore * 0.4) + (returnScore * 0.4) + (randomFactor * 0.2);
  });

  // Weight by time — early round uses more random, late round uses more data
  const weightedProbs = rawProbs.map((p) => {
    const base = 1 / totalTeams;
    return base * (1 - timeWeight) + p * timeWeight;
  });

  // Normalize to sum to 1.0
  const totalProb = weightedProbs.reduce((a, b) => a + b, 0);
  const normalized = weightedProbs.map((p) => p / totalProb);

  return teams.map((team, i) => ({
    id: `outcome_${team.id}`,
    team_id: team.id,
    team_name: team.name,
    probability: normalized[i],
    odds: Math.round((1 / normalized[i]) * 10) / 10,
    volume: 0,
  }));
}
