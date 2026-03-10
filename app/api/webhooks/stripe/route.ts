import { NextRequest, NextResponse } from 'next/server';
import { constructStripeEvent, completePurchase, failPurchase } from '@/lib/payments';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const payload = await request.text();

  let event;
  try {
    event = constructStripeEvent(payload, signature);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    logger.error('Stripe webhook verification failed', { route: '/api/webhooks/stripe' }, err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as { id: string };
      const ok = await completePurchase(session.id);
      if (!ok) {
        logger.error('completePurchase failed', { route: '/api/webhooks/stripe', sessionId: session.id });
      }
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object as { id: string };
      const ok = await failPurchase(session.id, 'session_expired');
      if (!ok) {
        logger.error('failPurchase failed', { route: '/api/webhooks/stripe', sessionId: session.id });
      }
      break;
    }
    default:
      // Ignore other events (payment_intent.*, etc.)
      break;
  }

  return NextResponse.json({ received: true });
}
