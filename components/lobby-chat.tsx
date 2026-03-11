'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { chatChannel, type ChatMessage } from '@/lib/chat';
import { font, c, radius } from '@/app/design';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LobbyChatProps {
  lobbyId: string;
  userId: string;
  userName: string;
  userRole: 'competitor' | 'spectator' | 'admin';
  collapsed?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 100;
const QUICK_REACTIONS = ['\u{1F525}', '\u{1F4C8}', '\u{1F4C9}', '\u{1F602}', '\u{1F480}', '\u{1F680}'];

const ROLE_COLORS: Record<string, string> = {
  admin: '#F5A0D0',
  system: '#00DC82',
  competitor: '#FFFFFF',
  spectator: '#999999',
};

const ROLE_BADGES: Record<string, string> = {
  admin: '\u26A1',
  system: '\u{1F514}',
};

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LobbyChat({ lobbyId, userId, userName, userRole, collapsed: initialCollapsed }: LobbyChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [collapsed, setCollapsed] = useState(initialCollapsed ?? true);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch message history on mount
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/chat?limit=50`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        // API returns newest-first; reverse to chronological order for display
        const history: ChatMessage[] = (data.messages ?? []).reverse();
        setMessages(history);
      } catch {
        // Silently fail — chat will still work via realtime
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
  }, [lobbyId]);

  // Subscribe to realtime chat for new messages
  useEffect(() => {
    const channel = supabase.channel(chatChannel(lobbyId));

    channel
      .on('broadcast', { event: 'chat' }, ({ payload }: { payload: ChatMessage }) => {
        if (!payload?.id) return;
        setMessages((prev) => {
          // Dedupe (handles race between POST response and broadcast)
          if (prev.some((m) => m.id === payload.id)) return prev;
          const next = [...prev, payload];
          if (next.length > MAX_MESSAGES) next.splice(0, next.length - MAX_MESSAGES);
          return next;
        });
        // If collapsed, bump unread
        setCollapsed((c) => {
          if (c) setUnread((u) => u + 1);
          return c;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lobbyId]);

  // Auto-scroll on new messages when open
  useEffect(() => {
    if (!collapsed) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, collapsed]);

  // Clear unread when opening
  useEffect(() => {
    if (!collapsed) setUnread(0);
  }, [collapsed]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`/api/lobby/${lobbyId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: userId,
          sender_name: userName,
          sender_role: userRole,
          content: text.trim(),
        }),
      });
    } catch {
      // Silently fail — message won't persist but chat stays functional
    }
    setSending(false);
  }, [lobbyId, userId, userName, userRole, sending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  const handleReaction = (emoji: string) => {
    sendMessage(emoji);
  };

  // ─── Collapsed: floating toggle button ───
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 200,
          width: 52,
          height: 52,
          borderRadius: radius.md,
          background: c.surface,
          border: `1px solid ${c.border}`,
          color: c.text2,
          fontFamily: font.sans,
          fontSize: 20,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all .2s',
          boxShadow: '0 4px 24px rgba(0,0,0,.5)',
        }}
      >
        <span style={{ fontSize: 22 }}>{'\u{1F4AC}'}</span>
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: 20,
            height: 20,
            borderRadius: radius.pill,
            background: c.pink,
            color: c.bg,
            fontFamily: font.mono,
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    );
  }

  // ─── Open: chat panel ───
  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 200,
      width: 340,
      maxWidth: 'calc(100vw - 40px)',
      height: 440,
      maxHeight: 'calc(100vh - 100px)',
      display: 'flex',
      flexDirection: 'column',
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: radius.md,
      boxShadow: '0 8px 40px rgba(0,0,0,.6)',
      overflow: 'hidden',
      animation: 'chatSlideUp .25s ease-out',
    }}>
      <style>{`
        @keyframes chatSlideUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }
        .chat-input:focus { border-color: ${c.pink} !important; }
        .reaction-btn { transition: transform .1s; }
        .reaction-btn:hover { transform: scale(1.25) !important; }
        .reaction-btn:active { transform: scale(0.9) !important; }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: `1px solid ${c.border}`,
        background: c.elevated,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: font.display, fontSize: 16, color: c.text, letterSpacing: '0.05em' }}>CHAT</span>
          <span style={{
            fontFamily: font.mono,
            fontSize: 10,
            color: c.text3,
            background: c.bg,
            padding: '2px 6px',
            borderRadius: radius.sm,
          }}>
            {messages.length}
          </span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          style={{
            background: 'none',
            border: 'none',
            color: c.text3,
            fontFamily: font.mono,
            fontSize: 16,
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          {'\u2715'}
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {loadingHistory && messages.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
          }}>
            <span style={{ fontFamily: font.sans, fontSize: 12, color: c.text4 }}>
              Loading messages...
            </span>
          </div>
        )}
        {!loadingHistory && messages.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 32,
          }}>
            <span style={{ fontSize: 28, opacity: 0.3 }}>{'\u{1F4AC}'}</span>
            <span style={{ fontFamily: font.sans, fontSize: 12, color: c.text4, textAlign: 'center' }}>
              No messages yet. Be the first to say something.
            </span>
          </div>
        )}
        {messages.map((msg) => {
          const isReaction = QUICK_REACTIONS.includes(msg.text);
          const roleColor = ROLE_COLORS[msg.sender_role] ?? c.text2;
          const badge = ROLE_BADGES[msg.sender_role] ?? msg.badge;

          if (isReaction) {
            return (
              <div key={msg.id} style={{
                padding: '2px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{ fontFamily: font.sans, fontSize: 11, color: roleColor, fontWeight: 600 }}>
                  {badge && <span style={{ marginRight: 3 }}>{badge}</span>}
                  {msg.sender_name}
                </span>
                <span style={{ fontSize: 18 }}>{msg.text}</span>
              </div>
            );
          }

          return (
            <div key={msg.id} style={{
              padding: '4px 14px',
              transition: 'background .1s',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{
                  fontFamily: font.sans,
                  fontSize: 12,
                  fontWeight: 600,
                  color: roleColor,
                  flexShrink: 0,
                }}>
                  {badge && <span style={{ marginRight: 2 }}>{badge}</span>}
                  {msg.sender_name}
                </span>
                <span style={{
                  fontFamily: font.mono,
                  fontSize: 9,
                  color: c.text4,
                  flexShrink: 0,
                }}>
                  {relativeTime(msg.timestamp)}
                </span>
              </div>
              <div style={{
                fontFamily: font.sans,
                fontSize: 13,
                color: c.text2,
                lineHeight: 1.4,
                wordBreak: 'break-word',
                marginTop: 1,
              }}>
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Quick reactions */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '6px 12px',
        borderTop: `1px solid ${c.border}`,
        flexShrink: 0,
      }}>
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            className="reaction-btn"
            onClick={() => handleReaction(emoji)}
            style={{
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: radius.sm,
              width: 36,
              height: 30,
              fontSize: 15,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        gap: 0,
        padding: '8px 10px 10px',
        borderTop: `1px solid ${c.border}`,
        flexShrink: 0,
      }}>
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message..."
          maxLength={500}
          style={{
            flex: 1,
            height: 36,
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRight: 'none',
            borderRadius: `${radius.sm}px 0 0 ${radius.sm}px`,
            color: c.text,
            fontFamily: font.sans,
            fontSize: 13,
            padding: '0 12px',
            outline: 'none',
            transition: 'border-color .15s',
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          style={{
            height: 36,
            padding: '0 16px',
            background: input.trim() ? c.pink : c.elevated,
            color: input.trim() ? c.bg : c.text4,
            border: 'none',
            borderRadius: `0 ${radius.sm}px ${radius.sm}px 0`,
            fontFamily: font.display,
            fontSize: 14,
            letterSpacing: '0.05em',
            cursor: input.trim() ? 'pointer' : 'default',
            transition: 'all .15s',
            flexShrink: 0,
          }}
        >
          SEND
        </button>
      </form>
    </div>
  );
}
