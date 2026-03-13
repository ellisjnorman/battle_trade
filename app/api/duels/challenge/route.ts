import { NextRequest, NextResponse } from 'next/server';
import { authenticateProfile } from '@/lib/auth-guard';
import {
  createChallenge,
  acceptChallenge,
  declineChallenge,
  startDuel,
  expireStaleChallenge,
  type DuelDuration,
} from '@/lib/duels';

export const dynamic = 'force-dynamic';

const VALID_DURATIONS = [15, 30, 60, 240];

/**
 * POST /api/duels/challenge
 * Create a direct challenge to another player.
 * Body: { challenger_id: string, opponent_id: string, duration_minutes: 15 | 30 | 60 | 240 }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { challenger_id, opponent_id, duration_minutes } = body;

    if (!challenger_id || typeof challenger_id !== 'string') {
      return NextResponse.json({ error: 'challenger_id is required' }, { status: 400 });
    }
    if (!opponent_id || typeof opponent_id !== 'string') {
      return NextResponse.json({ error: 'opponent_id is required' }, { status: 400 });
    }
    if (challenger_id === opponent_id) {
      return NextResponse.json({ error: 'Cannot challenge yourself' }, { status: 400 });
    }

    // Authenticate: verify caller owns challenger_id
    const auth = await authenticateProfile(request);
    if (!auth.ok) return auth.response;
    if (auth.profileId !== challenger_id) {
      return NextResponse.json({ error: 'Cannot challenge as another user' }, { status: 403 });
    }

    if (!VALID_DURATIONS.includes(duration_minutes)) {
      return NextResponse.json(
        { error: `duration_minutes must be one of: ${VALID_DURATIONS.join(', ')}` },
        { status: 400 },
      );
    }

    // Expire stale challenges opportunistically
    expireStaleChallenge().catch(() => {});

    const duel = await createChallenge(
      challenger_id,
      opponent_id,
      duration_minutes as DuelDuration,
    );

    return NextResponse.json({ challenge_id: duel.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message.includes('already have a pending') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/duels/challenge
 * Accept or decline a challenge.
 * Body: { challenge_id: string, action: 'accept' | 'decline', profile_id: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { challenge_id, action, profile_id } = body;

    if (!challenge_id || typeof challenge_id !== 'string') {
      return NextResponse.json({ error: 'challenge_id is required' }, { status: 400 });
    }
    if (!action || !['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'action must be "accept" or "decline"' }, { status: 400 });
    }
    if (!profile_id || typeof profile_id !== 'string') {
      return NextResponse.json({ error: 'profile_id is required' }, { status: 400 });
    }

    // Authenticate: verify caller owns profile_id
    const patchAuth = await authenticateProfile(request);
    if (!patchAuth.ok) return patchAuth.response;
    if (patchAuth.profileId !== profile_id) {
      return NextResponse.json({ error: 'Cannot respond to challenge as another user' }, { status: 403 });
    }

    if (action === 'decline') {
      await declineChallenge(challenge_id);
      return NextResponse.json({ declined: true });
    }

    // Accept flow: accept the challenge then start the duel
    await acceptChallenge(challenge_id, profile_id);
    const { lobby_id } = await startDuel(challenge_id);

    return NextResponse.json({ lobby_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';

    let status = 500;
    if (message.includes('not found')) status = 404;
    else if (message.includes('cannot accept') || message.includes('cannot decline')) status = 409;
    else if (message.includes('not addressed to you')) status = 403;
    else if (message.includes('expired')) status = 410;

    return NextResponse.json({ error: message }, { status });
  }
}
