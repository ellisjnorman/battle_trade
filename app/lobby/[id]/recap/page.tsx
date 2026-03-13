'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const B = { fontFamily: "var(--font-bebas, 'Bebas Neue'), sans-serif", letterSpacing: '0.05em' } as const;
const M = { fontFamily: "var(--font-jetbrains, 'JetBrains Mono'), monospace", letterSpacing: '-0.02em' } as const;
const S = { fontFamily: "var(--font-dm-sans, 'DM Sans'), sans-serif" } as const;

interface RecapTrader {
  name: string;
  rank: number;
  returnPct: number;
  isEliminated: boolean;
  roundEliminated?: number;
}

interface RecapRound {
  round_number: number;
  winner_name: string | null;
  winner_return: number | null;
  eliminated_name: string | null;
}

export default function RecapPage() {
  const params = useParams();
  const lobbyId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [lobbyName, setLobbyName] = useState('');
  const [traders, setTraders] = useState<RecapTrader[]>([]);
  const [rounds, setRounds] = useState<RecapRound[]>([]);
  const [totalRounds, setTotalRounds] = useState(0);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    (async () => {
      // Fetch lobby
      const { data: lobby } = await supabase.from('lobbies').select('name').eq('id', lobbyId).single();
      if (lobby) setLobbyName(lobby.name);

      // Fetch all rounds
      const { data: rnds } = await supabase.from('rounds').select('id, round_number, status').eq('lobby_id', lobbyId).order('round_number');
      if (rnds) setTotalRounds(rnds.length);

      // Fetch final standings from last round
      const completedRounds = rnds?.filter(r => r.status === 'completed') ?? [];
      const recapRounds: RecapRound[] = [];

      for (const cr of completedRounds) {
        try {
          const res = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${cr.id}`);
          if (res.ok) {
            const data = await res.json();
            const standings = data.standings ?? [];
            const winner = standings[0];
            const last = standings[standings.length - 1];
            recapRounds.push({
              round_number: cr.round_number,
              winner_name: winner?.teamName ?? winner?.trader?.name ?? null,
              winner_return: winner?.returnPct ?? null,
              eliminated_name: last?.trader?.name ?? null,
            });
          }
        } catch {}
      }
      setRounds(recapRounds);

      // Fetch all traders with final state
      const { data: trs } = await supabase
        .from('traders')
        .select('name, is_eliminated')
        .eq('lobby_id', lobbyId);

      if (trs) {
        // Get final leaderboard from last completed round
        const lastRound = completedRounds[completedRounds.length - 1];
        if (lastRound) {
          try {
            const res = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${lastRound.id}`);
            if (res.ok) {
              const data = await res.json();
              const standings = data.standings ?? [];
              setTraders(standings.map((s: { rank: number; returnPct: number; trader: { name: string }; teamName?: string }, i: number) => ({
                name: s.teamName ?? s.trader.name,
                rank: i + 1,
                returnPct: s.returnPct,
                isEliminated: i > 0, // only #1 survives
              })));
            }
          } catch {}
        }
      }
      setLoading(false);
    })();
  }, [lobbyId]);

  const champion = traders[0];
  const podium = traders.slice(0, 3);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ ...B, fontSize: 24, color: '#888' }}>LOADING RECAP...</span>
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes champGlow { 0%,100% { text-shadow: 0 0 40px rgba(0,255,136,0.6), 0 0 80px rgba(0,255,136,0.3); } 50% { text-shadow: 0 0 60px rgba(0,255,136,0.8), 0 0 120px rgba(0,255,136,0.5); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes confetti { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
        .fade-up { animation: fadeUp 0.6s ease-out forwards; opacity: 0; }
        .fade-up-1 { animation-delay: 0.1s; }
        .fade-up-2 { animation-delay: 0.3s; }
        .fade-up-3 { animation-delay: 0.5s; }
        .fade-up-4 { animation-delay: 0.7s; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', position: 'relative' }}>

        {/* Confetti */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} style={{
              position: 'absolute', width: 6 + Math.random() * 6, height: 6 + Math.random() * 6,
              left: `${Math.random() * 100}%`, top: -10,
              background: ['#F5A0D0', '#00FF88', '#FFF', '#FFD700'][i % 4],
              animation: `confetti ${3 + Math.random() * 3}s ease-out ${Math.random() * 2}s forwards`,
            }} />
          ))}
        </div>

        {/* Header */}
        <div style={{ width: '100%', padding: '16px 24px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/brand/logo-main.png" alt="" style={{ height: 28, width: 'auto' }} />
            <span style={{ ...B, fontSize: 14, color: '#555' }}>{lobbyName}</span>
          </div>
          <span style={{ ...B, fontSize: 14, color: '#888' }}>GAME OVER · {totalRounds} ROUNDS</span>
        </div>

        <div style={{ width: '100%', maxWidth: 640, padding: '32px 24px' }}>

          {/* Champion reveal */}
          {champion && (
            <div className="fade-up fade-up-1" style={{ textAlign: 'center', marginBottom: 48 }}>
              <span style={{ ...B, fontSize: 20, color: '#F5A0D0', textShadow: '0 0 20px rgba(245,160,208,0.5)' }}>CHAMPION</span>
              <h1 style={{ ...B, fontSize: 'clamp(48px, 12vw, 96px)', color: '#FFF', lineHeight: 1, marginTop: 8, textShadow: '0 0 40px rgba(255,255,255,0.2)' }}>{champion.name}</h1>
              <div style={{ ...B, fontSize: 72, color: '#00FF88', lineHeight: 1, marginTop: 8, animation: 'champGlow 2s ease-in-out infinite' }}>
                +{champion.returnPct.toFixed(1)}%
              </div>
            </div>
          )}

          {/* Podium */}
          <div className="fade-up fade-up-2" style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
            {podium.map((t, i) => {
              const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
              const sizes = [64, 48, 40];
              return (
                <div key={i} style={{ flex: 1, padding: 16, background: '#0D0D0D', border: `2px solid ${i === 0 ? '#F5A0D0' : '#1A1A1A'}`, textAlign: 'center' }}>
                  <div style={{ ...B, fontSize: sizes[i], color: colors[i] }}>#{i + 1}</div>
                  <div style={{ ...B, fontSize: 20, color: '#FFF', marginTop: 4 }}>{t.name}</div>
                  <div style={{ ...M, fontSize: 18, fontWeight: 700, color: t.returnPct >= 0 ? '#00FF88' : '#FF3333', marginTop: 4 }}>
                    {t.returnPct >= 0 ? '+' : ''}{t.returnPct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>

          {/* Round timeline */}
          {rounds.length > 0 && (
            <div className="fade-up fade-up-3" style={{ marginBottom: 32 }}>
              <span style={{ ...B, fontSize: 16, color: '#888', display: 'block', marginBottom: 12 }}>ROUND TIMELINE</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rounds.map(r => (
                  <div key={r.round_number} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#0D0D0D', border: '1px solid #111' }}>
                    <span style={{ ...B, fontSize: 16, color: '#888', width: 32 }}>R{r.round_number}</span>
                    <div style={{ flex: 1 }}>
                      {r.winner_name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ ...B, fontSize: 14, color: '#F5A0D0' }}>{r.winner_name}</span>
                          <span style={{ ...M, fontSize: 12, color: '#00FF88', fontWeight: 700 }}>
                            {r.winner_return !== null ? `+${r.winner_return.toFixed(1)}%` : ''}
                          </span>
                        </div>
                      )}
                      {r.eliminated_name && (
                        <span style={{ ...M, fontSize: 10, color: '#FF3333' }}>KO: {r.eliminated_name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full standings */}
          <div className="fade-up fade-up-4" style={{ marginBottom: 32 }}>
            <span style={{ ...B, fontSize: 16, color: '#888', display: 'block', marginBottom: 12 }}>FINAL STANDINGS</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {traders.map(t => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: t.rank === 1 ? 'rgba(245,160,208,0.05)' : '#0D0D0D', borderLeft: `3px solid ${t.rank === 1 ? '#F5A0D0' : t.rank <= 3 ? '#FFD700' : 'transparent'}` }}>
                  <span style={{ ...B, fontSize: 18, color: t.rank === 1 ? '#F5A0D0' : t.rank <= 3 ? '#FFF' : '#555', width: 32 }}>#{t.rank}</span>
                  <span style={{ ...B, fontSize: 16, color: t.isEliminated ? '#666' : '#FFF', textDecoration: t.isEliminated && t.rank > 3 ? 'line-through' : 'none', flex: 1 }}>{t.name}</span>
                  <span style={{ ...M, fontSize: 14, fontWeight: 700, color: t.returnPct >= 0 ? '#00FF88' : '#FF3333' }}>
                    {t.returnPct >= 0 ? '+' : ''}{t.returnPct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24, alignItems: 'center' }}>
            <button
              onClick={() => { window.location.href = '/dashboard'; }}
              style={{ width: '100%', maxWidth: 320, height: 56, ...B, fontSize: 22, color: '#0A0A0A', background: '#F5A0D0', border: 'none', cursor: 'pointer', boxShadow: '0 0 20px rgba(245,160,208,0.3)', transition: 'all 150ms' }}
            >
              BACK TO LOBBY
            </button>
            <button
              onClick={() => {
                const url = window.location.href;
                const text = `${champion?.name ?? 'Champion'} won ${lobbyName} with +${champion?.returnPct.toFixed(1)}%!\n\nBattle Trade — Trading as a Spectator Sport`;
                if (navigator.share) {
                  navigator.share({ title: `${lobbyName} Results`, text, url });
                } else {
                  navigator.clipboard.writeText(`${text}\n${url}`);
                  setShowShare(true);
                  setTimeout(() => setShowShare(false), 2000);
                }
              }}
              style={{ width: '100%', maxWidth: 320, height: 48, ...B, fontSize: 16, color: '#888', background: 'transparent', border: '1px solid #333', cursor: 'pointer', transition: 'all 150ms' }}
            >
              {showShare ? 'COPIED!' : 'SHARE RESULTS'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
