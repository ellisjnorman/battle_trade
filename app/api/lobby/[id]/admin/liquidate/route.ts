import { NextRequest, NextResponse } from 'next/server';
import { checkAndLiquidate } from '@/lib/liquidation';
import { logAdminAction } from '@/lib/audit';
import { checkAuthWithLobby, unauthorized } from '../auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  if (!(await checkAuthWithLobby(request, lobbyId))) return unauthorized();
  const results = await checkAndLiquidate(lobbyId);

  logAdminAction(lobbyId, 'liquidate', { count: results.length });

  return NextResponse.json({
    action: 'liquidation_check',
    liquidated: results.length,
    positions: results,
  });
}
