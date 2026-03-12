import { NextRequest, NextResponse } from 'next/server';
import { createStream, getStream, endStream } from '@/lib/streaming';
import { checkAuth, unauthorized } from '../admin/auth';

export const dynamic = 'force-dynamic';

// GET — public: return playback info for viewers (no stream key)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;

  const stream = await getStream(lobbyId);
  if (!stream) {
    return NextResponse.json({ stream: null });
  }

  // Only expose playback URL and status to viewers — never the stream key
  return NextResponse.json({
    stream: {
      id: stream.id,
      lobby_id: stream.lobby_id,
      playback_url: stream.playback_url,
      status: stream.status,
      created_at: stream.created_at,
    },
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15' },
  });
}

// POST — admin only: create a new stream for this lobby
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;

  try {
    const stream = await createStream(lobbyId);
    return NextResponse.json({ stream }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — admin only: end and clean up the stream
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;

  try {
    await endStream(lobbyId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
