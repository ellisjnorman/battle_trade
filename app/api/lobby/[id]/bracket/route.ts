import { NextRequest, NextResponse } from 'next/server';
import {
  createBracket,
  seedBracket,
  startRound,
  completeRound,
  getBracketStateByLobby,
} from '@/lib/brackets';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — return the bracket state for this lobby's most recent tournament
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  try {
    const state = await getBracketStateByLobby(lobbyId);

    if (!state) {
      return NextResponse.json(
        { error: 'No bracket tournament found for this lobby' },
        { status: 404 },
      );
    }

    return NextResponse.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — create a new bracket tournament for this lobby
// Body: { name: string, round_duration_minutes?: number, entry_fee?: number }
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = body.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'name is required and must be a non-empty string' },
      { status: 400 },
    );
  }

  const roundDurationMinutes = Number(body.round_duration_minutes ?? 20);
  const entryFee = Number(body.entry_fee ?? 0);

  if (roundDurationMinutes < 1 || roundDurationMinutes > 120) {
    return NextResponse.json(
      { error: 'round_duration_minutes must be between 1 and 120' },
      { status: 400 },
    );
  }

  if (entryFee < 0) {
    return NextResponse.json(
      { error: 'entry_fee must be >= 0' },
      { status: 400 },
    );
  }

  try {
    const tournament = await createBracket(
      lobbyId,
      name.trim(),
      roundDurationMinutes,
      entryFee,
    );

    // Auto-seed immediately after creation
    const slots = await seedBracket(tournament.id);

    // Refetch full state to return
    const state = await getBracketStateByLobby(lobbyId);

    return NextResponse.json(
      { tournament, slots_created: slots.length, bracket: state },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH — advance the tournament
// Body: { action: 'start_round' | 'complete_round' }
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'start_round' && action !== 'complete_round') {
    return NextResponse.json(
      { error: "action must be 'start_round' or 'complete_round'" },
      { status: 400 },
    );
  }

  // Find the tournament for this lobby
  const { getServerSupabase } = await import('@/lib/supabase-server');
  const sb = getServerSupabase();

  const { data: tournament } = await sb
    .from('bracket_tournaments')
    .select('id, status')
    .eq('lobby_id', lobbyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!tournament) {
    return NextResponse.json(
      { error: 'No bracket tournament found for this lobby' },
      { status: 404 },
    );
  }

  try {
    if (action === 'start_round') {
      const roundId = await startRound(tournament.id);
      const state = await getBracketStateByLobby(lobbyId);
      return NextResponse.json({ round_id: roundId, bracket: state });
    } else {
      await completeRound(tournament.id);
      const state = await getBracketStateByLobby(lobbyId);
      return NextResponse.json({ bracket: state });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
