'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { font, c, radius } from '@/app/design';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PredictionPanelProps {
  lobbyId: string;
  bettorId?: string;       // undefined = view-only (broadcast)
  compact?: boolean;        // smaller layout for sidebar / OBS overlay
  credits?: number;         // current bettor credits (for bet validation)
  onCreditsChange?: (newBalance: number) => void;
  onBetPlaced?: (bet: BetConfirmation) => void;
}

export interface MarketOutcome {
  id: string;
  team_id: string;
  team_name: string;
  probability: number;
  odds: number;
  volume: number;
}

export interface MarketData {
  id: string;
  lobby_id: string;
  round_id: string;
  question: string;
  total_volume: number;
  status: 'open' | 'suspended' | 'resolved';
  outcomes: MarketOutcome[];
}

export interface BetConfirmation {
  outcome_id: string;
  team_name: string;
  amount: number;
  potential_payout: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PredictionPanel({
  lobbyId,
  bettorId,
  compact = false,
  credits = 0,
  onCreditsChange,
  onBetPlaced,
}: PredictionPanelProps) {
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState<number | null>(null);
  const [confirmBet, setConfirmBet] = useState(false);
  const [placingBet, setPlacingBet] = useState(false);
  const [betResult, setBetResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lockedBet, setLockedBet] = useState<BetConfirmation | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Fetch markets
  // -----------------------------------------------------------------------

  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/predictions`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.markets) {
        setMarkets(data.markets);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [lobbyId]);

  // -----------------------------------------------------------------------
  // Polling (5s) + Supabase Realtime
  // -----------------------------------------------------------------------

  useEffect(() => {
    fetchMarkets();
    pollRef.current = setInterval(fetchMarkets, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMarkets]);

  useEffect(() => {
    const ch = supabase.channel(`predictions-${lobbyId}`);
    ch.on('broadcast', { event: 'market' }, ({ payload }) => {
      if (payload?.type === 'odds_update' && payload.outcomes && payload.market_id) {
        setMarkets((prev) =>
          prev.map((m) =>
            m.id === payload.market_id
              ? { ...m, outcomes: payload.outcomes as MarketOutcome[] }
              : m,
          ),
        );
      }
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [lobbyId]);

  // -----------------------------------------------------------------------
  // Place bet
  // -----------------------------------------------------------------------

  const handlePlaceBet = async (marketId: string) => {
    if (!bettorId || !selectedOutcome || !betAmount) return;

    if (!confirmBet) {
      setConfirmBet(true);
      return;
    }
    setConfirmBet(false);
    setPlacingBet(true);

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/predictions/${marketId}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bettor_id: bettorId,
          outcome_id: selectedOutcome,
          amount_credits: betAmount,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const market = markets.find((m) => m.id === marketId);
        const outcome = market?.outcomes.find((o) => o.id === selectedOutcome);
        const payout = data.potential_payout ?? Math.round(betAmount * (outcome?.odds ?? 1));
        const bet: BetConfirmation = {
          outcome_id: selectedOutcome,
          team_name: outcome?.team_name ?? '???',
          amount: betAmount,
          potential_payout: payout,
        };
        setLockedBet(bet);
        setBetResult({ type: 'success', message: `+${payout}CR potential payout` });
        if (data.new_balance !== undefined) onCreditsChange?.(data.new_balance);
        onBetPlaced?.(bet);
        setSelectedOutcome(null);
        setBetAmount(null);
        fetchMarkets();
      } else {
        setBetResult({ type: 'error', message: data.error || 'Bet failed' });
      }
    } catch {
      setBetResult({ type: 'error', message: 'Network error' });
    } finally {
      setPlacingBet(false);
      setTimeout(() => setBetResult(null), 4000);
    }
  };

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------

  const activeMarket = markets.find((m) => m.status === 'open') ?? markets[0] ?? null;
  const outcomes = activeMarket?.outcomes ?? [];
  const maxVolume = Math.max(1, ...outcomes.map((o) => o.volume));
  const totalVolume = outcomes.reduce((s, o) => s + o.volume, 0);
  const selectedOutcomeData = outcomes.find((o) => o.id === selectedOutcome);
  const potentialPayout = betAmount && selectedOutcomeData ? Math.round(betAmount * selectedOutcomeData.odds) : 0;

  // -----------------------------------------------------------------------
  // Compact / broadcast-only render
  // -----------------------------------------------------------------------

  if (compact) {
    return (
      <div style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid #1A1A1A`,
        }}>
          <div style={{
            fontFamily: font.display,
            fontSize: 13,
            letterSpacing: '0.15em',
            color: c.text3,
          }}>
            {activeMarket?.question ?? 'WHO WINS THIS ROUND?'}
          </div>
        </div>

        {/* Outcomes */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {outcomes.length === 0 && !loading && (
            <div style={{ fontFamily: font.mono, fontSize: 12, color: c.text4 }}>
              No active markets
            </div>
          )}
          {loading && outcomes.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 48, borderRadius: radius.sm }} />
              ))}
            </div>
          )}
          {outcomes.map((entry, idx) => {
            const maxOdds = Math.max(...outcomes.map((e) => e.odds));
            const barWidth = maxOdds > 0 ? (entry.odds / maxOdds) * 100 : 0;
            const isLeading = idx === 0;

            return (
              <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontFamily: font.display,
                    fontSize: 16,
                    letterSpacing: '0.05em',
                    color: isLeading ? c.pink : c.text,
                  }}>
                    {entry.team_name}
                  </span>
                  <span style={{ fontFamily: font.display, fontSize: 20, letterSpacing: '0.02em', color: c.text }}>
                    {entry.odds.toFixed(1)}<span style={{ fontSize: 14, color: c.text3 }}>X</span>
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 4, width: '100%', background: '#1A1A1A', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${barWidth}%`,
                    transition: 'width 700ms ease-out',
                    background: isLeading
                      ? 'linear-gradient(90deg, #F5A0D0 0%, #E080B8 100%)'
                      : 'linear-gradient(90deg, #444444 0%, #333333 100%)',
                    boxShadow: isLeading ? '0 0 12px rgba(245, 160, 208, 0.4)' : 'none',
                  }} />
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>
                  {entry.volume.toLocaleString()} CR
                </span>
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div style={{
          padding: '14px 20px',
          borderTop: `1px solid #1A1A1A`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: font.display, fontSize: 11, letterSpacing: '0.1em', color: c.text4 }}>
            TOTAL POOL
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 14, color: c.pink }}>
            {totalVolume.toLocaleString()} CR
          </span>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Full interactive render (spectator view)
  // -----------------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            fontFamily: font.display,
            fontSize: 28,
            color: c.text,
            letterSpacing: '0.03em',
          }}>
            {activeMarket?.question ?? 'WHO WINS THIS ROUND?'}
          </div>
          {activeMarket?.status === 'suspended' && (
            <div style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: '#FF8800',
              padding: '2px 8px',
              border: '1px solid #FF8800',
            }}>
              SUSPENDED
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <span style={{ fontFamily: font.mono, fontSize: 12, color: c.text2 }}>
            {totalVolume.toLocaleString()} CR VOLUME
          </span>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4, animation: 'pulse 2s infinite' }}>
            {String.fromCharCode(9679)} LIVE ODDS
          </span>
        </div>
      </div>

      {/* Bet result banner */}
      {betResult && (
        <div style={{
          padding: '12px 16px',
          background: betResult.type === 'success' ? 'rgba(0,220,130,0.08)' : 'rgba(255,68,102,0.08)',
          borderBottom: `1px solid ${betResult.type === 'success' ? 'rgba(0,220,130,0.2)' : 'rgba(255,68,102,0.2)'}`,
        }}>
          <div style={{
            fontFamily: font.display,
            fontSize: 20,
            color: betResult.type === 'success' ? c.green : c.red,
          }}>
            {betResult.type === 'success' ? 'BET PLACED' : 'BET FAILED'}
          </div>
          <div style={{ fontFamily: font.mono, fontSize: 12, color: c.text2, marginTop: 2 }}>
            {betResult.message}
          </div>
        </div>
      )}

      {/* Locked bet display */}
      {lockedBet && !betResult && (
        <div style={{
          padding: 16,
          borderBottom: `1px solid #1A1A1A`,
          background: 'rgba(245,160,208,0.05)',
        }}>
          <div style={{ fontFamily: font.display, fontSize: 16, color: c.text }}>
            YOU BET {lockedBet.amount}CR ON {lockedBet.team_name}
          </div>
          <div style={{ fontFamily: font.display, fontSize: 20, color: c.green, marginTop: 4 }}>
            POTENTIAL: +{lockedBet.potential_payout}CR
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && outcomes.length === 0 && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: radius.sm }} />
          ))}
        </div>
      )}

      {/* No markets */}
      {!loading && outcomes.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontFamily: font.display, fontSize: 24, color: c.text3 }}>NO ACTIVE MARKETS</div>
          <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text4, marginTop: 8 }}>
            Waiting for admin to create a prediction market
          </div>
        </div>
      )}

      {/* Outcome cards */}
      {activeMarket?.status !== 'suspended' && !lockedBet && outcomes.map((o, idx) => {
        const isTop = idx === 0;
        const isLongShot = idx === outcomes.length - 1 && outcomes.length > 1;
        const isSelected = selectedOutcome === o.id;

        return (
          <button
            key={o.id}
            onClick={() => {
              if (!bettorId) return;
              setSelectedOutcome(isSelected ? null : o.id);
              setConfirmBet(false);
            }}
            disabled={!bettorId}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 64,
              padding: '0 16px',
              background: isSelected ? c.surface : 'transparent',
              border: 'none',
              borderBottom: `1px solid ${c.surface}`,
              borderLeft: isSelected ? `1px solid ${c.pink}` : '1px solid transparent',
              cursor: bettorId ? 'pointer' : 'default',
              width: '100%',
              textAlign: 'left',
              position: 'relative',
              opacity: bettorId ? 1 : 0.8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: c.text3, width: 20 }}>
                #{idx + 1}
              </span>
              <div style={{
                width: 36,
                height: 36,
                background: '#1A1A1A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: font.display,
                fontSize: 16,
                color: c.text2,
                flexShrink: 0,
              }}>
                {o.team_name.charAt(0)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontFamily: font.display,
                    fontSize: 18,
                    color: c.text,
                    letterSpacing: '0.03em',
                  }}>
                    {o.team_name}
                  </span>
                  {isTop && (
                    <span style={{
                      fontFamily: font.display,
                      fontSize: 9,
                      color: c.green,
                      border: `1px solid ${c.green}`,
                      padding: '1px 5px',
                    }}>
                      FAVORITE
                    </span>
                  )}
                  {isLongShot && (
                    <span style={{
                      fontFamily: font.display,
                      fontSize: 9,
                      color: c.pink,
                      border: `1px solid ${c.pink}`,
                      padding: '1px 5px',
                    }}>
                      LONG SHOT
                    </span>
                  )}
                </div>
                <span style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: c.text4,
                }}>
                  {(o.probability * 100).toFixed(0)}% chance
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: font.display, fontSize: 24, color: c.text }}>
                {o.odds.toFixed(1)}X
              </div>
              <div style={{ fontFamily: font.mono, fontSize: 10, color: c.text2 }}>
                {o.volume.toLocaleString()} CR
              </div>
            </div>
            {/* Volume bar */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: c.surface }}>
              <div style={{
                height: 3,
                background: isTop ? c.pink : c.text4,
                width: `${(o.volume / maxVolume) * 100}%`,
                transition: 'width 300ms',
              }} />
            </div>
          </button>
        );
      })}

      {/* Bet placement */}
      {bettorId && selectedOutcome && !lockedBet && activeMarket?.status === 'open' && (
        <div style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          borderTop: `1px solid #1A1A1A`,
        }}>
          <div style={{
            fontFamily: font.sans,
            fontSize: 9,
            color: c.text2,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            YOUR BET
          </div>

          {/* Amount buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[50, 100, 200].map((amt) => (
              <button
                key={amt}
                onClick={() => { setBetAmount(betAmount === amt ? null : amt); setConfirmBet(false); }}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  background: betAmount === amt ? c.pink : 'transparent',
                  color: betAmount === amt ? c.bg : c.text3,
                  border: `1px solid ${betAmount === amt ? c.pink : c.text4}`,
                  fontFamily: font.display,
                  fontSize: 16,
                  cursor: credits >= amt ? 'pointer' : 'not-allowed',
                  opacity: credits >= amt ? 1 : 0.4,
                }}
              >
                {amt}CR
              </button>
            ))}
            <button
              onClick={() => { setBetAmount(betAmount === credits ? null : credits); setConfirmBet(false); }}
              style={{
                flex: 1,
                padding: '10px 0',
                background: betAmount === credits ? c.pink : 'transparent',
                color: betAmount === credits ? c.bg : c.text3,
                border: `1px solid ${betAmount === credits ? c.pink : c.text4}`,
                fontFamily: font.display,
                fontSize: 16,
                cursor: 'pointer',
              }}
            >
              ALL IN
            </button>
          </div>

          {/* Payout + confirm */}
          {betAmount && (
            <>
              <div style={{
                fontFamily: font.display,
                fontSize: 28,
                color: c.green,
                textAlign: 'center',
                textShadow: '0 0 20px rgba(0,220,130,0.4)',
              }}>
                POTENTIAL PAYOUT: +{potentialPayout}CR
              </div>

              {confirmBet && (
                <div style={{ fontFamily: font.mono, fontSize: 11, color: c.text2, textAlign: 'center' }}>
                  {betAmount}CR on {selectedOutcomeData?.team_name} at {selectedOutcomeData?.odds.toFixed(1)}X odds.
                  You&apos;ll have {credits - betAmount}CR left.
                </div>
              )}

              <button
                onClick={() => activeMarket && handlePlaceBet(activeMarket.id)}
                disabled={placingBet}
                style={{
                  width: '100%',
                  height: 64,
                  background: confirmBet ? c.red : c.pink,
                  color: confirmBet ? c.text : c.bg,
                  border: 'none',
                  fontFamily: font.display,
                  fontSize: 24,
                  letterSpacing: '0.08em',
                  cursor: placingBet ? 'wait' : 'pointer',
                  opacity: placingBet ? 0.6 : 1,
                }}
              >
                {placingBet
                  ? 'PLACING...'
                  : confirmBet
                    ? `CONFIRM ${betAmount}CR BET`
                    : 'PLACE BET'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Suspended overlay */}
      {activeMarket?.status === 'suspended' && (
        <div style={{
          padding: 32,
          textAlign: 'center',
          background: 'rgba(255,136,0,0.05)',
        }}>
          <div style={{ fontFamily: font.display, fontSize: 28, color: '#FF8800' }}>
            MARKET SUSPENDED
          </div>
          <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, marginTop: 8 }}>
            Betting is temporarily paused
          </div>
        </div>
      )}
    </div>
  );
}
