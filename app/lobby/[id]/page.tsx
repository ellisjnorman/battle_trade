'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { shortenAddress } from '@/lib/wallet'
import LobbyChat from '@/components/lobby-chat'

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
interface FeeInfo { entry_fee: number; prize_pool: number; total_entries: number; split: number[]; pot_status: string }

export default function LobbyLandingPage() {
  const { id: lobbyId } = useParams<{ id: string }>()
  const router = useRouter()
  const [lobby, setLobby] = useState<LobbyInfo | null>(null)
  const [round, setRound] = useState<RoundInfo | null>(null)
  const [standings, setStandings] = useState<Standing[]>([])
  const [feeInfo, setFeeInfo] = useState<FeeInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [showCode, setShowCode] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositing, setDepositing] = useState(false)
  const [depositMsg, setDepositMsg] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimMsg, setClaimMsg] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profileCredits, setProfileCredits] = useState<number>(0)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [chatUser, setChatUser] = useState<{ id: string; name: string; role: 'competitor' | 'spectator' | 'admin' } | null>(null)

  // Try to resolve chat identity from localStorage
  useEffect(() => {
    if (!lobbyId) return
    const tryResolve = async () => {
      try {
        // Check for spectator identity
        const saved = localStorage.getItem(`bt-spectator-${lobbyId}`)
        if (saved) {
          const { id } = JSON.parse(saved)
          const { data } = await supabase.from('traders').select('id, name, is_competitor').eq('id', id).eq('lobby_id', lobbyId).single()
          if (data) { setChatUser({ id: data.id, name: data.name ?? 'Anon', role: data.is_competitor ? 'competitor' : 'spectator' }); return }
        }
        // Check for trader identity via profile
        const profileStr = localStorage.getItem('bt-profile')
        if (profileStr) {
          const p = JSON.parse(profileStr)
          if (p.id) {
            const { data } = await supabase.from('traders').select('id, name, is_competitor').eq('lobby_id', lobbyId).eq('profile_id', p.id).single()
            if (data) { setChatUser({ id: data.id, name: data.name ?? 'Anon', role: data.is_competitor ? 'competitor' : 'spectator' }) }
          }
        }
      } catch { /* ignore */ }
    }
    tryResolve()
  }, [lobbyId])

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
      // Fee info
      try {
        const feeRes = await fetch(`/api/lobby/${lobbyId}/fee-info`)
        if (feeRes.ok) { const d = await feeRes.json(); setFeeInfo(d) }
      } catch {}

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

  // Load wallet & profile from localStorage (set during Privy auth / registration)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('bt-profile')
      if (stored) {
        const p = JSON.parse(stored)
        if (p.id) setProfileId(p.id)
        if (p.wallet_address) setWalletAddress(p.wallet_address)
        if (typeof p.credits === 'number') setProfileCredits(p.credits)
      }
    } catch {}
  }, [])

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount)
    if (!amt || amt <= 0 || !walletAddress || !profileId) return
    setDepositing(true)
    setDepositMsg(null)
    try {
      const res = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress, amount: amt, profile_id: profileId }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setDepositMsg(`+${data.credits_added} credits deposited`)
        setProfileCredits(prev => prev + data.credits_added)
        setDepositAmount('')
      } else {
        setDepositMsg(data.error ?? 'Deposit failed')
      }
    } catch {
      setDepositMsg('Network error')
    }
    setDepositing(false)
  }

  const handleClaimPrize = async (amount: number) => {
    if (!walletAddress || !profileId || !lobbyId) return
    setClaiming(true)
    setClaimMsg(null)
    try {
      const res = await fetch('/api/wallet/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress, amount, lobby_id: lobbyId, profile_id: profileId }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setClaimMsg(`Claimed $${amount} USDC — tx: ${data.tx_hash?.slice(0, 10)}...`)
        setProfileCredits(prev => prev - Math.round(amount * 100))
      } else {
        setClaimMsg(data.error ?? 'Claim failed')
      }
    } catch {
      setClaimMsg('Network error')
    }
    setClaiming(false)
  }

  const handleQuickJoin = async (role: 'compete' | 'spectate') => {
    if (role === 'spectate') {
      setJoining(true)
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
      setJoining(false)
    } else {
      // If lobby has an entry fee, show confirmation modal first
      if (fee > 0) {
        setShowConfirm(true)
      } else {
        router.push(`/register/${lobby?.invite_code ?? lobbyId}`)
      }
    }
  }

  const handleConfirmJoin = () => {
    setShowConfirm(false)
    router.push(`/register/${lobby?.invite_code ?? lobbyId}`)
  }

  const handleCodeJoin = () => {
    const code = codeInput.trim()
    if (!code) return
    router.push(`/lobby/${lobbyId}/trade?code=${code}`)
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  const fmtCredits = (n: number) => n.toLocaleString()
  const fee = (lobby?.config?.entry_fee as number) ?? 0
  const prizePool = feeInfo?.prize_pool ?? 0
  const totalEntries = feeInfo?.total_entries ?? 0
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
        @keyframes prizeGlow { 0%,100%{box-shadow:0 0 12px rgba(0,255,136,0.1)} 50%{box-shadow:0 0 24px rgba(0,255,136,0.25)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .cta-glow { animation: glow 3s ease-in-out infinite; }
        .prize-glow { animation: prizeGlow 3s ease-in-out infinite; }
        .overlay-fade { animation: fadeIn 200ms ease both; }
        .modal-slide { animation: slideUp 300ms ease both; }
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
        <div style={{ display: 'flex', gap: 32, marginTop: 24, marginBottom: fee > 0 ? 16 : 32 }}>
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
              <div style={{ fontFamily: B, fontSize: 28, color: '#00FF88' }}>{fmtCredits(fee)}</div>
              <div style={{ fontFamily: S, fontSize: 10, color: '#888', letterSpacing: '0.1em' }}>BUY-IN (CR)</div>
            </div>
          )}
          {round && lobby.status === 'active' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: M, fontSize: 24, color: timeRemaining < 30 ? '#FF3333' : '#FFF' }}>{fmtTime(timeRemaining)}</div>
              <div style={{ fontFamily: S, fontSize: 10, color: '#888', letterSpacing: '0.1em' }}>R{round.round_number}</div>
            </div>
          )}
        </div>

        {/* Prize Pool Card — shown when lobby has entry fee */}
        {fee > 0 && (
          <div className="prize-glow" style={{
            width: '100%', maxWidth: 400, marginBottom: 32,
            border: '1px solid #1A1A1A', background: 'rgba(0,255,136,0.02)',
            padding: '20px 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: S, fontSize: 9, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase' }}>PRIZE POOL</div>
                <div style={{ fontFamily: B, fontSize: 36, color: '#00FF88', lineHeight: 1, marginTop: 4 }}>
                  {fmtCredits(prizePool)} CR
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: S, fontSize: 9, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase' }}>ENTRIES</div>
                <div style={{ fontFamily: M, fontSize: 20, color: '#FFF', marginTop: 4 }}>{totalEntries}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 0, width: '100%' }}>
              {[
                { pct: 60, label: '1ST', color: '#FFD700' },
                { pct: 25, label: '2ND', color: '#C0C0C0' },
                { pct: 15, label: '3RD', color: '#CD7F32' },
              ].map(({ pct, label, color }) => (
                <div key={label} style={{
                  flex: pct, textAlign: 'center',
                  padding: '8px 0',
                  background: `${color}08`,
                  borderTop: `2px solid ${color}`,
                }}>
                  <div style={{ fontFamily: M, fontSize: 11, color, letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontFamily: M, fontSize: 13, color: '#FFF', marginTop: 2 }}>
                    {prizePool > 0 ? `${fmtCredits(Math.round(prizePool * pct / 100))} CR` : `${pct}%`}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: S, fontSize: 10, color: '#555', textAlign: 'center', marginTop: 12, letterSpacing: '0.05em' }}>
              ENTRY FEE: {fmtCredits(fee)} CR PER PLAYER
            </div>
          </div>
        )}

        {/* Wallet section */}
        {walletAddress && (
          <div style={{ width: '100%', maxWidth: 400, marginBottom: 24, border: '1px solid #1A1A1A', background: '#0D0D0D', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, background: '#00FF88' }} />
                <span style={{ fontFamily: M, fontSize: 12, color: '#00FF88', letterSpacing: '0.05em' }}>WALLET LINKED</span>
              </div>
              <span style={{ fontFamily: M, fontSize: 12, color: '#888' }}>{shortenAddress(walletAddress)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: S, fontSize: 12, color: '#888' }}>Credits</span>
              <span style={{ fontFamily: M, fontSize: 14, color: '#F5A0D0' }}>{profileCredits.toLocaleString()} CR</span>
            </div>

            {/* Deposit toggle */}
            {fee > 0 && !showDeposit && (
              <button onClick={() => setShowDeposit(true)} style={{ width: '100%', height: 36, background: 'transparent', border: '1px solid #333', color: '#F5A0D0', fontFamily: B, fontSize: 14, letterSpacing: '0.05em', cursor: 'pointer', marginBottom: 4 }}>
                DEPOSIT USDC FOR CREDITS
              </button>
            )}

            {showDeposit && (
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
                  <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="USDC amount"
                    style={{ flex: 1, height: 36, background: '#111', border: '1px solid #333', borderRight: 'none', color: '#FFF', fontFamily: M, fontSize: 13, textAlign: 'center', outline: 'none' }} />
                  <button onClick={handleDeposit} disabled={depositing}
                    style={{ height: 36, padding: '0 16px', background: '#F5A0D0', border: 'none', color: '#0A0A0A', fontFamily: B, fontSize: 13, cursor: depositing ? 'not-allowed' : 'pointer' }}>
                    {depositing ? '...' : 'DEPOSIT'}
                  </button>
                </div>
                <span style={{ fontFamily: S, fontSize: 10, color: '#555' }}>1 USDC = 100 credits</span>
              </div>
            )}

            {depositMsg && (
              <div style={{ marginTop: 8, fontFamily: M, fontSize: 11, color: depositMsg.startsWith('+') ? '#00FF88' : '#FF3333' }}>{depositMsg}</div>
            )}
          </div>
        )}

        {/* Claim prize (shown when lobby is completed and user has wallet) */}
        {walletAddress && lobby.status === 'completed' && profileCredits > 0 && (
          <div style={{ width: '100%', maxWidth: 400, marginBottom: 24, border: '1px solid #1A1A1A', background: '#0D0D0D', padding: 16 }}>
            <div style={{ fontFamily: B, fontSize: 18, color: '#FFD700', letterSpacing: '0.05em', marginBottom: 12 }}>CLAIM YOUR WINNINGS</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: S, fontSize: 12, color: '#888' }}>Available</span>
              <span style={{ fontFamily: M, fontSize: 14, color: '#00FF88' }}>{profileCredits.toLocaleString()} CR (${(profileCredits / 100).toFixed(2)})</span>
            </div>
            <button onClick={() => handleClaimPrize(profileCredits / 100)} disabled={claiming}
              style={{ width: '100%', height: 44, background: '#FFD700', border: 'none', color: '#0A0A0A', fontFamily: B, fontSize: 18, letterSpacing: '0.05em', cursor: claiming ? 'not-allowed' : 'pointer' }}>
              {claiming ? 'CLAIMING...' : `CLAIM $${(profileCredits / 100).toFixed(2)} USDC TO WALLET`}
            </button>
            <div style={{ marginTop: 8, fontFamily: M, fontSize: 11, color: '#555' }}>Sent to {shortenAddress(walletAddress)}</div>
            {claimMsg && (
              <div style={{ marginTop: 8, fontFamily: M, fontSize: 11, color: claimMsg.startsWith('Claimed') ? '#00FF88' : '#FF3333' }}>{claimMsg}</div>
            )}
          </div>
        )}

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
            {fee > 0 ? `COMPETE · ${fmtCredits(fee)} CR` : 'COMPETE'}
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

      {/* Entry Fee Confirmation Modal */}
      {showConfirm && (
        <div className="overlay-fade" onClick={() => setShowConfirm(false)} style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 24,
        }}>
          <div className="modal-slide" onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 420,
            background: '#0D0D0D',
            border: '1px solid #1A1A1A',
            padding: 32,
            display: 'flex', flexDirection: 'column', gap: 24,
          }}>
            {/* Header */}
            <div>
              <div style={{ fontFamily: B, fontSize: 32, color: '#FFF', letterSpacing: '0.05em', lineHeight: 1 }}>
                JOIN {lobby.name}?
              </div>
              <div style={{ fontFamily: S, fontSize: 13, color: '#888', marginTop: 8 }}>
                This lobby requires an entry fee to compete.
              </div>
            </div>

            {/* Fee breakdown */}
            <div style={{
              border: '1px solid #1A1A1A', padding: '20px',
              background: 'rgba(0,255,136,0.02)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontFamily: S, fontSize: 12, color: '#888', letterSpacing: '0.05em' }}>ENTRY FEE</span>
                <span style={{ fontFamily: M, fontSize: 20, color: '#FF3333', fontWeight: 700 }}>-{fmtCredits(fee)} CR</span>
              </div>
              {profileCredits > 0 && (
                <>
                  <div style={{ width: '100%', height: 1, background: '#1A1A1A', marginBottom: 16 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontFamily: S, fontSize: 12, color: '#888', letterSpacing: '0.05em' }}>YOUR BALANCE</span>
                    <span style={{ fontFamily: M, fontSize: 16, color: profileCredits >= fee ? '#FFF' : '#FF3333' }}>{fmtCredits(profileCredits)} CR</span>
                  </div>
                </>
              )}
              <div style={{ width: '100%', height: 1, background: '#1A1A1A', marginBottom: 16 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: S, fontSize: 12, color: '#888', letterSpacing: '0.05em' }}>PRIZE POOL</span>
                <span style={{ fontFamily: M, fontSize: 16, color: '#00FF88' }}>{fmtCredits(prizePool)} CR</span>
              </div>
              <div style={{ fontFamily: M, fontSize: 11, color: '#555', marginTop: 12 }}>
                1st: 60% · 2nd: 25% · 3rd: 15%
              </div>
            </div>

            {/* Info note */}
            <div style={{ fontFamily: S, fontSize: 11, color: '#666', lineHeight: 1.5 }}>
              The entry fee will be deducted from your credits upon registration. All fees contribute to the prize pool (minus platform rake).
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowConfirm(false)} style={{
                flex: 1, height: 48,
                background: 'transparent', border: '1px solid #333',
                color: '#888', fontFamily: B, fontSize: 18,
                letterSpacing: '0.08em', cursor: 'pointer',
              }}>
                CANCEL
              </button>
              <button onClick={handleConfirmJoin} style={{
                flex: 1, height: 48,
                background: '#00FF88', border: 'none',
                color: '#0A0A0A', fontFamily: B, fontSize: 18,
                letterSpacing: '0.08em', cursor: 'pointer',
              }}>
                {'CONFIRM & JOIN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat */}
      {chatUser && (
        <LobbyChat
          lobbyId={lobbyId}
          userId={chatUser.id}
          userName={chatUser.name}
          userRole={chatUser.role}
        />
      )}
    </div>
  )
}
