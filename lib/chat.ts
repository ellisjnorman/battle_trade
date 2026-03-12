/**
 * Lobby chat system — real-time messaging via Supabase Realtime broadcast.
 * No DB persistence (ephemeral chat like Twitch). Messages live in the channel only.
 */

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'competitor' | 'spectator' | 'admin' | 'system';
  text: string;
  timestamp: string;
  badge?: string; // emoji badge next to name
}

export interface ChatReaction {
  emoji: string;
  sender_name: string;
  timestamp: string;
}

/** Generate a channel name for lobby chat */
export function chatChannel(lobbyId: string): string {
  return `lobby-${lobbyId}-chat`;
}

/** System message factory */
export function systemMessage(text: string): ChatMessage {
  return {
    id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    sender_id: 'system',
    sender_name: 'SYSTEM',
    sender_role: 'system',
    text,
    timestamp: new Date().toISOString(),
  };
}

/** Admin broadcast message factory */
export function adminBroadcast(text: string): ChatMessage {
  return {
    id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    sender_id: 'admin',
    sender_name: 'MISSION CONTROL',
    sender_role: 'admin',
    text,
    timestamp: new Date().toISOString(),
    badge: '⚡',
  };
}

// Rate limiting: max 1 message per second per user
const lastMessageTime = new Map<string, number>();
const MAX_RATE_LIMIT_ENTRIES = 10_000;

export function canSendMessage(senderId: string): boolean {
  const now = Date.now();
  const last = lastMessageTime.get(senderId) ?? 0;
  if (now - last < 1000) return false;
  lastMessageTime.set(senderId, now);

  // Prevent unbounded growth: evict stale entries when map gets large
  if (lastMessageTime.size > MAX_RATE_LIMIT_ENTRIES) {
    for (const [key, ts] of lastMessageTime) {
      if (now - ts > 60_000) lastMessageTime.delete(key);
    }
  }
  return true;
}

// Profanity filter (basic — extend as needed)
const BLOCKED_WORDS = ['fuck', 'shit', 'nigger', 'faggot', 'retard'];
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED_WORDS.join('|')})\\b`, 'gi');

export function filterMessage(text: string): string {
  return text.replace(BLOCKED_RE, (match) => '*'.repeat(match.length));
}
