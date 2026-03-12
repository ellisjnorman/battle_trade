import { NextRequest, NextResponse } from 'next/server';
import { getProvider, getOddsHistory } from '@/lib/prediction-markets';

export const dynamic = 'force-dynamic';

/** GET — Get a single market with outcomes, odds, and odds history */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; marketId: string }> },
) {
  const { marketId } = await params;

  try {
    const provider = getProvider('mock');
    const market = await provider.getMarket(marketId);
    const odds_history = await getOddsHistory(marketId);

    return NextResponse.json({ market, odds_history }, {
      headers: { 'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=5' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Market not found';
    if (message === 'Market not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
