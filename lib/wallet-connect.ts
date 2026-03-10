/**
 * Wallet integration layer for Battle Trade.
 *
 * Connects Privy-linked wallets to game mechanics:
 * - Deposit USDC → receive in-game credits
 * - Claim prize winnings → withdraw to wallet
 * - Verify wallet ownership via signed message
 *
 * Currently implemented as database records (paper mode).
 * On-chain execution can be swapped in by replacing the
 * `executOnChainDeposit` / `executeOnChainClaim` stubs below.
 */

import { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1 USDC = 100 credits (same rate as Stripe $1 = 100 credits) */
export const USDC_TO_CREDITS_RATE = 100;

/** Platform wallet address — deposits go here (placeholder for now) */
export const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS ?? '0x0000000000000000000000000000000000000000';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletTransaction {
  id?: string;
  profile_id: string;
  wallet_address: string;
  type: 'deposit' | 'claim' | 'withdraw';
  amount: number;           // USDC amount
  credits_amount: number;   // credits equivalent
  chain: string;
  tx_hash: string | null;
  status: 'pending' | 'completed' | 'failed';
  created_at?: string;
}

export interface DepositResult {
  success: boolean;
  credits_added: number;
  tx_hash?: string;
  error?: string;
}

export interface ClaimResult {
  success: boolean;
  tx_hash?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// On-chain stubs (swap these for real implementations)
// ---------------------------------------------------------------------------

/**
 * STUB: Execute on-chain USDC transfer from user → platform.
 * In production, this would interact with the USDC contract on the
 * user's chain (Ethereum mainnet, Base, Solana, etc.).
 *
 * For now, returns a mock tx hash to simulate success.
 */
async function executeOnChainDeposit(_opts: {
  walletAddress: string;
  amount: number;
  chain: string;
}): Promise<{ tx_hash: string }> {
  // TODO: Replace with real on-chain execution via ethers.js / @solana/web3.js
  const mockHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
  return { tx_hash: mockHash };
}

/**
 * STUB: Execute on-chain USDC transfer from platform → winner.
 * In production, this would send USDC from the platform wallet
 * to the winner's address.
 */
async function executeOnChainClaim(_opts: {
  walletAddress: string;
  amount: number;
  chain: string;
}): Promise<{ tx_hash: string }> {
  // TODO: Replace with real on-chain execution
  const mockHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
  return { tx_hash: mockHash };
}

// ---------------------------------------------------------------------------
// Deposit credits via wallet
// ---------------------------------------------------------------------------

/**
 * Deposit USDC from a linked wallet and receive in-game credits.
 * Records the transaction and credits the profile.
 */
export async function depositCredits(opts: {
  walletAddress: string;
  amount: number;       // USDC amount
  profileId: string;
  chain?: string;
}): Promise<DepositResult> {
  if (opts.amount <= 0) {
    return { success: false, credits_added: 0, error: 'Amount must be positive' };
  }

  const chain = opts.chain ?? 'ethereum';
  const creditsToAdd = Math.round(opts.amount * USDC_TO_CREDITS_RATE);

  const { supabase } = await import('./supabase');

  // 1. Record pending transaction
  const { data: tx, error: txErr } = await supabase
    .from('wallet_transactions')
    .insert({
      profile_id: opts.profileId,
      wallet_address: opts.walletAddress,
      type: 'deposit',
      amount: opts.amount,
      credits_amount: creditsToAdd,
      chain,
      status: 'pending',
    })
    .select('id')
    .single();

  if (txErr || !tx) {
    console.error('depositCredits: failed to record tx', txErr?.message);
    return { success: false, credits_added: 0, error: 'Failed to record transaction' };
  }

  // 2. Execute on-chain deposit (stub for now)
  let txHash: string;
  try {
    const result = await executeOnChainDeposit({
      walletAddress: opts.walletAddress,
      amount: opts.amount,
      chain,
    });
    txHash = result.tx_hash;
  } catch (err) {
    // Mark failed
    await supabase
      .from('wallet_transactions')
      .update({ status: 'failed' })
      .eq('id', tx.id);
    return { success: false, credits_added: 0, error: 'On-chain deposit failed' };
  }

  // 3. Credit the profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', opts.profileId)
    .single();

  const currentCredits = (profile?.credits as number) ?? 0;

  await supabase
    .from('profiles')
    .update({ credits: currentCredits + creditsToAdd })
    .eq('id', opts.profileId);

  // 4. Mark transaction completed
  await supabase
    .from('wallet_transactions')
    .update({ status: 'completed', tx_hash: txHash })
    .eq('id', tx.id);

  return { success: true, credits_added: creditsToAdd, tx_hash: txHash };
}

// ---------------------------------------------------------------------------
// Claim prize to wallet
// ---------------------------------------------------------------------------

/**
 * Claim prize winnings — converts credits to USDC and sends to wallet.
 * Checks that the profile has enough credits, deducts them, and
 * records the outbound transaction.
 */
export async function claimPrize(opts: {
  walletAddress: string;
  amount: number;       // USDC amount to claim
  lobbyId: string;
  profileId: string;
  chain?: string;
}): Promise<ClaimResult> {
  if (opts.amount <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }

  const chain = opts.chain ?? 'ethereum';
  const creditsToDeduct = Math.round(opts.amount * USDC_TO_CREDITS_RATE);

  const { supabase } = await import('./supabase');

  // 1. Check credit balance
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', opts.profileId)
    .single();

  const currentCredits = (profile?.credits as number) ?? 0;
  if (currentCredits < creditsToDeduct) {
    return { success: false, error: `Insufficient credits. Need ${creditsToDeduct}, have ${currentCredits}.` };
  }

  // 2. Record pending transaction
  const { data: tx, error: txErr } = await supabase
    .from('wallet_transactions')
    .insert({
      profile_id: opts.profileId,
      wallet_address: opts.walletAddress,
      type: 'claim',
      amount: opts.amount,
      credits_amount: creditsToDeduct,
      chain,
      status: 'pending',
    })
    .select('id')
    .single();

  if (txErr || !tx) {
    console.error('claimPrize: failed to record tx', txErr?.message);
    return { success: false, error: 'Failed to record transaction' };
  }

  // 3. Deduct credits first (optimistic — refund on failure)
  await supabase
    .from('profiles')
    .update({ credits: currentCredits - creditsToDeduct })
    .eq('id', opts.profileId);

  // 4. Execute on-chain claim (stub for now)
  let txHash: string;
  try {
    const result = await executeOnChainClaim({
      walletAddress: opts.walletAddress,
      amount: opts.amount,
      chain,
    });
    txHash = result.tx_hash;
  } catch (err) {
    // Refund credits on failure
    await supabase
      .from('profiles')
      .update({ credits: currentCredits })
      .eq('id', opts.profileId);
    await supabase
      .from('wallet_transactions')
      .update({ status: 'failed' })
      .eq('id', tx.id);
    return { success: false, error: 'On-chain claim failed' };
  }

  // 5. Mark completed
  await supabase
    .from('wallet_transactions')
    .update({ status: 'completed', tx_hash: txHash })
    .eq('id', tx.id);

  return { success: true, tx_hash: txHash };
}

// ---------------------------------------------------------------------------
// Verify wallet ownership
// ---------------------------------------------------------------------------

/**
 * Verify that a user owns a wallet by checking a signed message.
 * Uses ethers v6 `verifyMessage` for EVM wallets.
 */
export async function verifyWalletOwnership(opts: {
  address: string;
  signature: string;
  message: string;
}): Promise<boolean> {
  try {
    const recovered = ethers.verifyMessage(opts.message, opts.signature);
    return recovered.toLowerCase() === opts.address.toLowerCase();
  } catch {
    return false;
  }
}
