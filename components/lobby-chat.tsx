'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { chatChannel, type ChatMessage } from '@/lib/chat';
import { font, c, radius } from '@/app/design';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Slash command parsed from chat input */
export interface ChatCommand {
  command: string;   // e.g. 'buy', 'long', 'short', 'close', 'balance', 'rank', 'help'
  args: string[];    // remaining tokens
  raw: string;       // full input string
}

interface LobbyChatProps {
  lobbyId: string;
  userId: string;
  userName: string;
  userRole: 'competitor' | 'spectator' | 'admin';
  collapsed?: boolean;
  /** Render inline (not floating) — for embedding in sidebars */
  embedded?: boolean;
  /** Render as bottom panel (full-width, no collapse) */
  bottomPanel?: boolean;
  /** Called when user enters a /command */
  onCommand?: (cmd: ChatCommand) => void;
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

const SLASH_COMMANDS: Record<string, string> = {
  '/buy': 'Spot buy an asset — /buy BTC 1000',
  '/long': 'Open long position — /long ETH 2000',
  '/short': 'Open short position — /short SOL 500',
  '/close': 'Close position — /close all or /close BTC',
  '/balance': 'Show your current balance',
  '/rank': 'Show your current rank',
  '/positions': 'List your open positions',
  '/help': 'Show available commands',
};

function parseCommand(input: string): ChatCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.split(/\s+/);
  const command = parts[0].slice(1).toLowerCase(); // remove '/'
  return { command, args: parts.slice(1), raw: trimmed };
}

export default function LobbyChat({ lobbyId, userId, userName, userRole, collapsed: initialCollapsed, embedded, bottomPanel, onCommand }: LobbyChatProps) {
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
      // Build auth headers — include trader code + guest ID if available
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const traderCode = params.get('code');
        if (traderCode) headers['X-Trader-Code'] = traderCode;
        try {
          const g = JSON.parse(localStorage.getItem('bt_guest') ?? '{}');
          if (g?.guest_id) headers['X-Guest-Id'] = g.guest_id;
        } catch {}
      }
      const res = await fetch(`/api/lobby/${lobbyId}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sender_id: userId,
          sender_name: userName,
          sender_role: userRole,
          content: text.trim(),
        }),
      });
      if (!res.ok) {
        console.error('[chat] send failed:', res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      console.error('[chat] send error:', err);
    }
    setSending(false);
  }, [lobbyId, userId, userName, userRole, sending]);

  const [commandHint, setCommandHint] = useState<string | null>(null);

  // Show command hint while typing
  useEffect(() => {
    if (input.startsWith('/')) {
      const parts = input.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const match = Object.entries(SLASH_COMMANDS).find(([k]) => k.startsWith(cmd));
      setCommandHint(match ? match[1] : null);
    } else {
      setCommandHint(null);
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Check for slash commands
    const cmd = parseCommand(input);
    if (cmd && onCommand) {
      if (cmd.command === 'help') {
        // Show help as a local system message
        const helpText = Object.entries(SLASH_COMMANDS).map(([k, v]) => `${k} — ${v}`).join('\n');
        setMessages(prev => [...prev, {
          id: `help-${Date.now()}`,
          sender_id: 'system',
          sender_name: 'SYSTEM',
          sender_role: 'system',
          text: helpText,
          timestamp: new Date().toISOString(),
          lobby_id: lobbyId,
        }]);
      } else {
        onCommand(cmd);
      }
      setInput('');
      return;
    }

    sendMessage(input);
    setInput('');
  };

  const handleReaction = (emoji: string) => {
    sendMessage(emoji);
  };

  // ─── Bottom panel mode: full-width, always visible ───
  if (bottomPanel) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#0D0D0D' }}>
        <div style={{ padding: '6px 20px', borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", fontSize: 14, color: '#777', letterSpacing: '0.05em' }}>CHAT</span>
            <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", fontSize: 10, color: '#555', background: '#111', padding: '1px 6px', borderRadius: 3 }}>{messages.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                style={{ background: 'none', border: '1px solid #1A1A1A', borderRadius: 4, width: 28, height: 24, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 100ms' }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0', minHeight: 0 }}>
          {messages.length === 0 && (
            <div style={{ padding: '16px 20px', textAlign: 'center' }}>
              <span style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif", fontSize: 12, color: '#333' }}>No messages yet — type /help for commands</span>
            </div>
          )}
          {messages.map((msg) => {
            const isCmd = msg.sender_role === 'system';
            const roleColor = ROLE_COLORS[msg.sender_role] ?? '#FFF';
            const badge = ROLE_BADGES[msg.sender_role] ?? undefined;
            return (
              <div key={msg.id} style={{ padding: '3px 20px', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif", fontSize: 12, fontWeight: 600, color: roleColor, flexShrink: 0 }}>
                  {badge && <span style={{ marginRight: 2 }}>{badge}</span>}
                  {msg.sender_name}
                </span>
                <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", fontSize: 9, color: '#444', flexShrink: 0 }}>{relativeTime(msg.timestamp)}</span>
                <span style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif", fontSize: 13, color: isCmd ? '#00DC82' : '#CCC', lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: isCmd ? 'pre-wrap' : undefined }}>{msg.text}</span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {/* Command hint */}
        {commandHint && (
          <div style={{ padding: '4px 20px', background: '#111', borderTop: '1px solid #1A1A1A', flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", fontSize: 10, color: '#F5A0D0' }}>{commandHint}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', padding: '6px 16px 8px', borderTop: '1px solid #1A1A1A', gap: 0, flexShrink: 0 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message or /command..."
            maxLength={500}
            style={{ flex: 1, fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif", fontSize: 13, color: '#FFF', background: '#0A0A0A', border: '1px solid #222', borderRight: 'none', borderRadius: '4px 0 0 4px', padding: '8px 12px', outline: 'none', height: 36 }}
          />
          <button type="submit" disabled={!input.trim() || sending} style={{ fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", fontSize: 13, color: input.trim() ? '#0A0A0A' : '#333', background: input.trim() ? '#F5A0D0' : '#1A1A1A', border: 'none', borderRadius: '0 4px 4px 0', padding: '0 16px', cursor: input.trim() ? 'pointer' : 'default', height: 36, transition: 'all 150ms', letterSpacing: '0.05em' }}>SEND</button>
        </form>
      </div>
    );
  }

  // ─── Embedded mode: inline in sidebar ───
  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ padding: '6px 14px', borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", fontSize: 12, color: '#777', letterSpacing: '0.05em' }}>CHAT</span>
          <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", fontSize: 9, color: '#555' }}>{messages.length}</span>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {messages.length === 0 && (
            <div style={{ padding: '16px 14px', textAlign: 'center' }}>
              <span style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif", fontSize: 11, color: '#333' }}>No messages yet</span>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} style={{ padding: '2px 14px' }}>
              <span style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif", fontSize: 11, fontWeight: 600, color: ROLE_COLORS[msg.sender_role] ?? '#FFF' }}>{msg.sender_name}</span>
              <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", fontSize: 8, color: '#555', marginLeft: 4 }}>{relativeTime(msg.timestamp)}</span>
              <div style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif", fontSize: 12, color: '#CCC', lineHeight: 1.3, wordBreak: 'break-word' }}>{msg.text}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', padding: '4px 8px', borderTop: '1px solid #1A1A1A', gap: 4, flexShrink: 0 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Say something..."
            maxLength={200}
            style={{ flex: 1, fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif", fontSize: 12, color: '#FFF', background: '#111', border: '1px solid #222', padding: '6px 8px', outline: 'none', minHeight: 32 }}
          />
          <button type="submit" disabled={!input.trim() || sending} style={{ fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", fontSize: 11, color: input.trim() ? '#F5A0D0' : '#333', background: 'none', border: '1px solid #222', padding: '4px 10px', cursor: input.trim() ? 'pointer' : 'default', minHeight: 32 }}>SEND</button>
        </form>
      </div>
    );
  }

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
