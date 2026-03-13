'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Fonts (match design system)
// ---------------------------------------------------------------------------
const B: React.CSSProperties = { fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", letterSpacing: '0.05em' };
const M: React.CSSProperties = { fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", letterSpacing: '-0.02em' };
const S: React.CSSProperties = { fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif" };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TutorialStep {
  icon: string;
  title: string;
  description: string;
  highlight?: string; // CSS selector or area label (for visual reference)
}

export type TutorialRole = 'player' | 'spectator' | 'admin';

interface TutorialOverlayProps {
  role: TutorialRole;
  lobbyId: string;
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Step definitions per role
// ---------------------------------------------------------------------------
const PLAYER_STEPS: TutorialStep[] = [
  {
    icon: '📈',
    title: 'PICK YOUR ASSET',
    description: 'Tap the asset bar at the top to choose what you want to trade. BTC, ETH, SOL, memes, equities — over 50 markets available.',
  },
  {
    icon: '⬆️',
    title: 'GO LONG OR SHORT',
    description: 'Think the price will go up? Go LONG. Think it\'ll drop? Go SHORT. Pick your direction, then set your size and leverage.',
  },
  {
    icon: '🎚️',
    title: 'SET YOUR LEVERAGE',
    description: 'Drag the slider to set leverage. Higher leverage = bigger gains OR bigger losses. Watch the liquidation price — if it hits, you\'re out.',
  },
  {
    icon: '🚀',
    title: 'USE STRATEGY PRESETS',
    description: 'No time to think? Hit a strategy preset to auto-open multiple positions. Blue Chip for safety, Degen for max risk.',
  },
  {
    icon: '🛡️',
    title: 'DEFEND YOURSELF',
    description: 'Other players can trigger market events against you. Use defense tools (hedge, dark pool, resume) to protect your portfolio.',
  },
  {
    icon: '⚡',
    title: 'ATTACK YOUR RIVALS',
    description: 'Tap a rival in the standings to target them, then trigger events — exchange outages, margin calls, flash crashes. Costs credits.',
  },
  {
    icon: '📊',
    title: 'ORDER BOOK',
    description: 'Toggle the order book to see real bid/ask depth from Hyperliquid. See where the liquidity sits before you trade.',
  },
  {
    icon: '🏆',
    title: 'CLIMB THE RANKS',
    description: 'Your goal: highest return % when the round ends. Stay alive, manage risk, and outperform everyone else.',
  },
];

const SPECTATOR_STEPS: TutorialStep[] = [
  {
    icon: '👁',
    title: 'WATCH THE ACTION',
    description: 'See every trade, event, and position change in real-time. The live feed shows you everything happening in the lobby.',
  },
  {
    icon: '⚡',
    title: 'TRIGGER MARKET EVENTS',
    description: 'Spend credits to trigger events against traders — exchange outages, margin calls, regulatory halts. Chaos is currency.',
  },
  {
    icon: '🎲',
    title: 'PREDICT THE WINNER',
    description: 'Place bets on who\'ll win the round. Call it right and earn credits. The odds shift in real-time based on performance.',
  },
  {
    icon: '💰',
    title: 'EARN & SPEND CREDITS',
    description: 'You start with free credits. Earn more from correct predictions. Spend them on events to shake up the leaderboard.',
  },
  {
    icon: '😂',
    title: 'REACT & CHAT',
    description: 'Smash reaction buttons to show your emotions. Chat with other spectators and talk trash.',
  },
];

const ADMIN_STEPS: TutorialStep[] = [
  {
    icon: '🎮',
    title: 'YOU\'RE THE TRADE MASTER',
    description: 'You control the entire battle. Start rounds, trigger events, eliminate players, and manage the competition flow.',
  },
  {
    icon: '▶️',
    title: 'ROUND CONTROLS',
    description: 'Create rounds with the big action buttons. Start, freeze, and end rounds. Set round duration and starting balance.',
  },
  {
    icon: '🌪️',
    title: 'EVENT PRESETS',
    description: 'One-click event presets: CRASH, PUMP, CHAOS, PUNISH, COMEBACK. Each fires a curated market event with narrative flavor.',
  },
  {
    icon: '⚡',
    title: 'MANUAL EVENTS',
    description: 'Go custom — pick an event type, target asset, magnitude, and duration. Fire it manually for precise control.',
  },
  {
    icon: '📊',
    title: 'MONITOR TRADERS',
    description: 'Left panel shows every trader\'s health, P&L, open positions, and activity. Spot who\'s idle, who\'s winning, who\'s about to get liquidated.',
  },
  {
    icon: '💀',
    title: 'ELIMINATE & LIQUIDATE',
    description: 'Eliminate bottom performers between rounds. Force-liquidate positions. Close all positions at once. You have full control.',
  },
  {
    icon: '🔗',
    title: 'BROADCAST VIEWS',
    description: 'Use the nav links (SPECTATE, OBS, CAST, STAGE, BOARD) to access broadcast overlays for streaming and live events.',
  },
];

const STEPS_MAP: Record<TutorialRole, TutorialStep[]> = {
  player: PLAYER_STEPS,
  spectator: SPECTATOR_STEPS,
  admin: ADMIN_STEPS,
};

const ROLE_TITLES: Record<TutorialRole, string> = {
  player: 'TRADER BOOTCAMP',
  spectator: 'SPECTATOR GUIDE',
  admin: 'TRADE MASTER BRIEFING',
};

const ROLE_SUBTITLES: Record<TutorialRole, string> = {
  player: 'Everything you need to compete and win',
  spectator: 'How to watch, bet, and cause chaos',
  admin: 'Your command center walkthrough',
};

// ---------------------------------------------------------------------------
// localStorage key helper
// ---------------------------------------------------------------------------
function getTutorialKey(role: TutorialRole, lobbyId: string): string {
  return `bt_tutorial_${role}_${lobbyId}`;
}

export function hasSeen(role: TutorialRole, lobbyId: string): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(getTutorialKey(role, lobbyId)) === 'done';
}

export function markSeen(role: TutorialRole, lobbyId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getTutorialKey(role, lobbyId), 'done');
}

export function resetTutorial(role: TutorialRole, lobbyId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getTutorialKey(role, lobbyId));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function TutorialOverlay({ role, lobbyId, onComplete }: TutorialOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = STEPS_MAP[role];
  const total = steps.length;

  useEffect(() => {
    if (!hasSeen(role, lobbyId)) {
      // Small delay so the page renders first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [role, lobbyId]);

  const handleNext = useCallback(() => {
    if (currentStep < total - 1) {
      setCurrentStep(s => s + 1);
    } else {
      markSeen(role, lobbyId);
      setVisible(false);
      onComplete?.();
    }
  }, [currentStep, total, role, lobbyId, onComplete]);

  const handleSkip = useCallback(() => {
    markSeen(role, lobbyId);
    setVisible(false);
    onComplete?.();
  }, [role, lobbyId, onComplete]);

  if (!visible) return null;

  const step = steps[currentStep];
  const isLast = currentStep === total - 1;
  const progress = ((currentStep + 1) / total) * 100;

  return (
    <>
      <style>{`
        @keyframes tutorialFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tutorialSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes tutorialIconPop { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes tutorialProgressFill { from { width: 0; } }
        @keyframes tutorialGlow { 0%, 100% { box-shadow: 0 0 20px rgba(245,160,208,0.2); } 50% { box-shadow: 0 0 40px rgba(245,160,208,0.4); } }
      `}</style>

      <div
        onClick={(e) => { if (e.target === e.currentTarget) handleSkip(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24,
          animation: 'tutorialFadeIn 300ms ease-out',
        }}
      >
        <div style={{
          width: '100%', maxWidth: 420,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          animation: 'tutorialSlideUp 400ms ease-out',
        }}>

          {/* Header — only on first step */}
          {currentStep === 0 && (
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ ...B, fontSize: 42, color: '#FFF', lineHeight: 1 }}>{ROLE_TITLES[role]}</div>
              <div style={{ ...S, fontSize: 14, color: '#888', marginTop: 8 }}>{ROLE_SUBTITLES[role]}</div>
            </div>
          )}

          {/* Step counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <span style={{ ...M, fontSize: 11, color: '#F5A0D0' }}>{currentStep + 1}/{total}</span>
            {/* Progress dots */}
            <div style={{ display: 'flex', gap: 4 }}>
              {steps.map((_, i) => (
                <div
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  style={{
                    width: i === currentStep ? 20 : 8,
                    height: 8,
                    background: i <= currentStep ? '#F5A0D0' : '#333',
                    cursor: 'pointer',
                    transition: 'all 200ms',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div
            key={`icon-${currentStep}`}
            style={{
              fontSize: 56,
              marginBottom: 20,
              animation: 'tutorialIconPop 400ms ease-out',
            }}
          >
            {step.icon}
          </div>

          {/* Title */}
          <div
            key={`title-${currentStep}`}
            style={{
              ...B, fontSize: 32, color: '#FFF', textAlign: 'center', lineHeight: 1,
              animation: 'tutorialSlideUp 300ms ease-out',
            }}
          >
            {step.title}
          </div>

          {/* Description */}
          <div
            key={`desc-${currentStep}`}
            style={{
              ...S, fontSize: 15, color: '#999', textAlign: 'center', lineHeight: 1.5,
              marginTop: 12, maxWidth: 340,
              animation: 'tutorialSlideUp 400ms ease-out',
            }}
          >
            {step.description}
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%', height: 3, background: '#1A1A1A', marginTop: 32, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #F5A0D060, #F5A0D0)', transition: 'width 300ms ease' }} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 20, width: '100%' }}>
            <button
              onClick={handleSkip}
              style={{
                flex: 0, padding: '0 20px', minHeight: 52,
                ...B, fontSize: 14, color: '#555',
                background: 'transparent', border: '1px solid #333',
                cursor: 'pointer', transition: 'all 150ms',
              }}
            >
              SKIP
            </button>
            <button
              onClick={handleNext}
              style={{
                flex: 1, minHeight: 52,
                ...B, fontSize: 20, color: '#0A0A0A',
                background: '#F5A0D0', border: 'none',
                cursor: 'pointer', transition: 'all 150ms',
                animation: isLast ? 'tutorialGlow 2s ease-in-out infinite' : 'none',
              }}
            >
              {isLast ? 'LET\'S GO' : 'NEXT'}
            </button>
          </div>

          {/* Back button (after first step) */}
          {currentStep > 0 && (
            <button
              onClick={() => setCurrentStep(s => s - 1)}
              style={{
                ...M, fontSize: 11, color: '#555', background: 'none', border: 'none',
                cursor: 'pointer', marginTop: 12, padding: '4px 8px',
              }}
            >
              ← BACK
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Trigger button — drop this into any page to let users re-open the tutorial
// ---------------------------------------------------------------------------
export function TutorialTrigger({ role, lobbyId, onOpen }: { role: TutorialRole; lobbyId: string; onOpen: () => void }) {
  return (
    <button
      onClick={() => {
        resetTutorial(role, lobbyId);
        onOpen();
      }}
      style={{
        ...M, fontSize: 9, color: '#555',
        background: 'transparent', border: '1px solid #222',
        padding: '3px 8px', cursor: 'pointer',
        transition: 'all 150ms',
      }}
    >
      ? TUTORIAL
    </button>
  );
}
