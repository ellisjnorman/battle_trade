'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const B = "var(--font-bebas, 'Bebas Neue'), sans-serif"
const M = "var(--font-jetbrains, 'JetBrains Mono'), monospace"
const S = "var(--font-dm-sans, 'DM Sans'), sans-serif"

interface LobbyInfo {
  id: string; name: string; format: string; status: string; invite_code: string | null
  config: Record<string, unknown>
  player_count: number; spectator_count: number
}
interface RoundInfo { id: string; round_number: number; status: string; started_at: string | null; duration_seconds: number }
interface Standing { trader: { id: string; name: string }; portfolioValue: number; returnPct: number; rank: number }

export default function LobbyLandingPage() {
  const { id: lobbyId } = useParams<{ id: string }>()
  const router = useRouter()
  const [lobby, setLobby] = useState<LobbyInfo | null>(null)
  const [round, setRound] = useState<RoundInfo | null>(null)
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [showCode, setShowCode] = useState(false)
  const [codeInput, setCodeInput] = useState('')

  useEffect(() => {
    if (!lobbyId) return
    const load = async () => {
      // Lobby info
      const { data: l } = await supabase.from('lobbies').select('*').eq('id', lobbyId).single()
      if (!l) { setLoading(false); return }
      const { count: pCount } = await supabase.from('traders').select('id', { count: 'exact', head: true }).eq('lobby_id', lobbyId).eq('is_competitor', true)
      const { count: sCount } = await supabase.from('traders').select('id', { count: 'exact', head: true }).eq('lobby_id', lobbyId).eq('is_competitor', false)
      setLobby({ ...l, player_count: pCount ?? 0, spectator_count: sCount ?? 0 } as unknown as LobbyInfo)

      // Current round
      const { data: rnds } = await supabase.from('rounds').select('id, round_number, status, started_at, duration_seconds').eq('lobby_id', lobbyId).in('status', ['active', 'frozen', 'pending']).order('round_number', { ascending: false }).limit(1)
      if (rnds?.[0]) setRound(rnds[0] as RoundInfo)

      // Standings
      const rid = rnds?.[0]?.id
      if (rid) {
        try {
          const r = await fetch(`/api/lobby/${lobbyId}/leaderboard?round_id=${rid}`)
          if (r.ok) { const d = await r.json(); setStandings(d.standings?.slice(0, 5) ?? []) }
        } catch {}
      }
      setLoading(false)
    }
    load()
    const i = setInterval(load, 5000)
    return () => clearInterval(i)
  }, [lobbyId])

  // Timer
  useEffect(() => {
    if (!round?.started_at || round.status !== 'active') { setTimeRemaining(0); return }
    const calc = () => Math.max(0, Math.floor((new Date(round.started_at!).getTime() + round.duration_seconds * 1000 - Date.now()) / 1000))
    setTimeRemaining(calc())
    const i = setInterval(() => setTimeRemaining(calc()), 1000)
    return () => clearInterval(i)
  }, [round])

  const handleQuickJoin = async (role: 'compete' | 'spectate') => {
    setJoining(true)
    if (role === 'spectate') {
      try {
        const res = await fetch(`/api/lobby/${lobbyId}/spectate-join`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ display_name: joinName || undefined }),
        })
        const data = await res.json()
        if (res.ok && data.trader_id) {
          localStorage.setItem(`bt-spectator-${lobbyId}`, JSON.stringify({ id: data.trader_id, code: data.code }))
          router.push(`/lobby/${lobbyId}/spectate`)
        }
      } catch {}
    } else {
      router.push(`/register/${lobby?.invite_code ?? lobbyId}`)
    }
    setJoining(false)
  }

  const handleCodeJoin = () => {
    const code = codeInput.trim()
    if (!code) return
    router.push(`/lobby/${lobbyId}/trade?code=${code}`)
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  const fee = (lobby?.config?.entry_fee as number) ?? 0
  const statusColors: Record<string, string> = { active: '#00FF88', waiting: '#FFD700', completed: '#888' }
  const statusLabels: Record<string, string> = { active: 'LIVE', waiting: 'WAITING', completed: 'COMPLETED' }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: B, fontSize: 24, color: '#555', letterSpacing: '0.1em', animation: 'pulse 2s infinite' }}>LOADING ARENA...</span>
    </div>
  )

  if (!lobby) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontFamily: B, fontSize: 36, color: '#FF3333', letterSpacing: '0.05em' }}>LOBBY NOT FOUND</span>
      <button onClick={() => router.push('/')} style={{ fontFamily: B, fontSize: 16, color: '#F5A0D0', background: 'transparent', border: '1px solid #F5A0D0', padding: '10px 24px', cursor: 'pointer' }}>BACK HOME</button>
    </div>
  )

  const sc = statusColors[lobby.status] ?? '#888'

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px rgba(245,160,208,0.15)} 50%{box-shadow:0 0 40px rgba(245,160,208,0.35)} }
        .cta-glow { animation: glow 3s ease-in-out infinite; }
      `}</style>

      {/* Nav */}
      <nav style={{ height: 48, borderBottom: '1px solid #1A1A1A', display: 'flex', alignItems: 'center', padding: '0 24px', background: '#0D0D0D' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon.png" alt="" style={{ height: 20, width: 'auto' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <span style={{ fontFamily: B, fontSize: 16, color: '#F5A0D0', letterSpacing: '0.1em' }}>BATTLE TRADE</span>
        </Link>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px' }}>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          {lobby.status === 'active' && <div style={{ width: 8, height: 8, background: sc, animation: 'pulse 2s infinite' }} />}
          <span style={{ fontFamily: M, fontSize: 12, color: sc, letterSpacing: '0.1em' }}>{statusLabels[lobby.status] ?? lobby.status.toUpperCase()}</span>
          <span style={{ fontFamily: M, fontSize: 11, color: '#555' }}>·</span>
          <span style={{ fontFamily: M, fontSize: 11, color: '#555' }}>{lobby.format.toUpperCase()}</span>
        </div>

        {/* Lobby name */}
        <h1 style={{ fontFamily: B, fontSize: 'clamp(40px, 8vw, 72px)', color: 'white', letterSpacing: '0.03em', textAlign: 'center', lineHeight: 1 }}>{lobby.name}</h1>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 32, marginTop: 24, marginBottom: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: B, fontSize: 28, color: '#F5A0D0' }}>{lobby.player_count}</div>
            <div style={{ fontFamily: S, fontSize: 10, color: '#888', letterSpacing: '0.1em' }}>PLAYERS</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: B, fontSize: 28, color: '#F5A0D0' }}>{lobby.spectator_count}</div>
            <div style={{ fontFamily: S, fontSize: 10, color: '#888', letterSpacing: '0.1em' }}>SPECTATORS</div>
          </div>
          {fee > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: B, fontSize: 28, color: '#00FF88' }}>${fee}</div>
              <div style={{ fontFamily: S, fontSize: 10, color: '#888', letterSpacing: '0.1em' }}>BUY-IN</div>
            </div>
          )}
          {round && lobby.status === 'active' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: M, fontSize: 24, color: timeRemaining < 30 ? '#FF3333' : '#FFF' }}>{fmtTime(timeRemaining)}</div>
              <div style={{ fontFamily: S, fontSize: 10, color: '#888', letterSpacing: '0.1em' }}>R{round.round_number}</div>
            </div>
          )}
        </div>

        {/* Live standings preview */}
        {standings.length > 0 && lobby.status === 'active' && (
          <div style={{ width: '100%', maxWidth: 400, marginBottom: 32 }}>
            {standings.map((s, i) => (
              <div key={s.trader.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #111', background: i === 0 ? 'rgba(245,160,208,0.05)' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: M, fontSize: 13, color: i === 0 ? '#FFD700' : '#666', width: 20 }}>#{s.rank}</span>
                  <span style={{ fontFamily: B, fontSize: 16, color: '#FFF', letterSpacing: '0.03em' }}>{s.trader.name}</span>
                </div>
                <span style={{ fontFamily: M, fontSize: 13, color: s.returnPct >= 0 ? '#00FF88' : '#FF3333' }}>
                  {s.returnPct >= 0 ? '+' : ''}{s.returnPct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 400, marginBottom: 16 }}>
          <button onClick={() => handleQuickJoin('compete')} disabled={joining} className="cta-glow" style={{ flex: 1, height: 56, background: '#00FF88', color: '#0A0A0A', border: 'none', fontFamily: B, fontSize: 22, letterSpacing: '0.1em', cursor: joining ? 'not-allowed' : 'pointer' }}>
            {fee > 0 ? `COMPETE · $${fee}` : 'COMPETE'}
          </button>
          <button onClick={() => handleQuickJoin('spectate')} disabled={joining} style={{ flex: 1, height: 56, background: '#F5A0D0', color: '#0A0A0A', border: 'none', fontFamily: B, fontSize: 22, letterSpacing: '0.1em', cursor: joining ? 'not-allowed' : 'pointer' }}>
            SPECTATE
          </button>
        </div>

        {/* Broadcast links — share these */}
        <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 400, marginTop: 8 }}>
          <Link href={`/lobby/${lobbyId}/spectate`} style={{ flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', border: '1px solid #222', color: '#888', fontFamily: S, fontSize: 12, fontWeight: 500, textDecoration: 'none', transition: 'all .15s' }}>
            Spectator View
          </Link>
          <Link href={`/lobby/${lobbyId}/broadcast`} style={{ flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', border: '1px solid #222', color: '#888', fontFamily: S, fontSize: 12, fontWeight: 500, textDecoration: 'none', transition: 'all .15s' }}>
            OBS Overlay
          </Link>
          <Link href={`/lobby/${lobbyId}/leaderboard`} style={{ flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', border: '1px solid #222', color: '#888', fontFamily: S, fontSize: 12, fontWeight: 500, textDecoration: 'none', transition: 'all .15s' }}>
            Leaderboard
          </Link>
        </div>

        {/* Name input */}
        <input type="text" value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="DISPLAY NAME (OPTIONAL)"
          style={{ width: '100%', maxWidth: 400, height: 44, background: '#111', border: '1px solid #222', color: '#FFF', fontFamily: S, fontSize: 14, textAlign: 'center', outline: 'none', padding: '0 16px', marginBottom: 16 }} />

        {/* Already registered */}
        <div style={{ marginTop: 8 }}>
          {showCode ? (
            <div style={{ display: 'flex', gap: 0 }}>
              <input type="text" value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleCodeJoin()} placeholder="YOUR CODE" autoFocus
                style={{ width: 160, height: 40, background: '#111', border: '1px solid #333', borderRight: 'none', color: '#F5A0D0', fontFamily: M, fontSize: 14, textAlign: 'center', letterSpacing: '0.1em', outline: 'none' }} />
              <button onClick={handleCodeJoin} style={{ height: 40, padding: '0 20px', background: '#333', border: 'none', color: '#FFF', fontFamily: B, fontSize: 14, cursor: 'pointer' }}>ENTER</button>
            </div>
          ) : (
            <button onClick={() => setShowCode(true)} style={{ fontFamily: S, fontSize: 12, color: '#555', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              Already registered? <span style={{ color: '#F5A0D0' }}>Enter your code</span>
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
