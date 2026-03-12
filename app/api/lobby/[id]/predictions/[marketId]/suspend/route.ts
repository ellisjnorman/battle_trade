import { NextRequest, NextResponse } from 'next/server';
import { suspendMarket, resumeMarket } from '@/lib/prediction-markets';
import { checkAuthWithLobby, unauthorized } from '../../../admin/auth';

export const dynamic = 'force-dynamic';

/** POST — Suspend or resume a market */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; marketId: string }> },
) {
  const { id: lobbyId, marketId } = await params;
  if (!(await checkAuthWithLobby(request, lobbyId))) return unauthorized();

  let body: { action: 'suspend' | 'resume' };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action } = body;

  if (action !== 'suspend' && action !== 'resume') {
    return NextResponse.json(
      { error: 'action must be "suspend" or "resume"' },
      { status: 400 },
    );
  }

  try {
    if (action === 'suspend') {
      await suspendMarket(marketId);
    } else {
      await resumeMarket(marketId);
    }
    return NextResponse.json({ success: true, action });
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to ${action} market`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
