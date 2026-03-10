import { NextRequest, NextResponse } from 'next/server';
import { verifyWalletOwnership } from '@/lib/wallet-connect';

/**
 * POST /api/wallet/verify
 * Verify wallet ownership by checking a signed message.
 *
 * Body: { address: string, signature: string, message: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, signature, message } = body;

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'address required' }, { status: 400 });
    }
    if (!signature || typeof signature !== 'string') {
      return NextResponse.json({ error: 'signature required' }, { status: 400 });
    }
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const verified = await verifyWalletOwnership({ address, signature, message });

    return NextResponse.json({ verified });
  } catch (err) {
    console.error('POST /api/wallet/verify error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
