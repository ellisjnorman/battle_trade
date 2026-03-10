'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useToastStore } from '@/lib/toast-store'
import { usePrivy } from '@privy-io/react-auth'
import { shortenAddress } from '@/lib/wallet'
import { font, c, radius, navStyle, logoStyle, navLinkStyle, btnPrimary, btnSecondary, card, inputStyle, globalCSS, tierColor } from '@/app/design'

interface ProfileData {
  id: string; display_name: string; handle: string | null; avatar_url: string | null
  total_lobbies_played: number; total_wins: number; win_rate: number; best_return: number
  global_rank: number | null; credits: number
}

interface LobbyHistory {
  id: string; lobby_name: string; final_rank: number | null; is_eliminated: boolean
  returnPct: number; date: string
}

const AVATARS = [
  '🐻', '🐂', '🦈', '🦅', '🐺', '🦁', '🐲', '🦊',
  '🎯', '💎', '🔥', '⚡', '🚀', '💀', '👑', '🎰',
]

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [history, setHistory] = useState<LobbyHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [editName, setEditName] = useState('')
  const [editHandle, setEditHandle] = useState('')
  const [editAvatar, setEditAvatar] = useState('')
  const [saving, setSaving] = useState(false)
  const [showAvatars, setShowAvatars] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { user: privyUser, linkWallet } = usePrivy()
  const addToast = useToastStore((s) => s.addToast)

  const profileId = typeof window !== 'undefined' ? localStorage.getItem('bt_profile_id') : null
  const linkedWallet = privyUser?.linkedAccounts?.find(
    (a) => a.type === 'wallet'
  ) as { type: 'wallet'; address: string; chainType?: string } | undefined

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
      const { data: p } = await supabase.from('profiles').select('*').eq('id', profileId).single()
      if (p) { setProfile(p as ProfileData); setEditName(p.display_name ?? ''); setEditHandle(p.handle ?? ''); setEditAvatar(p.avatar_url ?? '') }
      const { data: sessions } = await supabase.from('sessions')
        .select('id, lobby_id, final_rank, is_eliminated, starting_balance, final_balance, created_at')
        .eq('trader_id', profileId).order('created_at', { ascending: false }).limit(20)
      if (sessions && sessions.length > 0) {
        const lobbyIds = sessions.map(s => s.lobby_id)
        const { data: lobbies } = await supabase.from('lobbies').select('id, name').in('id', lobbyIds)
        const lobbyMap = new Map((lobbies ?? []).map(l => [l.id, l.name]))
        setHistory(sessions.map(s => ({
          id: s.id, lobby_name: lobbyMap.get(s.lobby_id) ?? 'Unknown',
          final_rank: s.final_rank, is_eliminated: s.is_eliminated,
          returnPct: s.final_balance && s.starting_balance ? ((s.final_balance - s.starting_balance) / s.starting_balance) * 100 : 0,
          date: new Date(s.created_at).toLocaleDateString(),
        })))
      }
      setLoading(false)
    })()
  }, [profileId])

  const handleSave = async () => {
    if (!profileId || !editName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('profiles')
      .update({ display_name: editName.trim(), handle: editHandle.trim() || null, avatar_url: editAvatar || null })
      .eq('id', profileId)
    if (error) addToast('Failed to save', 'error')
    else { addToast('Profile updated', 'success', '✓'); setProfile(p => p ? { ...p, display_name: editName.trim(), handle: editHandle.trim() || null, avatar_url: editAvatar || null } : p) }
    setSaving(false)
  }

  if (loading) return (
    <div style={{minHeight:'100vh',background:c.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <span style={{fontFamily:font.sans,fontSize:16,color:c.text3}}>Loading...</span>
    </div>
  )

  if (!profileId || !profile) return (
    <div style={{minHeight:'100vh',background:c.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16}}>
      <span style={{fontFamily:font.sans,fontSize:24,fontWeight:700,color:c.text}}>No profile found</span>
      <span style={{fontFamily:font.sans,fontSize:14,color:c.text3}}>Join a lobby to create your profile</span>
      <a href="/create" className="btn-p" style={{...btnPrimary,fontSize:16,padding:'14px 36px',textDecoration:'none'}}>Create a Lobby</a>
    </div>
  )

  return (
    <div style={{minHeight:'100vh',background:c.bg}}>
      <style>{globalCSS}</style>

      {/* Nav */}
      <nav style={navStyle(scrolled)}>
        <a href="/" style={{display:'flex',alignItems:'center',textDecoration:'none'}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-main.png" alt="Battle Trade" style={logoStyle} onError={e=>{(e.target as HTMLImageElement).style.display='none'}} />
        </a>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <a href="/dashboard" className="nav-a" style={navLinkStyle(false)}>Home</a>
          <a href="/markets" className="nav-a" style={navLinkStyle(false)}>Battles</a>
          <a href="/lab" className="nav-a" style={navLinkStyle(false)}>Lab</a>
          <span style={navLinkStyle(true)}>Profile</span>
        </div>
        <div style={{width:80}} />
      </nav>

      <div style={{maxWidth:600,margin:'0 auto',padding:'32px 24px'}}>

        {/* Avatar + Name */}
        <div style={{display:'flex',alignItems:'center',gap:20,marginBottom:32}}>
          <div onClick={()=>setShowAvatars(!showAvatars)} style={{
            width:72,height:72,background:c.surface,border:`2px solid ${c.pink}`,
            borderRadius:radius.lg,display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:36,cursor:'pointer',
          }}>
            {editAvatar || '🎮'}
          </div>
          <div style={{flex:1}}>
            <div style={{fontFamily:font.sans,fontSize:28,fontWeight:800,color:c.text,lineHeight:1}}>{profile.display_name}</div>
            {profile.handle && <div style={{fontFamily:font.mono,fontSize:13,color:c.text3,marginTop:4}}>@{profile.handle}</div>}
            {profile.global_rank && <div style={{fontFamily:font.mono,fontSize:12,color:c.pink,marginTop:2}}>Global #{profile.global_rank}</div>}
          </div>
        </div>

        {/* Avatar picker */}
        {showAvatars && (
          <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:24,padding:16,...card}}>
            {AVATARS.map(a => (
              <button key={a} onClick={()=>{setEditAvatar(a);setShowAvatars(false)}} style={{
                width:44,height:44,fontSize:22,borderRadius:radius.md,cursor:'pointer',
                background:editAvatar===a?c.pinkDim:c.surface,
                border:editAvatar===a?`2px solid ${c.pink}`:`1px solid ${c.border}`,
              }}>
                {a}
              </button>
            ))}
          </div>
        )}

        {/* Stats */}
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:32}}>
          {[
            { l: 'Battles', v: profile.total_lobbies_played, color: c.text },
            { l: 'Wins', v: profile.total_wins, color: c.green },
            { l: 'Win Rate', v: `${profile.win_rate.toFixed(0)}%`, color: profile.win_rate >= 50 ? c.green : c.red },
            { l: 'Best', v: `+${profile.best_return.toFixed(0)}%`, color: c.pink },
            { l: 'Credits', v: profile.credits, color: c.gold },
          ].map(s => (
            <div key={s.l} style={{flex:1,minWidth:100,...card,padding:'14px 16px',textAlign:'center'}}>
              <div style={{fontFamily:font.sans,fontSize:11,fontWeight:500,color:c.text3}}>{s.l}</div>
              <div style={{fontFamily:font.mono,fontSize:24,fontWeight:700,color:s.color,marginTop:4}}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Edit form */}
        <div style={{marginBottom:32}}>
          <div style={{fontFamily:font.sans,fontSize:14,fontWeight:600,color:c.text2,marginBottom:14}}>Edit Profile</div>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={{fontFamily:font.sans,fontSize:12,fontWeight:500,color:c.text3,display:'block',marginBottom:4}}>Display Name</label>
              <input value={editName} onChange={e=>setEditName(e.target.value)} maxLength={24}
                style={{...inputStyle,height:44,fontSize:15,padding:'0 14px'}} />
            </div>
            <div>
              <label style={{fontFamily:font.sans,fontSize:12,fontWeight:500,color:c.text3,display:'block',marginBottom:4}}>Handle</label>
              <input value={editHandle} onChange={e=>setEditHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g,''))} maxLength={20} placeholder="your_handle"
                style={{...inputStyle,height:44,fontSize:15,padding:'0 14px'}} />
            </div>
            <button onClick={handleSave} disabled={saving||!editName.trim()} className="btn-p" style={{
              ...btnPrimary,height:48,fontSize:15,
              opacity:saving||!editName.trim()?0.4:1,
              cursor:saving?'default':'pointer',
            }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Wallet */}
        <div style={{marginBottom:32}}>
          <div style={{fontFamily:font.sans,fontSize:14,fontWeight:600,color:c.text2,marginBottom:14}}>Wallet</div>
          {linkedWallet ? (
            <div style={{...card,display:'flex',alignItems:'center',gap:12,padding:'14px 18px'}}>
              <div style={{flex:1}}>
                <div style={{fontFamily:font.sans,fontSize:13,fontWeight:600,color:c.text}}>
                  {'chainType' in linkedWallet ? linkedWallet.chainType?.toUpperCase() : 'WALLET'}
                </div>
                <div style={{fontFamily:font.mono,fontSize:12,color:c.green,marginTop:2}}>{shortenAddress(linkedWallet.address)}</div>
              </div>
              <span style={{fontFamily:font.sans,fontSize:11,fontWeight:500,color:c.green,background:c.greenDim,padding:'3px 10px',borderRadius:radius.pill}}>Connected</span>
            </div>
          ) : (
            <button onClick={handleConnectWallet} className="btn-s" style={{...btnSecondary,width:'100%',height:48,fontSize:14}}>
              Link Wallet
            </button>
          )}
        </div>

        {/* Match History */}
        <div>
          <div style={{fontFamily:font.sans,fontSize:14,fontWeight:600,color:c.text2,marginBottom:14}}>Match History</div>
          {history.length === 0 ? (
            <div style={{...card,padding:'40px 0',textAlign:'center'}}>
              <div style={{fontFamily:font.sans,fontSize:16,fontWeight:600,color:c.text4}}>No matches yet</div>
              <div style={{fontFamily:font.sans,fontSize:12,color:c.text4,marginTop:6}}>Join a lobby to start your battle record</div>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:2}}>
              {history.map(h => (
                <div key={h.id} className="row-hover" style={{...card,display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderRadius:0}}>
                  <span style={{fontFamily:font.mono,fontSize:14,fontWeight:700,color:h.final_rank===1?c.gold:h.final_rank&&h.final_rank<=3?c.pink:c.text4,width:36}}>
                    {h.final_rank?`#${h.final_rank}`:'—'}
                  </span>
                  <span style={{fontFamily:font.sans,fontSize:14,fontWeight:600,color:c.text,flex:1}}>{h.lobby_name}</span>
                  <span style={{fontFamily:font.mono,fontSize:13,fontWeight:700,color:h.returnPct>=0?c.green:c.red}}>
                    {h.returnPct>=0?'+':''}{h.returnPct.toFixed(1)}%
                  </span>
                  <span style={{fontFamily:font.mono,fontSize:11,color:c.text4}}>{h.date}</span>
                  {h.is_eliminated && <span style={{fontFamily:font.sans,fontSize:10,fontWeight:600,color:c.red,background:c.redDim,padding:'1px 6px',borderRadius:4}}>KO</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
