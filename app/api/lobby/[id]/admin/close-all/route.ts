import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { calcUnrealizedPnl } from '@/lib/pnl';
import { checkAuthWithLobby } from '../auth';
import type { Position } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lobby/[id]/admin/close-all
 * Closes ALL open positions in the lobby at current market price.
 * Optionally filter by trader_id.
 * Body: { trader_id?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const isAuth = await checkAuthWithLobby(request, lobbyId);
  if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch {}

  const traderId = body.trader_id as string | undefined;
  const sb = getServerSupabase();

  // Get all open positions in this lobby
  // First get all rounds for this lobby
  const { data: rounds } = await sb
    .from('rounds')
    .select('id')
    .eq('lobby_id', lobbyId);

  if (!rounds?.length) {
    return NextResponse.json({ closed: 0, message: 'No rounds found' });
  }

  const roundIds = rounds.map(r => r.id);

  // Find all open positions (closed_at is null)
  let query = sb
    .from('positions')
    .select('id, trader_id, round_id, symbol, direction, size, leverage, entry_price, opened_at, closed_at')
    .in('round_id', roundIds)
    .is('closed_at', null);

  if (traderId) {
    query = query.eq('trader_id', traderId);
  }

  const { data: openPositions, error: fetchErr } = await query;

  if (fetchErr || !openPositions?.length) {
    return NextResponse.json({ closed: 0, message: fetchErr?.message ?? 'No open positions' });
  }

  // Get current prices
  const { data: priceRows } = await sb.from('prices').select('symbol, price');
  const prices: Record<string, number> = {};
  for (const p of priceRows ?? []) prices[p.symbol] = p.price;

  // Close each position at market price
  const results: { id: string; symbol: string; pnl: number }[] = [];
  const errors: string[] = [];

  for (const pos of openPositions) {
    const exitPrice = prices[pos.symbol];
    if (!exitPrice) {
      errors.push(`No price for ${pos.symbol}`);
      continue;
    }

    const realizedPnl = calcUnrealizedPnl(pos as Position, exitPrice);

    // Try with status column, fall back without
    const closePayload: Record<string, unknown> = {
      exit_price: exitPrice,
      realized_pnl: realizedPnl,
      closed_at: new Date().toISOString(),
      status: 'closed',
    };

    const { error: u1Err } = await sb
      .from('positions')
      .update(closePayload)
      .eq('id', pos.id);

    if (u1Err) {
      const { status: _s, ...safe } = closePayload;
      const { error: u2Err } = await sb
        .from('positions')
        .update(safe)
        .eq('id', pos.id);

      if (u2Err) {
        errors.push(`Failed to close ${pos.id}: ${u2Err.message}`);
        continue;
      }
    }

    results.push({ id: pos.id, symbol: pos.symbol, pnl: realizedPnl });
  }

  return NextResponse.json({
    closed: results.length,
    total_pnl: results.reduce((s, r) => s + r.pnl, 0),
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
