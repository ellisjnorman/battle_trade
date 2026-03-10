import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '../auth';
import { supabase } from '@/lib/supabase';
import { chatChannel, adminBroadcast } from '@/lib/chat';

export const dynamic = 'force-dynamic';

/** Admin broadcast — sends a message to ALL channels in the lobby */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { message, type } = body;

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 });
  }

  const chatMsg = adminBroadcast(message.trim());

  // Send to lobby chat channel (spectators + traders see this)
  const channels = [
    chatChannel(lobbyId),
    `lobby-${lobbyId}-broadcast`,
  ];

  const sendToChannel = (channelName: string, event: string, payload: Record<string, unknown>) => {
    return new Promise<void>((resolve) => {
      const ch = supabase.channel(channelName);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.send({ type: 'broadcast', event, payload });
          setTimeout(() => { supabase.removeChannel(ch); resolve(); }, 500);
        }
      });
      setTimeout(() => { supabase.removeChannel(ch); resolve(); }, 3000);
    });
  };

  // Broadcast to all channels
  await Promise.all([
    ...channels.map(ch => sendToChannel(ch, 'chat', chatMsg as unknown as Record<string, unknown>)),
    // Also send as admin_broadcast event for trading terminals to pick up
    sendToChannel(`lobby-${lobbyId}-broadcast`, 'admin_broadcast', {
      type: type ?? 'announcement',
      message: message.trim(),
      timestamp: new Date().toISOString(),
    }),
  ]);

  // Also broadcast to each individual trader channel
  const { data: traders } = await supabase
    .from('traders')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('is_eliminated', false);

  if (traders) {
    await Promise.all(
      traders.map(t =>
        sendToChannel(`t-${t.id}`, 'admin_broadcast', {
          type: type ?? 'announcement',
          message: message.trim(),
          timestamp: new Date().toISOString(),
        })
      )
    );
  }

  return NextResponse.json({ sent: true, channels: channels.length + (traders?.length ?? 0) });
}
