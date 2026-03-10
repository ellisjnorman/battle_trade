import { NextRequest, NextResponse } from 'next/server';
import { getStream } from '@/lib/streaming';
import { checkAuth, unauthorized } from '../../admin/auth';

export const dynamic = 'force-dynamic';

// GET — admin only: return the stream key + RTMP URL for the broadcaster
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(request)) return unauthorized();

  const { id: lobbyId } = await params;

  const stream = await getStream(lobbyId);
  if (!stream) {
    return NextResponse.json({ error: 'No stream exists for this lobby' }, { status: 404 });
  }

  return NextResponse.json({
    stream_key: stream.stream_key,
    rtmp_url: stream.rtmp_url,
    playback_url: stream.playback_url,
    status: stream.status,
  });
}
