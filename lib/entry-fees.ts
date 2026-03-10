import type { LobbyConfig } from '@/types';

// ---------------------------------------------------------------------------
// Entry fee helpers
// ---------------------------------------------------------------------------

/** Returns 0 if no entry fee configured — IRL events can skip this entirely */
export function getEntryFee(config: LobbyConfig): number {
  return config.entry_fee ?? 0;
}

/** Platform rake percentage (default 20%) */
export function getEntryRakePct(config: LobbyConfig): number {
  return config.entry_rake_pct ?? 20;
}

/** Deduct entry fee from trader's credit balance and add to pot */
export async function chargeEntryFee(opts: {
  trader_id: string;
  lobby_id: string;
  config: LobbyConfig;
}): Promise<{ charged: boolean; error?: string }> {
  const fee = getEntryFee(opts.config);
  if (fee <= 0) return { charged: false }; // No fee — IRL / free lobby

  const { supabase } = await import('./supabase');

  // Check trader's credit balance
  const { data: alloc } = await supabase
    .from('credit_allocations')
    .select('balance, total_spent')
    .eq('trader_id', opts.trader_id)
    .eq('lobby_id', opts.lobby_id)
    .single();

  const balance = alloc?.balance ?? 0;
  if (balance < fee) {
    return { charged: false, error: `Not enough credits. Need ${fee}CR, have ${balance}CR.` };
  }

  // Deduct from trader
  const prevSpent = (alloc?.total_spent as number) ?? 0;
  await supabase
    .from('credit_allocations')
    .update({
      balance: balance - fee,
      total_spent: prevSpent + fee,
    })
    .eq('trader_id', opts.trader_id)
    .eq('lobby_id', opts.lobby_id);

  // Add to pot
  const rakePct = getEntryRakePct(opts.config);
  const rake = Math.round(fee * rakePct / 100);
  const prizeContribution = fee - rake;

  const { data: pot } = await supabase
    .from('entry_fee_pots')
    .select('*')
    .eq('lobby_id', opts.lobby_id)
    .single();

  if (pot) {
    await supabase
      .from('entry_fee_pots')
      .update({
        total_collected: pot.total_collected + fee,
        total_entries: pot.total_entries + 1,
        rake_collected: pot.rake_collected + rake,
        prize_pool: pot.prize_pool + prizeContribution,
      })
      .eq('lobby_id', opts.lobby_id);
  } else {
    await supabase
      .from('entry_fee_pots')
      .insert({
        lobby_id: opts.lobby_id,
        total_collected: fee,
        total_entries: 1,
        rake_collected: rake,
        prize_pool: prizeContribution,
      });
  }

  return { charged: true };
}

/** Distribute prize pool to top finishers: 1st 60%, 2nd 25%, 3rd 15% */
export async function distributePrizePool(opts: {
  lobby_id: string;
  rankings: { trader_id: string; rank: number }[];
}): Promise<{ distributed: boolean; error?: string }> {
  const { supabase } = await import('./supabase');

  const { data: pot } = await supabase
    .from('entry_fee_pots')
    .select('*')
    .eq('lobby_id', opts.lobby_id)
    .eq('status', 'collecting')
    .single();

  if (!pot || pot.prize_pool <= 0) return { distributed: false, error: 'No prize pool' };

  const splits = [0.60, 0.25, 0.15];
  const winners = opts.rankings.filter(r => r.rank <= 3);

  for (const winner of winners) {
    const splitIdx = winner.rank - 1;
    const amount = Math.round(pot.prize_pool * (splits[splitIdx] ?? 0));
    if (amount <= 0) continue;

    // Credit the winner
    const { data: alloc } = await supabase
      .from('credit_allocations')
      .select('balance, total_earned')
      .eq('trader_id', winner.trader_id)
      .eq('lobby_id', opts.lobby_id)
      .single();

    if (alloc) {
      await supabase
        .from('credit_allocations')
        .update({
          balance: alloc.balance + amount,
          total_earned: alloc.total_earned + amount,
        })
        .eq('trader_id', winner.trader_id)
        .eq('lobby_id', opts.lobby_id);
    }

    // Record payout
    await supabase
      .from('entry_fee_payouts')
      .insert({
        lobby_id: opts.lobby_id,
        trader_id: winner.trader_id,
        amount,
        rank: winner.rank,
      });
  }

  // Mark pot as distributed
  await supabase
    .from('entry_fee_pots')
    .update({ status: 'distributed', distributed_at: new Date().toISOString() })
    .eq('lobby_id', opts.lobby_id);

  return { distributed: true };
}
