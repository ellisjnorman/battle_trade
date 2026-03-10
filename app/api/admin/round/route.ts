import { NextResponse } from 'next/server';

/**
 * DEPRECATED: Legacy round route. Use /api/lobby/[id]/admin/round/* instead.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/lobby/{lobby_id}/admin/round/* routes instead.' },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/lobby/{lobby_id}/admin/round/* routes instead.' },
    { status: 410 },
  );
}
