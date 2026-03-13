import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { authenticateProfile } from '@/lib/auth-guard';
import {
  enterQueue,
  leaveQueue,
  findMatch,
  createMatchedDuel,
  getQueuePosition,
  type DuelDuration,
  type QueueEntry,
} from '@/lib/duels';

export const dynamic = 'force-dynamic';

const VALID_DURATIONS = [15, 30, 60, 240];

/**
 * POST /api/duels/queue
 * Enter the matchmaking queue. Immediately attempts to find a match.
 * Body: { profile_id: string, duration_minutes: 15 | 30 | 60 | 240 }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile_id, duration_minutes } = body;

    if (!profile_id || typeof profile_id !== 'string') {
      return NextResponse.json({ error: 'profile_id is required' }, { status: 400 });
    }

    // Authenticate: verify caller owns this profile
    const auth = await authenticateProfile(request);
    if (!auth.ok) return auth.response;
    if (auth.profileId !== profile_id) {
      return NextResponse.json({ error: 'Cannot queue as another user' }, { status: 403 });
    }

    if (!VALID_DURATIONS.includes(duration_minutes)) {
      return NextResponse.json(
        { error: `duration_minutes must be one of: ${VALID_DURATIONS.join(', ')}` },
        { status: 400 },
      );
    }

    const duration = duration_minutes as DuelDuration;

    // Fetch BTR score from profile
    const sb = getServerSupabase();
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('id, tr_score')
      .eq('id', profile_id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const btrScore: number = profile.tr_score ?? 1000;

    // Enter queue
    await enterQueue(profile_id, btrScore, duration);

    // Build the queue entry for matching
    const entry: QueueEntry = {
      profile_id,
      btr_score: btrScore,
      duration_minutes: duration,
      queued_at: new Date().toISOString(),
    };

    // Attempt to find a match
    const match = await findMatch(entry);

    if (match) {
      // Match found — create the duel immediately
      const { duel_id, lobby_id } = await createMatchedDuel(entry, match);
      return NextResponse.json({ matched: true, duel_id, lobby_id });
    }

    // No match — return queue position
    const position = await getQueuePosition(profile_id);
    return NextResponse.json({ matched: false, position });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/duels/queue
 * Leave the matchmaking queue.
 * Body: { profile_id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile_id } = body;

    if (!profile_id || typeof profile_id !== 'string') {
      return NextResponse.json({ error: 'profile_id is required' }, { status: 400 });
    }

    // Authenticate: verify caller owns this profile
    const auth = await authenticateProfile(request);
    if (!auth.ok) return auth.response;
    if (auth.profileId !== profile_id) {
      return NextResponse.json({ error: 'Cannot leave queue as another user' }, { status: 403 });
    }

    await leaveQueue(profile_id);
    return NextResponse.json({ left: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
