import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/prediction-markets';

export const dynamic = 'force-dynamic';

/** POST — Resolve a market with a winning team */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; marketId: string }> },
) {
  const { marketId } = await params;

  let body: { winner_team_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { winner_team_id } = body;

  if (!winner_team_id) {
    return NextResponse.json(
      { error: 'winner_team_id is required' },
      { status: 400 },
    );
  }

  try {
    const provider = getProvider('mock');
    await provider.resolveMarket(marketId, winner_team_id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve market';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
