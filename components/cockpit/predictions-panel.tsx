'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { c, radius } from '@/app/design';

// ---------------------------------------------------------------------------
// Font shortcuts (matches trading-terminal.tsx)
// ---------------------------------------------------------------------------
const B: React.CSSProperties = { fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", letterSpacing: '0.05em' };
const M: React.CSSProperties = { fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", letterSpacing: '-0.02em' };
const S: React.CSSProperties = { fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif" };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Outcome {
  id: string;
  team_id: string;
  team_name: string;
  probability: number;
  odds: number;
  volume: number;
}

interface Market {
  id: string;
  lobby_id: string;
  round_id: string;
  question: string;
  outcomes: Outcome[];
  total_volume: number;
  status: 'open' | 'suspended' | 'resolved';
  provider: string;
  created_at: string;
  resolved_at?: string | null;
  winner_outcome_id?: string | null;
}

interface UserBet {
  id: string;
  market_id: string;
  outcome_id: string;
  amount_credits: number;
  potential_payout: number;
  created_at: string;
}

interface Props {
  lobbyId: string;
  traderId: string;
  creditsBalance: number;
  onCreditsChange?: (delta: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtOdds = (odds: number) => odds >= 2 ? `${odds.toFixed(1)}x` : `${odds.toFixed(2)}x`;
const fmtPct = (p: number) => `${(p * 100).toFixed(0)}%`;
const fmtVol = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PredictionsPanel({ lobbyId, traderId, creditsBalance, onCreditsChange }: Props) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [userBets, setUserBets] = useState<Record<string, UserBet[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bet placement state
  const [activeBet, setActiveBet] = useState<{ marketId: string; outcomeId: string; outcomeName: string } | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [betLoading, setBetLoading] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [betSuccess, setBetSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Collapsed state per-market
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ---------------------------------------------------------------------------
  // Fetch markets
  // ---------------------------------------------------------------------------
  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/predictions`);
      if (!res.ok) throw new Error('Failed to load markets');
      const data = await res.json();
      setMarkets(data.markets ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [lobbyId]);

  // ---------------------------------------------------------------------------
  // Fetch user bets for a market
  // ---------------------------------------------------------------------------
  const fetchBets = useCallback(async (marketId: string) => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/predictions/${marketId}/bet`);
      if (!res.ok) return;
      const data = await res.json();
      const mine = (data.bets ?? []).filter((b: Record<string, unknown>) => b.bettor_id === traderId);
      setUserBets(prev => ({ ...prev, [marketId]: mine }));
    } catch {
      // silently ignore
    }
  }, [lobbyId, traderId]);

  // ---------------------------------------------------------------------------
  // Initial load + polling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 10000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  // Fetch bets for all markets when markets change
  useEffect(() => {
    markets.forEach(m => fetchBets(m.id));
  }, [markets, fetchBets]);

  // Focus input when bet form opens
  useEffect(() => {
    if (activeBet && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeBet]);

  // Clear success message after 3s
  useEffect(() => {
    if (!betSuccess) return;
    const t = setTimeout(() => setBetSuccess(null), 3000);
    return () => clearTimeout(t);
  }, [betSuccess]);

  // ---------------------------------------------------------------------------
  // Place bet
  // ---------------------------------------------------------------------------
  const placeBet = async () => {
    if (!activeBet) return;
    const amount = parseInt(betAmount, 10);
    if (!amount || amount <= 0) { setBetError('Enter a valid amount'); return; }
    if (amount > creditsBalance) { setBetError('Insufficient credits'); return; }

    setBetLoading(true);
    setBetError(null);
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/predictions/${activeBet.marketId}/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bettor_id: traderId,
          outcome_id: activeBet.outcomeId,
          amount_credits: amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Bet failed');

      setBetSuccess(`Bet placed! Potential payout: ${Math.round(data.potential_payout)} CR`);
      onCreditsChange?.(-amount);
      setActiveBet(null);
      setBetAmount('');
      // Refresh
      fetchMarkets();
      fetchBets(activeBet.marketId);
    } catch (err) {
      setBetError(err instanceof Error ? err.message : 'Bet failed');
    } finally {
      setBetLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Quick-bet amounts
  // ---------------------------------------------------------------------------
  const quickAmounts = [5, 10, 25, 50];

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const openMarkets = markets.filter(m => m.status === 'open');
  const closedMarkets = markets.filter(m => m.status !== 'open');

  const myTotalBets = Object.values(userBets).flat();

  // ---------------------------------------------------------------------------
  // Skeleton
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ ...B, fontSize: 13, color: c.text3, letterSpacing: '0.08em' }}>PREDICTIONS</div>
        {[1, 2].map(i => (
          <div key={i} className="skeleton" style={{ height: 72, borderRadius: radius.sm }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ ...B, fontSize: 13, color: c.text3, letterSpacing: '0.08em', marginBottom: 8 }}>PREDICTIONS</div>
        <div style={{ ...S, fontSize: 12, color: c.red }}>{error}</div>
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ ...B, fontSize: 13, color: c.text3, letterSpacing: '0.08em', marginBottom: 8 }}>PREDICTIONS</div>
        <div style={{ ...S, fontSize: 12, color: c.text4, textAlign: 'center', padding: '16px 0' }}>
          No active markets yet
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...B, fontSize: 13, color: c.text3, letterSpacing: '0.08em' }}>PREDICTIONS</span>
          {openMarkets.length > 0 && (
            <span style={{
              ...M, fontSize: 9, fontWeight: 700,
              color: c.green, background: c.greenDim,
              padding: '2px 5px', borderRadius: 3,
            }}>
              {openMarkets.length} LIVE
            </span>
          )}
        </div>
        {myTotalBets.length > 0 && (
          <span style={{ ...M, fontSize: 10, color: c.pink }}>
            {myTotalBets.length} bet{myTotalBets.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Success toast */}
      {betSuccess && (
        <div style={{
          margin: '0 12px 8px', padding: '6px 10px',
          background: c.greenDim, border: `1px solid ${c.green}33`,
          borderRadius: radius.sm,
        }}>
          <span style={{ ...M, fontSize: 10, color: c.green }}>{betSuccess}</span>
        </div>
      )}

      {/* Open markets */}
      {openMarkets.map(market => {
        const isCollapsed = collapsed[market.id];
        const myBets = userBets[market.id] ?? [];
        const myBetOutcomeIds = new Set(myBets.map(b => b.outcome_id));

        return (
          <div key={market.id} style={{ borderTop: `1px solid ${c.border}` }}>
            {/* Market header */}
            <button
              onClick={() => setCollapsed(p => ({ ...p, [market.id]: !isCollapsed }))}
              style={{
                width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...S, fontSize: 12, fontWeight: 600, color: c.text, lineHeight: '16px' }}>
                  {market.question}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ ...M, fontSize: 9, color: c.text4 }}>
                    VOL {fmtVol(market.total_volume)} CR
                  </span>
                  {myBets.length > 0 && (
                    <span style={{ ...M, fontSize: 9, color: c.pink }}>
                      {myBets.length} bet{myBets.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <span style={{ ...M, fontSize: 10, color: c.text4, flexShrink: 0, marginLeft: 6, marginTop: 2 }}>
                {isCollapsed ? '+' : '-'}
              </span>
            </button>

            {/* Market body */}
            {!isCollapsed && (
              <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Outcomes */}
                {market.outcomes.map(outcome => {
                  const pctWidth = Math.max(4, outcome.probability * 100);
                  const hasBet = myBetOutcomeIds.has(outcome.id);
                  const isSelected = activeBet?.outcomeId === outcome.id && activeBet?.marketId === market.id;

                  return (
                    <div key={outcome.id}>
                      <button
                        onClick={() => {
                          if (isSelected) {
                            setActiveBet(null);
                            setBetAmount('');
                            setBetError(null);
                          } else {
                            setActiveBet({ marketId: market.id, outcomeId: outcome.id, outcomeName: outcome.team_name });
                            setBetAmount('');
                            setBetError(null);
                          }
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 8px',
                          background: isSelected ? c.elevated : hasBet ? 'rgba(245,160,208,0.03)' : c.surface,
                          border: `1px solid ${isSelected ? c.pink : hasBet ? c.pinkBorder : c.border}`,
                          borderRadius: radius.sm, cursor: 'pointer',
                          transition: 'all .15s',
                          position: 'relative', overflow: 'hidden',
                        }}
                      >
                        {/* Probability bar background */}
                        <div style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0,
                          width: `${pctWidth}%`,
                          background: isSelected
                            ? 'rgba(245,160,208,0.06)'
                            : 'rgba(255,255,255,0.02)',
                          transition: 'width .3s ease',
                        }} />

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ ...S, fontSize: 12, fontWeight: 500, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {outcome.team_name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <span style={{ ...M, fontSize: 11, fontWeight: 700, color: c.text }}>
                                {fmtPct(outcome.probability)}
                              </span>
                              <span style={{ ...M, fontSize: 9, color: c.text3 }}>
                                {fmtOdds(outcome.odds)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Bet form — inline below selected outcome */}
                      {isSelected && (
                        <div style={{
                          marginTop: 4, padding: '8px',
                          background: c.elevated, border: `1px solid ${c.pinkBorder}`,
                          borderRadius: radius.sm,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ ...S, fontSize: 10, color: c.text3 }}>Bet on</span>
                            <span style={{ ...S, fontSize: 10, fontWeight: 600, color: c.pink }}>
                              {outcome.team_name}
                            </span>
                            <span style={{ ...M, fontSize: 9, color: c.text4 }}>
                              @ {fmtOdds(outcome.odds)}
                            </span>
                          </div>

                          {/* Amount input */}
                          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                              <input
                                ref={inputRef}
                                type="number"
                                placeholder="Amount"
                                value={betAmount}
                                onChange={e => { setBetAmount(e.target.value); setBetError(null); }}
                                onKeyDown={e => { if (e.key === 'Enter') placeBet(); if (e.key === 'Escape') { setActiveBet(null); setBetAmount(''); } }}
                                style={{
                                  width: '100%', padding: '5px 32px 5px 8px',
                                  ...M, fontSize: 12, color: c.text,
                                  background: c.surface, border: `1px solid ${c.border}`,
                                  borderRadius: radius.sm, outline: 'none',
                                }}
                              />
                              <span style={{
                                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                ...M, fontSize: 9, color: c.text4,
                              }}>CR</span>
                            </div>
                          </div>

                          {/* Quick amounts */}
                          <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                            {quickAmounts.map(amt => (
                              <button
                                key={amt}
                                onClick={() => { setBetAmount(String(amt)); setBetError(null); }}
                                style={{
                                  flex: 1, padding: '3px 0',
                                  ...M, fontSize: 9, color: betAmount === String(amt) ? c.pink : c.text3,
                                  background: betAmount === String(amt) ? c.pinkDim : 'transparent',
                                  border: `1px solid ${betAmount === String(amt) ? c.pinkBorder : c.border}`,
                                  borderRadius: 4, cursor: 'pointer',
                                  transition: 'all .12s',
                                }}
                              >
                                {amt}
                              </button>
                            ))}
                            <button
                              onClick={() => { setBetAmount(String(creditsBalance)); setBetError(null); }}
                              style={{
                                flex: 1, padding: '3px 0',
                                ...M, fontSize: 9, color: c.text3,
                                background: 'transparent',
                                border: `1px solid ${c.border}`,
                                borderRadius: 4, cursor: 'pointer',
                                transition: 'all .12s',
                              }}
                            >
                              MAX
                            </button>
                          </div>

                          {/* Payout preview */}
                          {betAmount && parseInt(betAmount, 10) > 0 && (
                            <div style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              marginBottom: 6, padding: '4px 6px',
                              background: c.greenDim, borderRadius: 4,
                            }}>
                              <span style={{ ...S, fontSize: 10, color: c.text3 }}>Potential payout</span>
                              <span style={{ ...M, fontSize: 11, fontWeight: 700, color: c.green }}>
                                {Math.round(parseInt(betAmount, 10) * outcome.odds)} CR
                              </span>
                            </div>
                          )}

                          {/* Error */}
                          {betError && (
                            <div style={{ ...S, fontSize: 10, color: c.red, marginBottom: 6 }}>{betError}</div>
                          )}

                          {/* Confirm / Cancel */}
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => { setActiveBet(null); setBetAmount(''); setBetError(null); }}
                              style={{
                                flex: 1, padding: '5px 0',
                                ...S, fontSize: 11, fontWeight: 500, color: c.text3,
                                background: 'transparent', border: `1px solid ${c.border}`,
                                borderRadius: radius.sm, cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={placeBet}
                              disabled={betLoading || !betAmount || parseInt(betAmount, 10) <= 0}
                              style={{
                                flex: 2, padding: '5px 0',
                                ...B, fontSize: 12, letterSpacing: '0.06em',
                                color: c.bg, background: c.pink,
                                border: 'none', borderRadius: radius.sm,
                                cursor: betLoading ? 'wait' : 'pointer',
                                opacity: betLoading || !betAmount ? 0.5 : 1,
                                transition: 'all .15s',
                              }}
                            >
                              {betLoading ? 'PLACING...' : 'PLACE BET'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* User's active bets on this market */}
                {myBets.length > 0 && (
                  <div style={{
                    marginTop: 2, padding: '6px 8px',
                    background: 'rgba(245,160,208,0.02)',
                    border: `1px solid ${c.pinkBorder}`,
                    borderRadius: radius.sm,
                  }}>
                    <div style={{ ...B, fontSize: 9, color: c.text4, letterSpacing: '0.1em', marginBottom: 4 }}>
                      YOUR BETS
                    </div>
                    {myBets.map(bet => {
                      const outcome = market.outcomes.find(o => o.id === bet.outcome_id);
                      const currentPayout = outcome ? bet.amount_credits * outcome.odds : bet.potential_payout;
                      const pnl = currentPayout - bet.amount_credits;
                      const pnlColor = pnl >= 0 ? c.green : c.red;
                      return (
                        <div key={bet.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '3px 0',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ ...S, fontSize: 10, color: c.text2 }}>
                              {outcome?.team_name ?? '?'}
                            </span>
                            <span style={{ ...M, fontSize: 9, color: c.text4 }}>
                              {bet.amount_credits} CR
                            </span>
                          </div>
                          <span style={{ ...M, fontSize: 10, fontWeight: 700, color: pnlColor }}>
                            {pnl >= 0 ? '+' : ''}{Math.round(pnl)} CR
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Resolved/suspended markets */}
      {closedMarkets.length > 0 && (
        <>
          <div style={{
            padding: '6px 12px', borderTop: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ ...B, fontSize: 10, color: c.text4, letterSpacing: '0.08em' }}>RESOLVED</span>
            <span style={{ ...M, fontSize: 9, color: c.text4 }}>{closedMarkets.length}</span>
          </div>
          {closedMarkets.map(market => {
            const myBets = userBets[market.id] ?? [];
            return (
              <div key={market.id} style={{ borderTop: `1px solid ${c.border}`, opacity: 0.6 }}>
                <div style={{ padding: '6px 12px' }}>
                  <div style={{ ...S, fontSize: 11, color: c.text3, lineHeight: '14px' }}>
                    {market.question}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {market.outcomes.map(o => {
                      const isWinner = market.winner_outcome_id === o.id;
                      return (
                        <span key={o.id} style={{
                          ...M, fontSize: 9,
                          padding: '2px 6px',
                          color: isWinner ? c.green : c.text4,
                          background: isWinner ? c.greenDim : 'transparent',
                          border: `1px solid ${isWinner ? `${c.green}33` : c.border}`,
                          borderRadius: 3,
                        }}>
                          {o.team_name} {fmtPct(o.probability)}
                        </span>
                      );
                    })}
                  </div>
                  {myBets.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {myBets.map(bet => {
                        const won = market.winner_outcome_id === bet.outcome_id;
                        const result = won ? bet.potential_payout - bet.amount_credits : -bet.amount_credits;
                        return (
                          <div key={bet.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span style={{ ...M, fontSize: 9, color: c.text4 }}>{bet.amount_credits} CR</span>
                            <span style={{ ...M, fontSize: 9, fontWeight: 700, color: won ? c.green : c.red }}>
                              {result >= 0 ? '+' : ''}{Math.round(result)} CR
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
