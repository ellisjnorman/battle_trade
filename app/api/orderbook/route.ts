import { NextRequest, NextResponse } from 'next/server';
import { getOrderBookAdapter, listOrderBookAdapters } from '@/lib/orderbook';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orderbook?symbol=BTC&source=hyperliquid&depth=20
 * Returns order book from the specified source (default: hyperliquid).
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') ?? 'BTC';
  const source = request.nextUrl.searchParams.get('source') ?? 'hyperliquid';
  const depth = parseInt(request.nextUrl.searchParams.get('depth') ?? '20', 10);

  try {
    const adapter = getOrderBookAdapter(source);
    const book = await adapter.getOrderBook(symbol, Math.min(depth, 50));

    return NextResponse.json(book, {
      headers: { 'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=2' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, available_sources: listOrderBookAdapters() },
      { status: 500 },
    );
  }
}
