'use client';

import { useMemo, useState } from 'react';

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif";

interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface BadgeGridProps {
  earned: Array<{ id: string; name: string; icon: string; earned_at: string }>;
  definitions: BadgeDef[];
  compact?: boolean;
}

const RARITY_COLORS: Record<string, string> = {
  common: '#888',
  rare: '#00BFFF',
  epic: '#9B59B6',
  legendary: '#FFD700',
};

const CATEGORY_ORDER = ['PERFORMANCE', 'COMBAT', 'TRADING', 'COMMUNITY', 'SPECIAL'];

function formatEarnedDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function BadgeGrid({ earned, definitions, compact }: BadgeGridProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    badge: BadgeDef;
    isEarned: boolean;
    earnedAt?: string;
  } | null>(null);

  const earnedSet = useMemo(() => new Set(earned.map((e) => e.id)), [earned]);
  const earnedMap = useMemo(() => {
    const m = new Map<string, string>();
    earned.forEach((e) => m.set(e.id, e.earned_at));
    return m;
  }, [earned]);

  const grouped = useMemo(() => {
    const map = new Map<string, BadgeDef[]>();
    definitions.forEach((def) => {
      const cat = def.category.toUpperCase();
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(def);
    });
    // Sort by predefined order
    const sorted: Array<[string, BadgeDef[]]> = [];
    for (const cat of CATEGORY_ORDER) {
      if (map.has(cat)) sorted.push([cat, map.get(cat)!]);
    }
    // Any remaining categories
    for (const [cat, defs] of map) {
      if (!CATEGORY_ORDER.includes(cat)) sorted.push([cat, defs]);
    }
    return sorted;
  }, [definitions]);

  const gridCols = compact ? 4 : 6;
  const iconSize = compact ? 22 : 28;
  const cellPad = compact ? 10 : 14;

  const renderBadgeCell = (def: BadgeDef) => {
    const isEarned = earnedSet.has(def.id);
    const rarityColor = RARITY_COLORS[def.rarity] ?? '#888';

    return (
      <div
        key={def.id}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setTooltip({
            x: rect.left + rect.width / 2,
            y: rect.top - 8,
            badge: def,
            isEarned,
            earnedAt: earnedMap.get(def.id),
          });
        }}
        onMouseLeave={() => setTooltip(null)}
        style={{
          backgroundColor: isEarned ? '#0D0D0D' : '#111',
          border: `1px solid ${isEarned ? rarityColor : '#222'}`,
          borderRadius: 0,
          padding: cellPad,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          transition: 'border-color 0.15s',
          opacity: isEarned ? 1 : 0.5,
        }}
      >
        <span
          style={{
            fontSize: iconSize,
            lineHeight: 1,
            opacity: isEarned ? 1 : 0.3,
            filter: isEarned ? 'none' : 'grayscale(1)',
          }}
        >
          {def.icon}
        </span>
        <span
          style={{
            fontFamily: B,
            fontSize: 11,
            color: isEarned ? '#FFF' : '#444',
            letterSpacing: '0.05em',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {def.name}
        </span>
      </div>
    );
  };

  return (
    <div style={{ position: 'relative' }}>
      {compact ? (
        /* Compact: flat grid, no category headers */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: 6,
          }}
        >
          {definitions.map(renderBadgeCell)}
        </div>
      ) : (
        /* Full: grouped by category */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {grouped.map(([category, defs]) => (
            <div key={category}>
              <div
                style={{
                  fontFamily: B,
                  fontSize: 13,
                  color: '#555',
                  letterSpacing: '0.08em',
                  marginBottom: 10,
                  borderBottom: '1px solid #1A1A1A',
                  paddingBottom: 6,
                }}
              >
                {category}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                  gap: 6,
                }}
              >
                {defs.map(renderBadgeCell)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#1A1A1A',
            border: `1px solid ${RARITY_COLORS[tooltip.badge.rarity] ?? '#333'}`,
            borderRadius: 0,
            padding: '8px 12px',
            maxWidth: 220,
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontFamily: B,
              fontSize: 13,
              color: '#FFF',
              letterSpacing: '0.05em',
              marginBottom: 4,
            }}
          >
            {tooltip.badge.name}
          </div>
          <div
            style={{
              fontFamily: S,
              fontSize: 11,
              color: '#999',
              lineHeight: 1.4,
              marginBottom: 6,
            }}
          >
            {tooltip.badge.description}
          </div>
          {tooltip.isEarned && tooltip.earnedAt ? (
            <div style={{ fontFamily: M, fontSize: 10, color: '#00FF88' }}>
              Earned {formatEarnedDate(tooltip.earnedAt)}
            </div>
          ) : (
            <div style={{ fontFamily: M, fontSize: 10, color: '#555' }}>LOCKED</div>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          /* Override grid columns for mobile */
        }
      `}</style>
    </div>
  );
}
