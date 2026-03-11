import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const VALID_PERIODS = ['daily', 'weekly', 'monthly', 'all-time'] as const;
type Period = (typeof VALID_PERIODS)[number];

const PAYOUTS: Record<Exclude<Period, 'all-time'>, { '1st': number; '2nd': number; '3rd': number }> = {
  daily: { '1st': 100, '2nd': 50, '3rd': 25 },
  weekly: { '1st': 500, '2nd': 250, '3rd': 100 },
  monthly: { '1st': 2000, '2nd': 1000, '3rd': 500 },
};

const SELECT_FIELDS =
  'id, display_name, handle, avatar_url, tr_score, rank_tier, total_wins, win_rate, best_return, bio, total_lobbies_played, updated_at, created_at';

/**
 * Get the start of the current period in UTC.
 */
function getPeriodStart(period: Period): Date | null {
  const now = new Date();

  switch (period) {
    case 'daily':
      return new Date(Date.now() - 24 * 60 * 60 * 1000);

    case 'weekly': {
      // Last Monday 00:00 UTC
      const day = now.getUTCDay(); // 0=Sun, 1=Mon, ...
      const daysSinceMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
      );
      return monday;
    }

    case 'monthly':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    case 'all-time':
      return null;
  }
}

/**
 * Get the timestamp when the current period resets.
 */
function getResetsAt(period: Period): string | null {
  const now = new Date();

  switch (period) {
    case 'daily': {
      // Next day 00:00 UTC
      const tomorrow = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
      );
      return tomorrow.toISOString();
    }

    case 'weekly': {
      // Next Monday 00:00 UTC
      const day = now.getUTCDay();
      const daysUntilMonday = day === 0 ? 1 : 8 - day;
      const nextMonday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday),
      );
      return nextMonday.toISOString();
    }

    case 'monthly': {
      // 1st of next month 00:00 UTC
      const nextMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );
      return nextMonth.toISOString();
    }

    case 'all-time':
      return null;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const supabase = getServerSupabase();

  // --- Parse params ---
  const periodParam = url.searchParams.get('period') ?? 'all-time';
  const period: Period = VALID_PERIODS.includes(periodParam as Period)
    ? (periodParam as Period)
    : 'all-time';

  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  // --- Build query ---
  let query = supabase
    .from('profiles')
    .select(SELECT_FIELDS, { count: 'exact' })
    .order('tr_score', { ascending: false })
    .range(offset, offset + limit - 1);

  // Filter by period
  const periodStart = getPeriodStart(period);
  if (periodStart) {
    query = query.gte('updated_at', periodStart.toISOString());
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Add payout info per trader (top 3 by position in results, accounting for offset)
  const payoutMap = period !== 'all-time' ? PAYOUTS[period] : null;
  const traders = (data ?? []).map((trader, index) => {
    const globalPosition = offset + index + 1;
    let payout: number | null = null;

    if (payoutMap) {
      if (globalPosition === 1) payout = payoutMap['1st'];
      else if (globalPosition === 2) payout = payoutMap['2nd'];
      else if (globalPosition === 3) payout = payoutMap['3rd'];
    }

    return {
      ...trader,
      position: globalPosition,
      ...(payout !== null ? { payout } : {}),
    };
  });

  return NextResponse.json({
    period,
    traders,
    total: count ?? 0,
    payouts: payoutMap ?? null,
    resets_at: getResetsAt(period),
  });
}
