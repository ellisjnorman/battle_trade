'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif";

interface LobbyCardProps {
  id: string;
  name: string;
  format: string;
  status: 'waiting' | 'active' | 'completed';
  playerCount: number;
  spectatorCount: number;
  entryFee?: number;
  prizePool?: number;
  currentRound?: { number: number; total?: number; timeRemaining?: number };
  topTrader?: { name: string; returnPct: number };
  inviteCode?: string;
}

const STATUS_CONFIG = {
  waiting: { label: 'STARTING SOON', color: '#F5A623', dot: false },
  active: { label: 'LIVE', color: '#00FF88', dot: true },
  completed: { label: 'COMPLETED', color: '#666', dot: false },
} as const;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LobbyCard({
  id,
  name,
  format,
  status,
  playerCount,
  spectatorCount,
  entryFee,
  prizePool,
  currentRound,
  topTrader,
  inviteCode,
}: LobbyCardProps) {
  const router = useRouter();
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      onClick={() => router.push(`/lobby/${id}`)}
      style={{
        backgroundColor: '#0D0D0D',
        border: '1px solid #1A1A1A',
        borderRadius: 0,
        padding: 20,
        cursor: 'pointer',
        position: 'relative',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#333';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#1A1A1A';
      }}
    >
      {/* Status badge */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {cfg.dot && (
          <span
            style={{
              width: 6,
              height: 6,
              backgroundColor: cfg.color,
              display: 'inline-block',
              animation: 'lobbyCardPulse 1.5s ease-in-out infinite',
            }}
          />
        )}
        <span
          style={{
            fontFamily: M,
            fontSize: 10,
            color: cfg.color,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Lobby name */}
      <div
        style={{
          fontFamily: B,
          fontSize: 22,
          color: '#FFF',
          letterSpacing: '0.03em',
          marginBottom: 8,
          paddingRight: 100,
        }}
      >
        {name}
      </div>

      {/* Format badge */}
      <div
        style={{
          display: 'inline-block',
          border: '1px solid #333',
          borderRadius: 0,
          padding: '2px 8px',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily: M,
            fontSize: 10,
            color: '#888',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {format}
        </span>
      </div>

      {/* Stats row */}
      <div
        style={{
          fontFamily: S,
          fontSize: 12,
          color: '#888',
          marginBottom: 10,
        }}
      >
        {playerCount} player{playerCount !== 1 ? 's' : ''} &middot; {spectatorCount} watching
      </div>

      {/* Top trader (active only) */}
      {status === 'active' && topTrader && (
        <div
          style={{
            fontFamily: M,
            fontSize: 13,
            color: topTrader.returnPct >= 0 ? '#00FF88' : '#FF3333',
            marginBottom: 8,
          }}
        >
          #1 {topTrader.name} {topTrader.returnPct >= 0 ? '+' : ''}
          {topTrader.returnPct.toFixed(1)}%
        </div>
      )}

      {/* Current round */}
      {currentRound && (
        <div
          style={{
            fontFamily: M,
            fontSize: 12,
            color: '#888',
            marginBottom: 12,
          }}
        >
          R{currentRound.number}
          {currentRound.total ? `/${currentRound.total}` : ''}
          {currentRound.timeRemaining != null && ` \u00b7 ${formatTime(currentRound.timeRemaining)}`}
        </div>
      )}

      {/* Bottom row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid #1A1A1A',
        }}
      >
        {/* Entry fee */}
        <div
          style={{
            fontFamily: M,
            fontSize: 12,
            color: entryFee ? '#F5A0D0' : '#555',
            letterSpacing: '0.05em',
          }}
        >
          {entryFee ? `$${entryFee} BUY-IN` : 'FREE'}
          {prizePool != null && prizePool > 0 && (
            <span style={{ color: '#555', marginLeft: 8 }}>
              ${prizePool} POOL
            </span>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/lobby/${id}`);
            }}
            onMouseEnter={() => setHoveredBtn('watch')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              fontFamily: B,
              fontSize: 11,
              color: hoveredBtn === 'watch' ? '#FFF' : '#888',
              backgroundColor: 'transparent',
              border: `1px solid ${hoveredBtn === 'watch' ? '#FFF' : '#1A1A1A'}`,
              borderRadius: 0,
              padding: '5px 12px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              transition: 'all 0.15s',
            }}
          >
            WATCH
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/lobby/${id}`);
            }}
            onMouseEnter={() => setHoveredBtn('join')}
            onMouseLeave={() => setHoveredBtn(null)}
            style={{
              fontFamily: B,
              fontSize: 11,
              color: '#0A0A0A',
              backgroundColor: hoveredBtn === 'join' ? '#F7B0DA' : '#F5A0D0',
              border: 'none',
              borderRadius: 0,
              padding: '6px 14px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              fontWeight: 700,
              transition: 'background-color 0.15s',
            }}
          >
            JOIN
          </button>
        </div>
      </div>

      <style>{`
        @keyframes lobbyCardPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
