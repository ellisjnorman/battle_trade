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

  // Atomic deduct via sabotage module (uses RPC with CAS fallback)
  const { deductCredits } = await import('./sabotage');
  const deducted = await deductCredits(opts.trader_id, opts.lobby_id, fee);
  if (!deducted) {
    // Check balance for error message
    const { data: alloc } = await supabase
      .from('credit_allocations')
      .select('balance')
      .eq('trader_id', opts.trader_id)
      .eq('lobby_id', opts.lobby_id)
      .single();
    const balance = alloc?.balance ?? 0;
    return { charged: false, error: `Not enough credits. Need ${fee}CR, have ${balance}CR.` };
  }

  // Add to pot atomically
  const rakePct = getEntryRakePct(opts.config);
  const rake = Math.round(fee * rakePct / 100);
  const prizeContribution = fee - rake;

  // Try atomic RPC first, fallback to upsert
  const { error: rpcErr } = await supabase.rpc('add_to_pot', {
    p_lobby_id: opts.lobby_id,
    p_fee: fee,
    p_rake: rake,
    p_prize: prizeContribution,
  });

  if (rpcErr) {
    // Fallback: upsert
    await supabase
      .from('entry_fee_pots')
      .upsert({
        lobby_id: opts.lobby_id,
        total_collected: fee,
        total_entries: 1,
        rake_collected: rake,
        prize_pool: prizeContribution,
      }, { onConflict: 'lobby_id' });
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

    // Credit the winner atomically
    const { addCredits } = await import('./sabotage');
    await addCredits(winner.trader_id, opts.lobby_id, amount, 'prize_payout');

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
