import { NextRequest, NextResponse } from 'next/server';
import { getFollowerPortfolio } from '@/lib/copy-trading';

export const dynamic = 'force-dynamic';

/**
 * GET /api/copy-trading/portfolio?follower_id=...
 * Returns a follower's complete copy-trading portfolio:
 * active subscriptions, copied trades, total PnL, and total fees paid.
 */
export async function GET(request: NextRequest) {
  try {
    const followerId = request.nextUrl.searchParams.get('follower_id');

    if (!followerId) {
      return NextResponse.json({ error: 'follower_id query parameter is required' }, { status: 400 });
    }

    const portfolio = await getFollowerPortfolio(followerId);

    return NextResponse.json({
      subscriptions: portfolio.subscriptions,
      active_trades: portfolio.active_trades,
      total_pnl: portfolio.total_pnl,
      total_fees_paid: portfolio.total_fees_paid,
    });
  } catch (err) {
    console.error('GET /api/copy-trading/portfolio error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
