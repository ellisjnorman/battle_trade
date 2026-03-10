import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Credit packages
// ---------------------------------------------------------------------------

export interface CreditPackage {
  id: string;
  credits: number;
  price_usd: number;    // in cents
  label: string;
  bonus_pct: number;
  popular?: boolean;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'starter',   credits: 500,   price_usd: 100,  label: '500 CR',    bonus_pct: 0 },
  { id: 'fighter',   credits: 2000,  price_usd: 300,  label: '2,000 CR',  bonus_pct: 0, popular: true },
  { id: 'warrior',   credits: 5000,  price_usd: 500,  label: '5,000 CR',  bonus_pct: 20 },
  { id: 'legend',    credits: 15000, price_usd: 1000, label: '15,000 CR', bonus_pct: 50 },
];

export function getPackage(id: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find(p => p.id === id);
}

export function totalCredits(pkg: CreditPackage): number {
  return pkg.credits + Math.round(pkg.credits * pkg.bonus_pct / 100);
}

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

export type PaymentMethod = 'stripe' | 'coinbase_commerce';

// ---------------------------------------------------------------------------
// Stripe (Card / Apple Pay / Google Pay)
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not set');
    _stripe = new Stripe(key, { apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion });
  }
  return _stripe;
}

export async function createStripeCheckout(opts: {
  package_id: string;
  trader_id: string;
  lobby_id: string;
  success_url: string;
  cancel_url: string;
}): Promise<{ url: string; session_id: string }> {
  const pkg = getPackage(opts.package_id);
  if (!pkg) throw new Error('Invalid package');

  const stripe = getStripe();
  const credits = totalCredits(pkg);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: pkg.price_usd,
        product_data: {
          name: `${credits} Battle Credits`,
          description: `${pkg.label}${pkg.bonus_pct > 0 ? ` (+${pkg.bonus_pct}% bonus)` : ''}`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      trader_id: opts.trader_id,
      lobby_id: opts.lobby_id,
      package_id: opts.package_id,
      credits: String(credits),
    },
    success_url: opts.success_url,
    cancel_url: opts.cancel_url,
  });

  return { url: session.url!, session_id: session.id };
}

export function constructStripeEvent(payload: string | Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not set');
  return stripe.webhooks.constructEvent(payload, signature, secret);
}

// ---------------------------------------------------------------------------
// Coinbase Commerce (BTC, ETH, SOL, USDC, DOGE, LTC, MATIC, SHIB, etc.)
// ---------------------------------------------------------------------------

export interface CoinbaseCharge {
  id: string;
  hosted_url: string;
  code: string;
}

export async function createCoinbaseCharge(opts: {
  package_id: string;
  trader_id: string;
  lobby_id: string;
  redirect_url: string;
}): Promise<CoinbaseCharge> {
  const pkg = getPackage(opts.package_id);
  if (!pkg) throw new Error('Invalid package');

  const apiKey = process.env.COINBASE_COMMERCE_API_KEY;
  if (!apiKey) throw new Error('COINBASE_COMMERCE_API_KEY not set');

  const credits = totalCredits(pkg);
  const priceUsd = (pkg.price_usd / 100).toFixed(2);

  const res = await fetch('https://api.commerce.coinbase.com/charges', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CC-Api-Key': apiKey,
      'X-CC-Version': '2018-03-22',
    },
    body: JSON.stringify({
      name: `${credits} Battle Credits`,
      description: `${pkg.label}${pkg.bonus_pct > 0 ? ` (+${pkg.bonus_pct}% bonus)` : ''}`,
      pricing_type: 'fixed_price',
      local_price: { amount: priceUsd, currency: 'USD' },
      metadata: {
        trader_id: opts.trader_id,
        lobby_id: opts.lobby_id,
        package_id: opts.package_id,
        credits: String(credits),
      },
      redirect_url: opts.redirect_url,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Coinbase Commerce error: ${err}`);
  }

  const data = await res.json();
  const charge = data.data;

  return {
    id: charge.id,
    hosted_url: charge.hosted_url,
    code: charge.code,
  };
}

export function verifyCoinbaseWebhook(payload: string, signature: string): boolean {
  const secret = process.env.COINBASE_WEBHOOK_SECRET;
  if (!secret) return false;

  // Coinbase Commerce uses HMAC-SHA256
  const crypto = require('crypto') as typeof import('crypto');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ---------------------------------------------------------------------------
// Purchase records
// ---------------------------------------------------------------------------

export interface PurchaseRecord {
  trader_id: string;
  lobby_id: string;
  package_id: string | null;
  credits_granted: number;
  amount_usd_cents: number;
  payment_method: PaymentMethod;
  payment_ref: string;
  status: 'pending' | 'completed' | 'failed';
}

export async function recordPurchase(purchase: PurchaseRecord): Promise<string | null> {
  const { supabase } = await import('./supabase');

  const { data, error } = await supabase
    .from('purchases')
    .insert({
      trader_id: purchase.trader_id,
      lobby_id: purchase.lobby_id,
      package_id: purchase.package_id,
      credits_granted: purchase.credits_granted,
      amount_usd_cents: purchase.amount_usd_cents,
      payment_method: purchase.payment_method,
      payment_ref: purchase.payment_ref,
      status: purchase.status,
    })
    .select('id')
    .single();

  if (error) { console.error('recordPurchase error:', error.message); return null; }
  return data?.id ?? null;
}

export async function completePurchase(paymentRef: string): Promise<boolean> {
  const { supabase } = await import('./supabase');

  // Idempotency: only process pending purchases
  const { data: purchase } = await supabase
    .from('purchases')
    .select('*')
    .eq('payment_ref', paymentRef)
    .single();

  if (!purchase) return false;

  // Already completed or failed — idempotent no-op
  if (purchase.status === 'completed') return true;
  if (purchase.status === 'failed') return false;

  // Grant credits
  const { data: alloc } = await supabase
    .from('credit_allocations')
    .select('balance, total_earned')
    .eq('trader_id', purchase.trader_id)
    .eq('lobby_id', purchase.lobby_id)
    .single();

  if (alloc) {
    await supabase
      .from('credit_allocations')
      .update({
        balance: alloc.balance + purchase.credits_granted,
        total_earned: alloc.total_earned + purchase.credits_granted,
      })
      .eq('trader_id', purchase.trader_id)
      .eq('lobby_id', purchase.lobby_id);
  } else {
    await supabase
      .from('credit_allocations')
      .insert({
        trader_id: purchase.trader_id,
        lobby_id: purchase.lobby_id,
        balance: purchase.credits_granted,
        total_earned: purchase.credits_granted,
        total_spent: 0,
      });
  }

  // Mark completed
  await supabase
    .from('purchases')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', purchase.id);

  return true;
}

export async function failPurchase(paymentRef: string, reason: string): Promise<boolean> {
  const { supabase } = await import('./supabase');

  const { data: purchase } = await supabase
    .from('purchases')
    .select('id, status')
    .eq('payment_ref', paymentRef)
    .single();

  if (!purchase) return false;

  // Already terminal — idempotent no-op
  if (purchase.status === 'completed' || purchase.status === 'failed') return true;

  await supabase
    .from('purchases')
    .update({ status: 'failed', failure_reason: reason, completed_at: new Date().toISOString() })
    .eq('id', purchase.id);

  return true;
}
