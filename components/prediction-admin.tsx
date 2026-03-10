'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MarketData, MarketOutcome } from './prediction-panel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PredictionAdminProps {
  lobbyId: string;
  password: string;
  traders: Array<{ trader_id: string; name: string; team_id: string | null }>;
}

interface FullMarket extends MarketData {
  created_at?: string;
  resolved_at?: string;
  winner_team_id?: string;
}

// ---------------------------------------------------------------------------
// Fonts (match admin panel)
// ---------------------------------------------------------------------------

const bebas = "var(--font-bebas, 'Bebas Neue'), sans-serif";
const mono = "var(--font-jetbrains, 'JetBrains Mono'), monospace";
const sans = "var(--font-dm-sans, 'DM Sans'), sans-serif";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PredictionAdmin({ lobbyId, password, traders }: PredictionAdminProps) {
  const [markets, setMarkets] = useState<FullMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [expandedMarket, setExpandedMarket] = useState<string | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // -----------------------------------------------------------------------
  // Fetch markets
  // -----------------------------------------------------------------------

  const fetchMarkets = useCallback(async () => {
    try {
      const res = await fetch(`/api/lobby/${lobbyId}/predictions`);
      if (!res.ok) return;
      const data = await res.json();
      setMarkets(data.markets ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [lobbyId]);

  useEffect(() => {
    fetchMarkets();
    const interval = setInterval(fetchMarkets, 5000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleCreateMarket = async () => {
    setCreating(true);
    setMessage(null);

    // Derive unique teams from active traders
    const teamMap = new Map<string, string>();
    for (const t of traders) {
      if (t.team_id && !teamMap.has(t.team_id)) {
        teamMap.set(t.team_id, t.name);
      }
    }

    // If no teams, use individual traders as pseudo-teams
    const teams = teamMap.size > 0
      ? Array.from(teamMap.entries()).map(([id, name]) => ({ id, name }))
      : traders.slice(0, 8).map((t) => ({ id: t.trader_id, name: t.name }));

    if (teams.length < 2) {
      setMessage({ type: 'error', text: 'Need at least 2 teams/traders to create a market' });
      setCreating(false);
      return;
    }

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: password },
        body: JSON.stringify({ teams }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Market created' });
        fetchMarkets();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create market' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setCreating(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleResolve = async (marketId: string) => {
    if (!selectedWinner) return;
    if (!showResolveConfirm) {
      setShowResolveConfirm(true);
      return;
    }
    setShowResolveConfirm(false);
    setResolving(marketId);
    setMessage(null);

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/predictions/${marketId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: password },
        body: JSON.stringify({ winner_team_id: selectedWinner }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Market resolved' });
        setSelectedWinner(null);
        fetchMarkets();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to resolve' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setResolving(null);
    }
  };

  const handleSuspendResume = async (marketId: string, action: 'suspend' | 'resume') => {
    setSuspending(marketId);
    setMessage(null);

    try {
      const res = await fetch(`/api/lobby/${lobbyId}/predictions/${marketId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: password },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: `Market ${action}ed` });
        fetchMarkets();
      } else {
        setMessage({ type: 'error', text: data.error || `Failed to ${action}` });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSuspending(null);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const openMarkets = markets.filter((m) => m.status === 'open');
  const suspendedMarkets = markets.filter((m) => m.status === 'suspended');
  const resolvedMarkets = markets.filter((m) => m.status === 'resolved');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: bebas, fontSize: 22, color: '#FFF', letterSpacing: '0.05em' }}>
          PREDICTION MARKETS
        </div>
        <button
          onClick={handleCreateMarket}
          disabled={creating}
          style={{
            padding: '8px 16px',
            background: '#F5A0D0',
            color: '#0A0A0A',
            border: 'none',
            fontFamily: bebas,
            fontSize: 14,
            letterSpacing: '0.08em',
            cursor: creating ? 'wait' : 'pointer',
            opacity: creating ? 0.6 : 1,
          }}
        >
          {creating ? 'CREATING...' : '+ CREATE MARKET'}
        </button>
      </div>

      {/* Message banner */}
      {message && (
        <div style={{
          padding: '8px 12px',
          background: message.type === 'success' ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,51,0.08)',
          border: `1px solid ${message.type === 'success' ? 'rgba(0,255,136,0.2)' : 'rgba(255,51,51,0.2)'}`,
          fontFamily: mono,
          fontSize: 12,
          color: message.type === 'success' ? '#00FF88' : '#FF3333',
        }}>
          {message.text}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ fontFamily: mono, fontSize: 12, color: '#666' }}>Loading markets...</div>
      )}

      {/* No markets */}
      {!loading && markets.length === 0 && (
        <div style={{
          padding: 24,
          textAlign: 'center',
          border: '1px dashed #333',
        }}>
          <div style={{ fontFamily: bebas, fontSize: 18, color: '#666' }}>NO MARKETS YET</div>
          <div style={{ fontFamily: sans, fontSize: 12, color: '#444', marginTop: 4 }}>
            Create a market to let spectators bet on round outcomes
          </div>
        </div>
      )}

      {/* Open markets */}
      {openMarkets.map((market) => (
        <MarketCard
          key={market.id}
          market={market}
          expanded={expandedMarket === market.id}
          onToggle={() => setExpandedMarket(expandedMarket === market.id ? null : market.id)}
          selectedWinner={selectedWinner}
          onSelectWinner={setSelectedWinner}
          showResolveConfirm={showResolveConfirm}
          onResolve={() => handleResolve(market.id)}
          resolving={resolving === market.id}
          onSuspend={() => handleSuspendResume(market.id, 'suspend')}
          suspending={suspending === market.id}
        />
      ))}

      {/* Suspended markets */}
      {suspendedMarkets.map((market) => (
        <MarketCard
          key={market.id}
          market={market}
          expanded={expandedMarket === market.id}
          onToggle={() => setExpandedMarket(expandedMarket === market.id ? null : market.id)}
          selectedWinner={selectedWinner}
          onSelectWinner={setSelectedWinner}
          showResolveConfirm={showResolveConfirm}
          onResolve={() => handleResolve(market.id)}
          resolving={resolving === market.id}
          onResume={() => handleSuspendResume(market.id, 'resume')}
          suspending={suspending === market.id}
        />
      ))}

      {/* Resolved markets (collapsed) */}
      {resolvedMarkets.length > 0 && (
        <div style={{ borderTop: '1px solid #1A1A1A', paddingTop: 12 }}>
          <div style={{ fontFamily: sans, fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            RESOLVED ({resolvedMarkets.length})
          </div>
          {resolvedMarkets.map((market) => (
            <div key={market.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0',
              fontFamily: mono,
              fontSize: 11,
              color: '#666',
            }}>
              <span>{market.question}</span>
              <span style={{ color: '#00FF88' }}>{market.total_volume.toLocaleString()} CR</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Market Card Sub-component
// ---------------------------------------------------------------------------

function MarketCard({
  market,
  expanded,
  onToggle,
  selectedWinner,
  onSelectWinner,
  showResolveConfirm,
  onResolve,
  resolving,
  onSuspend,
  onResume,
  suspending,
}: {
  market: FullMarket;
  expanded: boolean;
  onToggle: () => void;
  selectedWinner: string | null;
  onSelectWinner: (id: string | null) => void;
  showResolveConfirm: boolean;
  onResolve: () => void;
  resolving: boolean;
  onSuspend?: () => void;
  onResume?: () => void;
  suspending: boolean;
}) {
  const outcomes = market.outcomes ?? [];
  const totalVolume = outcomes.reduce((s, o) => s + o.volume, 0);
  const totalBets = Math.round(totalVolume / 50);
  const isSuspended = market.status === 'suspended';

  return (
    <div style={{
      border: `1px solid ${isSuspended ? '#FF8800' : '#1E1E1E'}`,
      background: '#111',
      borderRadius: 0,
    }}>
      {/* Header (clickable) */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isSuspended && (
            <span style={{ fontFamily: mono, fontSize: 9, color: '#FF8800', border: '1px solid #FF8800', padding: '1px 5px' }}>
              SUSPENDED
            </span>
          )}
          <span style={{ fontFamily: bebas, fontSize: 16, color: '#FFF', letterSpacing: '0.03em' }}>
            {market.question}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: '#F5A0D0' }}>
            {totalVolume.toLocaleString()} CR
          </span>
          <span style={{ fontFamily: mono, fontSize: 12, color: '#666' }}>
            {totalBets} bets
          </span>
          <span style={{ fontFamily: mono, fontSize: 14, color: '#444' }}>
            {expanded ? '\u25B2' : '\u25BC'}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid #1A1A1A' }}>
          {/* Outcomes table */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 60px 60px 80px',
              gap: 4,
              fontFamily: mono,
              fontSize: 10,
              color: '#666',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              <span>TEAM</span>
              <span style={{ textAlign: 'right' }}>ODDS</span>
              <span style={{ textAlign: 'right' }}>PROB</span>
              <span style={{ textAlign: 'right' }}>VOLUME</span>
            </div>
            {outcomes.map((o, idx) => (
              <div
                key={o.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 60px 60px 80px',
                  gap: 4,
                  padding: '6px 0',
                  borderBottom: idx < outcomes.length - 1 ? '1px solid #1A1A1A' : 'none',
                }}
              >
                <span style={{ fontFamily: bebas, fontSize: 14, color: idx === 0 ? '#F5A0D0' : '#FFF' }}>
                  {o.team_name}
                </span>
                <span style={{ fontFamily: mono, fontSize: 13, color: '#FFF', textAlign: 'right' }}>
                  {o.odds.toFixed(1)}X
                </span>
                <span style={{ fontFamily: mono, fontSize: 13, color: '#999', textAlign: 'right' }}>
                  {(o.probability * 100).toFixed(0)}%
                </span>
                <span style={{ fontFamily: mono, fontSize: 13, color: '#888', textAlign: 'right' }}>
                  {o.volume.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #1A1A1A',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {/* Suspend / Resume */}
            <div style={{ display: 'flex', gap: 8 }}>
              {market.status === 'open' && onSuspend && (
                <button
                  onClick={onSuspend}
                  disabled={suspending}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: 'transparent',
                    color: '#FF8800',
                    border: '1px solid #FF8800',
                    fontFamily: bebas,
                    fontSize: 14,
                    cursor: suspending ? 'wait' : 'pointer',
                    opacity: suspending ? 0.6 : 1,
                  }}
                >
                  {suspending ? 'SUSPENDING...' : 'SUSPEND MARKET'}
                </button>
              )}
              {market.status === 'suspended' && onResume && (
                <button
                  onClick={onResume}
                  disabled={suspending}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: 'transparent',
                    color: '#00FF88',
                    border: '1px solid #00FF88',
                    fontFamily: bebas,
                    fontSize: 14,
                    cursor: suspending ? 'wait' : 'pointer',
                    opacity: suspending ? 0.6 : 1,
                  }}
                >
                  {suspending ? 'RESUMING...' : 'RESUME MARKET'}
                </button>
              )}
            </div>

            {/* Resolve */}
            <div style={{ fontFamily: mono, fontSize: 10, color: '#999', textTransform: 'uppercase' }}>
              RESOLVE MARKET
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {outcomes.map((o) => (
                <button
                  key={o.id}
                  onClick={() => onSelectWinner(selectedWinner === o.team_id ? null : o.team_id)}
                  style={{
                    padding: '6px 12px',
                    background: selectedWinner === o.team_id ? '#F5A0D0' : 'transparent',
                    color: selectedWinner === o.team_id ? '#0A0A0A' : '#888',
                    border: `1px solid ${selectedWinner === o.team_id ? '#F5A0D0' : '#333'}`,
                    fontFamily: bebas,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {o.team_name}
                </button>
              ))}
            </div>
            {selectedWinner && (
              <button
                onClick={onResolve}
                disabled={resolving}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  background: showResolveConfirm ? '#FF3333' : '#00FF88',
                  color: showResolveConfirm ? '#FFF' : '#0A0A0A',
                  border: 'none',
                  fontFamily: bebas,
                  fontSize: 16,
                  letterSpacing: '0.08em',
                  cursor: resolving ? 'wait' : 'pointer',
                  opacity: resolving ? 0.6 : 1,
                }}
              >
                {resolving
                  ? 'RESOLVING...'
                  : showResolveConfirm
                    ? `CONFIRM: ${outcomes.find((o) => o.team_id === selectedWinner)?.team_name} WINS`
                    : `RESOLVE: ${outcomes.find((o) => o.team_id === selectedWinner)?.team_name} WINS`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
