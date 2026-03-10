import { NextRequest, NextResponse } from 'next/server';
import {
  getPackage,
  totalCredits,
  createStripeCheckout,
  createCoinbaseCharge,
  recordPurchase,
  type PaymentMethod,
} from '@/lib/payments';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lobbyId } = await params;

  let body: { package_id: string; payment_method: PaymentMethod; trader_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { package_id, payment_method, trader_id } = body;

  if (!package_id || !payment_method || !trader_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const pkg = getPackage(package_id);
  if (!pkg) {
    return NextResponse.json({ error: 'Invalid package' }, { status: 400 });
  }

  if (payment_method !== 'stripe' && payment_method !== 'coinbase_commerce') {
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
  }

  const credits = totalCredits(pkg);
  const origin = request.nextUrl.origin;

  try {
    if (payment_method === 'stripe') {
      const { url, session_id } = await createStripeCheckout({
        package_id,
        trader_id,
        lobby_id: lobbyId,
        success_url: `${origin}/lobby/${lobbyId}?purchase=success`,
        cancel_url: `${origin}/lobby/${lobbyId}?purchase=cancelled`,
      });

      await recordPurchase({
        trader_id,
        lobby_id: lobbyId,
        package_id,
        credits_granted: credits,
        amount_usd_cents: pkg.price_usd,
        payment_method: 'stripe',
        payment_ref: session_id,
        status: 'pending',
      });

      return NextResponse.json({ url });
    }

    // Coinbase Commerce
    const charge = await createCoinbaseCharge({
      package_id,
      trader_id,
      lobby_id: lobbyId,
      redirect_url: `${origin}/lobby/${lobbyId}?purchase=success`,
    });

    await recordPurchase({
      trader_id,
      lobby_id: lobbyId,
      package_id,
      credits_granted: credits,
      amount_usd_cents: pkg.price_usd,
      payment_method: 'coinbase_commerce',
      payment_ref: charge.code,
      status: 'pending',
    });

    return NextResponse.json({ url: charge.hosted_url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Payment error';
    const { logger } = await import('@/lib/logger');
    logger.error('Credit purchase failed', { route: '/api/lobby/[id]/credits/purchase' }, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
