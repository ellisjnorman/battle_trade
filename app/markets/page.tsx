'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif"
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace"
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif"

type Filter = 'all' | 'live' | 'upcoming' | 'free' | 'paid'

interface LobbyItem {
  id: string; name: string; format: string; status: 'waiting' | 'active'
  invite_code: string | null; config: Record<string, unknown>
  player_count: number; spectator_count: number
  current_round?: { number: number; status: string; time_remaining?: number }
  top_trader?: { name: string; return_pct: number }
}

export default function MarketsPage() {
  const router = useRouter()
  const [lobbies, setLobbies] = useState<LobbyItem[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/lobbies/active')
        if (r.ok) { const d = await r.json(); setLobbies(d.lobbies ?? []) }
      } catch {}
      setLoading(false)
    }
    load()
    const i = setInterval(load, 5000)
    return () => clearInterval(i)
  }, [])

  const filtered = lobbies.filter(l => {
    if (filter === 'live') return l.status === 'active'
    if (filter === 'upcoming') return l.status === 'waiting'
    if (filter === 'free') return !((l.config?.entry_fee as number) > 0)
    if (filter === 'paid') return (l.config?.entry_fee as number) > 0
    return true
  })

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'ALL' },
    { id: 'live', label: 'LIVE' },
    { id: 'upcoming', label: 'STARTING SOON' },
    { id: 'free', label: 'FREE' },
    { id: 'paid', label: 'PAID' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px rgba(245,160,208,0.15)} 50%{box-shadow:0 0 40px rgba(245,160,208,0.35)} }
        .lobby-card:hover { border-color: #F5A0D0 !important; }
        .filter-btn:hover { color: #FFF !important; border-color: #555 !important; }
        .cta-glow { animation: glow 3s ease-in-out infinite; }
      `}</style>

      {/* Nav */}
      <nav style={{ height: 56, borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#0D0D0D' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.png" alt="" style={{ height: 24, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span style={{ fontFamily: B, fontSize: 20, color: '#F5A0D0', letterSpacing: '0.1em' }}>BATTLE TRADE</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="/markets" style={{ fontFamily: B, fontSize: 14, color: '#FFF', letterSpacing: '0.08em', textDecoration: 'none' }}>MARKETS</a>
          <a href="/learn" style={{ fontFamily: B, fontSize: 14, color: '#888', letterSpacing: '0.08em', textDecoration: 'none' }}>LEARN</a>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/profile')} style={{ fontFamily: B, fontSize: 13, color: '#888', background: 'transparent', border: '1px solid #333', padding: '8px 16px', cursor: 'pointer' }}>PROFILE</button>
          <button onClick={() => router.push('/create')} className="cta-glow" style={{ fontFamily: B, fontSize: 14, color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '8px 20px', cursor: 'pointer' }}>CREATE LOBBY</button>
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontFamily: B, fontSize: 48, color: 'white', letterSpacing: '0.05em' }}>ARENAS</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, background: '#00FF88', animation: 'pulse 2s infinite' }} />
            <span style={{ fontFamily: M, fontSize: 12, color: '#00FF88' }}>{lobbies.filter(l => l.status === 'active').length} LIVE</span>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button key={f.id} className="filter-btn" onClick={() => setFilter(f.id)}
              style={{
                fontFamily: B, fontSize: 13, letterSpacing: '0.08em', padding: '8px 16px', cursor: 'pointer', transition: 'all 150ms',
                background: filter === f.id ? '#F5A0D0' : 'transparent',
                color: filter === f.id ? '#0A0A0A' : '#888',
                border: filter === f.id ? 'none' : '1px solid #333',
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Lobby grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 64 }}>
            <span style={{ fontFamily: B, fontSize: 20, color: '#555', letterSpacing: '0.1em' }}>LOADING ARENAS...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 64, border: '1px solid #1A1A1A', background: '#0D0D0D' }}>
            <span style={{ fontFamily: B, fontSize: 32, color: '#555', letterSpacing: '0.05em' }}>NO ARENAS FOUND</span>
            <p style={{ fontFamily: S, fontSize: 14, color: '#888', marginTop: 12 }}>Be the first — create a lobby and invite your friends.</p>
            <button onClick={() => router.push('/create')} style={{ fontFamily: B, fontSize: 18, color: '#0A0A0A', background: '#F5A0D0', border: 'none', padding: '12px 32px', marginTop: 24, cursor: 'pointer' }}>CREATE LOBBY</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filtered.map(l => {
              const fee = (l.config?.entry_fee as number) ?? 0
              return (
                <div key={l.id} className="lobby-card" onClick={() => router.push(`/lobby/${l.id}`)}
                  style={{ padding: 20, background: '#0D0D0D', border: '1px solid #1A1A1A', cursor: 'pointer', transition: 'border-color 150ms' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontFamily: B, fontSize: 22, color: '#FFF', letterSpacing: '0.05em' }}>{l.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {l.status === 'active' && <div style={{ width: 6, height: 6, background: '#00FF88', animation: 'pulse 2s infinite' }} />}
                      <span style={{ fontFamily: M, fontSize: 10, color: l.status === 'active' ? '#00FF88' : '#FFD700' }}>
                        {l.status === 'active' ? 'LIVE' : 'UPCOMING'}
                      </span>
                    </div>
                  </div>

                  {/* Format + stats */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: M, fontSize: 9, color: '#F5A0D0', border: '1px solid rgba(245,160,208,0.3)', padding: '2px 6px' }}>{l.format.toUpperCase()}</span>
                    <span style={{ fontFamily: S, fontSize: 12, color: '#888' }}>{l.player_count} players · {l.spectator_count} watching</span>
                  </div>

                  {/* Top trader */}
                  {l.top_trader && (
                    <div style={{ fontFamily: M, fontSize: 13, color: l.top_trader.return_pct >= 0 ? '#00FF88' : '#FF3333', marginBottom: 8 }}>
                      #1 {l.top_trader.name} {l.top_trader.return_pct >= 0 ? '+' : ''}{l.top_trader.return_pct.toFixed(1)}%
                    </div>
                  )}

                  {/* Round info */}
                  {l.current_round && (
                    <div style={{ fontFamily: M, fontSize: 11, color: '#666', marginBottom: 12 }}>
                      R{l.current_round.number} · {l.current_round.status.toUpperCase()}
                    </div>
                  )}

                  {/* Bottom row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                    <span style={{ fontFamily: M, fontSize: 12, color: fee > 0 ? '#F5A0D0' : '#00FF88' }}>
                      {fee > 0 ? `$${fee} BUY-IN` : 'FREE'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={e => { e.stopPropagation(); router.push(`/lobby/${l.id}/spectate`) }}
                        style={{ height: 32, padding: '0 16px', background: 'transparent', border: '1px solid #333', color: '#888', fontFamily: B, fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer' }}>WATCH</button>
                      <button onClick={e => { e.stopPropagation(); router.push(`/lobby/${l.id}`) }}
                        style={{ height: 32, padding: '0 16px', background: '#F5A0D0', border: 'none', color: '#0A0A0A', fontFamily: B, fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer' }}>JOIN</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
