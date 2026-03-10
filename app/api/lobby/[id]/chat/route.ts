import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { validateTraderInLobby } from '@/lib/validate-trader';
import { chatChannel, filterMessage, canSendMessage, type ChatMessage } from '@/lib/chat';

export const dynamic = 'force-dynamic';

/** Send a chat message to the lobby */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();
  const { trader_id, text } = body;

  if (!trader_id || !text?.trim()) {
    return NextResponse.json({ error: 'Missing trader_id or text' }, { status: 400 });
  }

  if (text.trim().length > 280) {
    return NextResponse.json({ error: 'Message too long (280 char max)' }, { status: 400 });
  }

  // Rate limit
  if (!canSendMessage(trader_id)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  // Verify trader belongs to lobby
  const trader = await validateTraderInLobby(trader_id, lobbyId);
  if (!trader) {
    return NextResponse.json({ error: 'Invalid trader' }, { status: 403 });
  }

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    sender_id: trader_id,
    sender_name: trader.name,
    sender_role: trader.is_competitor ? 'competitor' : 'spectator',
    text: filterMessage(text.trim()),
    timestamp: new Date().toISOString(),
  };

  // Broadcast to lobby chat channel
  const ch = supabase.channel(chatChannel(lobbyId));
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await ch.send({ type: 'broadcast', event: 'chat', payload: message });
      setTimeout(() => supabase.removeChannel(ch), 500);
    }
  });

  return NextResponse.json({ message });
}
