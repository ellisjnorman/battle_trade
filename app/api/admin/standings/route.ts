import { NextResponse } from 'next/server';

/**
 * DEPRECATED: Legacy standings route. Use /api/lobby/[id]/leaderboard instead.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/lobby/{lobby_id}/leaderboard instead.' },
    { status: 410 },
  );
}
