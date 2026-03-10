import { NextResponse } from 'next/server';
import { refreshMarketData, getCachedMarketData } from '@/lib/market-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  await refreshMarketData();
  return NextResponse.json(getCachedMarketData());
}
