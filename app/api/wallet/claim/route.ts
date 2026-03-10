import { NextRequest, NextResponse } from 'next/server';
import { claimPrize } from '@/lib/wallet-connect';

/**
 * POST /api/wallet/claim
 * Claim prize winnings — converts credits to USDC sent to wallet.
 *
 * Body: { wallet_address: string, amount: number, lobby_id: string, profile_id: string, chain?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet_address, amount, lobby_id, profile_id, chain } = body;

    if (!wallet_address || typeof wallet_address !== 'string') {
      return NextResponse.json({ error: 'wallet_address required' }, { status: 400 });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number (USDC)' }, { status: 400 });
    }
    if (!lobby_id || typeof lobby_id !== 'string') {
      return NextResponse.json({ error: 'lobby_id required' }, { status: 400 });
    }
    if (!profile_id || typeof profile_id !== 'string') {
      return NextResponse.json({ error: 'profile_id required' }, { status: 400 });
    }

    const result = await claimPrize({
      walletAddress: wallet_address,
      amount,
      lobbyId: lobby_id,
      profileId: profile_id,
      chain,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      tx_hash: result.tx_hash,
    });
  } catch (err) {
    console.error('POST /api/wallet/claim error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
