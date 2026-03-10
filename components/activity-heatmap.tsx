'use client';

import { useMemo, useState } from 'react';

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif";

interface ActivityHeatmapProps {
  data: Array<{ date: string; value: number }>;
  days?: number;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function getCellColor(value: number): string {
  if (value === 0) return '#111';
  if (value > 0) {
    if (value < 0.33) return '#2A1520';
    if (value < 0.66) return '#4A2040';
    return '#F5A0D0';
  }
  // negative
  const abs = Math.abs(value);
  if (abs < 0.33) return '#2A1515';
  if (abs < 0.66) return '#4A2020';
  return '#FF3333';
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function displayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ActivityHeatmap({ data, days = 90 }: ActivityHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const { grid, monthLabels, columns } = useMemo(() => {
    const dataMap = new Map<string, number>();
    data.forEach((d) => dataMap.set(d.date, d.value));

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);

    // Align start to a Sunday
    const startDow = start.getDay();
    if (startDow !== 0) {
      start.setDate(start.getDate() - startDow);
    }

    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const cols = Math.ceil(totalDays / 7);

    const cells: Array<{ date: string; value: number; row: number; col: number }> = [];
    const labels: Array<{ label: string; col: number }> = [];
    const seenMonths = new Set<string>();

    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = formatDate(d);
      const col = Math.floor(i / 7);
      const row = i % 7;
      const value = dataMap.get(dateStr) ?? 0;
      cells.push({ date: dateStr, value, row, col });

      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      if (!seenMonths.has(monthKey) && row === 0) {
        seenMonths.add(monthKey);
        labels.push({ label: MONTHS[d.getMonth()], col });
      }
    }

    return { grid: cells, monthLabels: labels, columns: cols };
  }, [data, days]);

  const cellSize = 12;
  const gap = 2;
  const step = cellSize + gap;

  return (
    <div style={{ position: 'relative' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 12,
        }}
      >
        <span style={{ fontFamily: B, fontSize: 13, color: '#888', letterSpacing: '0.05em' }}>
          TRADING ACTIVITY
        </span>
        <span style={{ fontFamily: B, fontSize: 13, color: '#888', letterSpacing: '0.05em' }}>
          LAST {days} DAYS
        </span>
      </div>

      {/* Grid */}
      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <svg
          width={columns * step + gap}
          height={7 * step + 20}
          style={{ display: 'block' }}
        >
          {grid.map((cell, i) => (
            <rect
              key={i}
              x={cell.col * step}
              y={cell.row * step}
              width={cellSize}
              height={cellSize}
              fill={getCellColor(cell.value)}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pctStr = cell.value !== 0
                  ? `${cell.value > 0 ? '+' : ''}${(cell.value * 100).toFixed(1)}%`
                  : 'No activity';
                setTooltip({
                  x: rect.left + rect.width / 2,
                  y: rect.top - 8,
                  text: `${displayDate(cell.date)}: ${pctStr}`,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}

          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={m.col * step}
              y={7 * step + 14}
              fill="#555"
              style={{ fontFamily: B, fontSize: 10, letterSpacing: '0.05em' }}
            >
              {m.label}
            </text>
          ))}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#1A1A1A',
            border: '1px solid #333',
            borderRadius: 0,
            padding: '4px 8px',
            fontFamily: M,
            fontSize: 10,
            color: '#FFF',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
