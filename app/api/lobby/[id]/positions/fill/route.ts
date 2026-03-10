import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { calcUnrealizedPnl } from '@/lib/pnl';
import type { Position } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lobby/[id]/positions/fill
 * Checks all pending limit/stop/trailing orders and fills or stops them.
 * Also checks open trailing-stop positions.
 * Called by trading terminal on a polling interval.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  // Get pending orders + open trailing stops
  const { data: orders, error: fetchErr } = await supabase
    .from('positions')
    .select('*, rounds!inner(lobby_id, status)')
    .in('status', ['pending', 'open'])
    .eq('rounds.lobby_id', lobbyId)
    .eq('rounds.status', 'active');

  if (fetchErr || !orders || orders.length === 0) {
    return NextResponse.json({ filled: 0, stopped: 0 });
  }

  // Get current prices
  const symbols = [...new Set(orders.map(o => o.symbol))];
  const { data: priceRows } = await supabase
    .from('prices')
    .select('symbol, price')
    .in('symbol', symbols);

  const priceMap: Record<string, number> = {};
  priceRows?.forEach(r => { priceMap[r.symbol] = r.price; });

  let filled = 0;
  let stopped = 0;
  const filledIds: string[] = [];
  const stoppedIds: string[] = [];

  for (const order of orders) {
    const currentPrice = priceMap[order.symbol];
    if (!currentPrice) continue;

    // ── Pending orders: check if should fill ──
    if (order.status === 'pending') {
      let shouldFill = false;

      if (order.order_type === 'limit') {
        // LONG limit: fill when price drops to limit
        // SHORT limit: fill when price rises to limit
        shouldFill =
          (order.direction === 'long' && currentPrice <= order.limit_price) ||
          (order.direction === 'short' && currentPrice >= order.limit_price);
      } else if (order.order_type === 'stop_limit') {
        // Stop-limit: stop_price triggers, then fill at limit_price
        // LONG stop-limit: trigger when price >= stop, fill at limit
        // SHORT stop-limit: trigger when price <= stop, fill at limit
        const triggered =
          (order.direction === 'long' && currentPrice >= order.stop_price) ||
          (order.direction === 'short' && currentPrice <= order.stop_price);

        if (triggered) {
          // If limit_price set, check it too; otherwise fill at market
          if (order.limit_price) {
            shouldFill =
              (order.direction === 'long' && currentPrice <= order.limit_price) ||
              (order.direction === 'short' && currentPrice >= order.limit_price);
          } else {
            shouldFill = true;
          }
        }
      } else if (order.order_type === 'trailing_stop') {
        // Trailing stop pending = waiting to open, fill immediately as market
        shouldFill = true;
      }

      if (shouldFill) {
        await supabase
          .from('positions')
          .update({
            status: 'open',
            entry_price: currentPrice,
            opened_at: new Date().toISOString(),
            trail_peak: order.order_type === 'trailing_stop' ? currentPrice : order.trail_peak,
          })
          .eq('id', order.id);
        filled++;
        filledIds.push(order.id);
      }
    }

    // ── Open trailing stop: check if should stop out ──
    if (order.status === 'open' && order.order_type === 'trailing_stop' && order.trail_pct) {
      const peak = order.trail_peak ?? order.entry_price;
      let newPeak = peak;
      let shouldStop = false;

      if (order.direction === 'long') {
        // Track the peak high; stop if price drops trail_pct% below peak
        newPeak = Math.max(peak, currentPrice);
        const stopLevel = newPeak * (1 - order.trail_pct / 100);
        shouldStop = currentPrice <= stopLevel;
      } else {
        // Track the peak low; stop if price rises trail_pct% above trough
        newPeak = Math.min(peak, currentPrice);
        const stopLevel = newPeak * (1 + order.trail_pct / 100);
        shouldStop = currentPrice >= stopLevel;
      }

      if (shouldStop) {
        const pos = order as Position;
        const realizedPnl = calcUnrealizedPnl(pos, currentPrice);
        await supabase
          .from('positions')
          .update({
            status: 'stopped',
            exit_price: currentPrice,
            realized_pnl: realizedPnl,
            closed_at: new Date().toISOString(),
          })
          .eq('id', order.id);
        stopped++;
        stoppedIds.push(order.id);
      } else if (newPeak !== peak) {
        // Update peak tracker
        await supabase
          .from('positions')
          .update({ trail_peak: newPeak })
          .eq('id', order.id);
      }
    }
  }

  return NextResponse.json({ filled, stopped, filledIds, stoppedIds });
}
