'use client'

import { useState, useEffect } from 'react'
import { useToastStore } from '@/lib/toast-store'
import { usePrivy } from '@privy-io/react-auth'
import { shortenAddress } from '@/lib/wallet'
import { font, c, radius, navStyle, logoStyle, navLinkStyle, btnPrimary, btnSecondary, card, inputStyle, globalCSS, tierColor } from '@/app/design'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileData {
  id: string; display_name: string; handle: string | null; avatar_url: string | null
  bio: string | null; location: string | null
  total_lobbies_played: number; total_wins: number; win_rate: number; best_return: number
  global_rank: number | null; credits: number
  tr_score: number | null; rank_tier: string | null
  badges: string[] | null
  created_at: string
}

interface LobbyHistory {
  id: string; lobby_name: string; final_rank: number | null; is_eliminated: boolean
  returnPct: number; date: string
}

interface LinkedWallet {
  address: string; chainType?: string; type: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AVATARS = [
  '🐻', '🐂', '🦈', '🦅', '🐺', '🦁', '🐲', '🦊',
  '🎯', '💎', '🔥', '⚡', '🚀', '💀', '👑', '🎰',
]

const TABS = ['overview', 'wallets', 'history', 'settings'] as const
type Tab = typeof TABS[number]

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  paper_hands: { label: 'Paper Hands', color: c.text4 },
  retail: { label: 'Retail', color: c.tierRetail },
  swing_trader: { label: 'Swing Trader', color: c.tierSwing },
  market_maker: { label: 'Market Maker', color: c.tierMaker },
  whale: { label: 'Whale', color: c.tierWhale },
  degen_king: { label: 'Degen King', color: c.tierDegen },
  legendary: { label: 'Legendary', color: c.tierLegend },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [history, setHistory] = useState<LobbyHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [editName, setEditName] = useState('')
  const [editHandle, setEditHandle] = useState('')
  const [editAvatar, setEditAvatar] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAvatars, setShowAvatars] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [notifyTrades, setNotifyTrades] = useState(true)
  const [notifyEvents, setNotifyEvents] = useState(true)
  const [notifyChat, setNotifyChat] = useState(false)
  const [profilePublic, setProfilePublic] = useState(true)
  const [showStats, setShowStats] = useState(true)
  const { user: privyUser, linkWallet, logout } = usePrivy()
  const addToast = useToastStore((s) => s.addToast)

  const [profileId, setProfileId] = useState<string | null>(null)
  useEffect(() => { setProfileId(localStorage.getItem('bt_profile_id')); }, [])

  const linkedWallets: LinkedWallet[] = (privyUser?.linkedAccounts ?? [])
    .filter(a => a.type === 'wallet')
    .map(a => ({ address: (a as unknown as { address: string }).address, chainType: (a as unknown as { chainType?: string }).chainType, type: a.type }))

  const linkedEmail = privyUser?.linkedAccounts?.find(a => a.type === 'email') as { type: string; address: string } | undefined
  const linkedGoogle = privyUser?.linkedAccounts?.find(a => a.type === 'google_oauth') as { type: string; email: string; name?: string } | undefined
  const linkedApple = privyUser?.linkedAccounts?.find(a => a.type === 'apple_oauth') as { type: string; email?: string } | undefined

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  const handleConnectWallet = async () => {
    try { linkWallet() }
    catch (err) { addToast((err as Error).message ?? 'Wallet connection failed', 'error') }
  }

  useEffect(() => {
    if (!profileId) { setLoading(false); return }
    (async () => {
      try {
        const res = await fetch(`/api/profile/${profileId}`)
        if (!res.ok) throw new Error('Profile not found')
        const data = await res.json()
        const p = data.profile
        if (p) {
          setProfile({
            id: p.id,
            display_name: p.display_name ?? '',
            handle: p.handle ?? null,
            avatar_url: p.avatar_url ?? null,
            bio: p.bio ?? null,
            location: p.location ?? null,
            total_lobbies_played: p.total_lobbies_played ?? 0,
            total_wins: p.total_wins ?? 0,
            win_rate: p.win_rate ?? 0,
            best_return: p.best_return ?? 0,
            global_rank: p.global_rank ?? null,
            credits: p.credits ?? 0,
            tr_score: p.tr_score ?? null,
            rank_tier: p.rank_tier ?? null,
            badges: p.badges ?? null,
            created_at: p.created_at,
          })
          setEditName(p.display_name ?? '')
          setEditHandle(p.handle ?? '')
          setEditAvatar(p.avatar_url ?? '')
          setEditBio(p.bio ?? '')
          setEditLocation(p.location ?? '')
        }
        // Match history from API
        if (data.matches && data.matches.length > 0) {
          setHistory(data.matches.map((s: { id: string; lobby_name: string | null; final_rank: number | null; is_eliminated?: boolean; final_balance: number | null; starting_balance: number | null; created_at: string }) => ({
            id: s.id,
            lobby_name: s.lobby_name ?? 'Unknown',
            final_rank: s.final_rank,
            is_eliminated: s.is_eliminated ?? false,
            returnPct: s.final_balance && s.starting_balance ? ((s.final_balance - s.starting_balance) / s.starting_balance) * 100 : 0,
            date: new Date(s.created_at).toLocaleDateString(),
          })))
        }
      } catch {
        addToast('Failed to load profile', 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [profileId, addToast])

  const handleSave = async () => {
    if (!profileId || !editName.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/profile/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: editName.trim(),
          handle: editHandle.trim() || null,
          avatar_url: editAvatar || null,
          bio: editBio.trim() || null,
          location: editLocation.trim() || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      addToast('Profile updated', 'success')
      setProfile(p => p ? {
        ...p,
        display_name: editName.trim(),
        handle: editHandle.trim() || null,
        avatar_url: editAvatar || null,
        bio: editBio.trim() || null,
        location: editLocation.trim() || null,
      } : p)
    } catch {
      addToast('Failed to save', 'error')
    }
    setSaving(false)
  }

  const handleLogout = async () => {
    localStorage.removeItem('bt_profile_id')
    await logout()
    window.location.href = '/login'
  }

  // ---------------------------------------------------------------------------
  // Loading / empty states
  // ---------------------------------------------------------------------------

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: font.sans, fontSize: 16, color: c.text3 }}>Loading...</span>
    </div>
  )

  if (!profileId || !profile) return (
    <div style={{ minHeight: '100vh', background: c.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <span style={{ fontFamily: font.sans, fontSize: 24, fontWeight: 700, color: c.text }}>No profile found</span>
      <span style={{ fontFamily: font.sans, fontSize: 14, color: c.text3 }}>Sign in to access your profile</span>
      <a href="/login" className="btn-p" style={{ ...btnPrimary, fontSize: 16, padding: '14px 36px', textDecoration: 'none' }}>Sign In</a>
    </div>
  )

  const tier = TIER_LABELS[profile.rank_tier ?? ''] ?? TIER_LABELS.paper_hands
  const btr = profile.tr_score ?? 0
  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const totalPnl = history.reduce((sum, h) => sum + h.returnPct, 0)
  const winCount = history.filter(h => h.returnPct > 0).length
  const podiumCount = history.filter(h => h.final_rank && h.final_rank <= 3).length

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ minHeight: '100vh', background: c.bg }}>
      <style>{globalCSS}</style>

      {/* Nav */}
      <nav style={navStyle(scrolled)}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/brand/logo-main.png" alt="Battle Trade" style={logoStyle} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="/dashboard" className="nav-a" style={navLinkStyle(false)}>Home</a>
          <a href="/leaderboard" className="nav-a" style={navLinkStyle(false)}>Leaderboard</a>
          <span style={navLinkStyle(true)}>Profile</span>
        </div>
        <div style={{ width: 80 }} />
      </nav>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '32px 24px' }}>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PROFILE HEADER                                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 8 }}>
          <div onClick={() => setShowAvatars(!showAvatars)} style={{
            width: 80, height: 80, background: c.surface, border: `2px solid ${tier.color}`,
            borderRadius: radius.lg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, cursor: 'pointer', boxShadow: `0 0 20px ${tier.color}30`,
            transition: 'all 200ms',
          }}>
            {editAvatar || '🎮'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: font.sans, fontSize: 28, fontWeight: 800, color: c.text, lineHeight: 1 }}>{profile.display_name}</span>
              <span style={{ fontFamily: font.mono, fontSize: 20, fontWeight: 800, color: tier.color, textShadow: `0 0 12px ${tier.color}40` }}>{btr}</span>
            </div>
            {profile.handle && <div style={{ fontFamily: font.mono, fontSize: 13, color: c.text3, marginTop: 4 }}>@{profile.handle}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 600, color: tier.color, background: `${tier.color}15`, padding: '2px 8px', borderRadius: radius.pill }}>{tier.label}</span>
              <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>Since {memberSince}</span>
              {profile.location && <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4 }}>{profile.location}</span>}
            </div>
            {profile.bio && <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text2, marginTop: 6, lineHeight: 1.4 }}>{profile.bio}</div>}
          </div>
        </div>

        {/* Avatar picker */}
        {showAvatars && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, marginTop: 12, padding: 16, ...card }}>
            {AVATARS.map(a => (
              <button key={a} onClick={() => { setEditAvatar(a); setShowAvatars(false) }} style={{
                width: 44, height: 44, fontSize: 22, borderRadius: radius.md, cursor: 'pointer',
                background: editAvatar === a ? c.pinkDim : c.surface,
                border: editAvatar === a ? `2px solid ${c.pink}` : `1px solid ${c.border}`,
              }}>
                {a}
              </button>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 24, marginTop: 16 }}>
          {[
            { l: 'BATTLES', v: profile.total_lobbies_played, color: c.text },
            { l: 'WINS', v: profile.total_wins, color: c.green },
            { l: 'WIN RATE', v: `${profile.win_rate.toFixed(0)}%`, color: profile.win_rate >= 50 ? c.green : c.red },
            { l: 'BEST', v: `+${profile.best_return.toFixed(0)}%`, color: c.pink },
            { l: 'PODIUMS', v: podiumCount, color: c.gold },
          ].map(s => (
            <div key={s.l} style={{ flex: 1, padding: '12px 8px', background: c.surface, textAlign: 'center' }}>
              <div style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontFamily: font.sans, fontSize: 9, fontWeight: 600, color: c.text4, marginTop: 4, letterSpacing: '0.06em' }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Badges */}
        {profile.badges && profile.badges.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
            {profile.badges.map((b, i) => (
              <span key={i} style={{ fontFamily: font.sans, fontSize: 11, fontWeight: 600, color: c.pink, background: c.pinkDim, padding: '4px 10px', borderRadius: radius.pill, border: `1px solid ${c.pinkBorder}` }}>{b}</span>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TABS                                                    */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}`, marginBottom: 24 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              flex: 1, padding: '12px 0', fontFamily: font.sans, fontSize: 13, fontWeight: 600,
              color: activeTab === t ? c.text : c.text4,
              background: 'transparent', border: 'none',
              borderBottom: activeTab === t ? `2px solid ${c.pink}` : '2px solid transparent',
              cursor: 'pointer', transition: 'all 150ms', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>{t}</button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: OVERVIEW — Edit profile                           */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div>
            <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text2, marginBottom: 14 }}>Edit Profile</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 500, color: c.text3, display: 'block', marginBottom: 4 }}>Display Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={24}
                  style={{ ...inputStyle, height: 44, fontSize: 15, padding: '0 14px' }} />
              </div>
              <div>
                <label style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 500, color: c.text3, display: 'block', marginBottom: 4 }}>Handle</label>
                <input value={editHandle} onChange={e => setEditHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} maxLength={20} placeholder="your_handle"
                  style={{ ...inputStyle, height: 44, fontSize: 15, padding: '0 14px' }} />
              </div>
              <div>
                <label style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 500, color: c.text3, display: 'block', marginBottom: 4 }}>Bio</label>
                <textarea value={editBio} onChange={e => setEditBio(e.target.value)} maxLength={160} placeholder="Tell the world who you are..."
                  rows={3} style={{ ...inputStyle, fontSize: 14, padding: '10px 14px', resize: 'vertical', lineHeight: 1.4, minHeight: 72 }} />
                <span style={{ fontFamily: font.mono, fontSize: 10, color: c.text4, marginTop: 2, display: 'block', textAlign: 'right' }}>{editBio.length}/160</span>
              </div>
              <div>
                <label style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 500, color: c.text3, display: 'block', marginBottom: 4 }}>Location</label>
                <input value={editLocation} onChange={e => setEditLocation(e.target.value)} maxLength={40} placeholder="New York, NY"
                  style={{ ...inputStyle, height: 44, fontSize: 15, padding: '0 14px' }} />
              </div>
              <button onClick={handleSave} disabled={saving || !editName.trim()} className="btn-p" style={{
                ...btnPrimary, height: 48, fontSize: 15,
                opacity: saving || !editName.trim() ? 0.4 : 1,
                cursor: saving ? 'default' : 'pointer',
              }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            {/* Connected accounts */}
            <div style={{ marginTop: 32 }}>
              <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text2, marginBottom: 14 }}>Connected Accounts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {linkedEmail && (
                  <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                    <span style={{ fontSize: 18, width: 32, textAlign: 'center' }}>📧</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text }}>Email</div>
                      <div style={{ fontFamily: font.mono, fontSize: 12, color: c.text3 }}>{linkedEmail.address}</div>
                    </div>
                    <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.green, background: c.greenDim, padding: '3px 8px', borderRadius: radius.pill }}>Linked</span>
                  </div>
                )}
                {linkedGoogle && (
                  <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                    <span style={{ fontSize: 18, width: 32, textAlign: 'center' }}>G</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text }}>Google</div>
                      <div style={{ fontFamily: font.mono, fontSize: 12, color: c.text3 }}>{linkedGoogle.email}</div>
                    </div>
                    <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.green, background: c.greenDim, padding: '3px 8px', borderRadius: radius.pill }}>Linked</span>
                  </div>
                )}
                {linkedApple && (
                  <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                    <span style={{ fontSize: 18, width: 32, textAlign: 'center' }}>🍎</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text }}>Apple</div>
                      <div style={{ fontFamily: font.mono, fontSize: 12, color: c.text3 }}>{linkedApple.email ?? 'Connected'}</div>
                    </div>
                    <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.green, background: c.greenDim, padding: '3px 8px', borderRadius: radius.pill }}>Linked</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: WALLETS — Multiple wallet management              */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'wallets' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text2 }}>Your Wallets</div>
              <button onClick={handleConnectWallet} className="btn-p" style={{ ...btnPrimary, fontSize: 12, padding: '8px 16px' }}>
                + Add Wallet
              </button>
            </div>

            {linkedWallets.length === 0 ? (
              <div style={{ ...card, padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
                <div style={{ fontFamily: font.sans, fontSize: 16, fontWeight: 600, color: c.text, marginBottom: 6 }}>No wallets connected</div>
                <div style={{ fontFamily: font.sans, fontSize: 13, color: c.text3, marginBottom: 20, lineHeight: 1.5 }}>
                  Link your wallets to verify trades, claim prizes, and build your on-chain reputation.
                </div>
                <button onClick={handleConnectWallet} className="btn-p" style={{ ...btnPrimary, fontSize: 14, padding: '12px 32px' }}>
                  Connect Wallet
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {linkedWallets.map((w, i) => (
                  <div key={w.address} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: radius.md, background: c.surface,
                      border: `1px solid ${i === 0 ? c.pink : c.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: font.mono, fontSize: 14, color: i === 0 ? c.pink : c.text3,
                    }}>
                      W{i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text }}>
                          {w.chainType?.toUpperCase() ?? 'WALLET'}
                        </span>
                        {i === 0 && <span style={{ fontFamily: font.sans, fontSize: 9, fontWeight: 600, color: c.pink, background: c.pinkDim, padding: '2px 6px', borderRadius: radius.pill }}>PRIMARY</span>}
                      </div>
                      <div style={{ fontFamily: font.mono, fontSize: 12, color: c.green, marginTop: 2 }}>{shortenAddress(w.address)}</div>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(w.address); addToast('Address copied', 'success') }}
                      style={{ fontFamily: font.sans, fontSize: 11, color: c.text3, background: c.surface, border: `1px solid ${c.border}`, padding: '6px 12px', borderRadius: radius.sm, cursor: 'pointer' }}
                    >Copy</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 24, padding: 16, background: c.surface, border: `1px solid ${c.border}`, borderRadius: radius.md }}>
              <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.text3, marginBottom: 8 }}>Supported Wallets</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['MetaMask', 'WalletConnect', 'Coinbase Wallet', 'Phantom', 'Rainbow'].map(w => (
                  <span key={w} style={{ fontFamily: font.sans, fontSize: 11, color: c.text4, background: c.bg, padding: '4px 10px', borderRadius: radius.pill, border: `1px solid ${c.border}` }}>{w}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: HISTORY — Match history                           */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div>
            {/* Summary strip */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
              <div style={{ flex: 1, padding: '10px 12px', background: c.surface, textAlign: 'center' }}>
                <div style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: totalPnl >= 0 ? c.green : c.red }}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(1)}%</div>
                <div style={{ fontFamily: font.sans, fontSize: 9, color: c.text4, marginTop: 2 }}>TOTAL P&L</div>
              </div>
              <div style={{ flex: 1, padding: '10px 12px', background: c.surface, textAlign: 'center' }}>
                <div style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: c.text }}>{history.length}</div>
                <div style={{ fontFamily: font.sans, fontSize: 9, color: c.text4, marginTop: 2 }}>BATTLES</div>
              </div>
              <div style={{ flex: 1, padding: '10px 12px', background: c.surface, textAlign: 'center' }}>
                <div style={{ fontFamily: font.mono, fontSize: 18, fontWeight: 700, color: c.green }}>{winCount}</div>
                <div style={{ fontFamily: font.sans, fontSize: 9, color: c.text4, marginTop: 2 }}>PROFITABLE</div>
              </div>
            </div>

            {/* Column headers */}
            <div style={{ display: 'flex', padding: '6px 16px', borderBottom: `1px solid ${c.border}` }}>
              <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.text4, width: 36 }}>RANK</span>
              <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.text4, flex: 1 }}>LOBBY</span>
              <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.text4, width: 70, textAlign: 'right' }}>RETURN</span>
              <span style={{ fontFamily: font.sans, fontSize: 10, fontWeight: 600, color: c.text4, width: 70, textAlign: 'right' }}>DATE</span>
            </div>

            {history.length === 0 ? (
              <div style={{ ...card, padding: '40px 0', textAlign: 'center', borderRadius: 0 }}>
                <div style={{ fontFamily: font.sans, fontSize: 16, fontWeight: 600, color: c.text4 }}>No matches yet</div>
                <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text4, marginTop: 6 }}>Join a lobby to start your battle record</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {history.map(h => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${c.bg}`, background: c.surface, transition: 'background 100ms' }}>
                    <span style={{
                      fontFamily: font.mono, fontSize: 14, fontWeight: 700, width: 36,
                      color: h.final_rank === 1 ? c.gold : h.final_rank && h.final_rank <= 3 ? c.pink : c.text4,
                    }}>
                      {h.final_rank ? `#${h.final_rank}` : '—'}
                    </span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text }}>{h.lobby_name}</span>
                      {h.is_eliminated && <span style={{ fontFamily: font.sans, fontSize: 9, fontWeight: 600, color: c.red, background: c.redDim, padding: '1px 6px', borderRadius: 4 }}>KO</span>}
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 13, fontWeight: 700, color: h.returnPct >= 0 ? c.green : c.red, width: 70, textAlign: 'right' }}>
                      {h.returnPct >= 0 ? '+' : ''}{h.returnPct.toFixed(1)}%
                    </span>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: c.text4, width: 70, textAlign: 'right' }}>{h.date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: SETTINGS                                          */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Privacy */}
            <div>
              <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text2, marginBottom: 14 }}>Privacy</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ToggleRow label="Public profile" desc="Others can view your stats and history" value={profilePublic} onChange={setProfilePublic} />
                <ToggleRow label="Show trading stats" desc="Display win rate, best return, and P&L" value={showStats} onChange={setShowStats} />
              </div>
            </div>

            {/* Notifications */}
            <div>
              <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text2, marginBottom: 14 }}>Notifications</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ToggleRow label="Trade alerts" desc="Get notified when your trades execute" value={notifyTrades} onChange={setNotifyTrades} />
                <ToggleRow label="Market events" desc="Flash crashes, halts, and volatility" value={notifyEvents} onChange={setNotifyEvents} />
                <ToggleRow label="Chat messages" desc="New messages in your active lobbies" value={notifyChat} onChange={setNotifyChat} />
              </div>
            </div>

            {/* Account */}
            <div>
              <div style={{ fontFamily: font.sans, fontSize: 14, fontWeight: 600, color: c.text2, marginBottom: 14 }}>Account</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
                  <div>
                    <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text }}>Profile ID</div>
                    <div style={{ fontFamily: font.mono, fontSize: 11, color: c.text4, marginTop: 2 }}>{profileId}</div>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(profileId); addToast('Copied', 'success') }} style={{ fontFamily: font.sans, fontSize: 11, color: c.text3, background: c.surface, border: `1px solid ${c.border}`, padding: '6px 12px', borderRadius: radius.sm, cursor: 'pointer' }}>Copy</button>
                </div>
                <button onClick={handleLogout} style={{
                  width: '100%', padding: '14px 0', fontFamily: font.sans, fontSize: 14, fontWeight: 600,
                  color: c.red, background: c.redDim, border: `1px solid ${c.red}33`,
                  borderRadius: radius.md, cursor: 'pointer', transition: 'all 150ms',
                }}>
                  Sign Out
                </button>
              </div>
            </div>

            {/* Danger zone */}
            <div style={{ marginTop: 16, padding: 16, border: `1px solid ${c.red}22`, borderRadius: radius.md, background: `${c.red}05` }}>
              <div style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: c.red, marginBottom: 8 }}>Danger Zone</div>
              <div style={{ fontFamily: font.sans, fontSize: 12, color: c.text3, marginBottom: 12, lineHeight: 1.5 }}>
                Deleting your account is permanent. All your stats, history, and rank will be lost.
              </div>
              <button style={{
                fontFamily: font.sans, fontSize: 12, fontWeight: 600,
                color: c.text4, background: 'transparent', border: `1px solid ${c.border}`,
                padding: '8px 16px', borderRadius: radius.sm, cursor: 'pointer',
              }}>
                Delete Account
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle Row Component
// ---------------------------------------------------------------------------

function ToggleRow({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', background: c.surface, border: `1px solid ${c.border}`, borderRadius: radius.sm,
    }}>
      <div>
        <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: c.text }}>{label}</div>
        <div style={{ fontFamily: font.sans, fontSize: 11, color: c.text3, marginTop: 2 }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: value ? c.green : c.elevated,
        position: 'relative', transition: 'background 200ms',
        flexShrink: 0,
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 9, background: '#FFF',
          position: 'absolute', top: 3,
          left: value ? 23 : 3,
          transition: 'left 200ms',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  )
}
