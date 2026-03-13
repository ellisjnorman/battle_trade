import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { chatChannel, filterMessage, canSendMessage, type ChatMessage } from '@/lib/chat';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — fetch recent messages for a lobby
// Query params: ?limit=50&before=<ISO timestamp>
// Returns { messages: ChatMessage[] } ordered by created_at desc (newest first)
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const { searchParams } = request.nextUrl;

  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 100);
  const before = searchParams.get('before');

  const db = getServerSupabase();

  let query = db
    .from('chat_messages')
    .select('id, lobby_id, sender_id, sender_name, sender_role, content, message_type, created_at')
    .eq('lobby_id', lobbyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  // Map DB rows to ChatMessage shape for client compatibility
  const messages: ChatMessage[] = (data ?? []).map((row) => ({
    id: row.id,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    sender_role: row.sender_role as ChatMessage['sender_role'],
    text: row.content,
    timestamp: row.created_at,
  }));

  return NextResponse.json({ messages }, {
    headers: { 'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=3' },
  });
}

// ---------------------------------------------------------------------------
// POST — send a message (persist to DB + broadcast via Realtime)
// Body: { sender_id, sender_name?, sender_role?, content } or legacy { trader_id, text }
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: lobbyId } = await params;
  const body = await request.json();

  // Support both new shape and legacy shape
  const senderId: string | undefined = body.sender_id ?? body.trader_id;
  const rawContent: string | undefined = body.content ?? body.text;

  if (!senderId || !rawContent?.trim()) {
    return NextResponse.json({ error: 'Missing sender_id or content' }, { status: 400 });
  }

  const content = rawContent.trim();

  if (content.length > 500) {
    return NextResponse.json({ error: 'Message too long (500 char max)' }, { status: 400 });
  }

  // Rate limit (1 msg/sec per user)
  if (!canSendMessage(senderId)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }

  const db = getServerSupabase();

  // Always look up sender info from the traders table (ignore body sender_role to prevent spoofing)
  const { data: trader } = await db
    .from('traders')
    .select('name')
    .eq('id', senderId)
    .eq('lobby_id', lobbyId)
    .single();

  if (!trader) {
    return NextResponse.json({ error: 'Invalid sender' }, { status: 403 });
  }

  const senderName: string = body.sender_name || trader.name;
  // is_competitor defaults to true; removed from SELECT due to PostgREST schema cache issue
  const senderRole: string = 'competitor';

  const filteredContent = filterMessage(content);

  // Insert into DB
  const { data: row, error } = await db
    .from('chat_messages')
    .insert({
      lobby_id: lobbyId,
      sender_id: senderId,
      sender_name: senderName,
      sender_role: senderRole,
      content: filteredContent,
      message_type: 'text',
    })
    .select('id, lobby_id, sender_id, sender_name, sender_role, content, message_type, created_at')
    .single();

  if (error || !row) {
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }

  // Build ChatMessage for broadcast + response
  const message: ChatMessage = {
    id: row.id,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    sender_role: row.sender_role as ChatMessage['sender_role'],
    text: row.content,
    timestamp: row.created_at,
  };

  // Broadcast to Realtime channel (fire-and-forget)
  const ch = supabase.channel(chatChannel(lobbyId));
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await ch.send({ type: 'broadcast', event: 'chat', payload: message });
      setTimeout(() => supabase.removeChannel(ch), 500);
    }
  });

  return NextResponse.json({ message });
}
