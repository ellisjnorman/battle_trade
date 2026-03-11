import { NextRequest, NextResponse } from 'next/server';
import { subscribe, unsubscribe } from '@/lib/copy-trading';

export const dynamic = 'force-dynamic';

/**
 * POST /api/copy-trading/subscribe
 * Subscribe to copy a leader's trades.
 *
 * Body: { follower_id, leader_id, budget_usd, leverage_multiplier? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { follower_id, leader_id, budget_usd, leverage_multiplier } = body;

    if (!follower_id || typeof follower_id !== 'string') {
      return NextResponse.json({ error: 'follower_id is required' }, { status: 400 });
    }

    if (!leader_id || typeof leader_id !== 'string') {
      return NextResponse.json({ error: 'leader_id is required' }, { status: 400 });
    }

    if (budget_usd == null || typeof budget_usd !== 'number' || budget_usd <= 0) {
      return NextResponse.json({ error: 'budget_usd must be a positive number' }, { status: 400 });
    }

    if (budget_usd > 1_000_000) {
      return NextResponse.json({ error: 'budget_usd cannot exceed $1,000,000' }, { status: 400 });
    }

    if (leverage_multiplier != null) {
      if (typeof leverage_multiplier !== 'number' || leverage_multiplier < 0.5 || leverage_multiplier > 2.0) {
        return NextResponse.json(
          { error: 'leverage_multiplier must be between 0.5 and 2.0' },
          { status: 400 },
        );
      }
    }

    const result = await subscribe(
      follower_id,
      leader_id,
      budget_usd,
      leverage_multiplier ?? 1.0,
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ subscription: result.subscription }, { status: 201 });
  } catch (err) {
    console.error('POST /api/copy-trading/subscribe error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/copy-trading/subscribe
 * Unsubscribe from a leader. Does NOT close open mirror positions.
 *
 * Body: { subscription_id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription_id } = body;

    if (!subscription_id || typeof subscription_id !== 'string') {
      return NextResponse.json({ error: 'subscription_id is required' }, { status: 400 });
    }

    const result = await unsubscribe(subscription_id);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/copy-trading/subscribe error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
