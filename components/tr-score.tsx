'use client';

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif";

interface TRScoreProps {
  score: number;
  tier: string;
  size?: 'sm' | 'md' | 'lg';
  showPillars?: boolean;
  pillars?: {
    performance: number;
    combat: number;
    strategy: number;
    community: number;
    streak: number;
  };
}

const TIER_COLORS: Record<string, string> = {
  paper_hands: '#555',
  retail: '#CD7F32',
  swing_trader: '#C0C0C0',
  market_maker: '#FFD700',
  whale: '#00BFFF',
  degen_king: '#F5A0D0',
  legendary: '#FFF',
};

function getTierColor(tier: string): string {
  return TIER_COLORS[tier.toLowerCase()] ?? '#888';
}

function formatTierName(tier: string): string {
  return tier.toUpperCase().replace(/_/g, ' ');
}

function SmallScore({ score, tier }: { score: number; tier: string }) {
  const color = getTierColor(tier);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: M,
        fontSize: 12,
        color: '#FFF',
      }}
    >
      TR {score}
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          backgroundColor: color,
          boxShadow: tier === 'legendary' ? `0 0 6px ${color}` : 'none',
        }}
      />
    </span>
  );
}

function PillarBars({
  pillars,
  tierColor,
  labelSize,
  barHeight,
}: {
  pillars: NonNullable<TRScoreProps['pillars']>;
  tierColor: string;
  labelSize: number;
  barHeight: number;
}) {
  const entries: [string, number][] = [
    ['PERFORMANCE', pillars.performance],
    ['COMBAT', pillars.combat],
    ['STRATEGY', pillars.strategy],
    ['COMMUNITY', pillars.community],
    ['STREAK', pillars.streak],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
      {entries.map(([label, value]) => (
        <div key={label}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <span style={{ fontFamily: B, fontSize: labelSize, color: '#888', letterSpacing: '0.05em' }}>
              {label}
            </span>
            <span style={{ fontFamily: M, fontSize: labelSize - 1, color: '#666' }}>
              {value}
            </span>
          </div>
          <div
            style={{
              height: barHeight,
              backgroundColor: '#1A1A1A',
              width: '100%',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, value))}%`,
                backgroundColor: tierColor,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TRScore({ score, tier, size = 'md', showPillars, pillars }: TRScoreProps) {
  const tierColor = getTierColor(tier);
  const isLegendary = tier.toLowerCase() === 'legendary';

  if (size === 'sm') {
    return <SmallScore score={score} tier={tier} />;
  }

  const isLg = size === 'lg';
  const scoreSize = isLg ? 72 : 48;
  const tierFontSize = isLg ? 16 : 14;

  return (
    <div
      style={{
        borderLeft: `3px solid ${tierColor}`,
        paddingLeft: isLg ? 24 : 16,
        position: 'relative',
      }}
    >
      {isLegendary && (
        <style>{`
          @keyframes trScoreGlow {
            0%, 100% { text-shadow: 0 0 8px rgba(255,255,255,0.6); }
            50% { text-shadow: 0 0 20px rgba(255,255,255,0.9), 0 0 40px rgba(255,255,255,0.4); }
          }
        `}</style>
      )}

      {/* Score number */}
      <div
        style={{
          fontFamily: B,
          fontSize: scoreSize,
          color: '#FFF',
          lineHeight: 1,
          letterSpacing: '0.02em',
          ...(isLegendary
            ? { animation: 'trScoreGlow 2s ease-in-out infinite' }
            : {}),
        }}
      >
        {score}
      </div>

      {/* Tier name */}
      <div
        style={{
          fontFamily: B,
          fontSize: tierFontSize,
          color: tierColor,
          letterSpacing: '0.08em',
          marginTop: 4,
        }}
      >
        {formatTierName(tier)}
      </div>

      {/* Pillar bars */}
      {showPillars && pillars && (
        <PillarBars
          pillars={pillars}
          tierColor={tierColor}
          labelSize={isLg ? 12 : 11}
          barHeight={isLg ? 6 : 4}
        />
      )}
    </div>
  );
}
