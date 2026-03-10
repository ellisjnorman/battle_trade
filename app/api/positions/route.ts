import { NextResponse } from 'next/server';

/**
 * DEPRECATED: Legacy positions route. Use /api/lobby/[id]/positions instead.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/lobby/{lobby_id}/positions instead.' },
    { status: 410 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/lobby/{lobby_id}/positions instead.' },
    { status: 410 },
  );
}
