import { NextRequest, NextResponse } from 'next/server';
import { verifyCoinbaseWebhook, completePurchase, failPurchase } from '@/lib/payments';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-cc-webhook-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const payload = await request.text();

  if (!verifyCoinbaseWebhook(payload, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let body;
  try {
    body = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = body?.event?.type;
  const code = body?.event?.data?.code;

  if (!code) {
    return NextResponse.json({ received: true });
  }

  switch (eventType) {
    case 'charge:confirmed':
    case 'charge:resolved': {
      const ok = await completePurchase(code);
      if (!ok) {
        logger.error('completePurchase failed', { route: '/api/webhooks/coinbase', code, eventType });
      }
      break;
    }
    case 'charge:failed': {
      const ok = await failPurchase(code, 'charge_failed');
      if (!ok) {
        logger.error('failPurchase failed', { route: '/api/webhooks/coinbase', code, eventType });
      }
      break;
    }
    case 'charge:expired': {
      const ok = await failPurchase(code, 'charge_expired');
      if (!ok) {
        logger.error('failPurchase failed', { route: '/api/webhooks/coinbase', code, eventType });
      }
      break;
    }
    default:
      logger.debug(`Unhandled Coinbase event: ${eventType}`, { route: '/api/webhooks/coinbase' });
  }

  return NextResponse.json({ received: true });
}
