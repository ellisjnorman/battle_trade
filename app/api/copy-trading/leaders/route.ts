import { NextResponse } from 'next/server';
import { getTop20Leaders } from '@/lib/copy-trading';

export const dynamic = 'force-dynamic';

/**
 * GET /api/copy-trading/leaders
 * List Top 20 copy-eligible leaders with their copy stats.
 */
export async function GET() {
  try {
    const leaders = await getTop20Leaders();
    return NextResponse.json({ leaders });
  } catch (err) {
    console.error('GET /api/copy-trading/leaders error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
