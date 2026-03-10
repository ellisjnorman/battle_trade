import { NextResponse } from 'next/server';

/**
 * DEPRECATED: Legacy admin route. Use /api/lobby/[id]/admin/* instead.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/lobby/{lobby_id}/admin/* routes instead.' },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/lobby/{lobby_id}/admin/status instead.' },
    { status: 410 },
  );
}
